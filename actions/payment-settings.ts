"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export interface TenantPaymentSettings {
  upiId: string;
  upiName: string;
  acceptsUpi: boolean;
  acceptsCard: boolean;
  acceptsCash: boolean;
}

const DEFAULT_PAYMENT_SETTINGS: TenantPaymentSettings = {
  upiId: "",
  upiName: "",
  acceptsUpi: false,
  acceptsCard: false,
  acceptsCash: true,
};

export async function getPaymentSettings(): Promise<{
  ok: boolean;
  settings: TenantPaymentSettings;
  error?: string;
}> {
  try {
    const { role, tenantId } = await requireRole(["tenant_admin", "manager", "super_admin"]);

    if (!tenantId && role !== "super_admin") {
      return { ok: false, settings: DEFAULT_PAYMENT_SETTINGS, error: "Tenant ID required." };
    }

    const tId = tenantId || "";
    const doc = await adminDb.collection("tenants").doc(tId).get();
    if (!doc.exists) {
      return { ok: true, settings: DEFAULT_PAYMENT_SETTINGS };
    }

    const data = doc.data() || {};
    const raw = data.paymentSettings || {};

    return {
      ok: true,
      settings: {
        upiId: raw.upiId || "",
        upiName: raw.upiName || data.name || data.companyName || "",
        acceptsUpi: Boolean(raw.acceptsUpi),
        acceptsCard: Boolean(raw.acceptsCard),
        acceptsCash: true, // Always true
      },
    };
  } catch (err: any) {
    console.error("Error fetching payment settings:", err);
    return {
      ok: false,
      settings: DEFAULT_PAYMENT_SETTINGS,
      error: err?.message || "Failed to load payment settings.",
    };
  }
}

export async function savePaymentSettings(data: {
  upiId?: string;
  upiName?: string;
  acceptsUpi?: boolean;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const { session, role, tenantId } = await requireRole(["tenant_admin", "super_admin"]);

    if (!tenantId && role !== "super_admin") {
      return { ok: false, error: "Tenant ID required." };
    }

    const tId = tenantId || "";
    const upiId = (data.upiId || "").trim();
    const upiName = (data.upiName || "").trim();
    const acceptsUpi = Boolean(data.acceptsUpi);

    // Validate UPI ID regex: /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/
    const upiRegex = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
    if (acceptsUpi || upiId) {
      if (!upiRegex.test(upiId)) {
        return {
          ok: false,
          error: "Invalid UPI ID format. Example: shopname@upi or retailer@okaxis.",
        };
      }
    }

    const paymentSettings: TenantPaymentSettings = {
      upiId,
      upiName,
      acceptsUpi,
      acceptsCard: false,
      acceptsCash: true,
    };

    const tenantRef = adminDb.collection("tenants").doc(tId);
    await tenantRef.set(
      {
        paymentSettings,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const actorEmail = session.user?.email || "Tenant Admin";
    await adminDb.collection("admin_audit_logs").add({
      action: "PAYMENT_SETTINGS_UPDATED",
      actionType: "PAYMENT_SETTINGS_UPDATED",
      tenantId: tId,
      actor: actorEmail,
      actorId: actorEmail,
      details: `Updated UPI payment settings: UPI ID = ${upiId || "None"}, Accepts UPI = ${acceptsUpi}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/settings/payment");

    return { ok: true, message: "Payment settings saved successfully!" };
  } catch (err: any) {
    console.error("Error saving payment settings:", err);
    return { ok: false, error: err?.message || "Failed to save payment settings." };
  }
}
