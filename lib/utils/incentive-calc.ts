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

export type GuardRuleEvaluationInput = {
  fraudCatchReward?: number;
  catchValueThreshold?: number;
  catchValueReward?: number;
  monthlyTargetValue?: number;
  monthlyTargetBonus?: number;
  guardRuleType?: "PER_CATCH" | "MONTHLY_TARGET";
  rewardType?: "FLAT" | "PER_UNIT" | "PERCENTAGE";
  rewardAmount?: number;
  threshold?: number;
  metric?: string;
};

export type GuardRuleEvaluationResult = {
  incentiveAmount: number;
  appliedRules: string[];
  isEligible: boolean;
};

/**
 * Pure calculation function for evaluating Guard incentive rules.
 */
export function evaluateGuardIncentiveRule(
  rule: GuardRuleEvaluationInput | null | undefined,
  fraudCatches: number,
  fraudValuePrevented: number
): GuardRuleEvaluationResult {
  if (!rule) {
    if (fraudCatches > 0) {
      const amt = fraudCatches * 500;
      return {
        incentiveAmount: amt,
        appliedRules: [`Default baseline: ₹500 per fraud catch (${fraudCatches} catches = ₹${amt})`],
        isEligible: true,
      };
    }
    return { incentiveAmount: 0, appliedRules: [], isEligible: false };
  }

  let total = 0;
  const applied: string[] = [];

  // 1. Per catch reward
  const catchReward = Number(rule.fraudCatchReward || 0);
  if (catchReward > 0 && fraudCatches > 0) {
    const sub = fraudCatches * catchReward;
    total += sub;
    applied.push(`₹${catchReward}/fraud catch (${fraudCatches} catches = ₹${sub.toLocaleString("en-IN")})`);
  }

  // 2. High value catch bonus
  const highThreshold = Number(rule.catchValueThreshold || 0);
  const highReward = Number(rule.catchValueReward || 0);
  if (highThreshold > 0 && highReward > 0 && fraudValuePrevented >= highThreshold) {
    total += highReward;
    applied.push(`Bonus ₹${highReward.toLocaleString("en-IN")} for catching fraud > ₹${highThreshold.toLocaleString("en-IN")}`);
  }

  // 3. Monthly target bonus
  const targetVal = Number(rule.monthlyTargetValue || 0);
  const targetBonus = Number(rule.monthlyTargetBonus || 0);
  if (targetVal > 0 && targetBonus > 0 && fraudValuePrevented >= targetVal) {
    total += targetBonus;
    applied.push(`Monthly target bonus ₹${targetBonus.toLocaleString("en-IN")} (Target ₹${targetVal.toLocaleString("en-IN")} achieved)`);
  }

  // 4. Legacy metric support if configured
  if (rule.metric === "FRAUD_CATCH_COUNT" && fraudCatches >= (rule.threshold || 0)) {
    const rAmt = Number(rule.rewardAmount || 0);
    if (rule.rewardType === "PER_UNIT") {
      const sub = fraudCatches * rAmt;
      total += sub;
      applied.push(`₹${rAmt}/fraud catch (${fraudCatches} catches = ₹${sub.toLocaleString("en-IN")})`);
    } else if (rule.rewardType === "FLAT") {
      total += rAmt;
      applied.push(`Flat ₹${rAmt} for ${(rule.threshold || 0)}+ fraud catches`);
    }
  }

  return {
    incentiveAmount: Math.round(total * 100) / 100,
    appliedRules: applied,
    isEligible: total > 0,
  };
}

/**
 * Generates a human-friendly plain Hindi-English summary of an incentive rule
 */
export function generateRulePlainSummary(rule: any): string {
  if (!rule) return "Standard incentive rule.";

  const role = (rule.role || rule.targetRole || "cashier").toLowerCase();

  if (role === "guard") {
    const parts: string[] = [];
    if (rule.fraudCatchReward && Number(rule.fraudCatchReward) > 0) {
      parts.push(`Har verified fraud catch pe ₹${Number(rule.fraudCatchReward).toLocaleString("en-IN")} fixed reward milega`);
    }
    if (rule.catchValueThreshold && rule.catchValueReward) {
      parts.push(`₹${Number(rule.catchValueThreshold).toLocaleString("en-IN")} se badi fraud catch pe extra ₹${Number(rule.catchValueReward).toLocaleString("en-IN")} reward milega`);
    }
    if (rule.monthlyTargetValue && rule.monthlyTargetBonus) {
      parts.push(`₹${Number(rule.monthlyTargetValue).toLocaleString("en-IN")} monthly prevention target achieve karne pe ₹${Number(rule.monthlyTargetBonus).toLocaleString("en-IN")} flat bonus milega`);
    }
    const freq = rule.payoutFrequency ? rule.payoutFrequency.toLowerCase() : "monthly";
    const autoApprove = rule.autoApproveThreshold ?? 500;
    const approvalText = `₹${autoApprove} se kam amount auto-approve hoga. ₹${autoApprove} se zyada ke liye manager approval chahiye.`;
    return parts.length > 0
      ? `Guard: ${parts.join(". ")}. ${approvalText} ${freq.toUpperCase()} payout hoga.`
      : `Guard fraud catches pe standard incentive reward. ${approvalText}`;
  }

  if (role === "all") {
    const fixed = Number(rule.fixedAmount || 0);
    const autoApprove = rule.autoApproveThreshold ?? 500;
    return `Sabhi staff ko har qualifying month/order pe ₹${fixed} flat bonus milega. ₹${autoApprove} se kam auto-approve hoga.`;
  }

  // Cashier
  const categoryText = !rule.category || rule.category === "ALL" ? "Sabhi products" : `${rule.category} category`;
  let rewardText = "";

  if (rule.calculationType === "PERCENT_OF_SALE") {
    rewardText = `${rule.percentValue ?? 0}% commission`;
  } else if (rule.calculationType === "FIXED_PER_SALE") {
    rewardText = `₹${rule.fixedAmount ?? 0} fixed reward`;
  } else if (rule.calculationType === "TIERED" && Array.isArray(rule.tiers)) {
    const tierSummaries = rule.tiers
      .map((t: any) => `₹${Number(t.minSaleAmount).toLocaleString("en-IN")}+ pe ${t.percent}%`)
      .join(", ");
    rewardText = `Tiered commission (${tierSummaries})`;
  } else {
    rewardText = `${rule.percentValue ?? 1}% commission`;
  }

  const minSaleText = rule.minSaleAmount && Number(rule.minSaleAmount) > 0
    ? ` (Minimum sale: ₹${Number(rule.minSaleAmount).toLocaleString("en-IN")})`
    : "";

  const autoApprove = rule.autoApproveThreshold ?? 500;
  const freq = (rule.payoutFrequency || "MONTHLY").toLowerCase();

  return `Cashier ko ${categoryText} ki qualifying sales pe ${rewardText} milega${minSaleText}. ₹${autoApprove} se kam amount auto-approve hoga. ₹${autoApprove} se zyada ke liye manager approval chahiye. ${freq.toUpperCase()} payout hoga.`;
}

/**
 * Pure simulation helper for wizard step 5 live calculation preview
 */
export function simulateCalculation(rule: any, sampleSaleAmount: number = 10000) {
  const role = (rule?.role || rule?.targetRole || "cashier").toLowerCase();
  const autoApproveLimit = Number(rule?.autoApproveThreshold ?? 500);

  if (role === "guard") {
    const sampleCatches = 2;
    const samplePrevented = sampleSaleAmount;
    const evalRes = evaluateGuardIncentiveRule(rule, sampleCatches, samplePrevented);
    const inc = evalRes.incentiveAmount;
    return {
      sampleAmount: sampleSaleAmount,
      matchedRule: `Guard Security (${sampleCatches} sample fraud catches)`,
      qualifyingAmount: samplePrevented,
      excludedAmount: 0,
      estimatedIncentive: inc,
      approvalFlow: inc <= autoApproveLimit ? "AUTO APPROVE (below ₹" + autoApproveLimit + ")" : "MANAGER APPROVAL REQUIRED (exceeds ₹" + autoApproveLimit + ")",
      summaryText: generateRulePlainSummary(rule),
    };
  }

  const minSale = Number(rule?.minSaleAmount || 0);
  const isEligible = sampleSaleAmount >= minSale;
  const qualifyingAmount = isEligible ? sampleSaleAmount : 0;
  const excludedAmount = isEligible ? 0 : sampleSaleAmount;

  const evalRes = evaluateCategoryIncentive(rule, qualifyingAmount, 1);
  const inc = evalRes.incentiveAmount;

  const catName = !rule?.category || rule?.category === "ALL" ? "All Products" : rule.category;
  const calcDesc =
    rule?.calculationType === "PERCENT_OF_SALE"
      ? `${rule.percentValue || 0}%`
      : rule?.calculationType === "FIXED_PER_SALE"
      ? `₹${rule.fixedAmount || 0} fixed`
      : "Tiered";

  return {
    sampleAmount: sampleSaleAmount,
    matchedRule: `${catName} — ${calcDesc}`,
    qualifyingAmount,
    excludedAmount,
    estimatedIncentive: inc,
    approvalFlow: inc <= autoApproveLimit ? `AUTO APPROVE (₹${inc} ≤ ₹${autoApproveLimit})` : `NEEDS MANAGER APPROVAL (₹${inc} > ₹${autoApproveLimit})`,
    summaryText: generateRulePlainSummary(rule),
  };
}
