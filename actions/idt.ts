"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export interface IdtItem {
  barcode: string;
  name: string;
  quantity: number | string;
  price: number | string;
  unitCost: number | string;
  physicalStock?: number | string;
  weight: string;
  hsn?: string;
  gst?: string;
  expiryDate?: string;
  isLocal?: boolean;
  _localId?: number;
  _docId?: string;
  _originalIndex?: number;
}

export interface IdtRecord {
  docId: string;
  tenantId?: string;
  branchCode?: string;
  status: string;
  source?: string;
  timestampMs: number;
  items: IdtItem[];
}

export async function fetchIdtDeposits(targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const effectiveBranchCode = resolveStoreScope(role, storeId, targetBranchCode);

  let query: FirebaseFirestore.Query = adminDb
    .collection("idt_deposits")
    .where("status", "==", "VERIFIED")
    .orderBy("timestamp", "desc")
    .limit(40);

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (
    effectiveBranchCode &&
    effectiveBranchCode !== "HQ" &&
    effectiveBranchCode !== "ALL"
  ) {
    query = query.where("branchCode", "==", effectiveBranchCode);
  }

  const snap = await query.get();
  const records: IdtRecord[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      docId: doc.id,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
      status: data.status ?? "VERIFIED",
      source: data.source ?? "IDT_TERMINAL",
      timestampMs:
        (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
      items: (data.items ?? []).map((item: any, idx: number) => ({
        barcode: item.barcode ?? "",
        name: item.name ?? "",
        quantity: item.quantity ?? 1,
        price: item.price ?? 0,
        unitCost: item.unitCost ?? 0,
        physicalStock: item.physicalStock ?? 0,
        weight: item.weight ?? "",
        hsn: item.hsn ?? "",
        gst: item.gst ?? "0",
        expiryDate: item.expiryDate ?? "",
        isLocal: false,
        _docId: doc.id,
        _originalIndex: idx,
      })),
    };
  });

  return { ok: true, records };
}

export async function lookupProductByBarcode(
  barcode: string,
  targetBranchCode?: string
) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const effectiveBranchCode = resolveStoreScope(role, storeId, targetBranchCode) || "HQ";

  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return { ok: false, product: null };

  const safeTId = tenantId || "UNKNOWN";
  const docId = `${safeTId}_${effectiveBranchCode}_${cleanBarcode}`;

  // 1. Check direct doc key format
  const docSnap = await adminDb.collection("products").doc(docId).get();
  if (docSnap.exists) {
    const data = docSnap.data()!;
    return {
      ok: true,
      product: {
        barcode: cleanBarcode,
        name: data.name ?? "",
        price: data.price ?? 0,
        unitCost: data.unitCost ?? 0,
        physicalStock: data.physicalStock ?? 0,
        weight: data.weight ?? "",
        hsn: data.hsn ?? "",
        gst: data.gst ? String(data.gst) : "0",
        expiryDate: data.expiryDate ?? "",
      },
    };
  }

  // 2. Query by barcode if doc key differs
  let q: FirebaseFirestore.Query = adminDb
    .collection("products")
    .where("barcode", "==", cleanBarcode);
  if (role !== "super_admin" && tenantId) {
    q = q.where("tenantId", "==", tenantId);
  }
  if (effectiveBranchCode && effectiveBranchCode !== "ALL") {
    q = q.where("branchCode", "==", effectiveBranchCode);
  }

  const querySnap = await q.limit(1).get();
  if (!querySnap.empty) {
    const data = querySnap.docs[0].data();
    return {
      ok: true,
      product: {
        barcode: cleanBarcode,
        name: data.name ?? "",
        price: data.price ?? 0,
        unitCost: data.unitCost ?? 0,
        physicalStock: data.physicalStock ?? 0,
        weight: data.weight ?? "",
        hsn: data.hsn ?? "",
        gst: data.gst ? String(data.gst) : "0",
        expiryDate: data.expiryDate ?? "",
      },
    };
  }

  return { ok: true, product: null };
}

export async function markMultipleAsProcessed(
  itemsToProcess: IdtItem[],
  targetBranchCode?: string
) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const effectiveBranchCode = resolveStoreScope(role, storeId, targetBranchCode) || "HQ";
  const safeTId = tenantId || "TENANT";

  if (itemsToProcess.length === 0) {
    return { ok: false, error: "No items selected to Go Live." };
  }

  try {
    const batch = adminDb.batch();

    // Group items by DB docId if present
    const groupedDb: Record<string, IdtItem[]> = {};
    const localItems: IdtItem[] = [];

    for (const item of itemsToProcess) {
      if (item.isLocal || !item._docId) {
        localItems.push(item);
      } else {
        const dId = item._docId;
        if (!groupedDb[dId]) groupedDb[dId] = [];
        groupedDb[dId].push(item);
      }
    }

    // Process DB Items
    for (const docId of Object.keys(groupedDb)) {
      const processedItems = groupedDb[docId];
      const docRef = adminDb.collection("idt_deposits").doc(docId);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const record = docSnap.data()!;
        const docTenantId = record.tenantId || safeTId;
        const docBranchCode = record.branchCode || effectiveBranchCode;
        const existingItems: any[] = Array.isArray(record.items) ? [...record.items] : [];

        for (const item of processedItems) {
          await updateOrSetProduct(batch, docTenantId, docBranchCode, item);
          const removeIdx = existingItems.findIndex(
            (ex) => String(ex.barcode) === String(item.barcode)
          );
          if (removeIdx >= 0) existingItems.splice(removeIdx, 1);
        }

        if (existingItems.length === 0) {
          batch.update(docRef, {
            status: "PROCESSED",
            processedAt: FieldValue.serverTimestamp(),
            processedBy: session.user?.email,
          });
        } else {
          batch.update(docRef, { items: existingItems });
          // Create separate processed record for history
          const histRef = adminDb.collection("idt_deposits").doc();
          batch.set(histRef, {
            tenantId: docTenantId,
            branchCode: docBranchCode,
            status: "PROCESSED",
            source: record.source ?? "PARTIAL_PROCESS",
            items: processedItems.map(cleanItemProps),
            timestamp: record.timestamp ?? FieldValue.serverTimestamp(),
            processedAt: FieldValue.serverTimestamp(),
            processedBy: session.user?.email,
          });
        }
      }
    }

    // Process Local Scanned Items
    if (localItems.length > 0) {
      const cleanLocals: any[] = [];
      for (const item of localItems) {
        await updateOrSetProduct(batch, safeTId, effectiveBranchCode, item);
        cleanLocals.push(cleanItemProps(item));
      }

      const newDepositRef = adminDb.collection("idt_deposits").doc();
      batch.set(newDepositRef, {
        tenantId: safeTId,
        branchCode: effectiveBranchCode,
        status: "PROCESSED",
        source: "ADMIN_DIRECT_SCAN",
        items: cleanLocals,
        timestamp: FieldValue.serverTimestamp(),
        processedAt: FieldValue.serverTimestamp(),
        processedBy: session.user?.email,
      });
    }

    // Write audit log
    const auditRef = adminDb.collection("admin_audit_logs").doc();
    batch.set(auditRef, {
      action: "IDT_VERIFIED_GO_LIVE",
      itemCount: itemsToProcess.length,
      tenantId: safeTId,
      branchCode: effectiveBranchCode,
      adminId: session.user?.email,
      adminEmail: session.user?.email,
      adminName: session.user?.name || "Admin",
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Failed to Go Live with items." };
  }

  revalidatePath("/idt");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteIdtItems(itemsToDelete: IdtItem[]) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  try {
    const batch = adminDb.batch();
    const grouped: Record<string, IdtItem[]> = {};

    for (const item of itemsToDelete) {
      if (item._docId) {
        if (!grouped[item._docId]) grouped[item._docId] = [];
        grouped[item._docId].push(item);
      }
    }

    for (const docId of Object.keys(grouped)) {
      const docRef = adminDb.collection("idt_deposits").doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) continue;

      const record = docSnap.data()!;
      let existingItems: any[] = Array.isArray(record.items) ? [...record.items] : [];
      const barcodesToRemove = new Set(grouped[docId].map((i) => String(i.barcode)));

      existingItems = existingItems.filter((ex) => !barcodesToRemove.has(String(ex.barcode)));

      if (existingItems.length === 0) {
        batch.delete(docRef);
      } else {
        batch.update(docRef, { items: existingItems });
      }
    }

    await batch.commit();
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Failed to delete IDT items." };
  }

  revalidatePath("/idt");
  return { ok: true };
}

async function updateOrSetProduct(
  batch: FirebaseFirestore.WriteBatch,
  tId: string,
  bCode: string,
  item: IdtItem
) {
  const barcode = (item.barcode || "").trim();
  const safeBCode = bCode?.trim() || "HQ";
  const safeTId = tId?.trim() || "UNKNOWN";
  const qty = parseInt(String(item.quantity || "1"), 10) || 1;
  const price = parseFloat(String(item.price || "0")) || 0;
  const unitCost = parseFloat(String(item.unitCost || "0")) || 0;

  const productRef = adminDb
    .collection("products")
    .doc(`${safeTId}_${safeBCode}_${barcode}`);

  const docSnap = await productRef.get();

  if (docSnap.exists) {
    batch.update(productRef, {
      physicalStock: FieldValue.increment(qty),
      price,
      unitCost,
      gst: item.gst || "",
      hsn: item.hsn || "",
      expiryDate: item.expiryDate || "",
      weight: item.weight || "",
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    batch.set(productRef, {
      addedBy: "IDT Terminal",
      addedByEmail: "idt@clickout.com",
      barcode,
      branchCode: safeBCode,
      tenantId: safeTId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      name: item.name || "UNKNOWN ITEM",
      searchKey: (item.name || "UNKNOWN ITEM").toLowerCase(),
      isActive: true,
      isPublished: true,
      itemType: "PRODUCT",
      price,
      unitCost,
      gst: item.gst || "0",
      hsn: item.hsn || "",
      expiryDate: item.expiryDate || "",
      weight: item.weight || "1 unit",
      openingStock: qty,
      physicalStock: qty,
      damagedStock: 0,
      expiredStock: 0,
      purchasedStock: 0,
      reservedStock: 0,
      soldStock: 0,
    });
  }
}

function cleanItemProps(item: IdtItem) {
  return {
    barcode: item.barcode,
    name: item.name,
    quantity: parseInt(String(item.quantity || "1"), 10) || 1,
    price: parseFloat(String(item.price || "0")) || 0,
    unitCost: parseFloat(String(item.unitCost || "0")) || 0,
    weight: item.weight || "",
    hsn: item.hsn || "",
    gst: item.gst || "0",
    expiryDate: item.expiryDate || "",
  };
}