"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess } from "@/lib/rbac";
import { addProductSchema } from "@/lib/schemas/product-schema";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function addProduct(raw: unknown) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add products." };
  }
  const parsed = addProductSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const branchCode = storeId ?? (raw as any).branchCode ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${data.barcode.trim()}`;
  const docRef = adminDb.collection("products").doc(docId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) throw new Error(`Barcode ${data.barcode} already exists in this store inventory!`);

      tx.set(docRef, {
        barcode: data.barcode.trim(),
        name: data.name.trim(),
        itemType: "PRODUCT",
        price: data.price,
        unitCost: data.unitCost,
        gst: data.gst,
        physicalStock: data.physicalStock,
        openingStock: data.physicalStock,
        purchasedStock: 0,
        soldStock: 0,
        damagedStock: 0,
        expiredStock: 0,
        reservedStock: 0,
        weight: data.weight ?? "",
        expiryDate: data.expiryDate ? Timestamp.fromDate(new Date(data.expiryDate)) : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        searchKey: data.name.trim().toLowerCase(),
        tenantId,
        branchCode,
        isBlocked: false,
        addedBy: session.user?.name ?? session.user?.email ?? "Store Admin",
        addedByEmail: session.user?.email ?? "",
      });

      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "NEW_MASTER_PRODUCT_ADDED",
        actionType: "NEW_MASTER_PRODUCT_ADDED",
        barcode: data.barcode,
        actorId: session.user?.email,
        timestamp: FieldValue.serverTimestamp(),
        tenantId,
        details: `Registered ${data.name} (${data.barcode}) at ${branchCode}.`,
        severity: "INFO",
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to register product." };
  }

  revalidatePath("/inventory");
  return { ok: true };
}

export type ValidatedBulkProductRow = {
  lineNumber: number;
  barcode: string;
  name: string;
  price: number;
  unitCost: number;
  gst?: string;
  physicalStock?: number;
  weight?: string;
  expiryDate?: string | null;
  status: "valid" | "error";
  errors: string[];
};

export type ValidateBulkProductReport = {
  ok: boolean;
  error?: string;
  delimiter?: string;
  rows: ValidatedBulkProductRow[];
  validCount: number;
  errorCount: number;
};

function detectProductDelimiter(headerLine: string): string {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  if (semiCount > commaCount && semiCount > tabCount) return ";";
  if (commaCount > 0 && commaCount >= tabCount && commaCount >= semiCount) return ",";

  return ",";
}

export async function validateBulkProductImport(
  products: any[] | string,
  branchParam?: string
): Promise<ValidateBulkProductReport> {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return {
      ok: false,
      error: "You have view-only access and cannot import products.",
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

  let parsedProducts: any[] = [];
  let detectedDelimiter = ",";

  if (typeof products === "string") {
    const lines = products
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

    detectedDelimiter = detectProductDelimiter(lines[0]);

    let startIndex = 0;
    const firstLineLower = lines[0].toLowerCase();
    if (
      firstLineLower.includes("barcode") ||
      firstLineLower.includes("price") ||
      firstLineLower.includes("sku") ||
      firstLineLower.includes("item")
    ) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i]
        .split(detectedDelimiter)
        .map((p) => p.replace(/^["']|["']$/g, "").trim());
      // column order: barcode, name, price, unit_cost, gst, physical_stock, expiry_date, weight
      parsedProducts.push({
        lineNumber: i + 1,
        barcode: parts[0] || "",
        name: parts[1] || "",
        price: parts[2] !== undefined && parts[2] !== "" ? parts[2] : undefined,
        unitCost: parts[3] !== undefined && parts[3] !== "" ? parts[3] : undefined,
        gst: parts[4] || "0",
        physicalStock: parts[5] || "0",
        expiryDate: parts[6] || null,
        weight: parts[7] || "",
      });
    }
  } else if (Array.isArray(products)) {
    parsedProducts = products;
  }

  if (!parsedProducts || parsedProducts.length === 0) {
    return {
      ok: false,
      error: "No products received for validation.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";

  // Single batched query up front for existing barcodes
  const existingSnap = await adminDb
    .collection("products")
    .where("tenantId", "==", tenantId)
    .where("branchCode", "==", branchCode)
    .select("barcode", "isDeleted")
    .get();

  const existingBarcodes = new Set<string>();
  existingSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.barcode && !data.isDeleted) {
      existingBarcodes.add(String(data.barcode).trim());
    }
  });

  const batchBarcodes = new Set<string>();
  const rows: ValidatedBulkProductRow[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i] || {};
    const rowErrors: string[] = [];
    const lineNumber = Number(p.lineNumber) || i + 1;

    const barcode = String(p.barcode || "").trim();
    const name = String(p.name || "").trim();

    // 1. Barcode check
    if (!barcode) {
      rowErrors.push("Barcode is required and cannot be empty.");
    } else {
      if (batchBarcodes.has(barcode)) {
        rowErrors.push(`Duplicate barcode '${barcode}' within this batch.`);
      } else {
        batchBarcodes.add(barcode);
      }

      if (existingBarcodes.has(barcode)) {
        rowErrors.push(`Barcode '${barcode}' already exists in branch '${branchCode}' inventory.`);
      }
    }

    // 2. Name check
    if (!name) {
      rowErrors.push("Product name is required and cannot be empty.");
    }

    // 3. Price check (must be a valid positive number)
    const rawPrice = p.price;
    const numPrice = Number(rawPrice);
    if (
      rawPrice === undefined ||
      rawPrice === null ||
      rawPrice === "" ||
      isNaN(numPrice) ||
      numPrice <= 0
    ) {
      rowErrors.push(`Price must be a valid positive number (e.g. 100). Received: '${rawPrice ?? ""}'`);
    }

    // 4. Unit Cost check (must be a valid positive number)
    const rawCost = p.unitCost ?? p.unit_cost;
    const numCost = Number(rawCost);
    if (
      rawCost === undefined ||
      rawCost === null ||
      rawCost === "" ||
      isNaN(numCost) ||
      numCost <= 0
    ) {
      rowErrors.push(`Unit cost must be a valid positive number (e.g. 70). Received: '${rawCost ?? ""}'`);
    }

    const safePrice = !isNaN(numPrice) && numPrice > 0 ? numPrice : 0;
    const safeCost = !isNaN(numCost) && numCost > 0 ? numCost : 0;
    const safeStock = Number(p.physicalStock ?? p.physical_stock ?? p.stock) || 0;

    const status = rowErrors.length === 0 ? "valid" : "error";
    rows.push({
      lineNumber,
      barcode: barcode || `ROW-${lineNumber}`,
      name: name || "—",
      price: safePrice,
      unitCost: safeCost,
      gst: String(p.gst ?? "0").trim(),
      physicalStock: safeStock,
      weight: String(p.weight ?? "").trim(),
      expiryDate: p.expiryDate ?? p.expiry_date ?? null,
      status,
      errors: rowErrors,
    });
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return {
    ok: true,
    delimiter: detectedDelimiter,
    rows,
    validCount,
    errorCount,
  };
}

async function executeProductBatchWrites(
  products: any[],
  tenantId: string,
  branchCode: string,
  actorEmail?: string | null
) {
  let batch = adminDb.batch();
  let count = 0;
  let totalImported = 0;

  for (const prod of products) {
    if (!prod || !prod.barcode) continue;

    const barcode = String(prod.barcode).trim();
    const docId = `${tenantId}_${branchCode}_${barcode}`;
    const docRef = adminDb.collection("products").doc(docId);

    const safePrice = Number(prod.price) || 0;
    const safeUnitCost = Number(prod.unitCost ?? prod.unit_cost) || 0;
    const safeStock = Number(prod.physicalStock ?? prod.physical_stock ?? prod.stock) || 0;

    batch.set(
      docRef,
      {
        barcode,
        name: String(prod.name || "Unknown Item").trim(),
        itemType: "PRODUCT",
        price: safePrice,
        unitCost: parseFloat(safeUnitCost.toFixed(2)),
        weight: String(prod.weight || ""),
        gst: String(prod.gst || "0").trim(),
        isBlocked: false,
        isDeleted: false,
        physicalStock: safeStock,
        openingStock: safeStock,
        purchasedStock: 0,
        soldStock: 0,
        damagedStock: 0,
        expiredStock: 0,
        reservedStock: 0,
        searchKey: String(prod.name || "").trim().toLowerCase(),
        tenantId,
        branchCode,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    count++;
    totalImported++;

    if (count >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  await adminDb.collection("admin_audit_logs").add({
    action: "BULK_PRODUCTS_IMPORTED",
    actionType: "BULK_PRODUCTS_IMPORTED",
    actorId: actorEmail ?? "system",
    tenantId,
    branchCode,
    details: `Bulk imported ${totalImported} products for branch ${branchCode}.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/inventory");
  return { ok: true, count: totalImported };
}

export async function commitBulkProductImport(validatedRows: any[], branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "You have view-only access and cannot import products." };
  }

  if (!tenantId) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "Tenant identification missing." };
  }

  if (!validatedRows || !Array.isArray(validatedRows) || validatedRows.length === 0) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "No valid products provided to commit." };
  }

  const validOnly = validatedRows.filter((r) => r.status === "valid" || r.status === undefined);
  if (validOnly.length === 0) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: "No valid rows to commit." };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";

  try {
    const result = await executeProductBatchWrites(
      validOnly,
      tenantId,
      branchCode,
      session.user?.email
    );
    return { ok: true, count: result.count, successCount: result.count, failCount: 0, errors: [] };
  } catch (e: any) {
    return { ok: false, count: 0, successCount: 0, failCount: 0, error: e.message ?? "Bulk import write failed." };
  }
}

export async function bulkImportProductsAction(products: any[], branchParam?: string) {
  const validation = await validateBulkProductImport(products, branchParam);
  if (!validation.ok) {
    return { ok: false, count: 0, error: validation.error ?? "Validation failed." };
  }
  const validRows = validation.rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) {
    return {
      ok: false,
      count: 0,
      error: `Validation failed: all ${validation.errorCount} rows have errors.`,
    };
  }
  const commitRes = await commitBulkProductImport(validRows, branchParam);
  return { ok: commitRes.ok, count: commitRes.count, error: commitRes.error };
}

export async function blockBatch(productId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "View-only access." };
  }

  const docRef = adminDb.collection("products").doc(productId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error("Product not found");

      const data = snap.data()!;
      const stockRemoved = data.physicalStock ?? 0;
      const productName = data.name ?? "Unknown Item";

      tx.update(docRef, {
        physicalStock: 0,
        isBlocked: true,
        blockedAt: FieldValue.serverTimestamp(),
        expiredStock: (data.expiredStock ?? 0) + stockRemoved,
        lastEditedBy: session.user?.email,
      });

      // 1. Sync to ledger collection (used by Flutter Admin blocked_inventory_screen)
      const ledgerRef = adminDb.collection("ledger").doc();
      tx.set(ledgerRef, {
        productId,
        productName,
        quantityRemoved: stockRemoved,
        reason: "EXPIRED_BATCH_BLOCKED",
        tenantId,
        blockedBy: session.user?.email,
        createdAt: FieldValue.serverTimestamp(),
      });

      // 2. Audit Trail for Governance & Compliance
      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "EXPIRED_BATCH_BLOCKED",
        actionType: "EXPIRED_BATCH_BLOCKED",
        productId,
        productName,
        quantityRemoved: stockRemoved,
        tenantId,
        actorId: session.user?.email,
        details: `Blocked batch for ${productName}, removed ${stockRemoved} units from stock.`,
        severity: "WARNING",
        timestamp: FieldValue.serverTimestamp(),
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to block batch." };
  }

  revalidatePath("/inventory");
  return { ok: true };
}

export const blockBatchSafely = blockBatch;

export async function undoBlockBatch(productId: string, restoredStock: number) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "View-only access." };
  }

  try {
    const docRef = adminDb.collection("products").doc(productId);
    await docRef.update({
      physicalStock: FieldValue.increment(restoredStock),
      isBlocked: false,
      unblockedAt: FieldValue.serverTimestamp(),
      lastEditedBy: session.user?.email,
    });

    // Clean up ledger records for this unblocked batch
    try {
      const ledgerSnaps = await adminDb
        .collection("ledger")
        .where("productId", "==", productId)
        .where("reason", "==", "EXPIRED_BATCH_BLOCKED")
        .get();
      if (!ledgerSnaps.empty) {
        const batch = adminDb.batch();
        ledgerSnaps.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (_) {}

    await adminDb.collection("admin_audit_logs").add({
      action: "BATCH_UNBLOCKED",
      actionType: "BATCH_UNBLOCKED",
      productId,
      tenantId,
      actorId: session.user?.email,
      details: `Unblocked batch for ${productId}, restored ${restoredStock} units.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: "Undo failed." };
  }
}

export async function updateProduct(raw: unknown) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot edit products." };
  }

  const payload = raw as any;
  const productId = payload.productId || payload.id;
  if (!productId) return { ok: false, error: "Product ID is missing." };

  const name = String(payload.name || "").trim();
  if (!name) return { ok: false, error: "Product name is required." };

  const price = Number(payload.price) || 0;
  const unitCost = Number(payload.unitCost) || 0;
  const physicalStock = Number(payload.physicalStock ?? payload.stock) || 0;
  const weight = String(payload.weight || "").trim();
  const gst = String(payload.gst || "0").trim();
  const expiryDate = payload.expiryDate ? Timestamp.fromDate(new Date(payload.expiryDate)) : null;

  try {
    const docRef = adminDb.collection("products").doc(productId);
    const snap = await docRef.get();
    if (!snap.exists) return { ok: false, error: "Product not found." };

    await docRef.update({
      name,
      searchKey: name.toLowerCase(),
      price,
      unitCost: parseFloat(unitCost.toFixed(2)),
      physicalStock,
      weight,
      gst,
      expiryDate,
      lastEditedBy: session.user?.name ?? session.user?.email ?? "Store Admin",
      lastEditedByEmail: session.user?.email ?? "",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "MASTER_PRODUCT_UPDATED",
      actionType: "MASTER_PRODUCT_UPDATED",
      productId,
      productName: name,
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      tenantId,
      details: `Updated Master SKU ${name} (${snap.data()?.barcode}). Price: ₹${price}, Cost: ₹${unitCost}, Stock: ${physicalStock}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update product." };
  }
}

export async function deleteProduct(productId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "View-only access." };
  }

  try {
    const docRef = adminDb.collection("products").doc(productId);
    const snap = await docRef.get();
    if (!snap.exists) return { ok: false, error: "Product not found." };

    await docRef.update({
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      lastEditedBy: session.user?.email,
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "PRODUCT_DELETED",
      actionType: "PRODUCT_DELETED",
      productId,
      productName: snap.data()?.name,
      tenantId,
      actorId: session.user?.email,
      details: `Deleted product ${snap.data()?.name} (${snap.data()?.barcode}).`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to delete product." };
  }
}

export async function bulkDeleteProducts(productIds: string[]) {
  if (!productIds || productIds.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No products selected."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const id of productIds) {
    const res = await deleteProduct(id);
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${id}: ${res.error ?? "Failed to delete"}`);
    }
  }

  revalidatePath("/inventory");
  return { ok: failCount === 0, successCount, failCount, errors };
}

export async function bulkBlockBatches(productIds: string[]) {
  if (!productIds || productIds.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No products selected."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const id of productIds) {
    const res = await blockBatch(id);
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${id}: ${res.error ?? "Failed to block"}`);
    }
  }

  revalidatePath("/inventory");
  return { ok: failCount === 0, successCount, failCount, errors };
}