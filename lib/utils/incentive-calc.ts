import { CalculationType } from "@/lib/schemas/incentive-schema";

export type RuleEvaluationInput = {
  calculationType?: "PERCENT_OF_SALE" | "FIXED_PER_SALE" | "TIERED";
  percentValue?: number;
  fixedAmount?: number;
  tiers?: { minSaleAmount: number; percent: number }[];
  minSaleAmount?: number;
  rewardAmount?: number;
  rewardType?: "FLAT" | "PER_UNIT" | "PERCENTAGE";
};

export type RuleEvaluationResult = {
  eligibleAmount: number;
  incentiveAmount: number;
  calculationType: string;
  ruleDetail: string;
  isEligible: boolean;
};

/**
 * Pure calculation function for evaluating an incentive rule against a given sale amount and order count.
 * Used by both backend calculation engines and client-side live preview calculators.
 */
export function evaluateCategoryIncentive(
  rule: RuleEvaluationInput | null | undefined,
  saleAmount: number,
  salesCount: number = 1
): RuleEvaluationResult {
  const minSaleAmount = Number(rule?.minSaleAmount || 0);
  const isEligible = saleAmount >= minSaleAmount;

  if (!isEligible) {
    return {
      eligibleAmount: 0,
      incentiveAmount: 0,
      calculationType: rule?.calculationType || "PERCENT_OF_SALE",
      ruleDetail: `Sale amount ₹${saleAmount.toLocaleString("en-IN")} is below min sale threshold ₹${minSaleAmount.toLocaleString("en-IN")}`,
      isEligible: false,
    };
  }

  if (!rule) {
    // Default baseline fallback: 1%
    const defaultIncentive = (saleAmount * 1) / 100;
    return {
      eligibleAmount: saleAmount,
      incentiveAmount: Math.round(defaultIncentive * 100) / 100,
      calculationType: "PERCENT_OF_SALE",
      ruleDetail: `Default baseline: 1% of eligible sales (₹${saleAmount.toFixed(2)})`,
      isEligible: true,
    };
  }

  const calcType = rule.calculationType || (rule.rewardType === "FLAT" ? "FIXED_PER_SALE" : "PERCENT_OF_SALE");

  if (calcType === "PERCENT_OF_SALE") {
    const pct = Number(rule.percentValue ?? (rule.rewardAmount ?? 0));
    const inc = (saleAmount * pct) / 100;
    return {
      eligibleAmount: saleAmount,
      incentiveAmount: Math.round(inc * 100) / 100,
      calculationType: "PERCENT_OF_SALE",
      ruleDetail: `${pct}% of eligible sales (₹${saleAmount.toFixed(2)})`,
      isEligible: true,
    };
  }

  if (calcType === "FIXED_PER_SALE") {
    const fixed = Number(rule.fixedAmount ?? (rule.rewardAmount ?? 0));
    const inc = salesCount * fixed;
    return {
      eligibleAmount: saleAmount,
      incentiveAmount: Math.round(inc * 100) / 100,
      calculationType: "FIXED_PER_SALE",
      ruleDetail: `₹${fixed}/sale × ${salesCount} sale(s)`,
      isEligible: true,
    };
  }

  if (calcType === "TIERED") {
    const sortedTiers = [...(rule.tiers || [])].sort((a, b) => Number(b.minSaleAmount) - Number(a.minSaleAmount));
    const matchedTier = sortedTiers.find((t) => saleAmount >= Number(t.minSaleAmount));

    if (matchedTier) {
      const inc = (saleAmount * Number(matchedTier.percent)) / 100;
      return {
        eligibleAmount: saleAmount,
        incentiveAmount: Math.round(inc * 100) / 100,
        calculationType: "TIERED",
        ruleDetail: `Tier matched: ${matchedTier.percent}% for sales ≥ ₹${Number(matchedTier.minSaleAmount).toLocaleString("en-IN")} (₹${saleAmount.toFixed(2)})`,
        isEligible: true,
      };
    } else {
      return {
        eligibleAmount: saleAmount,
        incentiveAmount: 0,
        calculationType: "TIERED",
        ruleDetail: `Sales ₹${saleAmount.toFixed(2)} did not meet any tier minimum threshold`,
        isEligible: true,
      };
    }
  }

  return {
    eligibleAmount: saleAmount,
    incentiveAmount: 0,
    calculationType: calcType,
    ruleDetail: "Unknown calculation type",
    isEligible: true,
  };
}
