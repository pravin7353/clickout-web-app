import { z } from "zod";

export const kycStatusEnum = z.enum(["PENDING", "VERIFIED", "REJECTED"]);
export type KycStatus = z.infer<typeof kycStatusEnum>;

export const contractTypeEnum = z.enum(["MONTHLY", "ANNUAL"]);
export type ContractType = z.infer<typeof contractTypeEnum>;

export const tenantKycSchema = z.object({
  gstNumber: z.string().trim().optional(),
  businessProofUrl: z.string().trim().optional(),
  kycStatus: kycStatusEnum.default("PENDING").optional(),
  contractType: contractTypeEnum.default("MONTHLY").optional(),
});

export const upgradeTenantPlanSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  plan: z.enum(["trial", "mini", "pro", "growth", "business"]),
  contractType: contractTypeEnum.default("MONTHLY"),
  gstNumber: z.string().trim().optional(),
  businessProofUrl: z.string().trim().optional(),
  kycStatus: kycStatusEnum.default("PENDING").optional(),
}).superRefine((data, ctx) => {
  const isBusinessPlan = data.plan === "business";

  if (isBusinessPlan) {
    if (data.contractType !== "ANNUAL") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Business and Enterprise plans require an ANNUAL contract agreement.",
        path: ["contractType"],
      });
    }

    if (!data.gstNumber || data.gstNumber.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GST number is mandatory for Business/Enterprise plan verification.",
        path: ["gstNumber"],
      });
    }

    if (!data.businessProofUrl || data.businessProofUrl.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Business proof document URL is mandatory for Business/Enterprise plan onboarding.",
        path: ["businessProofUrl"],
      });
    }
  }
});

export type UpgradeTenantPlanInput = z.infer<typeof upgradeTenantPlanSchema>;

export interface TenantDocument {
  id: string;
  tenantId: string;
  companyName: string;
  ownerName?: string;
  subscriptionPlan: string;
  contractType?: ContractType;
  gstNumber?: string;
  businessProofUrl?: string;
  kycStatus?: KycStatus;
  billingStatus?: string;
  extraStoresPurchased?: number;
  maxStores?: number;
  maxUsers?: number;
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
}
