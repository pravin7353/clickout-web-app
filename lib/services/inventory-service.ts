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