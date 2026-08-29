"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function addCustomRole(params: { roleName: string; reportsToId: string | null; level: number; tagPrefix: string }) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  if (!tenantId) return { ok: false, error: "Fatal Error: Tenant Identity missing!" };
  if (!params.roleName.trim()) return { ok: false, error: "Role name is required." };

  const cleanRoleName = params.roleName.trim().toUpperCase().replace(/ /g, "_");
  const roleId = `${tenantId}_${cleanRoleName}`;

  const batch = adminDb.batch();
  batch.set(adminDb.collection("org_structure").doc(roleId), {
    roleId,
    tenantId,
    roleName: params.roleName.trim(),
    reportsTo: params.reportsToId,
    level: params.level,
    tagPrefix: params.tagPrefix.trim().toUpperCase(),
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(adminDb.collection("admin_audit_logs").doc(), {
    action: "CUSTOM_ROLE_CREATED",
    tenantId,
    roleName: params.roleName,
    actor: session.user?.email ?? "Admin",
    timestamp: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  revalidatePath("/org-structure");
  return { ok: true };
}