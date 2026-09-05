import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export type AiSuggestion = {
  id: string;
  productId: string;
  productName: string;
  supplierName: string;
  supplierId: string;
  suggestedQty: number;
  branchCode: string;
  estimatedCost: number;
};

export type PoItem = {
  productId?: string;
  barcode?: string;
  name: string;
  orderQty: number;
  unitCost: number;
  totalItemCost: number;
};

export type PORow = {
  id: string;
  poId: string;
  supplierName: string;
  supplierId: string;
  branchCode: string;
  totalItems: number;
  totalOrderValue: number;
  status: "DRAFT" | "PENDING" | "APPROVED" | "DELIVERED" | "REJECTED";
  createdAtMs: number;
  items: PoItem[];
  approvedBy?: string;
};

export type SupplierRow = {
  id: string;
  supplierID?: string;
  name: string;
  email?: string;
  phone?: string;
  categories?: string;
};

export type QuantumPromotionProduct = {
  id: string;
  productId: string;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  unitCost: number;
  expiryDate?: string | null;
  daysLeft: number;
  isDead: boolean;
  sevenDaySales: number;
  clearanceActive: boolean;
  clearanceType?: string;
  offerDisplayName?: string;
  offerPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  buyQty?: number;
  freeQty?: number;
  targetProductId?: string;
  targetProductName?: string;
  bundleQty?: number;
  bundlePrice?: number;
  durationHours?: number;
  isBlocked?: boolean;
};

export type LossProductInfo = {
  productId: string;
  name: string;
  price: number;
  stock: number;
  cost: number;
  effectiveOfferPrice: number;
  lossPerUnit: number;
};

export type PromotionMetrics = {
  totalInventoryValue: number;
  promotionImpact: number;
  projectedMargin: number;
  lossProductCount?: number;
  lossProducts?: LossProductInfo[];
};

function parseExpiryDaysLeft(rawDate: unknown): { daysLeft: number; isDead: boolean } {
  if (!rawDate) return { daysLeft: 999, isDead: false };

  let expDate: Date | null = null;
  if (typeof rawDate === "object" && rawDate !== null && "toDate" in rawDate) {
    expDate = (rawDate as any).toDate();
  } else if (typeof rawDate === "object" && rawDate !== null && "_seconds" in rawDate) {
    expDate = new Date((rawDate as any)._seconds * 1000);
  } else if (typeof rawDate === "string" && rawDate.trim().length > 0) {
    const trimmed = rawDate.trim();
    const parts = trimmed.replace(/-/g, "/").split("/");
    if (parts.length === 2) {
      // MM/YY
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10) + (parts[1].length === 2 ? 2000 : 0);
      expDate = new Date(year, month, 0);
    } else if (parts.length === 3) {
      // DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      expDate = new Date(year, month, day);
    } else {
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed)) expDate = new Date(parsed);
    }
  }

  if (!expDate) return { daysLeft: 999, isDead: false };

  const diffMs = expDate.getTime() - Date.now();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { daysLeft, isDead: daysLeft < 0 };
}

function formatExpiryDateString(rawDate: unknown): string | null {
  if (!rawDate) return null;
  if (typeof rawDate === "string") return rawDate;
  if (typeof rawDate === "object" && rawDate !== null) {
    if ("toDate" in rawDate && typeof (rawDate as any).toDate === "function") {
      return (rawDate as any).toDate().toISOString();
    }
    if ("_seconds" in rawDate) {
      return new Date((rawDate as any)._seconds * 1000).toISOString();
    }
  }
  return null;
}

function resolveOfferDisplayName(data: Record<string, any>, price: number): string {
  const type = data.clearanceType?.toString() ?? "";
  const oPrice = Number(data.offerPrice ?? 0);

  if (type === "PERCENTAGE") {
    const pct = Number(data.discountPercent ?? data.value1 ?? 0);
    if (pct > 0) return `${pct}% OFF`;
    if (price > 0 && oPrice > 0) {
      const calculated = Math.round(((price - oPrice) / price) * 100);
      if (calculated > 0) return `${calculated}% OFF`;
    }
    return "PERCENT OFF";
  }

  if (type === "FLAT_AMOUNT") {
    const flat = Number(data.discountAmount ?? data.value1 ?? 0);
    if (flat > 0) return `₹${flat} OFF`;
    if (price > 0 && oPrice > 0) {
      const calculated = Math.round(price - oPrice);
      if (calculated > 0) return `₹${calculated} OFF`;
    }
    return "FLAT OFF";
  }

  if (type === "BOGO") return "B1G1";

  if (type === "BUY_X_GET_Y" || type === "BUY_X_GET_Y_CROSS") {
    const bx = data.buyQty ?? data.value1 ?? 1;
    const gy = data.freeQty ?? data.value2 ?? 1;
    return `B${bx}G${gy}`;
  }

  if (type === "TIERED_QTY") {
    const minQ = data.minQty ?? data.value1 ?? 2;
    const disc = data.discountPercent ?? data.value2 ?? 10;
    return `${minQ}+ for ${disc}% OFF`;
  }

  if (type === "BUNDLE_PRICE") {
    const v1 = data.bundleQty ?? data.value1 ?? 2;
    const v2 = data.bundlePrice ?? data.value2 ?? price * 2;
    return `${v1} for ₹${v2}`;
  }

  if (type === "FLASH_SALE") return "FLASH SALE";

  if (type === "CROSS_PRODUCT") return "CROSS DEAL";

  return "OFFER ACTIVE";
}

export async function getQuantumPromotionData(
  role: string,
  tenantId: string | null,
  branchCode?: string | null
): Promise<{
  metrics: PromotionMetrics;
  products: QuantumPromotionProduct[];
}> {
  // 1. Fetch products
  let prodQuery: FirebaseFirestore.Query = adminDb.collection("products");
  if (role !== "super_admin" && tenantId) {
    prodQuery = prodQuery.where("tenantId", "==", tenantId);
  }
  if (branchCode && branchCode !== "HQ" && branchCode !== "ALL") {
    prodQuery = prodQuery.where("branchCode", "==", branchCode);
  }

  const prodSnap = await prodQuery.limit(150).get();

  // 2. Fetch 7-day sales from orders
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let ordersQuery: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("timestamp", ">=", Timestamp.fromDate(sevenDaysAgo));

  if (role !== "super_admin" && tenantId) {
    ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
  }

  const salesCount: Record<string, number> = {};
  try {
    const ordersSnap = await ordersQuery.limit(200).get();
    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      const status = (data.status ?? "").toString().toUpperCase();
      const pStatus = (data.paymentStatus ?? "").toString().toUpperCase();

      if (
        status === "COMPLETED" ||
        status === "DELIVERED" ||
        pStatus === "PAID" ||
        pStatus === "SUCCESS"
      ) {
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const pid = item.productId?.toString();
          const bcode = item.barcode?.toString();
          const qty = Number(item.quantity ?? item.orderQty ?? 1);

          if (pid) salesCount[pid] = (salesCount[pid] ?? 0) + qty;
          if (bcode) salesCount[bcode] = (salesCount[bcode] ?? 0) + qty;
        }
      }
    }
  } catch (err) {
    // If composite index is missing on timestamp + tenantId, fallback to all recent orders
    try {
      const fallbackSnap = await adminDb
        .collection("orders")
        .orderBy("timestamp", "desc")
        .limit(100)
        .get();
      for (const doc of fallbackSnap.docs) {
        const data = doc.data();
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const pid = item.productId?.toString();
          const bcode = item.barcode?.toString();
          const qty = Number(item.quantity ?? item.orderQty ?? 1);
          if (pid) salesCount[pid] = (salesCount[pid] ?? 0) + qty;
          if (bcode) salesCount[bcode] = (salesCount[bcode] ?? 0) + qty;
        }
      }
    } catch {}
  }

  // 3. Process products
  const products: QuantumPromotionProduct[] = [];
  let totalInventoryVal = 0;
  let totalCostVal = 0;
  let totalDiscountBurn = 0;
  const lossProducts: LossProductInfo[] = [];

  for (const doc of prodSnap.docs) {
    const data = doc.data();
    if (data.isBlocked === true) continue;

    const productId = doc.id;
    const barcode = (data.barcode ?? "").toString();
    const name = data.name ?? "Unnamed Item";
    const price = Math.max(0, Number(data.price ?? data.mrp ?? 0));
    const rawStock = Number(data.physicalStock ?? data.stock ?? 0);
    const stock = Math.max(0, rawStock); // Clamped stock for positive warehouse inventory & cost
    const rawCost = Number(data.unitCost ?? 0);
    const unitCost = rawCost > 0 ? rawCost : Number((price * 0.70).toFixed(2));
    const clearanceActive = data.clearanceActive === true;

    const { daysLeft, isDead } = parseExpiryDaysLeft(data.expiryDate);
    const sevenDaySales = salesCount[productId] ?? salesCount[barcode] ?? 0;

    let unitDiscount = 0;
    let effectiveOfferPrice = price;

    if (clearanceActive) {
      const cType = data.clearanceType;
      if (cType === "PERCENTAGE" || cType === "FLASH_SALE") {
        const pct = Number(data.discountPercent ?? data.value1 ?? 0);
        unitDiscount = price * (Math.min(100, Math.max(0, pct)) / 100);
      } else if (cType === "FLAT_AMOUNT") {
        const flat = Number(data.discountAmount ?? data.value1 ?? 0);
        unitDiscount = Math.min(price, Math.max(0, flat));
      } else if (cType === "BOGO") {
        unitDiscount = price * 0.5;
      } else if (cType === "BUY_X_GET_Y" || cType === "BUY_X_GET_Y_CROSS") {
        const bx = Number(data.buyQty ?? data.value1 ?? 2);
        const gy = Number(data.freeQty ?? data.value2 ?? 1);
        const ratio = (bx + gy > 0) ? gy / (bx + gy) : 0;
        unitDiscount = price * ratio;
      } else if (cType === "BUNDLE_PRICE") {
        const bQty = Number(data.bundleQty ?? data.value1 ?? 2);
        const bPrice = Number(data.bundlePrice ?? data.value2 ?? 0);
        if (bQty > 0 && bPrice > 0) {
          const unitOffer = bPrice / bQty;
          if (price > unitOffer) {
            unitDiscount = price - unitOffer;
          }
        }
      } else if (cType === "TIERED_QTY") {
        const pct = Number(data.discountPercent ?? data.value2 ?? 10);
        unitDiscount = price * (Math.min(100, Math.max(0, pct)) / 100);
      } else {
        const op = Number(data.offerPrice ?? price);
        if (price > op && op > 0) {
          unitDiscount = price - op;
        }
      }
      effectiveOfferPrice = Math.max(0, price - unitDiscount);

      // Track products currently selling below wholesale cost
      if (stock > 0 && effectiveOfferPrice < unitCost) {
        lossProducts.push({
          productId,
          name: String(name),
          price,
          stock,
          cost: unitCost,
          effectiveOfferPrice: Number(effectiveOfferPrice.toFixed(2)),
          lossPerUnit: Number((unitCost - effectiveOfferPrice).toFixed(2)),
        });
      }
    }

    totalInventoryVal += price * stock;
    totalCostVal += unitCost * stock;
    totalDiscountBurn += unitDiscount * stock;

    products.push({
      id: doc.id,
      productId: doc.id,
      name: String(name),
      barcode: String(barcode),
      price: Number(price),
      stock: Number(rawStock),
      unitCost: Number(unitCost),
      expiryDate: formatExpiryDateString(data.expiryDate),
      daysLeft: Number(daysLeft),
      isDead: Boolean(isDead),
      sevenDaySales: Number(sevenDaySales),
      clearanceActive: Boolean(clearanceActive),
      clearanceType: data.clearanceType ? String(data.clearanceType) : undefined,
      offerDisplayName: clearanceActive ? resolveOfferDisplayName(data, price) : undefined,
      offerPrice: data.offerPrice !== undefined && data.offerPrice !== null ? Number(data.offerPrice) : (clearanceActive ? Number(effectiveOfferPrice.toFixed(2)) : undefined),
      discountPercent: data.discountPercent !== undefined && data.discountPercent !== null ? Number(data.discountPercent) : undefined,
      discountAmount: data.discountAmount !== undefined && data.discountAmount !== null ? Number(data.discountAmount) : undefined,
      buyQty: data.buyQty !== undefined && data.buyQty !== null ? Number(data.buyQty) : undefined,
      freeQty: data.freeQty !== undefined && data.freeQty !== null ? Number(data.freeQty) : undefined,
      targetProductId: data.targetProductId ? String(data.targetProductId) : undefined,
      targetProductName: data.targetProductName ? String(data.targetProductName) : undefined,
      bundleQty: data.bundleQty !== undefined && data.bundleQty !== null ? Number(data.bundleQty) : undefined,
      bundlePrice: data.bundlePrice !== undefined && data.bundlePrice !== null ? Number(data.bundlePrice) : undefined,
      durationHours: data.durationHours !== undefined && data.durationHours !== null ? Number(data.durationHours) : undefined,
      isBlocked: data.isBlocked === true,
    });
  }

  // Calculate Margin (Do NOT clamp negative margins to 0)
  const projectedRevenue = Math.max(0, totalInventoryVal - totalDiscountBurn);
  let projectedMargin = 32.0; // Default benchmark margin when store has no items
  if (projectedRevenue > 0) {
    projectedMargin = ((projectedRevenue - totalCostVal) / projectedRevenue) * 100;
  } else if (totalCostVal > 0) {
    projectedMargin = -100.0;
  }

  const finalMargin = parseFloat(projectedMargin.toFixed(1));

  // Sync accurate live metrics to store_metrics document for this branch
  if (branchCode && branchCode !== "ALL" && branchCode !== "HQ") {
    try {
      await adminDb.collection("store_metrics").doc(branchCode).set(
        {
          totalInventoryValue: Math.round(totalInventoryVal),
          totalCostValue: Math.round(totalCostVal),
          projectedRevenue: Math.round(projectedRevenue),
          discountBurn: Math.round(totalDiscountBurn),
          projectedMargin: finalMargin,
          lossProductCount: lossProducts.length,
          lastSyncedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {}
  }

  return {
    metrics: {
      totalInventoryValue: Math.round(totalInventoryVal),
      promotionImpact: Math.round(totalDiscountBurn),
      projectedMargin: finalMargin,
      lossProductCount: lossProducts.length,
      lossProducts,
    },
    products,
  };
}

export async function getSuppliers(tenantId?: string | null): Promise<SupplierRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("suppliers");
  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  try {
    const snap = await query.limit(100).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        supplierID: data.supplierID ?? d.id,
        name: data.name ?? "General Supplier",
        email: data.email ?? "",
        phone: data.phone ?? "",
        categories: data.categories ?? "",
      };
    });
  } catch {
    return [];
  }
}

async function resolveSupplierName(supplierId: string): Promise<string> {
  if (!supplierId || supplierId === "DEFAULT_SUPPLIER") return "General Supplier";
  try {
    const doc = await adminDb.collection("suppliers").doc(supplierId).get();
    return doc.exists ? (doc.data()?.name ?? supplierId) : supplierId;
  } catch {
    return supplierId;
  }
}

export async function getAiSuggestions(
  role: string,
  tenantId: string | null,
  branchCode?: string | null
): Promise<AiSuggestion[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("ai_po_suggestions");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.limit(50).get();
  const results: AiSuggestion[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    let productName = "Unknown Product";
    let unitCost = 0;

    if (data.productId) {
      try {
        const productDoc = await adminDb.collection("products").doc(data.productId).get();
        if (productDoc.exists) {
          const p = productDoc.data();
          productName = p?.name ?? productName;
          unitCost = parseFloat(p?.unitCost ?? "0") || (parseFloat(p?.price ?? "0") || 0) * 0.7;
        }
      } catch {}
    }

    const suggestedQty = data.suggestedQty ?? data.orderQty ?? 50;

    results.push({
      id: doc.id,
      productId: data.productId ?? "",
      productName,
      supplierId: data.supplierId ?? "DEFAULT_SUPPLIER",
      supplierName: await resolveSupplierName(data.supplierId ?? "DEFAULT_SUPPLIER"),
      suggestedQty,
      branchCode: data.branchCode ?? "HQ",
      estimatedCost: unitCost * suggestedQty,
    });
  }

  return results;
}

export async function getPurchaseOrders(
  role: string,
  tenantId: string | null,
  branchCode?: string | null
): Promise<PORow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("purchase_orders");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.orderBy("createdAt", "desc").limit(100).get();
  const supplierNamesCache = new Map<string, string>();

  const rows: PORow[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const supId = data.supplierId ?? "DEFAULT_SUPPLIER";
    let supName = supplierNamesCache.get(supId);
    if (!supName) {
      supName = await resolveSupplierName(supId);
      supplierNamesCache.set(supId, supName);
    }

    const items: PoItem[] = Array.isArray(data.items)
      ? data.items.map((i: any) => ({
          productId: i.productId,
          barcode: i.barcode,
          name: i.name ?? "Item",
          orderQty: Number(i.orderQty ?? i.quantity ?? 1),
          unitCost: Number(i.unitCost ?? 0),
          totalItemCost: Number(i.totalItemCost ?? (i.unitCost ?? 0) * (i.orderQty ?? 1)),
        }))
      : [];

    const ts = data.createdAt as Timestamp | undefined;

    rows.push({
      id: doc.id,
      poId: data.poId ?? doc.id,
      supplierId: supId,
      supplierName: supName,
      branchCode: data.branchCode ?? "HQ",
      totalItems: Number(data.totalItems ?? items.length),
      totalOrderValue: Number(data.totalOrderValue ?? items.reduce((s, i) => s + i.totalItemCost, 0)),
      status: (data.status ?? "DRAFT") as PORow["status"],
      createdAtMs: ts ? ts.toMillis() : Date.now(),
      items,
      approvedBy: data.approvedBy,
    });
  }

  return rows;
}