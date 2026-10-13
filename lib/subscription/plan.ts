export type SubscriptionPlan = 'trial' | 'spark_lite' | 'spark' | 'mini' | 'pro' | 'growth' | 'enterprise' | 'business';

export const PLAN_HIERARCHY: SubscriptionPlan[] = ['trial', 'spark_lite', 'spark', 'mini', 'pro', 'growth', 'enterprise', 'business'];

export const PLAN_CONFIG: Record<SubscriptionPlan, {
  displayName: string;
  monthlyPrice: number;
  baseStores: number | 'unlimited';
  extraStorePrice: number | null;   // null = no add-on allowed (mini/spark/spark_lite) or not applicable (business/enterprise = unlimited)
  baseTx: number | 'unlimited';
  extraStoreTx: number;             // tx bundled per extra store purchased
  maxStaff: number | 'unlimited';
}> = {
  trial:      { displayName: 'Free Trial',  monthlyPrice: 0,   baseStores: 'unlimited', extraStorePrice: null, baseTx: 'unlimited', extraStoreTx: 0,    maxStaff: 'unlimited' },
  spark_lite: { displayName: 'Spark Lite',  monthlyPrice: 0,   baseStores: 1,           extraStorePrice: null, baseTx: 100,         extraStoreTx: 0,    maxStaff: 3 },
  spark:      { displayName: 'Spark',       monthlyPrice: 399, baseStores: 1,           extraStorePrice: null, baseTx: 500,         extraStoreTx: 0,    maxStaff: 5 },
  mini:       { displayName: 'Spark',       monthlyPrice: 399, baseStores: 1,           extraStorePrice: null, baseTx: 500,         extraStoreTx: 0,    maxStaff: 5 },
  pro:        { displayName: 'Pro',         monthlyPrice: 799, baseStores: 1,           extraStorePrice: 299,  baseTx: 2500,        extraStoreTx: 2500, maxStaff: 15 },
  growth:     { displayName: 'Growth',      monthlyPrice: 1499, baseStores: 1,          extraStorePrice: 399,  baseTx: 6000,        extraStoreTx: 6000, maxStaff: 50 },
  enterprise: { displayName: 'Enterprise',  monthlyPrice: 0,   baseStores: 'unlimited', extraStorePrice: null, baseTx: 'unlimited', extraStoreTx: 0,    maxStaff: 'unlimited' },
  business:   { displayName: 'Business',    monthlyPrice: 0,   baseStores: 'unlimited', extraStorePrice: null, baseTx: 'unlimited', extraStoreTx: 0,    maxStaff: 'unlimited' },
};

export function planFromString(value?: string | null): SubscriptionPlan {
  const v = (value ?? '').toLowerCase();
  if (['trial', 'spark_lite', 'spark', 'mini', 'pro', 'growth', 'enterprise', 'business'].includes(v)) return v as SubscriptionPlan;
  return 'spark_lite';
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

export const STAFF_BLOCK_PRICE = 199;
export const STAFF_BLOCK_SIZE = 10;

export function effectiveMaxStaff(plan: SubscriptionPlan, extraStaffPurchased: number): number | 'unlimited' {
  const cfg = PLAN_CONFIG[plan];
  if (cfg.maxStaff === 'unlimited') return 'unlimited';
  return cfg.maxStaff + (extraStaffPurchased > 0 ? extraStaffPurchased : 0);
}
