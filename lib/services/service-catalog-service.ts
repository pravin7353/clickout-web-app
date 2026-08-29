import { adminDb } from "@/lib/firebase-admin";

export type ServiceRow = { id: string; barcode: string; name: string; price: number; gst: string };

export async function getServices(role: string, tenantId: string | null, storeId: string | null): Promise<ServiceRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("products").where("itemType", "==", "SERVICE");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (role === "manager" && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, barcode: data.barcode ?? "", name: data.name ?? "", price: data.price ?? 0, gst: data.gst ?? "0" };
  });
}