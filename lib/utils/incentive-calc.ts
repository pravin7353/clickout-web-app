import { CalculationType } from "@/lib/schemas/incentive-schema";
import { INCENTIVE_COMBINED_CAP_PERCENT } from "@/lib/constants";

export type RuleEvaluationInput = {
  calculationType?: CalculationType;
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
 * Generates a human-friendly plain English summary of an incentive rule
 */
export function generateRulePlainSummary(rule: any): string {
  if (!rule) return "Standard baseline incentive rule.";

  const role = (rule.role || rule.targetRole || "cashier").toLowerCase();

  if (role === "guard") {
    const parts: string[] = [];
    if (rule.fraudCatchReward && Number(rule.fraudCatchReward) > 0) {
      parts.push(`₹${Number(rule.fraudCatchReward).toLocaleString("en-IN")} per verified fraud interception`);
    }
    if (rule.catchValueThreshold && rule.catchValueReward) {
      parts.push(`extra reward of ₹${Number(rule.catchValueReward).toLocaleString("en-IN")} for fraud intercepts exceeding ₹${Number(rule.catchValueThreshold).toLocaleString("en-IN")}`);
    }
    if (rule.monthlyTargetValue && rule.monthlyTargetBonus) {
      parts.push(`monthly bonus of ₹${Number(rule.monthlyTargetBonus).toLocaleString("en-IN")} on reaching ₹${Number(rule.monthlyTargetValue).toLocaleString("en-IN")} theft prevention target`);
    }
    const freq = rule.payoutFrequency ? rule.payoutFrequency.toUpperCase() : "MONTHLY";
    const autoApprove = rule.autoApproveThreshold ?? 500;
    const approvalText = `Auto-approved below ₹${autoApprove}; manager approval required above ₹${autoApprove}.`;
    return parts.length > 0
      ? `Security Guard: ${parts.join("; ")}. ${approvalText} Payout is ${freq}.`
      : `Security Guard: Standard fraud prevention rewards. ${approvalText}`;
  }

  if (role === "sales_executive") {
    const autoApprove = rule.autoApproveThreshold ?? 500;
    const freq = (rule.payoutFrequency || "MONTHLY").toUpperCase();
    const rateText =
      rule.calculationType === "FLAT_PER_LAKH"
        ? `₹${rule.flatPerLakh || 500} per Lakh assisted sales volume`
        : `${rule.percentValue ?? 1}% commission on assisted checkout volume`;
    return `Sales Executive earns ${rateText}. Auto-approved below ₹${autoApprove}. Payout is ${freq}.`;
  }

  if (role === "all") {
    const fixed = Number(rule.fixedAmount || 0);
    const autoApprove = rule.autoApproveThreshold ?? 500;
    return `All staff members receive a flat bonus of ₹${fixed} per qualifying period/order. Auto-approved below ₹${autoApprove}.`;
  }

  // Cashier
  const categoryText = !rule.category || rule.category === "ALL" ? "all product categories" : `${rule.category} category`;
  let rewardText = "";

  if (rule.calculationType === "PERCENT_OF_SALE" || rule.calculationType === "PERCENTAGE") {
    rewardText = `${rule.percentValue ?? 0}% commission`;
  } else if (rule.calculationType === "FIXED_PER_SALE" || rule.calculationType === "FIXED") {
    rewardText = `₹${rule.fixedAmount ?? 0} fixed reward`;
  } else if (rule.calculationType === "TIERED" && Array.isArray(rule.tiers)) {
    const tierSummaries = rule.tiers
      .map((t: any) => `₹${Number(t.minSaleAmount).toLocaleString("en-IN")}+ at ${t.percent}%`)
      .join(", ");
    rewardText = `tiered commission (${tierSummaries})`;
  } else {
    rewardText = `${rule.percentValue ?? 1}% commission`;
  }

  const minSaleText = rule.minSaleAmount && Number(rule.minSaleAmount) > 0
    ? ` with minimum sale of ₹${Number(rule.minSaleAmount).toLocaleString("en-IN")}`
    : "";

  const autoApprove = rule.autoApproveThreshold ?? 500;
  const freq = (rule.payoutFrequency || "MONTHLY").toUpperCase();

  return `Cashier earns ${rewardText} on ${categoryText}${minSaleText}. Auto-approved below ₹${autoApprove}; manager approval required above ₹${autoApprove}. Payout is ${freq}.`;
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
    rule?.calculationType === "PERCENT_OF_SALE" || rule?.calculationType === "PERCENTAGE"
      ? `${rule.percentValue || 0}%`
      : rule?.calculationType === "FIXED_PER_SALE" || rule?.calculationType === "FIXED"
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

/**
 * STEP 2: Pure function to estimate the effective percentage rate of a rule on an order.
 * Input: one IncentiveRule, avgOrderValue: number
 * Output: number (estimated % of order value this rule costs)
 */
export function estimateRuleEffectiveRate(rule: any, avgOrderValue: number): number {
  if (!rule) return 0;
  const role = (rule.role || rule.targetRole || "cashier").toLowerCase().trim();

  // GUARD role (any type) -> return 0 (excluded from cap by design)
  if (role === "guard") {
    return 0;
  }

  const effectiveAvgOrder = avgOrderValue > 0 ? avgOrderValue : 500;
  const calcType = (rule.calculationType || "").toUpperCase().trim();

  // PERCENTAGE / PERCENT_OF_SALE / PERCENTAGE_OF_ELIGIBLE_SALES
  if (
    calcType === "PERCENTAGE" ||
    calcType === "PERCENT_OF_SALE" ||
    calcType === "PERCENTAGE_OF_ELIGIBLE_SALES"
  ) {
    return Number(rule.percentValue ?? (rule.rewardAmount ?? 0));
  }

  // FIXED_PER_SALE / FIXED
  if (calcType === "FIXED_PER_SALE" || calcType === "FIXED") {
    const fixed = Number(rule.fixedAmount ?? (rule.rewardAmount ?? 0));
    return (fixed / effectiveAvgOrder) * 100;
  }

  // FLAT_PER_LAKH
  if (calcType === "FLAT_PER_LAKH") {
    const flat = Number(rule.flatPerLakh ?? (rule.fixedAmount ?? 0));
    return (flat / 100000) * 100;
  }

  // TIERED -> use lowest tier rate (conservative estimate)
  if (calcType === "TIERED") {
    if (Array.isArray(rule.tiers) && rule.tiers.length > 0) {
      const tierPercents = rule.tiers
        .map((t: any) => Number(t.percent || 0))
        .filter((p: number) => !isNaN(p) && p >= 0);
      if (tierPercents.length > 0) {
        return Math.min(...tierPercents);
      }
    }
    return Number(rule.percentValue ?? 0);
  }

  // FIXED_PER_SERVICE
  if (calcType === "FIXED_PER_SERVICE") {
    const fixed = Number(rule.fixedAmount ?? (rule.rewardAmount ?? 0));
    return (fixed / effectiveAvgOrder) * 100;
  }

  // Fallback for percentValue if specified
  if (rule.percentValue !== undefined && Number(rule.percentValue) > 0) {
    return Number(rule.percentValue);
  }

  console.warn("Unknown incentive calculation type:", rule.calculationType);
  return 0;
}

/**
 * STEP 3: Pure function to calculate combined incentive rate across all active rules.
 * Input: activeRules: IncentiveRule[], avgOrderValue: number
 * Output: {
 *   combinedRatePercent: number,
 *   exceedsCap: boolean,
 *   capPercent: number,
 *   breakdown: Array<{ ruleId, role, category, estimatedRate, label }>
 * }
 */
export interface CombinedIncentiveRateResult {
  combinedRatePercent: number;
  exceedsCap: boolean;
  capPercent: number;
  breakdown: Array<{
    ruleId: string;
    role: string;
    category?: string;
    estimatedRate: number;
    label: string;
  }>;
}

export function calculateCombinedIncentiveRate(
  activeRules: any[],
  avgOrderValue: number
): CombinedIncentiveRateResult {
  const breakdown: Array<{
    ruleId: string;
    role: string;
    category?: string;
    estimatedRate: number;
    label: string;
  }> = [];

  let totalRate = 0;

  for (const rule of activeRules || []) {
    // Filter out DRAFT rules — only ACTIVE rules count
    if (rule.status && rule.status !== "ACTIVE") {
      continue;
    }

    const role = (rule.role || rule.targetRole || "cashier").toLowerCase().trim();
    // Filter out GUARD role rules entirely
    if (role === "guard") {
      continue;
    }

    const estimatedRate = Math.round(estimateRuleEffectiveRate(rule, avgOrderValue) * 100) / 100;
    totalRate += estimatedRate;

    const roleTitle =
      role === "sales_executive"
        ? "Sales Executive"
        : role === "cashier"
        ? "Cashier"
        : role === "all"
        ? "All Staff"
        : role.charAt(0).toUpperCase() + role.slice(1);

    const category = rule.category && rule.category !== "ALL" ? rule.category : "General Sales";

    let ruleDescription = "";
    const calcType = (rule.calculationType || "").toUpperCase();
    if (calcType === "FLAT_PER_LAKH") {
      ruleDescription = `₹${rule.flatPerLakh || rule.fixedAmount || 500}/Lakh`;
    } else if (calcType === "FIXED_PER_SALE" || calcType === "FIXED") {
      ruleDescription = `₹${rule.fixedAmount || 0}/sale`;
    } else if (calcType === "TIERED") {
      ruleDescription = `Tiered (${estimatedRate}% base)`;
    } else {
      ruleDescription = `${rule.percentValue ?? estimatedRate}%`;
    }

    const label = `${roleTitle} — ${category} (${ruleDescription}): ~${estimatedRate.toFixed(1)}%`;

    breakdown.push({
      ruleId: rule.id || rule._id || "",
      role,
      category: rule.category,
      estimatedRate,
      label,
    });
  }

  const combinedRatePercent = Math.round(totalRate * 100) / 100;
  const exceedsCap = combinedRatePercent > INCENTIVE_COMBINED_CAP_PERCENT;

  return {
    combinedRatePercent,
    exceedsCap,
    capPercent: INCENTIVE_COMBINED_CAP_PERCENT,
    breakdown,
  };
}
