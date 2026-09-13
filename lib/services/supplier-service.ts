import { adminDb } from "@/lib/firebase-admin";

export type SupplierRow = {
  id: string;
  supplierID: string;
  name: string;
  email: string;
  phone: string;
  categories: string;
  isActive: boolean;
  gstin?: string;
};

export type SupplierPaginationOptions = {
  page?: number;
  pageSize?: number;
};

/**
 * Fetch suppliers with defensive .limit(300) cap and optional pagination support.
 */
export async function getSuppliers(
  role: string,
  tenantId: string | null,
  options?: SupplierPaginationOptions
): Promise<SupplierRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("suppliers");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  // Immediate defensive safety cap: max 300
  const snap = await query.limit(300).get();
  const allSuppliers: SupplierRow[] = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      supplierID: d.supplierID ?? "",
      name: d.name ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      categories: d.categories ?? "",
      isActive: d.isActive !== false,
      gstin: d.gstin ?? "",
    };
  });

  if (options?.page && options?.pageSize) {
    const start = (Math.max(1, options.page) - 1) * options.pageSize;
    const paged = allSuppliers.slice(start, start + options.pageSize);
    (paged as any).totalCount = allSuppliers.length;
    return paged;
  }

  (allSuppliers as any).totalCount = allSuppliers.length;
  return allSuppliers;
}