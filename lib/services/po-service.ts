import { adminDb } from "@/lib/firebase-admin";

export type AiSuggestion = {
  id: string;
  productName: string;
  supplierName: string;
  suggestedQty: number;
  branchCode: string;
};

export type PORow = {
  id: string;
  supplierName: string;
  totalItems: number;
  totalOrderValue: number;
  status: string;
};

async function resolveSupplierName(supplierId: string): Promise<string> {
  if (!supplierId) return "Unknown";
  const doc = await adminDb.collection("suppliers").doc(supplierId).get();
  return doc.exists ? (doc.data()?.name ?? supplierId) : supplierId;
}

export async function getAiSuggestions(role: string, tenantId: string | null): Promise<AiSuggestion[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("ai_po_suggestions");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.limit(50).get();
  const results: AiSuggestion[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const productDoc = await adminDb.collection("products").doc(data.productId).get();
    results.push({
      id: doc.id,
      productName: productDoc.data()?.name ?? "Unknown Product",
      supplierName: await resolveSupplierName(data.supplierId ?? "DEFAULT_SUPPLIER"),
      suggestedQty: data.suggestedQty ?? data.orderQty ?? 50,
      branchCode: data.branchCode ?? "HQ",
    });
  }
  return results;
}

export async function getPurchaseOrders(role: string, tenantId: string | null): Promise<PORow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("purchase_orders");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.orderBy("createdAt", "desc").limit(50).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      supplierName: data.supplierName ?? "Unknown Supplier",
      totalItems: data.totalItems ?? 0,
      totalOrderValue: data.totalOrderValue ?? 0,
      status: data.status ?? "DRAFT",
    };
  });
}