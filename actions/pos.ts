"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { applyOffers, ProductOffer, parseExpiryMs } from "@/lib/services/offer-engine";

export type PosProduct = {
  id?: string;
  barcode: string;
  name: string;
  price: number;
  originalPrice?: number;
  gst: string;
  weight: string;
  availableStock: number;
  category?: string;
  clearanceActive?: boolean;
  clearanceType?: string;
  offerDisplayName?: string;
  discountPercent?: number;
  discountAmount?: number;
  buyQty?: number;
  freeQty?: number;
  expiresAt?: string | number | null;
  flashExpiry?: number;
};

function resolveOfferTag(data: Record<string, any>, price: number): string {
  if (!data.clearanceActive) return "";
  const type = (data.clearanceType ?? "").toString().toUpperCase();
  if (type === "BOGO" || type === "B1G1") return "B1G1";
  if (type === "BUY_X_GET_Y") {
    const bx = data.buyQty ?? data.value1 ?? 1;
    const gy = data.freeQty ?? data.value2 ?? 1;
    return `B${bx}G${gy}`;
  }
  if (type === "BUY_X_GET_Y_CROSS") {
    const bx = data.buyQty ?? data.value1 ?? 1;
    return `B${bx} + GIFT`;
  }
  if (type === "PERCENTAGE") {
    const pct = Number(data.discountPercent ?? data.value1 ?? 0);
    return pct > 0 ? `${pct}% OFF` : "% OFF";
  }
  if (type === "FLAT_AMOUNT") {
    const flat = Number(data.discountAmount ?? data.value1 ?? 0);
    return flat > 0 ? `₹${flat} OFF` : "FLAT OFF";
  }
  if (type === "TIERED_QTY") {
    const minQ = data.minQty ?? data.value1 ?? 2;
    const disc = data.discountPercent ?? data.value2 ?? 10;
    return `Buy ${minQ}+: ${disc}%`;
  }
  if (type === "BUNDLE_PRICE") {
    const bq = data.bundleQty ?? data.value1 ?? 2;
    const bp = data.bundlePrice ?? data.value2 ?? price;
    return `${bq} for ₹${bp}`;
  }
  if (type === "FLASH_SALE") {
    const pct = Number(data.discountPercent ?? data.value1 ?? 0);
    return `FLASH ${pct}%`;
  }
  if (type === "CROSS_PRODUCT") {
    return "COMBO DEAL";
  }
  return data.clearanceType ?? "OFFER";
}

export async function searchProductByBarcode(barcode: string, targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";

  const cleanInput = barcode.trim();
  if (!cleanInput) return { ok: false, error: "Please enter a barcode" };

  let query: FirebaseFirestore.Query = adminDb.collection("products");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }
  query = query.where("barcode", "==", cleanInput).limit(1);

  const snap = await query.get();
  if (snap.empty) {
    return { ok: false, error: `Product with barcode "${cleanInput}" not found in store inventory.` };
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const price = Number(data.price ?? data.mrp ?? 0);

  return {
    ok: true,
    product: {
      id: doc.id,
      barcode: data.barcode ?? cleanInput,
      name: data.name ?? "Unknown Product",
      price,
      originalPrice: Number(data.mrp ?? data.price ?? 0),
      gst: data.gst ? String(data.gst) : "0",
      weight: data.weight ? String(data.weight) : "0",
      availableStock: Number(data.physicalStock ?? 0),
      category: data.category ?? "General",
      clearanceActive: data.clearanceActive === true,
      clearanceType: data.clearanceType,
      offerDisplayName: resolveOfferTag(data, price),
      discountPercent: data.discountPercent,
      discountAmount: data.discountAmount,
      buyQty: data.buyQty,
      freeQty: data.freeQty,
      expiresAt: data.expiresAt ? (typeof data.expiresAt.toDate === "function" ? data.expiresAt.toDate().toISOString() : data.expiresAt) : null,
      flashExpiry: parseExpiryMs(data.expiresAt),
    } as PosProduct,
  };
}

export async function searchProductsCatalog(query: string, targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode);

  const q = query.trim().toLowerCase();
  let dbQuery: FirebaseFirestore.Query = adminDb.collection("products");
  if (role !== "super_admin" && tenantId) {
    dbQuery = dbQuery.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    dbQuery = dbQuery.where("branchCode", "==", branchCode);
  }
  dbQuery = dbQuery.limit(60);

  const snap = await dbQuery.get();
  const all = snap.docs.map((doc) => {
    const data = doc.data();
    const price = Number(data.price ?? data.mrp ?? 0);
    return {
      id: doc.id,
      barcode: data.barcode ?? doc.id,
      name: data.name ?? "Unnamed",
      price,
      originalPrice: Number(data.mrp ?? data.price ?? 0),
      gst: data.gst ? String(data.gst) : "0",
      weight: data.weight ? String(data.weight) : "0",
      availableStock: Number(data.physicalStock ?? 0),
      category: data.category ?? "General",
      clearanceActive: data.clearanceActive === true,
      clearanceType: data.clearanceType,
      offerDisplayName: resolveOfferTag(data, price),
      discountPercent: data.discountPercent,
      discountAmount: data.discountAmount,
      buyQty: data.buyQty,
      freeQty: data.freeQty,
      expiresAt: data.expiresAt ? (typeof data.expiresAt.toDate === "function" ? data.expiresAt.toDate().toISOString() : data.expiresAt) : null,
      flashExpiry: parseExpiryMs(data.expiresAt),
    } as PosProduct;
  });

  if (!q) {
    return { ok: true, products: all.slice(0, 15) };
  }

  const filtered = all.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.barcode.toLowerCase().includes(q) ||
    (p.category && p.category.toLowerCase().includes(q))
  );

  return { ok: true, products: filtered.slice(0, 15) };
}

export async function fetchActivePosOffers(targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode);

  let query: FirebaseFirestore.Query = adminDb.collection("products").where("clearanceActive", "==", true);
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snap = await query.limit(200).get();
  const matchedDocs = snap.docs.filter((d) => {
    const data = d.data();
    if (!branchCode) return true;
    return !data.branchCode || data.branchCode === branchCode;
  });

  const offers: ProductOffer[] = matchedDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      productId: d.id,
      barcode: data.barcode ?? d.id,
      name: data.name ?? "",
      productName: data.name ?? "",
      clearanceActive: data.clearanceActive === true,
      clearanceType: data.clearanceType ?? "",
      clearanceTag: data.clearanceTag ?? "",
      buyQty: data.buyQty ?? data.value1,
      freeQty: data.freeQty ?? data.value2,
      discountPercent: data.discountPercent ?? data.value1,
      discountAmount: data.discountAmount ?? data.value1,
      minQty: data.minQty ?? data.value1,
      bundleQty: data.bundleQty ?? data.value1,
      bundlePrice: data.bundlePrice ?? data.value2,
      offerPrice: data.offerPrice,
      targetProductId: data.targetProductId,
      targetProductName: data.targetProductName,
      expiresAt: data.expiresAt ? (typeof data.expiresAt.toDate === "function" ? data.expiresAt.toDate().toISOString() : data.expiresAt) : null,
      stock: Number(data.physicalStock ?? 999),
      physicalStock: Number(data.physicalStock ?? 999),
    };
  });

  const stockMap: Record<string, number> = {};
  for (const o of offers) {
    if (o.barcode) stockMap[o.barcode] = o.physicalStock ?? 999;
    if (o.productId) stockMap[o.productId] = o.physicalStock ?? 999;
  }

  return { ok: true, offers, stockMap };
}

export type CartItem = {
  barcode: string;
  name: string;
  price: number;
  originalPrice?: number;
  gst: string;
  weight: string;
  quantity: number;
};

export async function createPosOrder(params: {
  items: CartItem[];
  paymentMode: string;
  customerPhone?: string;
  instantDiscountPercent?: number;
  targetBranchCode?: string;
}) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot process checkout orders." };
  }

  const branchCode = resolveStoreScope(role, storeId, params.targetBranchCode) ?? "HQ";
  if (!params.items || params.items.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }

  // ---- fetch active offers + live stock for pricing ----
  let offersQuery: FirebaseFirestore.Query = adminDb.collection("products").where("clearanceActive", "==", true);
  if (tenantId) {
    offersQuery = offersQuery.where("tenantId", "==", tenantId);
  }
  const offersSnap = await offersQuery.limit(200).get();
  const activeOffers: ProductOffer[] = offersSnap.docs
    .filter((d) => {
      const data = d.data();
      if (!branchCode) return true;
      return !data.branchCode || data.branchCode === branchCode;
    })
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        productId: d.id,
        barcode: data.barcode ?? d.id,
        ...data,
      } as ProductOffer;
    });

  const liveStock: Record<string, number> = {};
  for (const item of params.items) {
    let pQuery = adminDb
      .collection("products")
      .where("barcode", "==", item.barcode);
    if (tenantId) {
      pQuery = pQuery.where("tenantId", "==", tenantId);
    }
    const pSnap = await pQuery.limit(5).get();
    if (!pSnap.empty) {
      const match =
        pSnap.docs.find(
          (d) =>
            !branchCode ||
            !d.data().branchCode ||
            d.data().branchCode === branchCode
        ) ?? pSnap.docs[0];
      liveStock[item.barcode] = Number(match.data().physicalStock ?? 999);
    }
  }

  const priced = applyOffers(
    params.items.map((i) => ({
      barcode: i.barcode,
      name: i.name,
      originalPrice: i.price,
      quantity: i.quantity,
    })),
    activeOffers,
    liveStock
  );

  // Apply instant offer discount if provided
  const instantDiscountPercent = Math.min(50, Math.max(0, params.instantDiscountPercent ?? 0));
  const discountFactor = 1.0 - instantDiscountPercent / 100.0;

  let gstTotal = 0;
  let taxableValue = 0;
  let totalWeight = 0;

  for (const line of priced.lines) {
    const cartItem = params.items.find((i) => i.barcode === line.barcode);
    const gst = cartItem ? cartItem.gst : "0";
    const lineTotal = line.finalUnitPrice * line.quantity * discountFactor;
    const gstRate = parseFloat(gst.toString().replace(/[^0-9.]/g, "")) || 0;
    gstTotal += lineTotal - lineTotal / (1 + gstRate / 100);
    taxableValue += lineTotal / (1 + gstRate / 100);
    if (cartItem) {
      totalWeight += (parseFloat(cartItem.weight) || 0) * line.quantity;
    }
  }

  const baseGrandTotal = priced.grandTotal;
  const instantDiscountAmount = baseGrandTotal * (instantDiscountPercent / 100);
  const totalAmount = baseGrandTotal * discountFactor;
  const totalDiscount = priced.totalDiscount + instantDiscountAmount;

  try {
    let companyName = "Retail Store";
    let storeName = companyName;
    let companyLogoUrl = "";
    let storeLogoUrl = "";
    let invoicePrefix = "INV/";

    if (tenantId) {
      const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
      if (tDoc.exists) {
        const tData = tDoc.data();
        companyName = tData?.companyName ?? companyName;
        companyLogoUrl = tData?.companyLogoUrl ?? "";
        let prefix = (tData?.invoiceConfig?.invoicePrefix ?? "").toString().trim();
        prefix = prefix.replace(/\d{2}-\d{2}[/-]?/g, "");
        if (prefix) {
          invoicePrefix = prefix.endsWith("/") || prefix.endsWith("-") ? prefix : prefix + "/";
        }
      }
    }

    if (branchCode) {
      const sSnap = await adminDb
        .collection("stores")
        .where("branchCode", "==", branchCode)
        .limit(1)
        .get();
      if (!sSnap.empty) {
        const sData = sSnap.docs[0].data();
        storeName = sData.storeName ?? companyName;
        storeLogoUrl = sData.storeLogoUrl ?? sData.companyLogoUrl ?? "";
      }
    }

    const now = new Date();
    const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStr = `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const tenantPrefix = tenantId && tenantId !== "ALL" ? tenantId : "GLOBAL";
    const counterDocId = `${tenantPrefix}_${branchCode}_${todayKey}`;
    const counterRef = adminDb.collection("daily_invoice_counters").doc(counterDocId);

    const seq = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists) {
        const legacyRef = adminDb.collection("daily_invoice_counters").doc(`${branchCode}_${todayKey}`);
        const legSnap = await tx.get(legacyRef);
        const startCount = legSnap.exists ? (legSnap.data()!.count ?? 0) + 1 : 1;
        tx.set(counterRef, { count: startCount });
        return startCount;
      }
      const newCount = (snap.data()!.count ?? 0) + 1;
      tx.update(counterRef, { count: newCount });
      return newCount;
    });

    const invoiceNo = `${invoicePrefix}${fyStr}/${dateStr}-${String(seq).padStart(2, "0")}`;
    const orderRef = adminDb.collection("orders").doc();

    const batch = adminDb.batch();
    batch.set(orderRef, {
      id: orderRef.id,
      orderType: "DIRECT_POS",
      invoiceNo,
      cashierId: session.user?.email,
      cashierName: session.user?.name ?? "Manager",
      customerPhone: params.customerPhone ? `+91${params.customerPhone.replace(/\D/g, "")}` : null,
      items: priced.lines.map((l) => {
        const cartItem = params.items.find((i) => i.barcode === l.barcode);
        return {
          barcode: l.barcode,
          name: l.name,
          price: l.finalUnitPrice * discountFactor,
          originalPrice: l.originalPrice,
          quantity: l.quantity,
          gst: cartItem?.gst ?? "0",
          weight: cartItem?.weight ?? "",
          offerType: l.offerType,
          isFreeLine: l.isFreeLine ?? false,
        };
      }),
      offerDiscount: totalDiscount,
      totalSavings: totalDiscount,
      instantDiscountPercent,
      instantDiscountAmount,
      freeItemsGiven: priced.totalFreeItems,
      taxableValue,
      subtotal: totalAmount - gstTotal,
      gstTotal,
      totalAmount,
      totalWeight,
      totalExpectedWeight: totalWeight,
      weightVerifiedAtGate: true,
      weightMismatchFlag: false,
      paymentMode: params.paymentMode,
      status: "completed",
      paymentStatus: "PAID",
      exitStatus: "APPROVED",
      generatedBy: "CASHIER",
      qrConsumed: true,
      timestamp: FieldValue.serverTimestamp(),
      paymentCompletedAt: FieldValue.serverTimestamp(),
      exitTimestamp: FieldValue.serverTimestamp(),
      wasEverRejected: false,
      riskLevel: "LOW",
      guardRecommendation: "APPROVE",
      tenantId,
      storeId: branchCode,
      branchCode,
      isDeleted: false,
      companyName,
      storeName,
      companyLogoUrl,
      storeLogoUrl,
    });

    // Deduct stock
    for (const line of priced.lines) {
      const baseBarcode = line.barcode.replace("_FREE", "");
      const pSnap = await adminDb
        .collection("products")
        .where("barcode", "==", baseBarcode)
        .where("tenantId", "==", tenantId)
        .where("branchCode", "==", branchCode)
        .limit(1)
        .get();

      if (!pSnap.empty) {
        batch.update(pSnap.docs[0].ref, {
          physicalStock: FieldValue.increment(-line.quantity),
          soldStock: FieldValue.increment(line.quantity),
          lastSoldAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Write audit log
    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "POS_ORDER_CREATED",
      actionType: "POS_ORDER_CREATED",
      actorId: session.user?.email,
      tenantId,
      branchCode,
      orderId: orderRef.id,
      invoiceNo,
      totalAmount,
      paymentMode: params.paymentMode,
      details: `POS order ${invoiceNo} completed for ₹${totalAmount.toFixed(2)} via ${params.paymentMode}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/cashier");

    let storeAddress = "N/A";
    let storePhone = "N/A";
    let storeGstin = "N/A";
    const storeSnap = await adminDb.collection("stores").where("branchCode", "==", branchCode).limit(1).get();
    if (!storeSnap.empty) {
      const sd = storeSnap.docs[0].data();
      storeAddress = [sd.location?.address, sd.location?.city].filter(Boolean).join(", ") || "N/A";
      storePhone = sd.managerPhone ?? sd.contactNumbers?.[0] ?? "N/A";
      storeGstin = (sd.licenses ?? []).find((l: any) => l.type === "GSTIN")?.number ?? "N/A";
    }

    return {
      ok: true,
      invoiceNo,
      orderId: orderRef.id,
      discountApplied: totalDiscount,
      freeItems: priced.totalFreeItems,
      receipt: {
        invoiceNo,
        storeName: companyName,
        address: storeAddress,
        phone: storePhone,
        gstin: storeGstin,
        items: priced.lines
          .filter((l) => !l.isFreeLine || l.quantity > 0)
          .map((l) => ({
            name: l.name,
            quantity: l.quantity,
            price: l.finalUnitPrice * discountFactor,
            originalPrice: l.originalPrice,
          })),
        taxableValue,
        gstTotal,
        discount: totalDiscount,
        totalWeight,
        grandTotal: totalAmount,
        terms: [
          "1. Exchange within 7 days with original receipt.",
          "2. Goods once sold will not be refunded.",
          "3. Staff assisted direct checkout.",
        ],
        timestamp: new Date().toLocaleString(),
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Checkout failed" };
  }
}