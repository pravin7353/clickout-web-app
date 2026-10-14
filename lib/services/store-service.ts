import { adminDb } from "@/lib/firebase-admin";
import { planFromString, effectiveMaxStores } from "@/lib/subscription/plan";

export type StoreRow = {
  id: string;
  storeName: string;
  branchCode: string;
  managerName: string;
  city: string;
  bankDetailsPending: boolean;
  isActive: boolean;
  status: string;
  isFrozen?: boolean;
  frozenReason?: string;
};

export type StorePaginationOptions = {
  page?: number;
  pageSize?: number;
};

/**
 * Fetch stores with defensive .limit(200) cap, plan quota evaluation, and optional pagination support.
 */
export async function getStores(
  role: string,
  tenantId: string | null,
  options?: StorePaginationOptions
): Promise<StoreRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("stores");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  // Fetch stores ordered chronologically by createdAt (oldest first is primary base store)
  let snap;
  try {
    snap = await query.orderBy("createdAt", "asc").limit(200).get();
  } catch {
    snap = await query.limit(200).get();
  }

  let allowedStores = 999;
  if (tenantId) {
    try {
      const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
      if (tDoc.exists) {
        const tData = tDoc.data() || {};
        const plan = planFromString(tData.subscriptionPlan ?? tData.plan);
        const extraStores = Number(tData.extraStoresPurchased ?? 0);
        const effMax = effectiveMaxStores(plan, extraStores);
        if (effMax !== "unlimited") {
          allowedStores = effMax;
        }
      }
    } catch (e) {
      console.error("Error evaluating tenant store quota:", e);
    }
  }

  const allStores: StoreRow[] = snap.docs.map((doc, index) => {
    const data = doc.data();
    const isExceeded = index >= allowedStores;
    const isDocSuspended = data.status === "SUSPENDED" || data.isActive === false;
    const isFrozen = isExceeded || data.status === "FROZEN";
    return {
      id: doc.id,
      storeName: data.storeName ?? "",
      branchCode: data.branchCode ?? "",
      managerName: data.managerName ?? "",
      city: data.location?.city ?? "",
      bankDetailsPending: data.bankDetailsPending === true,
      isActive: !isFrozen && !isDocSuspended,
      status: isFrozen ? "FROZEN" : (data.status ?? "ACTIVE"),
      isFrozen,
      frozenReason: isFrozen ? (isExceeded ? "PLAN_LIMIT_EXCEEDED" : "PAYMENT_OVERDUE") : undefined,
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