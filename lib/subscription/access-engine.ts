import {
  SubscriptionPlan,
  PLAN_HIERARCHY,
  PLAN_CONFIG,
  planFromString,
  effectiveMaxStores,
  effectiveMaxTx,
} from './plan';
import {
  ROUTE_MIN_PLAN,
  ROUTE_UPGRADE_MESSAGE,
  ROUTE_FEATURE_BULLETS,
} from './feature-flag-matrix';

export function isRouteAllowed({
  route,
  plan,
  isTrialActive,
}: {
  route: string;
  plan: SubscriptionPlan | string;
  isTrialActive: boolean;
}): boolean {
  // Trial or Business plan = full access
  if (isTrialActive) return true;

  const resolvedPlan = planFromString(plan);
  if (resolvedPlan === 'trial' || resolvedPlan === 'business') return true;

  const minPlan = ROUTE_MIN_PLAN[route];
  // Route not in matrix = open to all plans
  if (!minPlan) return true;

  const userIndex = PLAN_HIERARCHY.indexOf(resolvedPlan);
  const requiredIndex = PLAN_HIERARCHY.indexOf(minPlan);

  if (userIndex === -1 || requiredIndex === -1) return false;
  return userIndex >= requiredIndex;
}

export function isTrialActive(trialEndsAt: Date | string | number | null | undefined): boolean {
  if (!trialEndsAt) return false;
  const date = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (isNaN(date.getTime())) return false;
  return Date.now() < date.getTime();
}

export function trialDaysRemaining(trialEndsAt: Date | string | number | null | undefined): number {
  if (!trialEndsAt) return -1;
  const date = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (isNaN(date.getTime())) return -1;
  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) return -1;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function isExpired(billingStatus: string): boolean {
  const status = (billingStatus ?? '').toLowerCase();
  return status === 'expired' || status === 'suspended';
}

export function isTransactionLimitReached(
  plan: SubscriptionPlan | string,
  extraStoresPurchased: number,
  currentCount: number
): boolean {
  const resolvedPlan = planFromString(plan);
  const max = effectiveMaxTx(resolvedPlan, extraStoresPurchased);
  if (max === 'unlimited') return false;
  return currentCount >= max;
}

export function isTransactionWarning(
  plan: SubscriptionPlan | string,
  extraStoresPurchased: number,
  currentCount: number
): boolean {
  const resolvedPlan = planFromString(plan);
  const max = effectiveMaxTx(resolvedPlan, extraStoresPurchased);
  if (max === 'unlimited' || max <= 0) return false;
  return currentCount / max >= 0.9;
}

export function isStaffLimitReached(
  plan: SubscriptionPlan | string,
  currentCount: number
): boolean {
  const resolvedPlan = planFromString(plan);
  const cfg = PLAN_CONFIG[resolvedPlan];
  if (cfg.maxStaff === 'unlimited') return false;
  return currentCount >= cfg.maxStaff;
}

export function isStoreLimitReached(
  plan: SubscriptionPlan | string,
  extraStoresPurchased: number,
  currentCount: number
): boolean {
  const resolvedPlan = planFromString(plan);
  const max = effectiveMaxStores(resolvedPlan, extraStoresPurchased);
  if (max === 'unlimited') return false;
  return currentCount >= max;
}

export function getUpgradeMessage(route: string): string {
  return ROUTE_UPGRADE_MESSAGE[route] ?? 'Upgrade your plan to unlock this feature';
}

export function getFeatureBullets(route: string): string[] {
  return ROUTE_FEATURE_BULLETS[route] ?? [];
}

export function getRequiredPlanName(route: string): string {
  const minPlan = ROUTE_MIN_PLAN[route];
  if (!minPlan) return '';
  const resolved = planFromString(minPlan);
  return PLAN_CONFIG[resolved]?.displayName ?? '';
}
