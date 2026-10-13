"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess, requireRole, requireRoutePlan } from "@/lib/rbac";
import { addProductSchema, stockTransferRequestSchema } from "@/lib/schemas/product-schema";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { detectDelimiter } from "@/lib/csv-utils";
import { serializeFirestoreDoc } from "@/lib/utils/serialize-firestore";

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

    detectedDelimiter = detectDelimiter(lines[0]);

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

// ==========================================
// INTER-BRANCH STOCK TRANSFER ACTIONS (Growth Plan)
// ==========================================

export async function requestStockTransfer(raw: unknown) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Unauthorized access" };
  }
  if (!tenantId) return { ok: false, error: "Tenant required" };

  try {
    await requireRoutePlan(tenantId, "inventory_transfer");
  } catch {
    return { ok: false, error: "Inter-branch stock transfer is a Growth plan feature. Please upgrade your plan." };
  }

  const parsed = stockTransferRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid transfer request" };
  }
  const data = parsed.data;

  // Security: both fromBranchCode and toBranchCode must belong to same tenantId
  const [fromStoreSnap, toStoreSnap] = await Promise.all([
    adminDb
      .collection("stores")
      .where("tenantId", "==", tenantId)
      .where("branchCode", "==", data.fromBranchCode)
      .limit(1)
      .get(),
    adminDb
      .collection("stores")
      .where("tenantId", "==", tenantId)
      .where("branchCode", "==", data.toBranchCode)
      .limit(1)
      .get(),
  ]);

  const fromStoreDoc = fromStoreSnap.docs.find((d) => d.data().isDeleted !== true);
  const toStoreDoc = toStoreSnap.docs.find((d) => d.data().isDeleted !== true);

  if (!fromStoreDoc || !toStoreDoc) {
    return { ok: false, error: "Branch not found or access denied" };
  }

  // Check source branch has enough physicalStock
  const sourceDocId = `${tenantId}_${data.fromBranchCode}_${data.barcode.trim()}`;
  const sourceProdSnap = await adminDb.collection("products").doc(sourceDocId).get();
  if (!sourceProdSnap.exists) {
    return { ok: false, error: `Product with barcode ${data.barcode} not found at source branch (${data.fromBranchCode})` };
  }
  const sourceProd = sourceProdSnap.data()!;
  const availableStock = Number(sourceProd.physicalStock ?? 0);
  if (availableStock < data.quantityRequested) {
    return { ok: false, error: `Insufficient stock at source branch (available: ${availableStock})` };
  }

  // Generate challanNumber: "TRF-{YYYYMMDD}-{random 4-digit}"
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomSeq = Math.floor(1000 + Math.random() * 9000);
  const challanNumber = `TRF-${dateStr}-${randomSeq}`;

  const transferRef = adminDb.collection("stock_transfers").doc();
  const transferDoc = {
    transferId: transferRef.id,
    tenantId,
    fromBranchCode: data.fromBranchCode,
    toBranchCode: data.toBranchCode,
    barcode: data.barcode.trim(),
    productName: sourceProd.name ?? data.barcode.trim(),
    quantityRequested: data.quantityRequested,
    quantityDispatched: 0,
    quantityReceived: 0,
    status: "PENDING",
    requestedBy: session.user?.email ?? "Store Manager",
    requestedAt: FieldValue.serverTimestamp(),
    notes: data.notes?.trim() || null,
    challanNumber,
  };

  await transferRef.set(transferDoc);

  await adminDb.collection("admin_audit_logs").add({
    action: "STOCK_TRANSFER_REQUESTED",
    actionType: "STOCK_TRANSFER_REQUESTED",
    tenantId,
    actorId: session.user?.email,
    actorEmail: session.user?.email,
    details: `Stock transfer ${challanNumber} requested: ${data.quantityRequested}x ${sourceProd.name} from ${data.fromBranchCode} to ${data.toBranchCode}`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/transfers");
  return { ok: true, transferId: transferRef.id, challanNumber };
}

export async function dispatchStockTransfer(transferId: string, quantityDispatched: number) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Unauthorized access" };
  }
  if (!tenantId) return { ok: false, error: "Tenant required" };

  const qty = Number(quantityDispatched);
  if (isNaN(qty) || qty <= 0) {
    return { ok: false, error: "Dispatched quantity must be at least 1" };
  }

  const transferRef = adminDb.collection("stock_transfers").doc(transferId);
  const transferSnap = await transferRef.get();
  if (!transferSnap.exists) {
    return { ok: false, error: "Transfer request not found" };
  }
  const transfer = transferSnap.data()!;
  if (transfer.tenantId !== tenantId) {
    return { ok: false, error: "Access denied" };
  }
  if (transfer.status !== "PENDING") {
    return { ok: false, error: `Cannot dispatch transfer in ${transfer.status} status` };
  }

  // Security: manager must belong to fromBranchCode
  if (role === "manager" && storeId && storeId !== transfer.fromBranchCode) {
    return { ok: false, error: "Only managers of the source branch can dispatch this transfer" };
  }

  const sourceDocId = `${tenantId}_${transfer.fromBranchCode}_${transfer.barcode}`;
  const sourceProdRef = adminDb.collection("products").doc(sourceDocId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const sSnap = await tx.get(sourceProdRef);
      if (!sSnap.exists) throw new Error("Source product not found in inventory");
      const sData = sSnap.data()!;
      const available = Number(sData.physicalStock ?? 0);
      if (available < qty) {
        throw new Error(`Insufficient stock at source branch (available: ${available}, requested to dispatch: ${qty})`);
      }

      // a. Deduct physicalStock
      // b. Increment inTransitStock
      tx.update(sourceProdRef, {
        physicalStock: FieldValue.increment(-qty),
        inTransitStock: FieldValue.increment(qty),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // c. Update transfer doc
      tx.update(transferRef, {
        status: "DISPATCHED",
        quantityDispatched: qty,
        dispatchedBy: session.user?.email ?? session.user?.name ?? "Store Manager",
        dispatchedAt: FieldValue.serverTimestamp(),
      });
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "STOCK_TRANSFER_DISPATCHED",
      actionType: "STOCK_TRANSFER_DISPATCHED",
      tenantId,
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      details: `Dispatched ${qty} units for transfer ${transfer.challanNumber || transferId} from ${transfer.fromBranchCode}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/transfers");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Dispatch transaction failed" };
  }
}

export async function receiveStockTransfer(transferId: string, quantityReceived: number) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Unauthorized access" };
  }
  if (!tenantId) return { ok: false, error: "Tenant required" };

  const qty = Number(quantityReceived);
  if (isNaN(qty) || qty <= 0) {
    return { ok: false, error: "Received quantity must be at least 1" };
  }

  const transferRef = adminDb.collection("stock_transfers").doc(transferId);
  const transferSnap = await transferRef.get();
  if (!transferSnap.exists) {
    return { ok: false, error: "Transfer request not found" };
  }
  const transfer = transferSnap.data()!;
  if (transfer.tenantId !== tenantId) {
    return { ok: false, error: "Access denied" };
  }
  if (transfer.status !== "DISPATCHED") {
    return { ok: false, error: `Cannot receive transfer in ${transfer.status} status` };
  }

  // Security: manager must belong to toBranchCode
  if (role === "manager" && storeId && storeId !== transfer.toBranchCode) {
    return { ok: false, error: "Only managers of the destination branch can receive this transfer" };
  }

  const sourceDocId = `${tenantId}_${transfer.fromBranchCode}_${transfer.barcode}`;
  const destDocId = `${tenantId}_${transfer.toBranchCode}_${transfer.barcode}`;
  const sourceProdRef = adminDb.collection("products").doc(sourceDocId);
  const destProdRef = adminDb.collection("products").doc(destDocId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const [sourceSnap, destSnap] = await Promise.all([
        tx.get(sourceProdRef),
        tx.get(destProdRef),
      ]);

      const sData = sourceSnap.data() || {};

      if (!destSnap.exists) {
        tx.set(destProdRef, {
          barcode: transfer.barcode,
          name: sData.name ?? transfer.productName,
          category: sData.category ?? "General",
          itemType: "PRODUCT",
          price: Number(sData.price ?? 0),
          unitCost: Number(sData.unitCost ?? 0),
          gst: sData.gst ?? "0",
          physicalStock: qty,
          openingStock: qty,
          purchasedStock: 0,
          soldStock: 0,
          damagedStock: 0,
          expiredStock: 0,
          reservedStock: 0,
          inTransitStock: 0,
          weight: sData.weight ?? "",
          expiryDate: sData.expiryDate ?? null,
          tenantId,
          branchCode: transfer.toBranchCode,
          isBlocked: false,
          addedBy: `Transferred from ${transfer.fromBranchCode}`,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(destProdRef, {
          physicalStock: FieldValue.increment(qty),
          purchasedStock: FieldValue.increment(qty),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (sourceSnap.exists) {
        tx.update(sourceProdRef, {
          inTransitStock: FieldValue.increment(-Number(transfer.quantityDispatched || qty)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.update(transferRef, {
        status: "RECEIVED",
        quantityReceived: qty,
        receivedBy: session.user?.email ?? session.user?.name ?? "Store Manager",
        receivedAt: FieldValue.serverTimestamp(),
      });
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "STOCK_TRANSFER_RECEIVED",
      actionType: "STOCK_TRANSFER_RECEIVED",
      tenantId,
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      details: `Received ${qty} units for transfer ${transfer.challanNumber || transferId} at branch ${transfer.toBranchCode}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    revalidatePath("/inventory/transfers");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Receive transaction failed" };
  }
}

export async function cancelStockTransfer(transferId: string, reason?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Unauthorized access" };
  }
  if (!tenantId) return { ok: false, error: "Tenant required" };

  const transferRef = adminDb.collection("stock_transfers").doc(transferId);
  const transferSnap = await transferRef.get();
  if (!transferSnap.exists) {
    return { ok: false, error: "Transfer request not found" };
  }
  const transfer = transferSnap.data()!;
  if (transfer.tenantId !== tenantId) {
    return { ok: false, error: "Access denied" };
  }

  if (transfer.status === "DISPATCHED") {
    return { ok: false, error: "Cannot cancel a dispatched transfer. Contact the receiving branch." };
  }
  if (transfer.status !== "PENDING") {
    return { ok: false, error: `Cannot cancel a transfer with status ${transfer.status}` };
  }

  if (role === "manager" && storeId && (storeId !== transfer.fromBranchCode && storeId !== transfer.toBranchCode)) {
    return { ok: false, error: "Access denied" };
  }

  const updatedNotes = reason?.trim()
    ? transfer.notes
      ? `${transfer.notes} | Cancel reason: ${reason.trim()}`
      : reason.trim()
    : transfer.notes || null;

  await transferRef.update({
    status: "CANCELLED",
    cancelledBy: session.user?.email ?? "Store Admin",
    cancelledAt: FieldValue.serverTimestamp(),
    notes: updatedNotes,
  });

  await adminDb.collection("admin_audit_logs").add({
    action: "STOCK_TRANSFER_CANCELLED",
    actionType: "STOCK_TRANSFER_CANCELLED",
    tenantId,
    actorId: session.user?.email,
    actorEmail: session.user?.email,
    details: `Cancelled stock transfer ${transfer.challanNumber || transferId}. Reason: ${reason || "N/A"}`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/transfers");
  return { ok: true };
}

export async function getStockTransfers(branchCode?: string, status?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "Unauthorized access", transfers: [] };
  }
  if (!tenantId) return { ok: true, transfers: [] };

  try {
    const snap = await adminDb
      .collection("stock_transfers")
      .where("tenantId", "==", tenantId)
      .limit(150)
      .get();

    let transfers = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Scope filter for manager or branchCode
    if (role === "manager" && storeId) {
      transfers = transfers.filter(
        (t: any) => t.fromBranchCode === storeId || t.toBranchCode === storeId
      );
    } else if (branchCode && branchCode !== "ALL") {
      transfers = transfers.filter(
        (t: any) => t.fromBranchCode === branchCode || t.toBranchCode === branchCode
      );
    }

    if (status && status !== "ALL") {
      transfers = transfers.filter((t: any) => t.status === status.toUpperCase());
    }

    // Sort by requestedAt descending
    transfers.sort((a: any, b: any) => {
      const aTime = a.requestedAt?.toMillis ? a.requestedAt.toMillis() : (a.requestedAt?._seconds ? a.requestedAt._seconds * 1000 : 0);
      const bTime = b.requestedAt?.toMillis ? b.requestedAt.toMillis() : (b.requestedAt?._seconds ? b.requestedAt._seconds * 1000 : 0);
      return bTime - aTime;
    });

    return {
      ok: true,
      transfers: serializeFirestoreDoc(transfers),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed to fetch transfers", transfers: [] };
  }
}

export async function getProductStockAtBranch(barcode: string, branchCode: string) {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId || !barcode || !branchCode) {
    return { ok: false, error: "Missing barcode or branch" };
  }

  const cleanBarcode = barcode.trim();
  const cleanBranch = branchCode.trim().toUpperCase();
  const docId = `${tenantId}_${cleanBranch}_${cleanBarcode}`;

  const doc = await adminDb.collection("products").doc(docId).get();
  if (!doc.exists) {
    return { ok: false, error: `Product not found at branch ${cleanBranch}` };
  }
  const data = doc.data()!;
  return {
    ok: true,
    product: {
      barcode: cleanBarcode,
      name: data.name ?? cleanBarcode,
      physicalStock: Number(data.physicalStock ?? 0),
      price: Number(data.price ?? 0),
    },
  };
}