import { auth } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { getPosCountersWithStatus } from "@/lib/services/pos-counter-service";
import { getMaxPosCounters } from "@/lib/plan-limits";
import { CounterSelection } from "@/components/pos/counter-selection";

export default async function PosCounterSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store: queryStore } = await searchParams;
  const session = await auth();

  let effectiveTenantId = (session?.user as any)?.tenantId as string | undefined;
  let storeName = "ClickOut Store";
  let effectiveStoreId = queryStore || (session?.user as any)?.storeId;

  // Resolve store and tenant details
  if (queryStore) {
    const storeSnap = await adminDb
      .collection("stores")
      .where("branchCode", "==", queryStore)
      .limit(1)
      .get();
    if (!storeSnap.empty) {
      const sData = storeSnap.docs[0].data();
      storeName = sData.storeName || sData.name || storeName;
      if (!effectiveTenantId) {
        effectiveTenantId = sData.tenantId;
      }
    }
  }

  // Fallback: If no store query provided, look up first active store of tenant
  if (effectiveTenantId && !queryStore) {
    const storeSnap = await adminDb
      .collection("stores")
      .where("tenantId", "==", effectiveTenantId)
      .limit(1)
      .get();
    if (!storeSnap.empty) {
      const sData = storeSnap.docs[0].data();
      storeName = sData.storeName || sData.name || storeName;
      effectiveStoreId = sData.branchCode;
    }
  }

  // Default fallback if brand/tenant name is available
  if (effectiveTenantId && storeName === "ClickOut Store") {
    const tenantDoc = await adminDb.collection("tenants").doc(effectiveTenantId).get();
    if (tenantDoc.exists) {
      const tData = tenantDoc.data()!;
      storeName = tData.businessName || tData.name || tData.companyName || storeName;
    }
  }

  let counters: any[] = [];
  let maxAllowedCounters = 1;

  if (effectiveTenantId) {
    const [rawCounters, tDoc] = await Promise.all([
      getPosCountersWithStatus(effectiveTenantId, effectiveStoreId),
      adminDb.collection("tenants").doc(effectiveTenantId).get(),
    ]);

    counters = rawCounters;
    const tData = tDoc.data() || {};
    const plan = (tData.subscriptionPlan || "mini").toLowerCase();
    const extraCounters = Number(tData.extraPosCountersPurchased || 0);
    maxAllowedCounters = getMaxPosCounters(plan, extraCounters);
  }

  return (
    <CounterSelection
      storeName={storeName}
      storeId={effectiveStoreId}
      tenantId={effectiveTenantId}
      counters={counters}
      maxAllowedCounters={maxAllowedCounters}
    />
  );
}
