"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess } from "@/lib/rbac";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { detectDelimiter } from "@/lib/csv-utils";

const serviceSchema = z.object({
  barcode: z.string().trim().min(1, "Service Code is required"),
  name: z.string().trim().min(1, "Service Name is required"),
  price: z.coerce.number().min(0, "Price must be greater than or equal to 0"),
  gst: z.string().default("18% GST"),
  sac: z.string().optional(),
});

const updateServiceSchema = z.object({
  barcode: z.string().trim().min(1, "Service Code is required"),
  name: z.string().trim().min(1, "Service Name is required"),
  price: z.coerce.number().min(0, "Price must be greater than or equal to 0"),
  gst: z.string().default("18% GST"),
  sac: z.string().optional(),
});

export async function addService(raw: unknown, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add services." };
  }

  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const barcode = data.barcode.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
  const branchCode = storeId ?? branchParam ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    await adminDb.collection("products").doc(docId).set({
      barcode,
      name: data.name,
      price: data.price,
      gst: data.gst,
      sac: data.sac ?? "",
      itemType: "SERVICE",
      searchKey: data.name.toLowerCase(),
      tenantId,
      branchCode,
      unitCost: 0,
      physicalStock: 0,
      reservedStock: 0,
      addedBy: session.user?.name ?? session.user?.email ?? "Admin",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_CREATED",
      actionType: "SERVICE_CREATED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Registered service '${data.name}' (${barcode}) for branch ${branchCode}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to add service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export async function updateService(raw: unknown, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot edit services." };
  }

  const parsed = updateServiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const barcode = data.barcode.trim().toUpperCase();
  const branchCode = storeId ?? branchParam ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    const docRef = adminDb.collection("products").doc(docId);
    const snap = await docRef.get();

    const updatePayload = {
      name: data.name.trim(),
      price: data.price,
      gst: data.gst,
      sac: data.sac?.trim() ?? "",
      searchKey: data.name.trim().toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.user?.name ?? session.user?.email ?? "Admin",
    };

    if (snap.exists) {
      await docRef.update(updatePayload);
    } else {
      const qSnap = await adminDb
        .collection("products")
        .where("itemType", "==", "SERVICE")
        .where("barcode", "==", barcode)
        .limit(1)
        .get();

      if (!qSnap.empty) {
        await qSnap.docs[0].ref.update(updatePayload);
      } else {
        await docRef.set({
          ...updatePayload,
          barcode,
          itemType: "SERVICE",
          tenantId,
          branchCode,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_UPDATED",
      actionType: "SERVICE_UPDATED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Updated service '${data.name}' (${barcode}) for branch ${branchCode}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export async function deleteService(barcode: string, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot delete services." };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    const docRef = adminDb.collection("products").doc(docId);
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
    } else {
      const qSnap = await adminDb
        .collection("products")
        .where("itemType", "==", "SERVICE")
        .where("barcode", "==", barcode)
        .limit(1)
        .get();
      if (!qSnap.empty) {
        await qSnap.docs[0].ref.delete();
      }
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_DELETED",
      actionType: "SERVICE_DELETED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Deleted service ${barcode} from branch ${branchCode}.`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to delete service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export type ValidatedBulkServiceRow = {
  lineNumber: number;
  barcode: string;
  name: string;
  price: number;
  gst: string;
  sac: string;
  status: "valid" | "error";
  errors: string[];
};

export type ValidateBulkServiceReport = {
  ok: boolean;
  error?: string;
  delimiter?: string;
  rows: ValidatedBulkServiceRow[];
  validCount: number;
  errorCount: number;
};

function normalizeGstRate(rawGst?: string): { gst: string; isZero: boolean } {
  if (!rawGst || !rawGst.trim()) {
    return { gst: "18% GST", isZero: false };
  }
  const clean = rawGst.trim().replace(/gst/i, "").replace(/%/g, "").trim();
  const num = parseFloat(clean);
  if (isNaN(num) || num === 0) {
    return { gst: "0% GST", isZero: true };
  }
  return { gst: `${num}% GST`, isZero: false };
}

export async function validateBulkServiceImport(
  csvContent: string | any[],
  branchParam?: string
): Promise<ValidateBulkServiceReport> {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return {
      ok: false,
      error: "You have view-only access and cannot import services.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  if (!tenantId) {
    return {
      ok: false,
      error: "Tenant identification missing.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";

  let parsedServices: any[] = [];
  let detectedDelim = ",";

  if (typeof csvContent === "string") {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return {
        ok: false,
        error: "CSV content is empty.",
        rows: [],
        validCount: 0,
        errorCount: 0,
      };
    }

    detectedDelim = detectDelimiter(lines[0]);

    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    const hasHeader =
      firstLineLower.includes("name") ||
      firstLineLower.includes("service") ||
      firstLineLower.includes("price") ||
      firstLineLower.includes("charge") ||
      firstLineLower.includes("sac") ||
      firstLineLower.includes("gst") ||
      firstLineLower.includes("code") ||
      firstLineLower.includes("barcode");

    let colCode = 0;
    let colName = 1;
    let colPrice = 2;
    let colGst = 3;
    let colSac = 4;

    if (hasHeader) {
      startIndex = 1;
      const headers = lines[0]
        .split(detectedDelim)
        .map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

      const cIdx = headers.findIndex(
        (h) => h.includes("code") || h.includes("barcode") || h.includes("id")
      );
      const nIdx = headers.findIndex(
        (h) => h.includes("name") || h.includes("title") || h.includes("service")
      );
      const pIdx = headers.findIndex(
        (h) => h.includes("price") || h.includes("charge") || h.includes("cost") || h.includes("rate") || h.includes("fee")
      );
      const gIdx = headers.findIndex((h) => h.includes("gst") || h.includes("tax"));
      const sIdx = headers.findIndex((h) => h.includes("sac"));

      if (nIdx !== -1) colName = nIdx;
      if (pIdx !== -1) colPrice = pIdx;
      if (gIdx !== -1) colGst = gIdx;
      if (sIdx !== -1) colSac = sIdx;
      if (cIdx !== -1) colCode = cIdx;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i]
        .split(detectedDelim)
        .map((p) => p.replace(/^["']|["']$/g, "").trim());

      parsedServices.push({
        lineNumber: i + 1,
        barcode: parts[colCode] || "",
        name: parts[colName] || "",
        price: parts[colPrice] !== undefined && parts[colPrice] !== "" ? parts[colPrice] : undefined,
        gst: parts[colGst] || "",
        sac: parts[colSac] || "",
      });
    }
  } else if (Array.isArray(csvContent)) {
    parsedServices = csvContent;
  }

  if (!parsedServices || parsedServices.length === 0) {
    return {
      ok: false,
      error: "No service rows found to validate.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  // Pre-fetch existing services for tenant + branchCode
  const existingSnap = await adminDb
    .collection("products")
    .where("tenantId", "==", tenantId)
    .where("branchCode", "==", branchCode)
    .where("itemType", "==", "SERVICE")
    .select("barcode", "name", "isDeleted")
    .get();

  const existingNames = new Set<string>();
  const existingBarcodes = new Set<string>();

  existingSnap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.name && !d.isDeleted) {
      existingNames.add(String(d.name).trim().toLowerCase());
    }
    if (d.barcode && !d.isDeleted) {
      existingBarcodes.add(String(d.barcode).trim().toUpperCase());
    }
  });

  const batchNames = new Set<string>();
  const batchBarcodes = new Set<string>();
  const rows: ValidatedBulkServiceRow[] = [];

  for (let i = 0; i < parsedServices.length; i++) {
    const item = parsedServices[i] || {};
    const lineNumber = Number(item.lineNumber) || i + 1;
    const rowErrors: string[] = [];

    const name = String(item.name || "").trim();
    let barcode = String(item.barcode || item.code || "").trim().toUpperCase();

    // Auto-generate barcode if missing
    if (!barcode && name) {
      const namePart = name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).toUpperCase();
      barcode = `SRV-${namePart || lineNumber}`;
    }

    // 1. Name validation
    if (!name) {
      rowErrors.push("Service name is required and cannot be empty.");
    } else {
      const lowerName = name.toLowerCase();
      if (batchNames.has(lowerName)) {
        rowErrors.push(`Duplicate service name '${name}' within this batch.`);
      } else {
        batchNames.add(lowerName);
      }

      if (existingNames.has(lowerName)) {
        rowErrors.push(`Service '${name}' already exists in branch '${branchCode}'.`);
      }
    }

    // 2. Barcode duplicate check
    if (barcode) {
      if (batchBarcodes.has(barcode)) {
        rowErrors.push(`Duplicate service code '${barcode}' within this batch.`);
      } else {
        batchBarcodes.add(barcode);
      }

      if (existingBarcodes.has(barcode)) {
        rowErrors.push(`Service code '${barcode}' already exists in branch '${branchCode}'.`);
      }
    }

    // 3. Price validation (valid positive/zero number)
    const rawPrice = item.price;
    const numPrice = Number(rawPrice);
    if (
      rawPrice === undefined ||
      rawPrice === null ||
      rawPrice === "" ||
      isNaN(numPrice) ||
      numPrice < 0
    ) {
      rowErrors.push(`Price must be a valid positive number or 0. Received: '${rawPrice ?? ""}'`);
    }
    const safePrice = !isNaN(numPrice) && numPrice >= 0 ? numPrice : 0;

    // 4. GST & SAC validation
    const { gst: normalizedGst, isZero: isGstZero } = normalizeGstRate(item.gst);
    const rawSac = String(item.sac || "").trim();

    if (!isGstZero && !rawSac) {
      rowErrors.push("SAC code is required for taxable services (> 0% GST, e.g. 9983, 9997).");
    }

    const status = rowErrors.length === 0 ? "valid" : "error";
    rows.push({
      lineNumber,
      barcode: barcode || `SRV-${lineNumber}`,
      name: name || "—",
      price: safePrice,
      gst: normalizedGst,
      sac: isGstZero ? "" : rawSac,
      status,
      errors: rowErrors,
    });
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return {
    ok: true,
    delimiter: detectedDelim,
    rows,
    validCount,
    errorCount,
  };
}

export async function commitBulkServiceImport(
  validatedRows: any[],
  branchParam?: string
) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "You have view-only access and cannot import services." };
  }

  if (!tenantId) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "Tenant identification missing." };
  }

  if (!validatedRows || !Array.isArray(validatedRows) || validatedRows.length === 0) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "No valid services provided to commit." };
  }

  const validOnly = validatedRows.filter((r) => r.status === "valid" || r.status === undefined);
  if (validOnly.length === 0) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "No valid rows to commit." };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const row of validOnly) {
    const res = await addService(
      {
        barcode: row.barcode,
        name: row.name,
        price: row.price,
        gst: row.gst,
        sac: row.sac,
      },
      branchCode
    );

    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${row.name || row.barcode}: ${res.error ?? "Failed to save"}`);
    }
  }

  revalidatePath("/service");
  return {
    ok: failCount === 0,
    count: successCount,
    successCount,
    failCount,
    errors,
  };
}

export async function bulkDeleteServices(barcodes: string[], branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, successCount: 0, failCount: 0, errors: ["You have view-only access and cannot delete services."] };
  }

  if (!barcodes || barcodes.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No services selected for deletion."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const barcode of barcodes) {
    const res = await deleteService(barcode, branchParam);
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${barcode}: ${res.error ?? "Failed to delete"}`);
    }
  }

  revalidatePath("/service");
  return { ok: failCount === 0, successCount, failCount, errors };
}