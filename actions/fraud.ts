"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

export async function toggleStaffSuspension(staffId: string, currentStatus: string, displayName: string) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const isSuspended = currentStatus === "SUSPENDED";
  const newStatus = isSuspended ? "ACTIVE" : "SUSPENDED";

  await adminDb.collection("employees").doc(staffId).set({ status: newStatus }, { merge: true });

  await adminDb.collection("audit_logs").add({
    actionType: isSuspended ? "RESTORE_STAFF" : "SUSPEND_STAFF",
    targetCollection: "employees",
    targetId: staffId,
    details: isSuspended ? `Restored access for ${displayName}` : `Suspended access for ${displayName} due to fraud suspicion.`,
    severity: isSuspended ? "INFO" : "CRITICAL",
    actorEmail: session.user?.email ?? "System Manager",
    tenantId: tenantId ?? "UNKNOWN",
    branchCode: storeId ?? "UNKNOWN",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/fraud-control");
}