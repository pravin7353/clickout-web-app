"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { detectDelimiter } from "@/lib/csv-utils";

export async function addSupplier(params: {
  supplierID?: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
  gstin?: string;
}) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add distributors." };
  }

  if (!params.name?.trim()) return { ok: false, error: "Distributor name is required." };

  if (params.phone) {
    const cleanPhone = params.phone.replace(/\D/g, "");
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      return { ok: false, error: "Phone number must be exactly 10 digits." };
    }
  }

  if (params.gstin) {
    const cleanGstin = params.gstin.trim().toUpperCase();
    const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/;
    if (cleanGstin.length > 0 && !GSTIN_REGEX.test(cleanGstin)) {
      return { ok: false, error: "Invalid 15-character GSTIN format." };
    }
  }

  try {
    const docRef = adminDb.collection("suppliers").doc();
    await docRef.set({
      id: docRef.id,
      supplierID: params.supplierID?.trim() || `SUP-${Date.now().toString().slice(-6)}`,
      name: params.name.trim(),
      email: params.email?.trim() ?? "",
      phone: params.phone?.trim() ?? "",
      categories: params.categories?.trim() ?? "",
      gstin: params.gstin?.trim().toUpperCase() ?? "",
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
    revalidatePath("/procurement");
    return { ok: true, id: docRef.id };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to save distributor." };
  }
}

export async function updateSupplier(
  docId: string,
  params: {
    supplierID?: string;
    name: string;
    email?: string;
    phone?: string;
    categories?: string;
    gstin?: string;
  }
) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot modify distributors." };
  }

  if (!docId) return { ok: false, error: "Distributor ID is required." };
  if (!params.name?.trim()) return { ok: false, error: "Distributor name is required." };

  if (params.phone) {
    const cleanPhone = params.phone.replace(/\D/g, "");
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      return { ok: false, error: "Phone number must be exactly 10 digits." };
    }
  }

  if (params.gstin) {
    const cleanGstin = params.gstin.trim().toUpperCase();
    const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/;
    if (cleanGstin.length > 0 && !GSTIN_REGEX.test(cleanGstin)) {
      return { ok: false, error: "Invalid 15-character GSTIN format." };
    }
  }

  try {
    const docRef = adminDb.collection("suppliers").doc(docId);
    const snap = await docRef.get();
    if (!snap.exists) return { ok: false, error: "Distributor not found." };
    if (tenantId && snap.data()?.tenantId !== tenantId) {
      return { ok: false, error: "Unauthorized access to distributor record." };
    }

    const updateData: Record<string, any> = {
      name: params.name.trim(),
      email: params.email?.trim() ?? "",
      phone: params.phone?.trim() ?? "",
      categories: params.categories?.trim() ?? "",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.user?.email ?? "Admin",
    };
    if (params.supplierID?.trim()) {
      updateData.supplierID = params.supplierID.trim();
    }
    if (params.gstin !== undefined) {
      updateData.gstin = params.gstin.trim().toUpperCase();
    }

    await docRef.update(updateData);

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIER_UPDATED",
      actionType: "SUPPLIER_UPDATED",
      actorId: session.user?.email,
      tenantId,
      details: `Updated distributor "${params.name.trim()}" (${docId})`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    revalidatePath("/procurement");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update distributor." };
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
    revalidatePath("/procurement");
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
    revalidatePath("/procurement");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to delete distributor." };
  }
}

export async function bulkDeleteSuppliers(docIds: string[]) {
  let session;
  try {
    ({ session } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, successCount: 0, failCount: 0, errors: ["You have view-only access and cannot delete distributors."] };
  }

  if (!docIds || docIds.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No distributors selected."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const id of docIds) {
    const res = await deleteSupplier(id);
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${id}: ${res.error ?? "Failed to delete"}`);
    }
  }

  revalidatePath("/suppliers");
  revalidatePath("/procurement");
  return { ok: failCount === 0, successCount, failCount, errors };
}

export type CsvSupplierRecord = {
  supplierID?: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
  gstin?: string;
};

export type ValidatedBulkSupplierRow = {
  lineNumber: number;
  supplierID?: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
  gstin?: string;
  status: "valid" | "error";
  errors: string[];
};

export type ValidateBulkSupplierReport = {
  ok: boolean;
  error?: string;
  delimiter?: string;
  rows: ValidatedBulkSupplierRow[];
  validCount: number;
  errorCount: number;
};

export async function validateBulkSupplierImport(
  input: string | CsvSupplierRecord[]
): Promise<ValidateBulkSupplierReport> {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return {
      ok: false,
      error: "You have view-only access and cannot import distributors.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  let delimiter = ",";
  const recordsToValidate: Array<{
    lineNumber: number;
    supplierID?: string;
    name: string;
    email?: string;
    phone?: string;
    categories?: string;
    gstin?: string;
  }> = [];

  if (typeof input === "string") {
    const lines = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { ok: false, error: "CSV content is empty.", rows: [], validCount: 0, errorCount: 0 };
    }

    delimiter = detectDelimiter(lines[0]);
    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    if (
      firstLineLower.includes("supplier") ||
      firstLineLower.includes("name") ||
      firstLineLower.includes("phone") ||
      firstLineLower.includes("email") ||
      firstLineLower.includes("gstin")
    ) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      recordsToValidate.push({
        lineNumber: i + 1,
        supplierID: parts[0] || undefined,
        name: parts[1] || "",
        email: parts[2] || undefined,
        phone: parts[3] || undefined,
        categories: parts[4] || undefined,
        gstin: parts[5] || undefined,
      });
    }
  } else if (Array.isArray(input)) {
    if (input.length === 0) {
      return { ok: false, error: "No records provided.", rows: [], validCount: 0, errorCount: 0 };
    }
    input.forEach((rec, idx) => {
      recordsToValidate.push({
        lineNumber: idx + 1,
        supplierID: rec.supplierID?.trim() || undefined,
        name: rec.name?.trim() || "",
        email: rec.email?.trim() || undefined,
        phone: rec.phone?.trim() || undefined,
        categories: rec.categories?.trim() || undefined,
        gstin: rec.gstin?.trim() || undefined,
      });
    });
  }

  // Batch query existing distributors for this tenant (zero writes)
  const existingNames = new Set<string>();
  const existingPhones = new Set<string>();
  const existingGstins = new Set<string>();

  if (tenantId) {
    const existingSnap = await adminDb
      .collection("suppliers")
      .where("tenantId", "==", tenantId)
      .select("name", "phone", "gstin")
      .get();

    existingSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.name) existingNames.add(String(d.name).trim().toLowerCase());
      if (d.phone) {
        const cleanP = String(d.phone).replace(/\D/g, "");
        if (cleanP) existingPhones.add(cleanP);
      }
      if (d.gstin) {
        const cleanG = String(d.gstin).trim().toUpperCase();
        if (cleanG) existingGstins.add(cleanG);
      }
    });
  }

  const batchNames = new Set<string>();
  const batchPhones = new Set<string>();
  const batchGstins = new Set<string>();
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/;

  const rows: ValidatedBulkSupplierRow[] = [];

  for (const rec of recordsToValidate) {
    const rowErrors: string[] = [];
    const name = rec.name.trim();
    const nameLower = name.toLowerCase();

    // 1. Name validation
    if (!name) {
      rowErrors.push("Distributor name is required.");
    } else {
      if (batchNames.has(nameLower)) {
        rowErrors.push(`Duplicate distributor name '${name}' within this batch.`);
      } else {
        batchNames.add(nameLower);
      }

      if (existingNames.has(nameLower)) {
        rowErrors.push(`Distributor '${name}' already exists in your network.`);
      }
    }

    // 2. Phone validation
    let cleanPhone = rec.phone ? rec.phone.replace(/\D/g, "") : "";
    if (cleanPhone) {
      if (cleanPhone.length !== 10) {
        rowErrors.push(`Phone number '${rec.phone}' must be exactly 10 digits.`);
      } else {
        if (batchPhones.has(cleanPhone)) {
          rowErrors.push(`Duplicate phone number '${rec.phone}' within this batch.`);
        } else {
          batchPhones.add(cleanPhone);
        }

        if (existingPhones.has(cleanPhone)) {
          rowErrors.push(`Phone number '${rec.phone}' is already registered with another distributor.`);
        }
      }
    }

    // 3. GSTIN validation
    const cleanGstin = rec.gstin ? rec.gstin.trim().toUpperCase() : "";
    if (cleanGstin) {
      if (!GSTIN_REGEX.test(cleanGstin)) {
        rowErrors.push(`Invalid 15-character GSTIN format '${cleanGstin}' (e.g. 27ABCDE1234F1Z5).`);
      } else {
        if (batchGstins.has(cleanGstin)) {
          rowErrors.push(`Duplicate GSTIN '${cleanGstin}' within this batch.`);
        } else {
          batchGstins.add(cleanGstin);
        }

        if (existingGstins.has(cleanGstin)) {
          rowErrors.push(`GSTIN '${cleanGstin}' is already registered with another distributor.`);
        }
      }
    }

    // 4. Email validation (basic syntax check)
    if (rec.email && rec.email.trim()) {
      const emailTrim = rec.email.trim();
      if (!emailTrim.includes("@") || !emailTrim.includes(".")) {
        rowErrors.push(`Invalid email address format '${emailTrim}'.`);
      }
    }

    const status = rowErrors.length === 0 ? "valid" : "error";
    rows.push({
      lineNumber: rec.lineNumber,
      supplierID: rec.supplierID || `SUP-${Date.now().toString().slice(-6)}`,
      name: name || "—",
      email: rec.email?.trim() || undefined,
      phone: rec.phone?.trim() || undefined,
      categories: rec.categories?.trim() || undefined,
      gstin: cleanGstin || undefined,
      status,
      errors: rowErrors,
    });
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return {
    ok: true,
    delimiter,
    rows,
    validCount,
    errorCount,
  };
}

/**
 * Shared write helper for a single supplier record
 */
function applySupplierRecord(
  batch: FirebaseFirestore.WriteBatch,
  record: {
    supplierID?: string;
    name: string;
    email?: string;
    phone?: string;
    categories?: string;
    gstin?: string;
  },
  tenantId: string | null | undefined,
  actorEmail: string
) {
  const docRef = adminDb.collection("suppliers").doc();
  batch.set(docRef, {
    id: docRef.id,
    supplierID: record.supplierID?.trim() || `SUP-${Date.now().toString().slice(-6)}`,
    name: record.name.trim(),
    email: record.email?.trim() ?? "",
    phone: record.phone?.trim() ?? "",
    categories: record.categories?.trim() ?? "",
    gstin: record.gstin?.trim().toUpperCase() ?? "",
    tenantId,
    addedBy: actorEmail,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function commitBulkSupplierImport(
  validatedRecords: Array<{
    supplierID?: string;
    name: string;
    email?: string;
    phone?: string;
    categories?: string;
    gstin?: string;
  }>
) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot commit imports.", successCount: 0, failCount: 0, errors: [] };
  }

  if (!validatedRecords || validatedRecords.length === 0) {
    return { ok: false, error: "No valid records provided to commit.", successCount: 0, failCount: 0, errors: [] };
  }

  try {
    let successCount = 0;
    const batchSize = 400;
    const actorEmail = session.user?.email ?? "Bulk CSV Import";

    for (let i = 0; i < validatedRecords.length; i += batchSize) {
      const chunk = validatedRecords.slice(i, i + batchSize);
      const batch = adminDb.batch();

      for (const r of chunk) {
        if (!r.name || !r.name.trim()) continue;
        applySupplierRecord(batch, r, tenantId, actorEmail);
        successCount++;
      }

      await batch.commit();
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIERS_BULK_IMPORTED",
      actionType: "SUPPLIERS_BULK_IMPORTED",
      actorId: actorEmail,
      tenantId,
      details: `Bulk imported ${successCount} distributors via validated CSV`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/suppliers");
    revalidatePath("/procurement");
    return { ok: true, count: successCount, successCount, failCount: 0, errors: [] };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Commit failed.", successCount: 0, failCount: validatedRecords.length, errors: [e.message] };
  }
}

export async function bulkImportSuppliersAction(input: string | CsvSupplierRecord[]) {
  const report = await validateBulkSupplierImport(input);
  if (!report.ok) {
    return { ok: false, count: 0, error: report.error ?? "Validation failed." };
  }

  const validRows = report.rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) {
    return {
      ok: false,
      count: 0,
      error: "No valid distributor records found to import. All rows failed validation.",
    };
  }

  const commitRes = await commitBulkSupplierImport(validRows);
  return commitRes;
}