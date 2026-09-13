import { adminDb } from "@/lib/firebase-admin";

export type StoreRow = {
  id: string;
  storeName: string;
  branchCode: string;
  managerName: string;
  city: string;
  bankDetailsPending: boolean;
  isActive: boolean;
  status: string;
};

export type StorePaginationOptions = {
  page?: number;
  pageSize?: number;
};

/**
 * Fetch stores with defensive .limit(200) cap and optional pagination support.
 */
export async function getStores(
  role: string,
  tenantId: string | null,
  options?: StorePaginationOptions
): Promise<StoreRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("stores");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  // Immediate safety cap: limit(200) prevents unbounded growth
  const snap = await query.orderBy("createdAt", "desc").limit(200).get();
  const allStores: StoreRow[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      storeName: data.storeName ?? "",
      branchCode: data.branchCode ?? "",
      managerName: data.managerName ?? "",
      city: data.location?.city ?? "",
      bankDetailsPending: data.bankDetailsPending === true,
      isActive: data.isActive !== false,
      status: data.status ?? "ACTIVE",
    };
  });

  if (options?.page && options?.pageSize) {
    const start = (Math.max(1, options.page) - 1) * options.pageSize;
    const paged = allStores.slice(start, start + options.pageSize);
    (paged as any).totalCount = allStores.length;
    return paged;
  }

  (allStores as any).totalCount = allStores.length;
  return allStores;
}