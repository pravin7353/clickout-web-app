"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

export async function toggleStaffSuspension(staffId: string, currentStatus: string, displayName: string, targetBranchCode?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot suspend or restore staff." };
  }

  const isSuspended = currentStatus === "SUSPENDED";
  const newStatus = isSuspended ? "ACTIVE" : "SUSPENDED";
  const branch = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";

  try {
    const batch = adminDb.batch();

    // 1. Update in employees collection if exists
    const empRef = adminDb.collection("employees").doc(staffId);
    batch.set(empRef, { status: newStatus, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // 2. Also update in staff collection if exists
    const staffRef = adminDb.collection("staff").doc(staffId);
    batch.set(staffRef, { status: newStatus, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // 3. Log strictly to admin_audit_logs
    const auditRef = adminDb.collection("admin_audit_logs").doc();
    batch.set(auditRef, {
      action: isSuspended ? "RESTORE_STAFF" : "SUSPEND_STAFF",
      actionType: isSuspended ? "RESTORE_STAFF" : "SUSPEND_STAFF",
      targetCollection: "staff",
      targetId: staffId,
      details: isSuspended
        ? `Restored access for ${displayName}`
        : `Suspended access for ${displayName} due to low trust score or fraud suspicion.`,
      severity: isSuspended ? "INFO" : "CRITICAL",
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      tenantId: tenantId ?? "UNKNOWN",
      branchCode: branch,
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/fraud-control");
    revalidatePath("/manager");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update staff status." };
  }
}