import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { razorpayInstance } from "@/lib/razorpay-admin";
import { PLAN_CONFIG, SubscriptionPlan, planFromString } from "@/lib/subscription/plan";
import { adminDb } from "@/lib/firebase-admin";

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
    const { planKey, billingCycle = "monthly", tenantId, purchaseType = "plan_upgrade" } = body;

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
    }

    const sessionTenantId = (session.user as any).tenantId;
    if (role !== "super_admin" && sessionTenantId !== tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Tenant ID mismatch" },
        { status: 403 }
      );
    }

    let amountInPaise = 0;

    if (purchaseType === "extra_store") {
      // Calculate extra store price
      const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
      const currentPlan = planFromString(tenantDoc.data()?.subscriptionPlan || planKey);
      const planCfg = PLAN_CONFIG[currentPlan];
      if (!planCfg || planCfg.extraStorePrice === null) {
        return NextResponse.json(
          { ok: false, error: `Extra store purchase is not supported on plan ${currentPlan}` },
          { status: 400 }
        );
      }
      amountInPaise = Math.round(planCfg.extraStorePrice * 100);
    } else {
      // Plan upgrade
      const targetPlan = planFromString(planKey);
      const planCfg = PLAN_CONFIG[targetPlan];
      if (!planCfg || planCfg.monthlyPrice <= 0) {
        return NextResponse.json(
          { ok: false, error: `Invalid or free plan selected: ${planKey}` },
          { status: 400 }
        );
      }

      if (billingCycle === "annual") {
        // Multiply by 12 then apply 20% discount
        const annualDiscounted = planCfg.monthlyPrice * 12 * 0.8;
        amountInPaise = Math.round(annualDiscounted * 100);
      } else {
        amountInPaise = Math.round(planCfg.monthlyPrice * 100);
      }
    }

    // Minimum 100 paise
    amountInPaise = Math.max(100, amountInPaise);

    const receipt = `sub_${tenantId}_${Date.now()}`.slice(0, 40);

    const order: any = await (razorpayInstance.orders.create as any)({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      payment_capture: true,
      notes: {
        tenantId,
        planKey: planKey || "",
        billingCycle,
        purchaseType,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error("Razorpay create-order error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create Razorpay order" },
      { status: 500 }
    );
  }
}
