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

export async function bulkImportProductsAction(products: any[], branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot import products." };
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return { ok: false, error: "No valid products received for import." };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";

  try {
    let batch = adminDb.batch();
    let count = 0;
    let totalImported = 0;

    for (const prod of products) {
      if (!prod || !prod.barcode) continue;

      const barcode = String(prod.barcode).trim();
      const docId = `${tenantId}_${branchCode}_${barcode}`;
      const docRef = adminDb.collection("products").doc(docId);

      const safePrice = Number(prod.price) || 0;
      const safeUnitCost = Number(prod.unitCost) || 0;
      const safeStock = Number(prod.physicalStock || prod.stock) || 0;

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
      actorId: session.user?.email,
      tenantId,
      branchCode,
      details: `Bulk imported ${totalImported} products for branch ${branchCode}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/inventory");
    return { ok: true, count: totalImported };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message ?? "Bulk import failed." };
  }
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