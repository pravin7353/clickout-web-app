"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { createStoreSchema } from "@/lib/schemas/store-schema";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function createStore(raw: unknown) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  const parsed = createStoreSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;
  const effectiveTenantId = tenantId ?? (raw as any).tenantId;
  if (!effectiveTenantId) return { ok: false, error: "Tenant Identity missing!" };

  const managerEmail = data.managerEmail.toLowerCase();
  const branchCode = data.branchCode.toUpperCase();

  try {
    const existingManager = await adminDb.collection("staff").where("email", "==", managerEmail).where("isDeleted", "==", false).get();
    if (!existingManager.empty) {
      return { ok: false, error: "This email is already assigned to an active operational account." };
    }

    const batch = adminDb.batch();
    const storeRef = adminDb.collection("stores").doc();
    const staffRef = adminDb.collection("staff").doc();

    batch.set(staffRef, {
      docId: staffRef.id,
      empId: data.managerEmpId.trim(),
      email: managerEmail,
      name: data.managerName.trim(),
      phone: data.managerPhone.trim(),
      role: "MANAGER",
      tenantId: effectiveTenantId,
      storeId: storeRef.id,
      branchCode,
      isActive: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(storeRef, {
      storeId: storeRef.id,
      tenantId: effectiveTenantId,
      storeName: data.storeName.trim(),
      branchCode,
      managerEmail,
      managerEmpId: data.managerEmpId.trim(),
      managerName: data.managerName.trim(),
      managerPhone: data.managerPhone.trim(),
      contactNumbers: [data.managerPhone.trim()],
      location: {
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        pincode: data.pincode ?? "",
      },
      licenses: [],
      bankAccounts: [],
      bankDetailsPending: true,
      status: "ACTIVE",
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    await adminDb.collection("audit_logs").add({
      tenantId: effectiveTenantId,
      timestamp: FieldValue.serverTimestamp(),
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      actionType: "STORE_CREATED",
      targetCollection: "stores",
      targetId: storeRef.id,
      details: `Created store ${data.storeName} (${branchCode}) with manager ${data.managerName}.`,
      severity: "INFO",
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Store creation failed" };
  }

  revalidatePath("/tenant-admin");
  return { ok: true };
}