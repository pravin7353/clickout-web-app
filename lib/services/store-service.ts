import { adminDb } from "@/lib/firebase-admin";

export type StoreRow = {
  id: string;
  storeName: string;
  branchCode: string;
  managerName: string;
  city: string;
  bankDetailsPending: boolean;
  isActive: boolean;
};

export async function getStores(role: string, tenantId: string | null): Promise<StoreRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("stores");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      storeName: data.storeName ?? "",
      branchCode: data.branchCode ?? "",
      managerName: data.managerName ?? "",
      city: data.location?.city ?? "",
      bankDetailsPending: data.bankDetailsPending === true,
      isActive: data.isActive !== false,
    };
  });
}