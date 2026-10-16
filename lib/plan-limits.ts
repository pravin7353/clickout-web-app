import { adminDb } from "@/lib/firebase-admin";
import { PLAN_CONFIG } from "@/lib/plan-config";

export type LimitKey = "maxScansPerMonth" | "maxStores" | "maxProducts" | "maxStaff" | "maxCashiers";

export type PlanTier = "spark_lite" | "spark" | "mini" | "pro" | "growth" | "business" | "trial" | "enterprise";

export interface PlanLimitsLegacy {
  maxPosCounters: number;
}

export const PLAN_LIMITS: Record<string, PlanLimitsLegacy> = {
  spark_lite: { maxPosCounters: 1 },
  mini: { maxPosCounters: 1 },
  spark: { maxPosCounters: 1 },
  pro: { maxPosCounters: 2 },
  growth: { maxPosCounters: 5 },
  trial: { maxPosCounters: 5 },
  business: { maxPosCounters: 99 },
  enterprise: { maxPosCounters: 99 },
};

export const EXTRA_POS_COUNTER_MONTHLY_PRICE = 199;
export const EXTRA_STAFF_BLOCK_MONTHLY_PRICE = 199;
export const EXTRA_STAFF_BLOCK_SIZE = 10;

/**
 * Get the maximum allowed simultaneous POS counters for a given subscription plan
 */
export function getMaxPosCounters(plan?: string | null, extraCountersPurchased: number = 0): number {
  const normalized = (plan || "mini").toLowerCase();
  const base = PLAN_LIMITS[normalized]?.maxPosCounters ?? 1;
  return base + (extraCountersPurchased > 0 ? extraCountersPurchased : 0);
}

/**
 * Check if a tenant's current resource count is allowed by their plan
 */
export async function checkPlanLimit(
  tenantId: string,
  limitKey: LimitKey,
  currentCount: number
): Promise<{ allowed: boolean; limit: number; current: number; planName: string }> {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const data = tenantSnap.data();
  const plan = (data?.plan ?? data?.subscriptionPlan ?? "spark_lite").toLowerCase();
  const config = PLAN_CONFIG[plan] || PLAN_CONFIG["spark_lite"];
  const limit = config?.limits?.[limitKey] ?? 0;

  return {
    allowed: limit === -1 || currentCount < limit, // -1 = unlimited
    limit,
    current: currentCount,
    planName: plan,
  };
}

/**
 * Read current counts and limits across all tracked resources for a tenant
 */
export async function getTenantUsageAndLimits(tenantId: string) {
  const [tenantSnap, productsSnap, staffSnap, storesSnap] = await Promise.all([
    adminDb.collection("tenants").doc(tenantId).get(),
    adminDb.collection("products").where("tenantId", "==", tenantId).where("isDeleted", "!=", true).count().get(),
    adminDb.collection("staff").where("tenantId", "==", tenantId).where("isDeleted", "==", false).count().get(),
    adminDb.collection("stores").where("tenantId", "==", tenantId).where("isDeleted", "!=", true).count().get(),
  ]);

  const tData = tenantSnap.data() || {};
  const plan = (tData.plan ?? tData.subscriptionPlan ?? "spark_lite").toLowerCase();
  const config = PLAN_CONFIG[plan] || PLAN_CONFIG["spark_lite"];
  const monthlyScans = Number(tData.monthlyScans ?? tData.currentTransactions ?? 0);

  const extraPosCounters = Number(tData.extraPosCountersPurchased ?? 0);
  const currentCashiers = extraPosCounters + 1;

  const currentCounts: Record<LimitKey, number> = {
    maxProducts: productsSnap.data().count,
    maxStaff: staffSnap.data().count,
    maxStores: storesSnap.data().count,
    maxScansPerMonth: monthlyScans,
    maxCashiers: currentCashiers,
  };

  return {
    plan,
    planDisplayName: config.displayName,
    monthlyPrice: config.monthlyPrice,
    limits: config.limits,
    currentCounts,
  };
}
