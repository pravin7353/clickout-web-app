"use server";

import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

const MAX_STORES: Record<string, number> = { ENTERPRISE: 1000, PRO: 50, BASIC: 5 };

export async function updateTenantProfile(params: { companyName: string; ownerName: string }) {
  const { tenantId } = await requireRole(["tenant_admin", "super_admin"]);
  if (!tenantId) return { ok: false, error: "No tenant found for this account." };

  await adminDb.collection("tenants").doc(tenantId).update({
    companyName: params.companyName.trim(),
    ownerName: params.ownerName.trim(),
  });

  revalidatePath("/tenant-admin");
  return { ok: true };
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