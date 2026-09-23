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

export const incentiveRuleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  role: IncentiveRoleEnum,
  metric: IncentiveMetricEnum,
  threshold: z.number().min(0, "Threshold must be 0 or greater"),
  rewardAmount: z.number().min(0, "Reward amount must be 0 or greater"),
  rewardType: z.enum(["FLAT", "PER_UNIT", "PERCENTAGE"]).default("PER_UNIT"),
  description: z.string().trim().optional(),
});

export type IncentiveRuleInput = z.infer<typeof incentiveRuleSchema>;

export interface IncentiveRuleDocument {
  id: string;
  tenantId: string;
  role: "cashier" | "guard";
  metric: "ORDER_COUNT" | "ORDER_VOLUME" | "FRAUD_CATCH_COUNT" | "FRAUD_VALUE_PREVENTED";
  threshold: number;
  rewardAmount: number;
  rewardType: "FLAT" | "PER_UNIT" | "PERCENTAGE";
  description?: string;
  createdBy?: string;
  createdAtMs?: number;
  updatedAt?: any;
}
