"use server";

import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

const MAX_STORES: Record<string, number> = { ENTERPRISE: 1000, PRO: 50, BASIC: 5 };

export async function updateTenantProfile(raw: {
  ownerName: string;
  phone?: string;
  email?: string;
  recoveryEmail?: string;
  companyName?: string;
}) {
  let session, role, tenantId;
  try {
    ({ session, role, tenantId } = await requireRole(["tenant_admin", "super_admin"]));
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  if (!tenantId) return { ok: false, error: "No tenant found for this account." };

  const ownerName = raw.ownerName?.trim();
  if (!ownerName) {
    return { ok: false, error: "Owner name is required." };
  }

  const docRef = adminDb.collection("tenants").doc(tenantId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return { ok: false, error: "Tenant record not found." };
  }

  const existingData = docSnap.data() || {};
  const existingContact = existingData.contact || {};

  const updatedContact: Record<string, any> = { ...existingContact };

  if (raw.phone !== undefined) {
    const phone = raw.phone.trim();
    if (!/^\d{10}$/.test(phone)) {
      return { ok: false, error: "Phone number must be exactly 10 digits." };
    }
    updatedContact.phone = phone;
  }

  if (raw.email !== undefined) {
    const email = raw.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { ok: false, error: "Please provide a valid business email address." };
    }
    updatedContact.email = email;
  }

  const updatePayload: Record<string, any> = {
    ownerName,
    contact: updatedContact,
  };

  if (raw.recoveryEmail !== undefined) {
    const recoveryEmail = raw.recoveryEmail.trim().toLowerCase();
    const storedRecoveryEmail = (
      existingContact.recoveryEmail ??
      existingData.recoveryEmail ??
      ""
    )
      .trim()
      .toLowerCase();

    if (recoveryEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recoveryEmail)) {
        return { ok: false, error: "Please provide a valid alternate login email address." };
      }

      // Only check difference from current login email if the user is actually changing it
      const isChangingRecoveryEmail = recoveryEmail !== storedRecoveryEmail;
      if (isChangingRecoveryEmail) {
        const currentLoginEmail = (session.user?.email || "").trim().toLowerCase();
        if (currentLoginEmail && recoveryEmail === currentLoginEmail) {
          return { ok: false, error: "Alternate login email must be different from your current login email." };
        }

        const userId = (session.user as any)?.uid || (session.user as any)?.id;
        if (userId) {
          const staffDoc = await adminDb.collection("staff").doc(userId).get();
          if (staffDoc.exists && (staffDoc.data()?.email || "").trim().toLowerCase() === recoveryEmail) {
            return { ok: false, error: "Alternate login email must be different from your current login email." };
          }
        }
      }

      updatedContact.recoveryEmail = recoveryEmail;
      updatePayload.recoveryEmail = recoveryEmail;
    } else {
      updatedContact.recoveryEmail = "";
      updatePayload.recoveryEmail = "";
    }
  }

  if (raw.companyName !== undefined) {
    const companyName = raw.companyName.trim();
    if (!companyName) {
      return { ok: false, error: "Company name is required." };
    }
    updatePayload.companyName = companyName;
  }

  try {
    await docRef.set(updatePayload, { merge: true });
    revalidatePath("/tenant-admin");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update tenant profile." };
  }
}

export async function onboardTenant(params: {
  companyName: string;
  plan: "BASIC" | "PRO" | "ENTERPRISE";
  adminName: string;
  adminPhone: string;
  adminEmail: string;
}) {
  const { session } = await requireRole(["super_admin"]);

  if (!params.companyName || !params.adminEmail || !params.adminPhone) {
    return { ok: false, error: "Missing required fields." };
  }

  try {
    const userRecord = await adminAuth.createUser({
      email: params.adminEmail.toLowerCase().trim(),
      password: "ClickOut@" + params.adminPhone.substring(0, 4),
      displayName: params.adminName.trim(),
    });
    const uid = userRecord.uid;

    const baseId = params.companyName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const tenantId = `tenant_${baseId}_${Date.now().toString().slice(8)}`;
    const maxStores = MAX_STORES[params.plan] ?? 5;

    const batch = adminDb.batch();

    batch.set(adminDb.collection("tenants").doc(tenantId), {
      tenantId,
      companyName: params.companyName.trim(),
      subscriptionPlan: params.plan,
      billingStatus: "ACTIVE",
      maxStores,
      maxUsers: maxStores * 20,
      gstins: [],
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(adminDb.collection("staff").doc(uid), {
      docId: uid,
      uid,
      empId: "ADMIN-001",
      role: "TENANT_ADMIN",
      name: params.adminName.trim(),
      phone: params.adminPhone.trim(),
      email: params.adminEmail.toLowerCase().trim(),
      branchCode: "HQ",
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "TENANT_ONBOARDED",
      tenantId,
      companyName: params.companyName,
      actor: session.user?.email ?? "SuperAdmin",
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/super-admin");
    return { ok: true, tenantId };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Onboarding failed" };
  }
}