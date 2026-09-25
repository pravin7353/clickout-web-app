import { z } from "zod";

export const IncentiveMetricEnum = z.enum([
  "ORDER_COUNT",
  "ORDER_VOLUME",
  "FRAUD_CATCH_COUNT",
  "FRAUD_VALUE_PREVENTED",
]);
export type IncentiveMetric = z.infer<typeof IncentiveMetricEnum>;

export const IncentiveRoleEnum = z.enum(["cashier", "guard"]);
export type IncentiveRole = z.infer<typeof IncentiveRoleEnum>;

export const CalculationTypeEnum = z.enum(["PERCENT_OF_SALE", "FIXED_PER_SALE", "TIERED"]);
export type CalculationType = z.infer<typeof CalculationTypeEnum>;

export const PayoutFrequencyEnum = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export type PayoutFrequency = z.infer<typeof PayoutFrequencyEnum>;

export const TierThresholdSchema = z.object({
  minSaleAmount: z.number().min(0, "Minimum sale amount must be non-negative"),
  percent: z.number().min(0, "Percent must be non-negative"),
});
export type TierThreshold = z.infer<typeof TierThresholdSchema>;

export const incentiveRuleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  role: IncentiveRoleEnum.default("cashier"),
  category: z.string().trim().default("ALL"),
  calculationType: CalculationTypeEnum.default("PERCENT_OF_SALE"),
  percentValue: z.coerce.number().min(0).optional(),
  fixedAmount: z.coerce.number().min(0).optional(),
  tiers: z.array(TierThresholdSchema).optional(),
  minSaleAmount: z.coerce.number().min(0).default(0),
  payoutFrequency: PayoutFrequencyEnum.default("MONTHLY"),
  autoApproveThreshold: z.coerce.number().min(0).default(500),

  // Legacy/Guard fields for backward compatibility
  metric: IncentiveMetricEnum.optional(),
  threshold: z.coerce.number().min(0).optional(),
  rewardAmount: z.coerce.number().min(0).optional(),
  rewardType: z.enum(["FLAT", "PER_UNIT", "PERCENTAGE"]).optional(),
  description: z.string().trim().optional(),
});

export type IncentiveRuleInput = z.infer<typeof incentiveRuleSchema>;

export interface IncentiveRuleDocument {
  id: string;
  tenantId: string;
  role?: "cashier" | "guard";
  category?: string;
  calculationType?: "PERCENT_OF_SALE" | "FIXED_PER_SALE" | "TIERED";
  percentValue?: number;
  fixedAmount?: number;
  tiers?: { minSaleAmount: number; percent: number }[];
  minSaleAmount?: number;
  payoutFrequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  autoApproveThreshold?: number;

  // Legacy / Guard metric fields
  metric?: "ORDER_COUNT" | "ORDER_VOLUME" | "FRAUD_CATCH_COUNT" | "FRAUD_VALUE_PREVENTED";
  threshold?: number;
  rewardAmount?: number;
  rewardType?: "FLAT" | "PER_UNIT" | "PERCENTAGE";
  description?: string;
  createdBy?: string;
  createdAtMs?: number;
  updatedAt?: any;
}

export type IncentivePayoutStatus = "AUTO_APPROVED" | "PENDING_MANAGER_APPROVAL" | "APPROVED" | "REJECTED";

export interface IncentivePayoutRecord {
  id: string;
  tenantId: string;
  staffId: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  month: string;
  incentiveAmount: number;
  status: IncentivePayoutStatus;
  autoApproveThreshold: number;
  approvedBy?: string | null;
  resolvedAtMs?: number | null;
  createdAtMs: number;
}
