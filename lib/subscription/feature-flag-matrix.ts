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
};
