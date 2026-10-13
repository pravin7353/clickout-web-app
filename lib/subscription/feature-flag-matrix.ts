import { SubscriptionPlan } from './plan';

export const ROUTE_MIN_PLAN: Record<string, SubscriptionPlan> = {
  'manager-dashboard': 'pro',
  'auditor': 'mini',
  'refund': 'pro',
  'growth': 'pro',
  'procurement': 'pro',
  'suppliers': 'pro',
  'fraud-control': 'pro',
  'campaign-manager': 'pro',
  'guard': 'growth',
  'risk': 'growth',
  'qr-reactivation': 'growth',
  'manpower': 'growth',
  'idt': 'pro',
  'integrations': 'business',
  'hr': 'growth',
  'finance': 'growth',
  'employee': 'growth',
  'inventory_transfer': 'growth',
};

export const ROUTE_UPGRADE_MESSAGE: Record<string, string> = {
  'manager-dashboard': 'Upgrade to Pro to manage your staff',
  'auditor': 'Upgrade to Pro for the Super Auditor suite',
  'refund': 'Upgrade to Pro for the Refund Engine',
  'growth': 'Upgrade to Pro for Growth Radar & churn intelligence',
  'procurement': 'Upgrade to Pro for the Procurement module',
  'suppliers': 'Upgrade to Pro for Supplier management',
  'fraud-control': 'Upgrade to Pro for Fraud Detection',
  'campaign-manager': 'Upgrade to Pro to run offer campaigns',
  'guard': 'Upgrade to Growth for Super Guard',
  'risk': 'Upgrade to Growth for Risk Engine AI',
  'qr-reactivation': 'Upgrade to Growth for QR Bailout',
  'manpower': 'Upgrade to Growth for Shift Planning & Manpower',
  'idt': 'Upgrade to Pro for Intelligent Deposit Tracking',
  'integrations': 'Upgrade to Business for Custom Integrations & ERP API',
  'hr': 'Upgrade to Growth for HR, Workforce & Incentive Operations',
  'finance': 'Upgrade to Growth for CA-Suitable Finance & Ledger Suite',
  'employee': 'Upgrade to Growth for Employee Self-Service Portal',
  'inventory_transfer': 'Upgrade to Growth for Inter-Branch Stock Transfers',
};

export const ROUTE_FEATURE_BULLETS: Record<string, string[]> = {
  'manager-dashboard': [
    'Staff onboarding & command management',
    'Role-based performance monitoring',
    'Shift scheduling & attendance',
  ],
  'auditor': [
    'Cash reconciliation dashboard',
    'Time intelligence reports',
    'Vault audit trail',
  ],
  'refund': [
    'Automated refund decision engine',
    'Financial leakage detection',
    'Refund fraud scoring',
  ],
  'growth': [
    'VIP customer tracking',
    'Ghost visitor detection',
    'Churn prediction & offers',
  ],
  'procurement': [
    'Purchase order management',
    'Distributor intelligence',
    'Stock alert automation',
  ],
  'suppliers': [
    'Vendor directory & performance metrics',
    'Supplier contract & ledger management',
    'Automated reorder procurement pipelines',
  ],
  'fraud-control': [
    'Real-time anomaly detection',
    'Leakage kanban board',
    'Staff fraud scoring',
  ],
  'campaign-manager': [
    'Targeted promotional campaigns',
    'Discount & offer lifecycle management',
    'Redemption analytics & usage tracking',
  ],
  'guard': [
    'AI-powered entry control',
    'Gate pass intelligence',
    'Exit scan analytics',
  ],
  'risk': [
    'Risk Engine AI scoring',
    'Operational intelligence layer',
    'Threat pattern recognition',
  ],
  'qr-reactivation': [
    'QR bailout for blocked carts',
    'Emergency checkout recovery',
    'Session reactivation logs',
  ],
  'manpower': [
    'Shift planning & roster allocation',
    'Staff attendance & verification audit',
    'Peak-hour floor coverage optimization',
  ],
  'idt': [
    'Intelligent Deposit Tracking',
    'Bank remittance reconciliation',
    'Cash-in-transit verification logs',
  ],
  'integrations': [
    'Custom ERP & accounting API access',
    'Enterprise webhook dispatchers',
    'Third-party POS & logistics synchronization',
  ],
  'hr': [
    'Geo-fenced mobile attendance & auto-checkin',
    'Staff leave balances & approval workflows',
    'Performance incentives & payroll compensation',
  ],
  'finance': [
    'CA-grade financial reports & ledger export',
    'Automated GST reconciliation & filing records',
    'Multi-store profit & loss operational matrix',
  ],
  'employee': [
    'One-touch GPS attendance check-in & ping',
    'Leave quota tracker & regularization requests',
    'Digital profile & employment milestones',
  ],
  'inventory_transfer': [
    'Cross-store inventory transfers',
    'Inter-branch delivery challans & gate pass',
    'Live in-transit stock reconciliation',
  ],
};

export const PLAN_LIMITS: Record<string, {
  maxStores: number;           // base included stores
  maxExtraStores: number;      // how many add-on stores allowed
  baseTxnsPerMonth: number;    // transactions included in base
  extraStoreTxns: number;      // additional txns per extra store
  extraStorePrice: number;     // ₹ per extra store per month
  maxStaff: number;
  maxPosCounters: number;
}> = {
  spark_lite: {
    maxStores: 1, maxExtraStores: 0,
    baseTxnsPerMonth: 100, extraStoreTxns: 0, extraStorePrice: 0,
    maxStaff: 3, maxPosCounters: 1,
  },
  spark: {
    maxStores: 1, maxExtraStores: 0,
    baseTxnsPerMonth: 500, extraStoreTxns: 0, extraStorePrice: 0,
    maxStaff: 5, maxPosCounters: 1,
  },
  mini: {
    maxStores: 1, maxExtraStores: 0,
    baseTxnsPerMonth: 500, extraStoreTxns: 0, extraStorePrice: 0,
    maxStaff: 5, maxPosCounters: 1,
  },
  pro: {
    maxStores: 1, maxExtraStores: 2,
    baseTxnsPerMonth: 2500, extraStoreTxns: 2500, extraStorePrice: 299,
    maxStaff: 15, maxPosCounters: 2,
  },
  growth: {
    maxStores: 1, maxExtraStores: 4,
    baseTxnsPerMonth: 6000, extraStoreTxns: 6000, extraStorePrice: 399,
    maxStaff: 50, maxPosCounters: 5,
  },
  trial: {
    maxStores: 1, maxExtraStores: 4,
    baseTxnsPerMonth: 6000, extraStoreTxns: 6000, extraStorePrice: 399,
    maxStaff: 50, maxPosCounters: 5,
  },
  enterprise: {
    maxStores: 999, maxExtraStores: 999,
    baseTxnsPerMonth: 999999, extraStoreTxns: 999999, extraStorePrice: 0,
    maxStaff: 9999, maxPosCounters: 999,
  },
  business: {
    maxStores: 999, maxExtraStores: 999,
    baseTxnsPerMonth: 999999, extraStoreTxns: 999999, extraStorePrice: 0,
    maxStaff: 9999, maxPosCounters: 999,
  },
};

export function getEffectiveTxnLimit(plan: string, extraStoreCount: number): number {
  const normalized = (plan || "spark_lite").toLowerCase();
  const limits = PLAN_LIMITS[normalized] ?? PLAN_LIMITS["spark_lite"];
  return limits.baseTxnsPerMonth + (Math.min(Math.max(0, extraStoreCount), limits.maxExtraStores) * limits.extraStoreTxns);
}

export const STAFF_BLOCK_PRICE = 199;
export const STAFF_BLOCK_SIZE = 10;

export function getEffectiveStaffLimit(plan: string, extraStaffPurchased: number): number {
  const normalized = (plan || "spark_lite").toLowerCase();
  const limits = PLAN_LIMITS[normalized] ?? PLAN_LIMITS["spark_lite"];
  return limits.maxStaff + Math.max(0, extraStaffPurchased);
}

