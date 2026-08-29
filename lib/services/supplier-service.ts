import { adminDb } from "@/lib/firebase-admin";

export type SupplierRow = { id: string; supplierID: string; name: string; email: string; phone: string; categories: string; isActive: boolean };

export async function getSuppliers(role: string, tenantId: string | null): Promise<SupplierRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("suppliers");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, supplierID: d.supplierID ?? "", name: d.name ?? "", email: d.email ?? "", phone: d.phone ?? "", categories: d.categories ?? "", isActive: d.isActive !== false };
  });
}