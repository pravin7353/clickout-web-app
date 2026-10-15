import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = ((session.user as any).role as string)?.toLowerCase();
    if (role !== "tenant_admin" && role !== "super_admin") {
      return NextResponse.json(
        { ok: false, error: "Forbidden: tenant_admin role required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tenantId,
      planKey,
      billingCycle = "monthly",
      purchaseType = "plan_upgrade",
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "Missing required payment verification fields" },
        { status: 400 }
      );
    }

    const sessionTenantId = (session.user as any).tenantId;
    if (role !== "super_admin" && sessionTenantId !== tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Tenant ID mismatch" },
        { status: 403 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      console.error("RAZORPAY_KEY_SECRET missing in server environment");
      return NextResponse.json(
        { ok: false, error: "Payment processor configuration error" },
        { status: 500 }
      );
    }

    // Verify Razorpay HMAC SHA256 signature
    const generated = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated !== razorpay_signature) {
      console.error("Razorpay signature verification failed for order:", razorpay_order_id);
      return NextResponse.json({ ok: false, error: "Invalid payment signature" }, { status: 400 });
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const actorEmail = session.user?.email || "Tenant Admin";

    if (purchaseType === "extra_store") {
      // 1. Increment extraStoresPurchased
      await tenantRef.set(
        {
          extraStoresPurchased: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 2. Record payment in subscription_payments
      await adminDb.collection("subscription_payments").add({
        tenantId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        planKey: planKey || "",
        purchaseType: "extra_store",
        status: "paid",
        timestamp: FieldValue.serverTimestamp(),
      });

      // 3. Write audit log
      await adminDb.collection("admin_audit_logs").add({
        action: "SUBSCRIPTION_PAYMENT_VERIFIED",
        actionType: "SUBSCRIPTION_PAYMENT_VERIFIED",
        tenantId,
        planKey: planKey || "",
        purchaseType: "extra_store",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        actor: actorEmail,
        actorId: actorEmail,
        details: `Verified payment for extra store slot: ₹${razorpay_payment_id}`,
        severity: "INFO",
        timestamp: FieldValue.serverTimestamp(),
      });
    } else {
      // Plan upgrade
      const contractType = billingCycle === "annual" ? "ANNUAL" : "MONTHLY";
      await tenantRef.set(
        {
          subscriptionPlan: (planKey || "mini").toUpperCase(),
          contractType,
          billingStatus: "active",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Record payment
      await adminDb.collection("subscription_payments").add({
        tenantId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        planKey: planKey || "",
        billingCycle,
        purchaseType: "plan_upgrade",
        status: "paid",
        timestamp: FieldValue.serverTimestamp(),
      });

      // Write audit log
      await adminDb.collection("admin_audit_logs").add({
        action: "SUBSCRIPTION_PAYMENT_VERIFIED",
        actionType: "SUBSCRIPTION_PAYMENT_VERIFIED",
        tenantId,
        planKey: (planKey || "").toUpperCase(),
        purchaseType: "plan_upgrade",
        billingCycle,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        actor: actorEmail,
        actorId: actorEmail,
        details: `Verified payment for plan upgrade to ${(planKey || "").toUpperCase()} (${contractType})`,
        severity: "INFO",
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    revalidatePath("/usage");
    revalidatePath("/tenant-admin");
    revalidatePath("/settings/subscription");

    return NextResponse.json({ ok: true, plan: planKey });
  } catch (err: any) {
    console.error("Razorpay verify-payment error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to verify payment" },
      { status: 500 }
    );
  }
}
