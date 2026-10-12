"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export type FeatureWaitlistChannel = "sms" | "whatsapp";

export async function joinFeatureWaitlist(channel: FeatureWaitlistChannel) {
  let session, role, tenantId;
  try {
    ({ session, role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Authentication required to join the waitlist." };
  }

  const effectiveTenantId = tenantId || "GLOBAL";

  try {
    let tenantName = effectiveTenantId;
    let plan = "pro";

    if (effectiveTenantId && effectiveTenantId !== "GLOBAL") {
      const tDoc = await adminDb.collection("tenants").doc(effectiveTenantId).get();
      if (tDoc.exists) {
        const tData = tDoc.data()!;
        tenantName = tData.name || tData.businessName || tData.tenantName || effectiveTenantId;
        plan = tData.subscriptionPlan || "pro";
      }
    }

    const payload = {
      tenantId: effectiveTenantId,
      tenantName,
      registeredAt: FieldValue.serverTimestamp(),
      plan,
      requestedBy: session.user?.email || "unknown",
      channel,
    };

    // 1. Primary path per specification: clickout_meta/featureWaitlist/{channel}/{tenantId}
    await adminDb
      .collection("clickout_meta")
      .doc("featureWaitlist")
      .collection(channel)
      .doc(effectiveTenantId)
      .set(payload, { merge: true });

    // 2. Secondary path per notifyList/{channel} mention in prompt
    await adminDb
      .collection("notifyList")
      .doc(channel)
      .collection("tenants")
      .doc(effectiveTenantId)
      .set(payload, { merge: true });

    // Audit log
    await adminDb.collection("admin_audit_logs").add({
      action: "GROWTH_RADAR_WAITLIST_JOINED",
      actionType: "FEATURE_WAITLIST_JOINED",
      actorId: session.user?.email,
      tenantId: effectiveTenantId,
      details: `Enrolled store in Growth Radar ${channel.toUpperCase()} campaigns waitlist`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/growth");
    revalidatePath("/campaign-manager");
    return { ok: true, channel };
  } catch (e: any) {
    console.error("Failed to join waitlist:", e);
    return { ok: false, error: e.message || "Failed to save waitlist entry." };
  }
}

export async function checkFeatureWaitlistStatus(): Promise<{ sms: boolean; whatsapp: boolean }> {
  let tenantId;
  try {
    ({ tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { sms: false, whatsapp: false };
  }

  const effectiveTenantId = tenantId || "GLOBAL";

  try {
    const [smsDoc, waDoc] = await Promise.all([
      adminDb.collection("clickout_meta").doc("featureWaitlist").collection("sms").doc(effectiveTenantId).get(),
      adminDb.collection("clickout_meta").doc("featureWaitlist").collection("whatsapp").doc(effectiveTenantId).get(),
    ]);

    return {
      sms: smsDoc.exists,
      whatsapp: waDoc.exists,
    };
  } catch {
    return { sms: false, whatsapp: false };
  }
}

/**
 * ============================================================================
 * ARCHITECTURE STUBS FOR FUTURE BACKEND IMPLEMENTATION (Vendor: MSG91)
 * ============================================================================
 * When building SMS and WhatsApp campaign delivery:
 * 1. Register ClickOut entity on TRAI DLT Portal (Jio/Airtel/BSNL).
 * 2. Pre-approve promotional SMS & Meta WhatsApp Business API templates in MSG91.
 * 3. Fill in the implementations below using `@/lib/msg91`.
 */
export async function sendSMS(_params: {
  targetPhone: string;
  templateId: string;
  variables?: Record<string, string>;
  campaignId?: string;
}) {
  return {
    ok: false,
    error: "SMS Campaign sending is currently in development (DLT registration pending).",
  };
}

export async function sendWhatsApp(_params: {
  targetPhone: string;
  templateName: string;
  language?: string;
  components?: any[];
  campaignId?: string;
}) {
  return {
    ok: false,
    error: "WhatsApp Campaign sending is currently in development (Meta WhatsApp Business API pending).",
  };
}
