"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function addSupplier(params: { supplierID: string; name: string; email: string; phone: string; categories: string }) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) return { ok: false, error: "Tenant Identity Missing! Cannot save distributor." };
  if (!params.name.trim()) return { ok: false, error: "Name is required." };

  await adminDb.collection("suppliers").add({
    supplierID: params.supplierID.trim() || "AUTO_GEN",
    name: params.name.trim(),
    email: params.email.trim(),
    phone: params.phone.trim(),
    categories: params.categories.trim(),
    tenantId,
    addedBy: session.user?.email ?? "Unknown Admin",
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  revalidatePath("/suppliers");
  return { ok: true };
}

export async function toggleSupplierStatus(docId: string, currentStatus: boolean) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("suppliers").doc(docId).update({ isActive: !currentStatus });
  revalidatePath("/suppliers");
}

export async function deleteSupplier(docId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("suppliers").doc(docId).delete();
  revalidatePath("/suppliers");
}