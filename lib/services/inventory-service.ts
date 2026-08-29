import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type LedgerRow = {
  productId: string;
  name: string;
  openingStock: number;
  purchasedStock: number;
  soldStock: number;
  damagedStock: number;
  expiredStock: number;
  closingStock: number;
  isDeadStock: boolean;
};

export async function getLedger(role: string, tenantId: string | null, storeId: string | null): Promise<LedgerRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("products");

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (role === "manager" && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.get();
  const now = Date.now();

  return snap.docs.map((doc) => {
    const data = doc.data();
    const openingStock = data.openingStock ?? 0;
    const purchasedStock = data.purchasedStock ?? 0;
    const soldStock = data.soldStock ?? 0;
    const damagedStock = data.damagedStock ?? 0;
    const expiredStock = data.expiredStock ?? 0;
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

    return {
      productId: doc.id,
      name: data.name ?? "Unknown Item",
      openingStock, purchasedStock, soldStock, damagedStock, expiredStock,
      closingStock, isDeadStock,
    };
  });
}