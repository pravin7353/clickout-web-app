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

  const branchCode = data.branchCode.toUpperCase();
  const hasManager = !!data.managerEmail;
  const managerEmail = hasManager ? data.managerEmail!.toLowerCase() : "";

  try {
    // 1. Check Branch Code Uniqueness within Tenant
    const existingBranch = await adminDb.collection("stores").where("tenantId", "==", effectiveTenantId).where("branchCode", "==", branchCode).get();
    if (!existingBranch.empty) {
      return { ok: false, error: `Branch Code ${branchCode} already exists in your company.` };
    }

    const batch = adminDb.batch();
    const storeRef = adminDb.collection("stores").doc();

    // 2. Optional Manager Creation
    if (hasManager) {
      if (managerEmail === session.user?.email) {
        return { ok: false, error: "You cannot assign yourself as a manager. As Tenant Admin, you already have access." };
      }
      const existingManager = await adminDb.collection("staff").where("email", "==", managerEmail).where("isDeleted", "==", false).get();
      if (!existingManager.empty) {
        return { ok: false, error: "This email is already assigned to an active operational account." };
      }

      const staffRef = adminDb.collection("staff").doc();
      batch.set(staffRef, {
        docId: staffRef.id,
        empId: data.managerEmpId?.trim() ?? "",
        email: managerEmail,
        name: data.managerName?.trim() ?? "",
        phone: data.managerPhone?.trim() ?? "",
        role: "MANAGER",
        tenantId: effectiveTenantId,
        storeId: storeRef.id,
        branchCode,
        isActive: true,
        isDeleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(storeRef, {
      storeId: storeRef.id,
      tenantId: effectiveTenantId,
      storeName: data.storeName.trim(),
      branchCode,
      gstin: data.gstin?.trim() ?? "",
      gstNumber: data.gstin?.trim() ?? "",
      managerEmail: hasManager ? managerEmail : null,
      managerEmpId: data.managerEmpId?.trim() ?? null,
      managerName: data.managerName?.trim() ?? null,
      managerPhone: data.managerPhone?.trim() ?? null,
      contactNumbers: [data.storePhone?.trim() || data.managerPhone?.trim() || ""].filter(Boolean),
      location: {
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        pincode: data.pincode ?? "",
      },
      licenses: data.licenses ?? [],
      bankAccounts: data.bankAccounts ?? [],
      bankDetailsPending: !data.bankAccounts?.length,
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

export async function toggleStoreSuspension(storeId: string, currentStatus: string) {
  await requireRole(["super_admin", "tenant_admin"]);
  const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  await adminDb.collection("stores").doc(storeId).update({ status: newStatus, isActive: newStatus === "ACTIVE" });
  revalidatePath("/tenant-admin");
}

export async function removeStore(storeId: string) {
  await requireRole(["super_admin", "tenant_admin"]);
  await adminDb.collection("stores").doc(storeId).delete();
  revalidatePath("/tenant-admin");
}

export async function getStoreForEdit(storeId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  let doc = await adminDb.collection("stores").doc(storeId).get();
  if (!doc.exists) {
    const qSnap = await adminDb.collection("stores").where("branchCode", "==", storeId).limit(1).get();
    if (!qSnap.empty) {
      doc = qSnap.docs[0];
    }
  }
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    storeId: doc.id,
    storeName: data.storeName || data.name || "",
    gstin: data.gstin || data.gstNumber || "",
    address: data.location?.address || "",
    city: data.location?.city || "",
    state: data.location?.state || "",
    pincode: data.location?.pincode || "",
    licenses: data.licenses || [],
    bankAccounts: data.bankAccounts || []
  };
}

export async function updateStoreProfile(params: { 
  storeId: string; storeName: string; gstin: string; address: string; city: string; state: string; pincode: string;
  licenses: any[]; bankAccounts: any[];
}) {
  try {
    await requireRole(["super_admin", "tenant_admin", "manager"]);
    let docRef = adminDb.collection("stores").doc(params.storeId);
    const snap = await docRef.get();
    if (!snap.exists) {
      const qSnap = await adminDb.collection("stores").where("branchCode", "==", params.storeId).limit(1).get();
      if (!qSnap.empty) {
        docRef = qSnap.docs[0].ref;
      }
    }

    await docRef.update({
      storeName: params.storeName.trim(),
      gstin: params.gstin.trim(),
      gstNumber: params.gstin.trim(),
      "location.address": params.address.trim(),
      "location.city": params.city.trim(),
      "location.state": params.state.trim(),
      "location.pincode": params.pincode.trim(),
      licenses: params.licenses,
      bankAccounts: params.bankAccounts,
      bankDetailsPending: !params.bankAccounts?.length
    });
    revalidatePath("/tenant-admin");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Failed to update profile" };
  }
}