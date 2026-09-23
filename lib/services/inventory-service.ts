import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type LedgerRow = {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  unitCost: number;
  openingStock: number;
  purchasedStock: number;
  soldStock: number;
  damagedStock: number;
  expiredStock: number;
  closingStock: number;
  physicalStock: number;
  isDeadStock: boolean;
  isBlocked: boolean;
  gst?: string;
  weight?: string;
  expiryDate?: string;
};

export async function getLedger(
  role: string,
  tenantId: string | null,
  storeId: string | null,
  searchQuery?: string,
  filter?: string
): Promise<LedgerRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("products");

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snap = await query.limit(200).get();
  const now = Date.now();
  const searchLower = (searchQuery ?? "").trim().toLowerCase();

  const rows: LedgerRow[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name ?? "Unknown Item";
    const barcode = data.barcode ?? "";

    // Search filter
    if (searchLower) {
      const matchName = name.toLowerCase().includes(searchLower);
      const matchBarcode = barcode.toLowerCase().includes(searchLower);
      if (!matchName && !matchBarcode) continue;
    }

    const openingStock = Number(data.openingStock ?? 0);
    const purchasedStock = Number(data.purchasedStock ?? 0);
    const soldStock = Number(data.soldStock ?? 0);
    const damagedStock = Number(data.damagedStock ?? 0);
    const expiredStock = Number(data.expiredStock ?? 0);
    const physicalStock = Number(data.physicalStock ?? 0);
    const closingStock = openingStock + purchasedStock - soldStock - damagedStock - expiredStock;

    const lastSoldAt = (data.lastSoldAt as Timestamp | undefined)?.toDate();
    let isDeadStock = false;
    if (closingStock >= 10) {
      if (!lastSoldAt) isDeadStock = true;
      else {
        const daysSince = (now - lastSoldAt.getTime()) / (1000 * 60 * 60 * 24);
        isDeadStock = daysSince > 15;
      }
    }

    const isBlocked = data.isBlocked === true;

    // Filter by category/state
    if (filter === "LOW_STOCK" && physicalStock >= 10) continue;
    if (filter === "DEAD_STOCK" && !isDeadStock) continue;
    if (filter === "BLOCKED" && !isBlocked) continue;

    const rawExpiry = data.expiryDate;
    let expiryDateStr: string | undefined;
    if (rawExpiry) {
      if (typeof rawExpiry.toDate === "function") {
        expiryDateStr = rawExpiry.toDate().toISOString().split("T")[0];
      } else if (typeof rawExpiry === "string") {
        expiryDateStr = rawExpiry.split("T")[0];
      }
    }

    rows.push({
      productId: doc.id,
      barcode,
      name,
      price: Number(data.price ?? 0),
      unitCost: Number(data.unitCost ?? 0),
      openingStock,
      purchasedStock,
      soldStock,
      damagedStock,
      expiredStock,
      closingStock,
      physicalStock,
      isDeadStock,
      isBlocked,
      gst: data.gst ? String(data.gst).replace("% GST", "") : "0",
      weight: data.weight ? String(data.weight) : "",
      expiryDate: expiryDateStr,
    });
  }

  return rows;
}
export type AgingProductItem = {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  unitCost: number;
  closingStock: number;
  lockedCapital: number;
  daysSinceLastSold: number;
  lastSoldDate?: string;
  branchCode?: string;
};

export type AgingBucket = {
  key: "0_30" | "31_60" | "61_90" | "90_PLUS";
  label: string;
  minDays: number;
  maxDays: number | null;
  productCount: number;
  totalUnits: number;
  lockedCapital: number;
  percentageOfLockedCapital: number;
  topItems: AgingProductItem[];
};

export type InventoryAgingReport = {
  totalSkus: number;
  totalClosingUnits: number;
  totalLockedCapital: number;
  buckets: {
    "0_30": AgingBucket;
    "31_60": AgingBucket;
    "61_90": AgingBucket;
    "90_PLUS": AgingBucket;
  };
};

/**
 * Generates an inventory aging & locked capital report bucketed by days since last sale:
 * 0-30 days (Fast moving / Fresh)
 * 31-60 days (Slow moving)
 * 61-90 days (At Risk)
 * 90+ days (Stagnant / Dead Capital)
 */
export async function getInventoryAgingReport(
  role: string,
  tenantId: string | null,
  storeId: string | null
): Promise<InventoryAgingReport> {
  let query: FirebaseFirestore.Query = adminDb.collection("products");

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snap = await query.get();
  const now = Date.now();

  const bucketItems: Record<string, AgingProductItem[]> = {
    "0_30": [],
    "31_60": [],
    "61_90": [],
    "90_PLUS": [],
  };

  let totalSkus = 0;
  let totalClosingUnits = 0;
  let totalLockedCapital = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name ?? "Unknown Item";
    const barcode = data.barcode ?? "";
    const unitCost = Number(data.unitCost ?? 0);
    const price = Number(data.price ?? 0);

    const openingStock = Number(data.openingStock ?? 0);
    const purchasedStock = Number(data.purchasedStock ?? 0);
    const soldStock = Number(data.soldStock ?? 0);
    const damagedStock = Number(data.damagedStock ?? 0);
    const expiredStock = Number(data.expiredStock ?? 0);
    const closingStock = Math.max(0, openingStock + purchasedStock - soldStock - damagedStock - expiredStock);

    if (closingStock <= 0) continue; // Only evaluate inventory holding positive physical stock

    totalSkus++;
    totalClosingUnits += closingStock;
    const lockedCapital = Math.round(unitCost * closingStock * 100) / 100;
    totalLockedCapital += lockedCapital;

    const lastSoldTs = data.lastSoldAt as Timestamp | undefined;
    const lastSoldDateObj = lastSoldTs?.toDate ? lastSoldTs.toDate() : null;

    let daysSince = 999;
    let lastSoldDateStr: string | undefined;

    if (lastSoldDateObj) {
      daysSince = Math.max(0, Math.floor((now - lastSoldDateObj.getTime()) / (1000 * 60 * 60 * 24)));
      lastSoldDateStr = lastSoldDateObj.toISOString().split("T")[0];
    } else if (data.createdAt) {
      const createdObj = (data.createdAt as Timestamp | undefined)?.toDate?.();
      if (createdObj) {
        daysSince = Math.max(0, Math.floor((now - createdObj.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    const item: AgingProductItem = {
      productId: doc.id,
      barcode,
      name,
      price,
      unitCost,
      closingStock,
      lockedCapital,
      daysSinceLastSold: daysSince,
      lastSoldDate: lastSoldDateStr,
      branchCode: data.branchCode,
    };

    if (daysSince <= 30) {
      bucketItems["0_30"].push(item);
    } else if (daysSince <= 60) {
      bucketItems["31_60"].push(item);
    } else if (daysSince <= 90) {
      bucketItems["61_90"].push(item);
    } else {
      bucketItems["90_PLUS"].push(item);
    }
  }

  totalLockedCapital = Math.round(totalLockedCapital * 100) / 100;

  const createBucket = (
    key: "0_30" | "31_60" | "61_90" | "90_PLUS",
    label: string,
    minDays: number,
    maxDays: number | null
  ): AgingBucket => {
    const items = bucketItems[key];
    const productCount = items.length;
    const totalUnits = items.reduce((acc, i) => acc + i.closingStock, 0);
    const lockedCap = Math.round(items.reduce((acc, i) => acc + i.lockedCapital, 0) * 100) / 100;
    const pct = totalLockedCapital > 0 ? Math.round((lockedCap / totalLockedCapital) * 1000) / 10 : 0;

    // Top 10 items by locked capital
    const sorted = [...items].sort((a, b) => b.lockedCapital - a.lockedCapital);
    const topItems = sorted.slice(0, 10);

    return {
      key,
      label,
      minDays,
      maxDays,
      productCount,
      totalUnits,
      lockedCapital: lockedCap,
      percentageOfLockedCapital: pct,
      topItems,
    };
  };

  return {
    totalSkus,
    totalClosingUnits,
    totalLockedCapital,
    buckets: {
      "0_30": createBucket("0_30", "0–30 Days (Active / Fresh)", 0, 30),
      "31_60": createBucket("31_60", "31–60 Days (Slow Moving)", 31, 60),
      "61_90": createBucket("61_90", "61–90 Days (At Risk)", 61, 90),
      "90_PLUS": createBucket("90_PLUS", "90+ Days (Dead Stock / Stagnant)", 91, null),
    },
  };
}
