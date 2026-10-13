export type PlanTier = "spark_lite" | "spark" | "mini" | "pro" | "growth" | "business" | "trial";

export interface PlanLimits {
  maxPosCounters: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  spark_lite: { maxPosCounters: 1 },
  mini: { maxPosCounters: 1 },
  spark: { maxPosCounters: 1 },
  pro: { maxPosCounters: 2 },
  growth: { maxPosCounters: 5 },
  trial: { maxPosCounters: 5 },
  business: { maxPosCounters: 99 },
};

export const EXTRA_POS_COUNTER_MONTHLY_PRICE = 199;

/**
 * Get the maximum allowed simultaneous POS counters for a given subscription plan
 */
export function getMaxPosCounters(plan?: string | null, extraCountersPurchased: number = 0): number {
  const normalized = (plan || "mini").toLowerCase();
  const base = PLAN_LIMITS[normalized]?.maxPosCounters ?? 1;
  return base + (extraCountersPurchased > 0 ? extraCountersPurchased : 0);
}
