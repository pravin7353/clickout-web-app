export type PlanTier = "spark_lite" | "spark" | "pro" | "growth" | "enterprise" | "trial";

export interface PlanLimits {
  maxScansPerMonth: number; // -1 = unlimited
  maxStores: number;        // -1 = unlimited
  maxProducts: number;      // -1 = unlimited
  maxStaff: number;         // -1 = unlimited
  maxCashiers: number;      // -1 = unlimited
}

export interface PlanConfigItem {
  name: string;
  displayName: string;
  monthlyPrice: number;
  description: string;
  limits: PlanLimits;
}

export const PLAN_CONFIG: Record<string, PlanConfigItem> = {
  spark_lite: {
    name: "spark_lite",
    displayName: "Spark Lite",
    monthlyPrice: 0,
    description: "Free forever starter plan for single counter shops",
    limits: {
      maxScansPerMonth: 100,
      maxStores: 1,
      maxProducts: -1,
      maxStaff: 3,
      maxCashiers: 1,
    },
  },
  spark: {
    name: "spark",
    displayName: "Spark",
    monthlyPrice: 399,
    description: "Single store plan with 500 scans and 5 staff accounts",
    limits: {
      maxScansPerMonth: 500,
      maxStores: 1,
      maxProducts: -1,
      maxStaff: 5,
      maxCashiers: 1,
    },
  },
  pro: {
    name: "pro",
    displayName: "Pro",
    monthlyPrice: 799,
    description: "Scaling retail store with multi-store support and HR",
    limits: {
      maxScansPerMonth: 2500,
      maxStores: 3,
      maxProducts: -1,
      maxStaff: 15,
      maxCashiers: 2,
    },
  },
  growth: {
    name: "growth",
    displayName: "Growth",
    monthlyPrice: 1499,
    description: "Enterprise multi-store chain with AI and CA-grade finance",
    limits: {
      maxScansPerMonth: 6000,
      maxStores: 5,
      maxProducts: -1,
      maxStaff: 50,
      maxCashiers: 5,
    },
  },
  trial: {
    name: "trial",
    displayName: "Free Trial",
    monthlyPrice: 0,
    description: "14-day full feature trial",
    limits: {
      maxScansPerMonth: 6000,
      maxStores: 5,
      maxProducts: -1,
      maxStaff: 50,
      maxCashiers: 5,
    },
  },
  enterprise: {
    name: "enterprise",
    displayName: "Enterprise",
    monthlyPrice: 0,
    description: "Unlimited enterprise grade deployment",
    limits: {
      maxScansPerMonth: -1,
      maxStores: -1,
      maxProducts: -1,
      maxStaff: -1,
      maxCashiers: -1,
    },
  },
};
