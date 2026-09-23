import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStaffDoc, getCurrentSalaryStructure } from "@/lib/services/hr-service";
import { IncentiveRuleDocument } from "@/lib/schemas/incentive-schema";

export type CashierIncentiveResult = {
  staffId: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  month: string;
  ordersProcessed: number;
  totalValue: number;
  incentiveAmount: number;
  appliedRules: string[];
};

export type GuardIncentiveResult = {
  staffId: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  month: string;
  fraudCatches: number;
  fraudValuePrevented: number;
  incentiveAmount: number;
  appliedRules: string[];
};

export type MonthlyIncentiveStaffSummary = {
  staffId: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  baseSalary: number;
  ordersProcessed?: number;
  totalValue?: number;
  fraudCatches?: number;
  fraudValuePrevented?: number;
  incentiveAmount: number;
  totalPayout: number;
  appliedRules: string[];
};

export type MonthlyIncentiveReport = {
  tenantId: string;
  branchCode: string;
  month: string;
  staffCount: number;
  totalOrdersProcessed: number;
  totalFraudCatches: number;
  totalFraudValuePrevented: number;
  totalBaseSalaries: number;
  totalIncentivePayout: number;
  totalGrossPayout: number;
  staffPayouts: MonthlyIncentiveStaffSummary[];
};

/**
 * Parses month string (YYYY-MM) into Firestore Start and End Timestamps
 */
function getMonthDateRange(month: string): { startTs: Timestamp; endTs: Timestamp; startMs: number; endMs: number } {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  return {
    startTs: Timestamp.fromDate(startDate),
    endTs: Timestamp.fromDate(endDate),
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
  };
}

/**
 * Fetches tenant-configured incentive rules from Firestore
 */
export async function getTenantIncentiveRules(
  tenantId: string,
  role?: "cashier" | "guard"
): Promise<IncentiveRuleDocument[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collection("incentive_rules")
    .where("tenantId", "==", tenantId);

  if (role) {
    query = query.where("role", "==", role);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<IncentiveRuleDocument, "id">),
  }));
}

/**
 * Creates or updates an incentive rule for a tenant
 */
export async function saveIncentiveRule(
  rule: Omit<IncentiveRuleDocument, "id">,
  ruleId?: string
): Promise<string> {
  const docRef = ruleId
    ? adminDb.collection("incentive_rules").doc(ruleId)
    : adminDb.collection("incentive_rules").doc();

  await docRef.set(
    {
      ...rule,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return docRef.id;
}

/**
 * Deletes an incentive rule
 */
export async function deleteIncentiveRule(ruleId: string, tenantId: string): Promise<void> {
  const docRef = adminDb.collection("incentive_rules").doc(ruleId);
  const doc = await docRef.get();
  if (doc.exists && doc.data()?.tenantId === tenantId) {
    await docRef.delete();
  }
}

/**
 * 1. calculateCashierIncentive
 * Reads orders where cashierId == staffId within the month (tenant/store-scoped)
 * Computes: orders processed, total value, and incentive based on rules.
 */
export async function calculateCashierIncentive(
  staffId: string,
  month: string
): Promise<CashierIncentiveResult> {
  const staff = await getStaffDoc(staffId);
  if (!staff) {
    throw new Error(`Staff member '${staffId}' not found.`);
  }

  const { startTs, endTs } = getMonthDateRange(month);

  // Match identifiers (email, empId, doc id)
  const identifiers = new Set(
    [staff.id, staff.email, staff.empId].filter(Boolean).map((s) => s.toLowerCase().trim())
  );

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("timestamp", ">=", startTs)
    .where("timestamp", "<=", endTs);

  if (staff.tenantId) {
    query = query.where("tenantId", "==", staff.tenantId);
  }

  const snap = await query.get();

  let ordersProcessed = 0;
  let totalValue = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const orderCashier = (data.cashierId ?? data.cashierEmail ?? "").toString().toLowerCase().trim();

    if (identifiers.has(orderCashier) || orderCashier === staff.id) {
      ordersProcessed++;
      const amount = parseFloat(data.totalAmount ?? data.amount ?? "0") || 0;
      totalValue += amount;
    }
  }

  // Calculate incentive from rules
  const rules = await getTenantIncentiveRules(staff.tenantId, "cashier");
  let incentiveAmount = 0;
  const appliedRules: string[] = [];

  if (rules.length > 0) {
    for (const r of rules) {
      if (r.metric === "ORDER_COUNT" && ordersProcessed >= r.threshold) {
        if (r.rewardType === "PER_UNIT") {
          const eligibleCount = ordersProcessed - r.threshold;
          const reward = eligibleCount * r.rewardAmount;
          incentiveAmount += reward;
          appliedRules.push(
            `₹${r.rewardAmount}/order above ${r.threshold} orders (${eligibleCount} orders = ₹${reward.toFixed(2)})`
          );
        } else if (r.rewardType === "FLAT") {
          incentiveAmount += r.rewardAmount;
          appliedRules.push(`Flat ₹${r.rewardAmount} for reaching ${r.threshold} orders`);
        }
      } else if (r.metric === "ORDER_VOLUME" && totalValue >= r.threshold) {
        if (r.rewardType === "PERCENTAGE") {
          const reward = (totalValue * r.rewardAmount) / 100;
          incentiveAmount += reward;
          appliedRules.push(
            `${r.rewardAmount}% of total order volume above ₹${r.threshold} (₹${reward.toFixed(2)})`
          );
        } else if (r.rewardType === "FLAT") {
          incentiveAmount += r.rewardAmount;
          appliedRules.push(`Flat ₹${r.rewardAmount} for reaching ₹${r.threshold} volume`);
        }
      }
    }
  } else {
    // Default baseline fallback: ₹2 per order above 50 orders + 0.1% volume
    if (ordersProcessed > 50) {
      const perOrderReward = (ordersProcessed - 50) * 2;
      incentiveAmount += perOrderReward;
      appliedRules.push(`Baseline: ₹2/order above 50 orders (₹${perOrderReward.toFixed(2)})`);
    }
    if (totalValue > 50000) {
      const volReward = totalValue * 0.001; // 0.1%
      incentiveAmount += volReward;
      appliedRules.push(`Baseline: 0.1% volume bonus (₹${volReward.toFixed(2)})`);
    }
  }

  return {
    staffId: staff.id,
    empId: staff.empId,
    name: staff.name,
    role: staff.role,
    branchCode: staff.branchCode,
    month,
    ordersProcessed,
    totalValue: Math.round(totalValue * 100) / 100,
    incentiveAmount: Math.round(incentiveAmount * 100) / 100,
    appliedRules,
  };
}

/**
 * 2. calculateGuardIncentive
 * Reads orders where verifiedByGuardId == staffId AND exitStatus == "REJECTED"
 * Rewards guards for catching fraud, not just raw volume.
 */
export async function calculateGuardIncentive(
  staffId: string,
  month: string
): Promise<GuardIncentiveResult> {
  const staff = await getStaffDoc(staffId);
  if (!staff) {
    throw new Error(`Staff member '${staffId}' not found.`);
  }

  const { startTs, endTs } = getMonthDateRange(month);

  const identifiers = new Set(
    [staff.id, staff.email, staff.empId].filter(Boolean).map((s) => s.toLowerCase().trim())
  );

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("exitStatus", "==", "REJECTED")
    .where("timestamp", ">=", startTs)
    .where("timestamp", "<=", endTs);

  if (staff.tenantId) {
    query = query.where("tenantId", "==", staff.tenantId);
  }

  const snap = await query.get();

  let fraudCatches = 0;
  let fraudValuePrevented = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const guardVerifier = (
      data.verifiedByGuardId ??
      data.exitVerifiedBy ??
      data.guardId ??
      ""
    )
      .toString()
      .toLowerCase()
      .trim();

    if (identifiers.has(guardVerifier) || guardVerifier === staff.id) {
      fraudCatches++;
      const amount = parseFloat(data.totalAmount ?? data.amount ?? "0") || 0;
      fraudValuePrevented += amount;
    }
  }

  // Calculate incentive from rules
  const rules = await getTenantIncentiveRules(staff.tenantId, "guard");
  let incentiveAmount = 0;
  const appliedRules: string[] = [];

  if (rules.length > 0) {
    for (const r of rules) {
      if (r.metric === "FRAUD_CATCH_COUNT" && fraudCatches >= r.threshold) {
        if (r.rewardType === "PER_UNIT") {
          const reward = fraudCatches * r.rewardAmount;
          incentiveAmount += reward;
          appliedRules.push(
            `₹${r.rewardAmount}/fraud catch (${fraudCatches} catches = ₹${reward.toFixed(2)})`
          );
        } else if (r.rewardType === "FLAT") {
          incentiveAmount += r.rewardAmount;
          appliedRules.push(`Flat ₹${r.rewardAmount} for ${r.threshold}+ fraud catches`);
        }
      } else if (r.metric === "FRAUD_VALUE_PREVENTED" && fraudValuePrevented >= r.threshold) {
        if (r.rewardType === "PERCENTAGE") {
          const reward = (fraudValuePrevented * r.rewardAmount) / 100;
          incentiveAmount += reward;
          appliedRules.push(
            `${r.rewardAmount}% of fraud value prevented (₹${reward.toFixed(2)})`
          );
        }
      }
    }
  } else {
    // Default baseline fallback: ₹500 per confirmed high-risk fraud catch
    if (fraudCatches > 0) {
      const catchReward = fraudCatches * 500;
      incentiveAmount += catchReward;
      appliedRules.push(`Baseline: ₹500 per confirmed exit fraud catch (${fraudCatches} catches = ₹${catchReward})`);
    }
  }

  return {
    staffId: staff.id,
    empId: staff.empId,
    name: staff.name,
    role: staff.role,
    branchCode: staff.branchCode,
    month,
    fraudCatches,
    fraudValuePrevented: Math.round(fraudValuePrevented * 100) / 100,
    incentiveAmount: Math.round(incentiveAmount * 100) / 100,
    appliedRules,
  };
}

/**
 * 4. getMonthlyIncentiveReport
 * Aggregated payout list for that branch/month across staff members
 */
export async function getMonthlyIncentiveReport(
  tenantId: string,
  branchCode: string,
  month: string
): Promise<MonthlyIncentiveReport> {
  // Query all active staff in that branch
  let query: FirebaseFirestore.Query = adminDb
    .collection("staff")
    .where("tenantId", "==", tenantId)
    .where("isDeleted", "==", false);

  if (branchCode && branchCode !== "ALL" && branchCode !== "HQ") {
    query = query.where("branchCode", "==", branchCode);
  }

  const staffSnap = await query.get();

  const staffPayouts: MonthlyIncentiveStaffSummary[] = [];

  let totalOrdersProcessed = 0;
  let totalFraudCatches = 0;
  let totalFraudValuePrevented = 0;
  let totalBaseSalaries = 0;
  let totalIncentivePayout = 0;

  for (const doc of staffSnap.docs) {
    const data = doc.data();
    const staffId = doc.id;
    const role = (data.role || "").toLowerCase().trim();

    // Fetch active base salary
    const salaryDoc = await getCurrentSalaryStructure(staffId, tenantId);
    const baseSalary = salaryDoc?.baseSalary ?? 0;
    totalBaseSalaries += baseSalary;

    let incentiveAmount = 0;
    let appliedRules: string[] = [];
    let ordersProcessed = 0;
    let totalValue = 0;
    let fraudCatches = 0;
    let fraudValuePrevented = 0;

    if (role === "cashier") {
      try {
        const cRes = await calculateCashierIncentive(staffId, month);
        ordersProcessed = cRes.ordersProcessed;
        totalValue = cRes.totalValue;
        incentiveAmount = cRes.incentiveAmount;
        appliedRules = cRes.appliedRules;
        totalOrdersProcessed += ordersProcessed;
      } catch (err) {
        console.error(`Error calculating cashier incentive for ${staffId}:`, err);
      }
    } else if (role === "guard") {
      try {
        const gRes = await calculateGuardIncentive(staffId, month);
        fraudCatches = gRes.fraudCatches;
        fraudValuePrevented = gRes.fraudValuePrevented;
        incentiveAmount = gRes.incentiveAmount;
        appliedRules = gRes.appliedRules;
        totalFraudCatches += fraudCatches;
        totalFraudValuePrevented += fraudValuePrevented;
      } catch (err) {
        console.error(`Error calculating guard incentive for ${staffId}:`, err);
      }
    }

    totalIncentivePayout += incentiveAmount;

    staffPayouts.push({
      staffId,
      empId: data.empId || "",
      name: data.name || "Staff Member",
      role: data.role || "",
      branchCode: data.branchCode || branchCode,
      baseSalary,
      ordersProcessed: role === "cashier" ? ordersProcessed : undefined,
      totalValue: role === "cashier" ? totalValue : undefined,
      fraudCatches: role === "guard" ? fraudCatches : undefined,
      fraudValuePrevented: role === "guard" ? fraudValuePrevented : undefined,
      incentiveAmount,
      totalPayout: baseSalary + incentiveAmount,
      appliedRules,
    });
  }

  return {
    tenantId,
    branchCode,
    month,
    staffCount: staffPayouts.length,
    totalOrdersProcessed,
    totalFraudCatches,
    totalFraudValuePrevented: Math.round(totalFraudValuePrevented * 100) / 100,
    totalBaseSalaries,
    totalIncentivePayout: Math.round(totalIncentivePayout * 100) / 100,
    totalGrossPayout: Math.round((totalBaseSalaries + totalIncentivePayout) * 100) / 100,
    staffPayouts,
  };
}
