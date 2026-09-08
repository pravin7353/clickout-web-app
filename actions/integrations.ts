"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { randomBytes, createHmac } from "crypto";
import { z } from "zod";

const phonepeSchema = z.object({
  merchantId: z.string().trim().min(1, "Merchant ID is required"),
  saltKey: z.string().trim().min(1, "Salt Key is required"),
  saltIndex: z.string().trim().min(1, "Salt Index is required"),
});

const razorpaySchema = z.object({
  keyId: z.string().trim().min(1, "Key ID is required"),
  keySecret: z.string().trim().min(1, "Key Secret is required"),
  webhookSecret: z.string().trim().optional(),
});

export async function generateErpApiKey() {
  const { session, role, tenantId } = await requireRole(["tenant_admin"]);

  if (role !== "tenant_admin") {
    return { ok: false, error: "Only Tenant Admin can generate API keys." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this staff record." };

  const newKey = `co_${tenantId.substring(0, 8)}_${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;

  // 🔒 Secrets isolation: write strictly to private/secrets subcollection
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("private")
    .doc("secrets")
    .set(
      {
        erpApiKey: newKey,
        erpApiKeyGeneratedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  await adminDb.collection("admin_audit_logs").doc().set({
    action: "ERP_API_KEY_GENERATED",
    tenantId,
    adminId: session.user?.email,
    adminEmail: session.user?.email,
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/integrations");
  return { ok: true, apiKey: newKey };
}

export async function configurePartnerMode(enabled: boolean, webhookUrl: string) {
  const { session, role, tenantId } = await requireRole(["tenant_admin"]);
  if (role !== "tenant_admin") {
    return { ok: false, error: "Only Tenant Admin can configure Partner Mode." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this account." };
  if (enabled && !webhookUrl.trim().startsWith("https://")) {
    return { ok: false, error: "Please enter a valid https:// webhook URL." };
  }

  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const secretsRef = tenantRef.collection("private").doc("secrets");

  // Fetch existing webhookSecret from private/secrets
  const secretsSnap = await secretsRef.get();
  const existingSecret = secretsSnap.data()?.webhookSecret;
  const webhookSecret = existingSecret ?? `whsec_${randomBytes(16).toString("hex")}`;

  // 🔒 Public tenant doc holds non-secret config only
  await tenantRef.set(
    {
      partnerMode: {
        enabled,
        webhookUrl: webhookUrl.trim(),
      },
    },
    { merge: true }
  );

  // 🔒 Private subcollection holds webhookSecret
  await secretsRef.set(
    {
      webhookSecret,
    },
    { merge: true }
  );

  await adminDb.collection("admin_audit_logs").doc().set({
    action: "PARTNER_MODE_UPDATED",
    tenantId,
    enabled,
    webhookUrl: webhookUrl.trim(),
    adminId: session.user?.email,
    adminEmail: session.user?.email,
    adminName: session.user?.name || "Admin",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/integrations");
  return { ok: true, webhookSecret };
}

export async function updatePaymentConfig(gatewayInput: string, credentials: Record<string, any>) {
  const { session, role, tenantId } = await requireRole(["tenant_admin"]);
  if (role !== "tenant_admin") {
    return { ok: false, error: "Access denied. Only Tenant Admin can configure payment gateway credentials." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this account." };

  const gateway = gatewayInput.trim().toUpperCase();
  let validated: Record<string, any>;

  if (gateway === "PHONEPE") {
    const parseRes = phonepeSchema.safeParse(credentials);
    if (!parseRes.success) {
      const errorMsg = parseRes.error.issues.map((e) => e.message).join(", ");
      return { ok: false, error: errorMsg };
    }
    validated = parseRes.data;
  } else if (gateway === "RAZORPAY") {
    const parseRes = razorpaySchema.safeParse(credentials);
    if (!parseRes.success) {
      const errorMsg = parseRes.error.issues.map((e) => e.message).join(", ");
      return { ok: false, error: errorMsg };
    }
    validated = parseRes.data;
  } else {
    return { ok: false, error: "Unsupported gateway. Must be PHONEPE or RAZORPAY." };
  }

  // 🔒 Secrets isolation: write strictly to tenants/{tenantId}/private/secrets.paymentConfig.{gateway}
  const secretsRef = adminDb.collection("tenants").doc(tenantId).collection("private").doc("secrets");
  await secretsRef.set(
    {
      paymentConfig: {
        [gateway]: validated,
      },
    },
    { merge: true }
  );

  // Audit log — NEVER log saltKey or keySecret
  await adminDb.collection("admin_audit_logs").doc().set({
    action: "PAYMENT_GATEWAY_CONFIG_UPDATED",
    tenantId,
    gateway,
    adminId: session.user?.email,
    adminEmail: session.user?.email,
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/integrations");
  // Never return raw credentials or secrets
  return { ok: true, gateway, configured: true };
}

export async function resendWebhookDelivery(deliveryId: string) {
  const { role, tenantId } = await requireRole(["tenant_admin"]);
  if (role !== "tenant_admin") {
    return { ok: false, error: "Only Tenant Admin can resend webhooks." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this account." };
  const deliveryRef = adminDb.collection("webhook_deliveries").doc(deliveryId);

  try {
    const doc = await deliveryRef.get();
    if (!doc.exists) return { ok: false, error: "Delivery record not found." };
    const delivery = doc.data()!;
    if (delivery.tenantId !== tenantId) return { ok: false, error: "Access denied." };

    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    const partnerMode = tenantDoc.data()?.partnerMode;
    if (!partnerMode?.enabled || !partnerMode.webhookUrl) {
      return { ok: false, error: "Partner Mode is not enabled for this tenant." };
    }

    // 🔒 Webhook secret read from private/secrets
    const secretsDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("private")
      .doc("secrets")
      .get();
    const webhookSecret = secretsDoc.data()?.webhookSecret;

    if (!webhookSecret) {
      return { ok: false, error: "Webhook signing secret not found in private configuration." };
    }

    const payload = JSON.stringify(delivery.payload ?? {});
    const signature = createHmac("sha256", webhookSecret).update(payload).digest("hex");

    const res = await fetch(partnerMode.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ClickOut-Signature": signature },
      body: payload,
    });

    if (res.ok) {
      await deliveryRef.update({ status: "DELIVERED", deliveredAt: FieldValue.serverTimestamp(), httpStatus: res.status });
    } else {
      await deliveryRef.update({ status: "FAILED", failedAt: FieldValue.serverTimestamp(), httpStatus: res.status, error: `HTTP ${res.status}` });
      return { ok: false, error: `Resend failed: HTTP ${res.status}` };
    }
  } catch (e: any) {
    await deliveryRef.update({ status: "FAILED", failedAt: FieldValue.serverTimestamp(), error: e.message ?? "Network error" });
    return { ok: false, error: e.message ?? "Resend attempt failed" };
  }

  revalidatePath("/integrations");
  return { ok: true };
}