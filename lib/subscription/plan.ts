export type SubscriptionPlan = 'trial' | 'mini' | 'pro' | 'growth' | 'business';

export const PLAN_HIERARCHY: SubscriptionPlan[] = ['trial', 'mini', 'pro', 'growth', 'business'];

export const PLAN_CONFIG: Record<SubscriptionPlan, {
  displayName: string;
  monthlyPrice: number;
  baseStores: number | 'unlimited';
  extraStorePrice: number | null;   // null = no add-on allowed (mini) or not applicable (business = unlimited)
  baseTx: number | 'unlimited';
  extraStoreTx: number;             // tx bundled per extra store purchased
  maxStaff: number | 'unlimited';
}> = {
  trial:    { displayName: 'Free Trial', monthlyPrice: 0,   baseStores: 'unlimited', extraStorePrice: null, baseTx: 'unlimited', extraStoreTx: 0,    maxStaff: 'unlimited' },
  mini:     { displayName: 'Mini',       monthlyPrice: 299, baseStores: 1,           extraStorePrice: null, baseTx: 500,         extraStoreTx: 0,    maxStaff: 2 },
  pro:      { displayName: 'Pro',        monthlyPrice: 599, baseStores: 1,           extraStorePrice: 399,  baseTx: 2500,        extraStoreTx: 1500, maxStaff: 10 },
  growth:   { displayName: 'Growth',     monthlyPrice: 999, baseStores: 1,           extraStorePrice: 299,  baseTx: 5000,        extraStoreTx: 2000, maxStaff: 'unlimited' },
  business: { displayName: 'Business',   monthlyPrice: 0,   baseStores: 'unlimited', extraStorePrice: null, baseTx: 'unlimited', extraStoreTx: 0,    maxStaff: 'unlimited' },
};

export function planFromString(value?: string | null): SubscriptionPlan {
  const v = (value ?? '').toLowerCase();
  if (['trial', 'mini', 'pro', 'growth', 'business'].includes(v)) return v as SubscriptionPlan;
  return 'mini';
}

// Effective store/tx limits accounting for purchased add-ons (extraStoresPurchased comes from the tenant doc)
export function effectiveMaxStores(plan: SubscriptionPlan, extraStoresPurchased: number): number | 'unlimited' {
  const cfg = PLAN_CONFIG[plan];
  if (cfg.baseStores === 'unlimited') return 'unlimited';
  return cfg.baseStores + (extraStoresPurchased > 0 ? extraStoresPurchased : 0);
}

export function effectiveMaxTx(plan: SubscriptionPlan, extraStoresPurchased: number): number | 'unlimited' {
  const cfg = PLAN_CONFIG[plan];
  if (cfg.baseTx === 'unlimited') return 'unlimited';
  return cfg.baseTx + (cfg.extraStoreTx * (extraStoresPurchased > 0 ? extraStoresPurchased : 0));
}
