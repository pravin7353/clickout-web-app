"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function addSupplier(params: {
  supplierID?: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
}) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add distributors." };
  }

  if (!params.name.trim()) return { ok: false, error: "Distributor name is required." };

  try {
    const docRef = adminDb.collection("suppliers").doc();
    await docRef.set({
      id: docRef.id,
      supplierID: params.supplierID?.trim() || `SUP-${Date.now().toString().slice(-6)}`,
      name: params.name.trim(),
      email: params.email?.trim() ?? "",
      phone: params.phone?.trim() ?? "",
      categories: params.categories?.trim() ?? "",
      tenantId,
      addedBy: session.user?.email ?? "Unknown Admin",
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIER_ADDED",
      actionType: "SUPPLIER_ADDED",
      actorId: session.user?.email,
      tenantId,
      details: `Added distributor "${params.name.trim()}"`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to save distributor." };
  }
}

export async function toggleSupplierStatus(docId: string, currentStatus: boolean) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot modify distributors." };
  }

  try {
    await adminDb.collection("suppliers").doc(docId).update({
      isActive: !currentStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIER_STATUS_TOGGLED",
      actionType: "SUPPLIER_STATUS_TOGGLED",
      actorId: session.user?.email,
      tenantId,
      details: `Changed status of distributor ${docId} to ${!currentStatus ? "ACTIVE" : "INACTIVE"}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update distributor status." };
  }
}

export async function deleteSupplier(docId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot delete distributors." };
  }

  try {
    await adminDb.collection("suppliers").doc(docId).delete();
    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIER_DELETED",
      actionType: "SUPPLIER_DELETED",
      actorId: session.user?.email,
      tenantId,
      details: `Deleted distributor ${docId}`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to delete distributor." };
  }
}

export type CsvSupplierRecord = {
  supplierID: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
};

export async function bulkImportSuppliersAction(records: CsvSupplierRecord[]) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, count: 0, error: "You have view-only access and cannot import distributors." };
  }

  if (!records || records.length === 0) {
    return { ok: false, count: 0, error: "No records found in CSV." };
  }

  try {
    let imported = 0;
    // Chunk in batches of 400 for Firestore
    const batchSize = 400;
    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      const batch = adminDb.batch();

      for (const r of chunk) {
        if (!r.name || !r.name.trim()) continue;
        const docRef = adminDb.collection("suppliers").doc();
        batch.set(docRef, {
          id: docRef.id,
          supplierID: r.supplierID?.trim() || `SUP-${Date.now().toString().slice(-6)}`,
          name: r.name.trim(),
          email: r.email?.trim() ?? "",
          phone: r.phone?.trim() ?? "",
          categories: r.categories?.trim() ?? "",
          tenantId,
          addedBy: session.user?.email ?? "Bulk CSV Import",
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        imported++;
      }
      await batch.commit();
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIERS_BULK_IMPORTED",
      actionType: "SUPPLIERS_BULK_IMPORTED",
      actorId: session.user?.email,
      tenantId,
      details: `Bulk imported ${imported} distributors via CSV`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    return { ok: true, count: imported };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message ?? "Bulk import failed." };
  }
}