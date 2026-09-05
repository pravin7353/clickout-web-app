"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function approveAiSuggestion(suggestionId: string, targetBranchCode?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot approve suggestions." };
  }

  const adminEmail = session.user?.email ?? "Unknown";
  const suggestionRef = adminDb.collection("ai_po_suggestions").doc(suggestionId);

  try {
    const suggestionSnap = await suggestionRef.get();
    if (!suggestionSnap.exists) return { ok: false, error: "Suggestion no longer exists." };
    const s = suggestionSnap.data()!;

    const productId = s.productId;
    const supplierId = s.supplierId ?? "DEFAULT_SUPPLIER";
    const branchCode = resolveStoreScope(role, storeId, targetBranchCode ?? s.branchCode) ?? "HQ";
    const orderQty = s.suggestedQty ?? s.orderQty ?? 50;

    let productName = "Unknown Product";
    let unitCost = 0;

    if (productId) {
      const productDoc = await adminDb.collection("products").doc(productId).get();
      if (productDoc.exists) {
        const pdata = productDoc.data();
        productName = pdata?.name ?? productName;
        unitCost = parseFloat(pdata?.unitCost ?? "0") || 0;
        if (unitCost <= 0) unitCost = (parseFloat(pdata?.price ?? "0") || 0) * 0.7;
      }
    }

    const totalItemCost = unitCost * orderQty;

    const poRef = adminDb.collection("purchase_orders").doc();
    await poRef.set({
      id: poRef.id,
      poId: poRef.id,
      supplierId,
      status: "APPROVED",
      branchCode,
      expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      totalItems: 1,
      totalOrderValue: totalItemCost,
      createdAt: FieldValue.serverTimestamp(),
      approvedBy: `AI_CONFIRMED_BY_${adminEmail}`,
      approvedAt: FieldValue.serverTimestamp(),
      tenantId,
      items: [{ productId, name: productName, orderQty, unitCost, totalItemCost }],
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "AI_PO_SUGGESTION_APPROVED",
      actionType: "AI_PO_SUGGESTION_APPROVED",
      actorId: adminEmail,
      tenantId,
      branchCode,
      details: `Approved AI PO #${poRef.id} for ${orderQty} units of ${productName} (₹${totalItemCost.toFixed(2)})`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    await suggestionRef.delete();
    revalidatePath("/procurement");
    return { ok: true, poId: poRef.id };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "AI Approval Failed" };
  }
}

export async function rejectAiSuggestion(suggestionId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot reject suggestions." };
  }

  try {
    await adminDb.collection("ai_po_suggestions").doc(suggestionId).delete();
    await adminDb.collection("admin_audit_logs").add({
      action: "AI_PO_SUGGESTION_REJECTED",
      actionType: "AI_PO_SUGGESTION_REJECTED",
      actorId: session.user?.email,
      tenantId,
      details: `Discarded AI reorder suggestion ${suggestionId}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
    revalidatePath("/procurement");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to reject suggestion." };
  }
}

export async function approvePO(poId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot approve purchase orders." };
  }

  try {
    await adminDb.collection("purchase_orders").doc(poId).update({
      status: "APPROVED",
      approvedBy: session.user?.email ?? "Admin",
      approvedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "PO_APPROVED",
      actionType: "PO_APPROVED",
      actorId: session.user?.email,
      tenantId,
      poId,
      details: `Approved Purchase Order #${poId}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to approve PO." };
  }
}

export async function deletePO(poId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot discard purchase orders." };
  }

  try {
    await adminDb.collection("purchase_orders").doc(poId).delete();
    await adminDb.collection("admin_audit_logs").add({
      action: "PO_DISCARDED",
      actionType: "PO_DISCARDED",
      actorId: session.user?.email,
      tenantId,
      poId,
      details: `Discarded Purchase Order #${poId}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
    revalidatePath("/procurement");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to discard PO." };
  }
}

export async function receivePoStock(poId: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot receive stock." };
  }

  try {
    const poRef = adminDb.collection("purchase_orders").doc(poId);
    const poSnap = await poRef.get();
    if (!poSnap.exists) return { ok: false, error: "PO not found." };
    const poData = poSnap.data()!;

    const items = poData.items ?? [];
    const branchCode = poData.branchCode ?? storeId ?? "HQ";

    const batch = adminDb.batch();

    // Increment physicalStock for each item
    for (const item of items) {
      const barcode = item.barcode ?? item.productId;
      if (!barcode) continue;
      const qty = Number(item.orderQty ?? item.quantity ?? 0);
      if (qty <= 0) continue;

      let pQuery: FirebaseFirestore.Query = adminDb
        .collection("products")
        .where("barcode", "==", barcode);
      if (tenantId) pQuery = pQuery.where("tenantId", "==", tenantId);
      if (branchCode) pQuery = pQuery.where("branchCode", "==", branchCode);

      const pSnap = await pQuery.limit(1).get();
      if (!pSnap.empty) {
        batch.update(pSnap.docs[0].ref, {
          physicalStock: FieldValue.increment(qty),
          lastRestockedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    batch.update(poRef, {
      status: "DELIVERED",
      receivedAt: FieldValue.serverTimestamp(),
      receivedBy: session.user?.email ?? "Staff",
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "PO_STOCK_RECEIVED",
      actionType: "PO_STOCK_RECEIVED",
      actorId: session.user?.email,
      tenantId,
      branchCode,
      poId,
      details: `Received delivery for PO #${poId}, synchronized inventory physical stock.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to receive stock." };
  }
}

export async function createManualPO(
  productId: string,
  orderQty: number,
  supplierId: string = "DEFAULT_SUPPLIER",
  targetBranchCode?: string
) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot create purchase orders." };
  }

  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";
  if (!productId.trim()) return { ok: false, error: "Product identifier is required." };
  if (orderQty <= 0) return { ok: false, error: "Quantity must be greater than zero." };

  try {
    // Try finding product by document ID or barcode
    let productDoc = await adminDb.collection("products").doc(productId.trim()).get();
    let pdata = productDoc.exists ? productDoc.data() : null;

    if (!pdata) {
      const bSnap = await adminDb
        .collection("products")
        .where("barcode", "==", productId.trim())
        .limit(1)
        .get();
      if (!bSnap.empty) {
        productDoc = bSnap.docs[0];
        pdata = productDoc.data();
      }
    }

    const productName = pdata?.name ?? `Product (${productId.trim()})`;
    let unitCost = parseFloat(pdata?.unitCost ?? "0") || 0;
    if (unitCost <= 0) unitCost = (parseFloat(pdata?.price ?? "0") || 0) * 0.7;
    const totalOrderValue = unitCost * orderQty;

    const poRef = adminDb.collection("purchase_orders").doc();
    await poRef.set({
      id: poRef.id,
      poId: poRef.id,
      supplierId,
      status: "DRAFT",
      branchCode,
      expectedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      totalItems: 1,
      totalOrderValue,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.user?.email ?? "Admin",
      tenantId,
      items: [
        {
          productId: productDoc.id ?? productId.trim(),
          barcode: pdata?.barcode ?? productId.trim(),
          name: productName,
          orderQty,
          unitCost,
          totalItemCost: totalOrderValue,
        },
      ],
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "MANUAL_PO_CREATED",
      actionType: "MANUAL_PO_CREATED",
      actorId: session.user?.email,
      tenantId,
      branchCode,
      poId: poRef.id,
      details: `Created manual PO #${poRef.id} for ${orderQty} units of ${productName} (₹${totalOrderValue.toFixed(2)})`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    return { ok: true, poId: poRef.id };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Manual PO creation failed." };
  }
}

export async function applyProductOffer(payload: {
  productId: string;
  offerType: string;
  data: Record<string, any>;
}) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot apply offers." };
  }

  const { productId, offerType, data } = payload;
  if (!productId) return { ok: false, error: "Product ID is required." };

  try {
    const docRef = adminDb.collection("products").doc(productId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return { ok: false, error: "Product not found." };

    const pdata = docSnap.data()!;
    const price = Number(pdata.price ?? pdata.mrp ?? 0);

    const updatePayload: Record<string, any> = {
      clearanceActive: true,
      clearanceType: offerType,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.user?.email ?? "Admin",
      ...data,
    };

    // Derived offer price calculation (per unit effective price)
    if (offerType === "PERCENTAGE") {
      const pct = Number(data.discountPercent ?? data.value1 ?? 0);
      updatePayload.offerPrice = Math.max(0, Number((price * (1 - pct / 100)).toFixed(2)));
    } else if (offerType === "FLAT_AMOUNT") {
      const flat = Number(data.discountAmount ?? data.value1 ?? 0);
      updatePayload.offerPrice = Math.max(0, Number((price - flat).toFixed(2)));
    } else if (offerType === "FLASH_SALE") {
      const pct = Number(data.discountPercent ?? data.value1 ?? 0);
      updatePayload.offerPrice = Math.max(0, Number((price * (1 - pct / 100)).toFixed(2)));
      const hours = Number(data.durationHours ?? data.value2 ?? 24);
      updatePayload.expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    } else if (offerType === "BUNDLE_PRICE") {
      const bQty = Number(data.bundleQty ?? data.value1 ?? 2);
      const bPrice = Number(data.bundlePrice ?? data.value2 ?? price * bQty);
      updatePayload.offerPrice = bQty > 0 ? Math.max(0, Number((bPrice / bQty).toFixed(2))) : price;
    } else if (offerType === "BOGO") {
      updatePayload.offerPrice = Math.max(0, Number((price * 0.5).toFixed(2)));
    } else if (offerType === "BUY_X_GET_Y" || offerType === "BUY_X_GET_Y_CROSS") {
      const bx = Number(data.buyQty ?? data.value1 ?? 2);
      const gy = Number(data.freeQty ?? data.value2 ?? 1);
      const ratio = (bx + gy > 0) ? bx / (bx + gy) : 1;
      updatePayload.offerPrice = Math.max(0, Number((price * ratio).toFixed(2)));
    } else if (offerType === "TIERED_QTY") {
      const pct = Number(data.discountPercent ?? data.value2 ?? 10);
      updatePayload.offerPrice = Math.max(0, Number((price * (1 - pct / 100)).toFixed(2)));
    }

    await docRef.update(updatePayload);

    await adminDb.collection("admin_audit_logs").add({
      action: "PRODUCT_OFFER_APPLIED",
      actionType: "PRODUCT_OFFER_APPLIED",
      actorId: session.user?.email,
      tenantId,
      productId,
      details: `Applied offer '${offerType}' on product ${pdata.name ?? productId}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to apply offer." };
  }
}

export async function removeProductOffer(productId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot remove offers." };
  }

  try {
    const docRef = adminDb.collection("products").doc(productId);
    const snap = await docRef.get();
    if (!snap.exists) return { ok: false, error: "Product not found." };

    await docRef.update({
      clearanceActive: FieldValue.delete(),
      clearanceType: FieldValue.delete(),
      clearanceValue: FieldValue.delete(),
      clearanceTag: FieldValue.delete(),
      offerPrice: FieldValue.delete(),
      discountPercent: FieldValue.delete(),
      discountAmount: FieldValue.delete(),
      buyQty: FieldValue.delete(),
      freeQty: FieldValue.delete(),
      value1: FieldValue.delete(),
      value2: FieldValue.delete(),
      targetProductId: FieldValue.delete(),
      targetProductName: FieldValue.delete(),
      bundleQty: FieldValue.delete(),
      bundlePrice: FieldValue.delete(),
      durationHours: FieldValue.delete(),
      expiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "PRODUCT_OFFER_REMOVED",
      actionType: "PRODUCT_OFFER_REMOVED",
      actorId: session.user?.email,
      tenantId,
      productId,
      details: `Deactivated offer on product ${snap.data()?.name ?? productId}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to remove offer." };
  }
}

export async function blockProductBatch(productId: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot block items." };
  }

  try {
    const docRef = adminDb.collection("products").doc(productId);
    const snap = await docRef.get();
    if (!snap.exists) return { ok: false, error: "Product not found." };

    await docRef.update({
      isBlocked: true,
      blockedAt: FieldValue.serverTimestamp(),
      blockedBy: session.user?.email ?? "Admin",
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "PRODUCT_BLOCKED",
      actionType: "PRODUCT_BLOCKED",
      actorId: session.user?.email,
      tenantId,
      productId,
      details: `Blocked product batch ${snap.data()?.name ?? productId} from inventory & sale.`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to block product." };
  }
}

export async function importSuppliersCsv(csvString: string) {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot import suppliers." };
  }

  try {
    const lines = csvString.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length <= 1) return { ok: false, error: "CSV is empty or missing data rows." };

    const batch = adminDb.batch();
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 2 || !cols[1]) continue;

      const docRef = adminDb.collection("suppliers").doc();
      batch.set(docRef, {
        supplierID: cols[0],
        name: cols[1],
        email: cols[2] ?? "",
        phone: cols[3] ?? "",
        categories: cols[4] ?? "",
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: session.user?.email ?? "Admin",
      });
      count++;
    }

    await batch.commit();

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIERS_IMPORTED",
      actionType: "SUPPLIERS_IMPORTED",
      actorId: session.user?.email,
      tenantId,
      details: `Imported ${count} distributors via CSV upload.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    return { ok: true, count };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to import CSV." };
  }
}

export async function createSupplier(supplierData: {
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

  if (!supplierData.name?.trim()) return { ok: false, error: "Distributor name is required." };

  try {
    const docRef = adminDb.collection("suppliers").doc();
    await docRef.set({
      supplierID: `SUP-${Date.now().toString().slice(-4)}`,
      name: supplierData.name.trim(),
      email: supplierData.email?.trim() ?? "",
      phone: supplierData.phone?.trim() ?? "",
      categories: supplierData.categories?.trim() ?? "",
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.user?.email ?? "Admin",
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "SUPPLIER_CREATED",
      actionType: "SUPPLIER_CREATED",
      actorId: session.user?.email,
      tenantId,
      details: `Added distributor '${supplierData.name}'.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/procurement");
    return { ok: true, id: docRef.id };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to create distributor." };
  }
}