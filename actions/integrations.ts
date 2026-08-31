"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { randomBytes, createHmac } from "crypto";


export async function generateErpApiKey() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);

  if (role !== "super_admin" && role !== "tenant_admin") {
    return { ok: false, error: "Only Tenant Admin can generate API keys." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this staff record." };

  const newKey = `co_${tenantId.substring(0, 8)}_${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;

  await adminDb.collection("tenants").doc(tenantId).update({
    erpApiKey: newKey,
    erpApiKeyGeneratedAt: FieldValue.serverTimestamp(),
  });

  revalidatePath("/integrations");
  return { ok: true, apiKey: newKey };
}

export async function configurePartnerMode(enabled: boolean, webhookUrl: string) {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  if (role !== "super_admin" && role !== "tenant_admin") {
    return { ok: false, error: "Only Tenant Admin can configure Partner Mode." };
  }
  if (!tenantId) return { ok: false, error: "No tenant associated with this account." };
  if (enabled && !webhookUrl.trim().startsWith("https://")) {
    return { ok: false, error: "Please enter a valid https:// webhook URL." };
  }

  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const existing = (await tenantRef.get()).data()?.partnerMode ?? {};

  const webhookSecret = existing.webhookSecret ?? `whsec_${randomBytes(16).toString("hex")}`;

  await tenantRef.update({
    partnerMode: {
      enabled,
      webhookUrl: webhookUrl.trim(),
      webhookSecret,
    },
  });

  return { ok: true, webhookSecret };
}

export async function resendWebhookDelivery(deliveryId: string) {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin"]);
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

    const payload = JSON.stringify(delivery.payload ?? {});
    const signature = createHmac("sha256", partnerMode.webhookSecret).update(payload).digest("hex");

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