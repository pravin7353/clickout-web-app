import { adminDb } from "@/lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStaffDoc, getCurrentSalaryStructure } from "@/lib/services/hr-service";
import { IncentiveRuleDocument } from "@/lib/schemas/incentive-schema";
import { evaluateCategoryIncentive } from "@/lib/utils/incentive-calc";

export type CategoryIncentiveDetail = {
  category: string;
  totalSales: number;
  eligibleSales: number;
  qualifyingOrdersCount: number;
  incentive: number;
  calculationType: "PERCENT_OF_SALE" | "FIXED_PER_SALE" | "TIERED";
  ruleDetails: string;
};

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
  status: "AUTO_APPROVED" | "PENDING_MANAGER_APPROVAL" | "APPROVED" | "REJECTED";
  autoApproveThreshold: number;
  approvedBy?: string | null;
  resolvedAtMs?: number | null;
  categoryBreakdown: CategoryIncentiveDetail[];
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
  status?: string;
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
 * Helper to fetch product categories by barcode for a tenant
 */
async function getProductCategoriesByBarcodes(
  tenantId: string,
  barcodes: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (barcodes.length === 0) return map;

  const chunkSize = 30;
  for (let i = 0; i < barcodes.length; i += chunkSize) {
    const chunk = barcodes.slice(i, i + chunkSize);
    let query: FirebaseFirestore.Query = adminDb
      .collection("products")
      .where("barcode", "in", chunk);

    if (tenantId) {
      query = query.where("tenantId", "==", tenantId);
    }

    const snap = await query.get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const b = (data.barcode || doc.id).toString().trim();
      const cat = (data.category || "General").toString().trim();
      if (b) map.set(b, cat);
    }
  }

  return map;
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
 * Groups cashier orders by product category, applies category calculation rules (PERCENT_OF_SALE, FIXED_PER_SALE, TIERED),
 * filters orders below minSaleAmount, and sets auto-approval status vs pending manager approval.
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

  const cashierOrders: { id: string; totalAmount: number; items: any[] }[] = [];
  const allBarcodes = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data();
    const orderCashier = (data.cashierId ?? data.cashierEmail ?? "").toString().toLowerCase().trim();

    if (identifiers.has(orderCashier) || orderCashier === staff.id) {
      ordersProcessed++;
      const amount = parseFloat(data.totalAmount ?? data.amount ?? "0") || 0;
      totalValue += amount;
      const items = Array.isArray(data.items) ? data.items : [];
      items.forEach((item: any) => {
        if (item?.barcode) allBarcodes.add(item.barcode.toString().trim());
      });
      cashierOrders.push({
        id: doc.id,
        totalAmount: amount,
        items,
      });
    }
  }

  // Lookup product categories for all items sold
  const barcodeToCategory = await getProductCategoriesByBarcodes(
    staff.tenantId,
    Array.from(allBarcodes)
  );

  // Fetch tenant incentive rules
  const rules = await getTenantIncentiveRules(staff.tenantId, "cashier");

  // Determine auto-approve threshold across rules (default 500)
  let autoApproveThreshold = 500;
  if (rules.length > 0) {
    const definedThresholds = rules
      .map((r) => r.autoApproveThreshold)
      .filter((t): t is number => typeof t === "number" && t > 0);
    if (definedThresholds.length > 0) {
      autoApproveThreshold = Math.min(...definedThresholds);
    }
  }

  // Create rules lookup map by normalized category name
  const categoryRulesMap = new Map<string, IncentiveRuleDocument>();
  let defaultRule: IncentiveRuleDocument | null = null;

  for (const r of rules) {
    const catKey = (r.category || "ALL").toUpperCase().trim();
    if (catKey === "ALL" || catKey === "DEFAULT" || catKey === "*") {
      defaultRule = r;
    } else {
      categoryRulesMap.set(catKey, r);
    }
  }

  // Group sales by category per order and evaluate minSaleAmount
  const categoryAggregates = new Map<
    string,
    { totalSales: number; eligibleSales: number; qualifyingOrdersCount: number }
  >();

  for (const order of cashierOrders) {
    if (order.items.length > 0) {
      const orderCatSales = new Map<string, number>();
      for (const item of order.items) {
        const barcode = (item.barcode || "").toString().trim();
        const cat = (item.category || barcodeToCategory.get(barcode) || "General").trim();
        const unitPrice = parseFloat(item.price ?? item.unitPrice ?? "0") || 0;
        const qty = parseInt(item.quantity ?? "1", 10) || 1;
        const lineTotal = unitPrice * qty;
        orderCatSales.set(cat, (orderCatSales.get(cat) || 0) + lineTotal);
      }

      for (const [cat, catSale] of orderCatSales.entries()) {
        const catRule = categoryRulesMap.get(cat.toUpperCase()) || defaultRule;
        const minSaleAmount = catRule?.minSaleAmount || 0;

        const current = categoryAggregates.get(cat) || {
          totalSales: 0,
          eligibleSales: 0,
          qualifyingOrdersCount: 0,
        };
        current.totalSales += catSale;

        // Requirement 4: Orders below minSaleAmount for that category do not count toward incentive
        if (catSale >= minSaleAmount) {
          current.eligibleSales += catSale;
          current.qualifyingOrdersCount += 1;
        }
        categoryAggregates.set(cat, current);
      }
    } else {
      const cat = "General";
      const catRule = categoryRulesMap.get(cat.toUpperCase()) || defaultRule;
      const minSaleAmount = catRule?.minSaleAmount || 0;

      const current = categoryAggregates.get(cat) || {
        totalSales: 0,
        eligibleSales: 0,
        qualifyingOrdersCount: 0,
      };
      current.totalSales += order.totalAmount;
      if (order.totalAmount >= minSaleAmount) {
        current.eligibleSales += order.totalAmount;
        current.qualifyingOrdersCount += 1;
      }
      categoryAggregates.set(cat, current);
    }
  }

  let incentiveAmount = 0;
  const appliedRules: string[] = [];
  const categoryBreakdown: CategoryIncentiveDetail[] = [];

  for (const [cat, agg] of categoryAggregates.entries()) {
    const rule = categoryRulesMap.get(cat.toUpperCase()) || defaultRule;
    const evalResult = evaluateCategoryIncentive(rule, agg.eligibleSales, agg.qualifyingOrdersCount);
    const catIncentive = evalResult.incentiveAmount;
    const calcType = (rule?.calculationType || "PERCENT_OF_SALE") as "PERCENT_OF_SALE" | "FIXED_PER_SALE" | "TIERED";

    incentiveAmount += catIncentive;
    appliedRules.push(
      `Category '${cat}': ₹${catIncentive.toFixed(2)} [${evalResult.ruleDetail}]`
    );

    categoryBreakdown.push({
      category: cat,
      totalSales: Math.round(agg.totalSales * 100) / 100,
      eligibleSales: Math.round(agg.eligibleSales * 100) / 100,
      qualifyingOrdersCount: agg.qualifyingOrdersCount,
      incentive: Math.round(catIncentive * 100) / 100,
      calculationType: calcType,
      ruleDetails: evalResult.ruleDetail,
    });
  }

  // Check existing payout record in incentive_payouts
  const payoutDocId = `${staff.id}_${month}`;
  const payoutRef = adminDb.collection("incentive_payouts").doc(payoutDocId);
  const payoutSnap = await payoutRef.get();

  let status: "AUTO_APPROVED" | "PENDING_MANAGER_APPROVAL" | "APPROVED" | "REJECTED";
  let approvedBy: string | null = null;
  let resolvedAtMs: number | null = null;

  if (payoutSnap.exists) {
    const pData = payoutSnap.data()!;
    status = pData.status || (incentiveAmount <= autoApproveThreshold ? "AUTO_APPROVED" : "PENDING_MANAGER_APPROVAL");
    approvedBy = pData.approvedBy || null;
    resolvedAtMs = pData.resolvedAtMs || null;
  } else {
    status = incentiveAmount <= autoApproveThreshold ? "AUTO_APPROVED" : "PENDING_MANAGER_APPROVAL";
    await payoutRef.set(
      {
        id: payoutDocId,
        tenantId: staff.tenantId,
        staffId: staff.id,
        empId: staff.empId,
        name: staff.name,
        role: staff.role,
        branchCode: staff.branchCode,
        month,
        incentiveAmount: Math.round(incentiveAmount * 100) / 100,
        status,
        autoApproveThreshold,
        approvedBy: null,
        resolvedAtMs: null,
        createdAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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
    status,
    autoApproveThreshold,
    approvedBy,
    resolvedAtMs,
    categoryBreakdown,
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
      const threshold = r.threshold ?? 0;
      const rewardAmount = r.rewardAmount ?? 0;
      if (r.metric === "FRAUD_CATCH_COUNT" && fraudCatches >= threshold) {
        if (r.rewardType === "PER_UNIT") {
          const reward = fraudCatches * rewardAmount;
          incentiveAmount += reward;
          appliedRules.push(
            `₹${rewardAmount}/fraud catch (${fraudCatches} catches = ₹${reward.toFixed(2)})`
          );
        } else if (r.rewardType === "FLAT") {
          incentiveAmount += rewardAmount;
          appliedRules.push(`Flat ₹${rewardAmount} for ${threshold}+ fraud catches`);
        }
      } else if (r.metric === "FRAUD_VALUE_PREVENTED" && fraudValuePrevented >= threshold) {
        if (r.rewardType === "PERCENTAGE") {
          const reward = (fraudValuePrevented * rewardAmount) / 100;
          incentiveAmount += reward;
          appliedRules.push(
            `${rewardAmount}% of fraud value prevented (₹${reward.toFixed(2)})`
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
      status: role === "cashier" ? (await calculateCashierIncentive(staffId, month)).status : "APPROVED",
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

/**
 * Approves or rejects a pending incentive payout (Manager / Admin action)
 */
export async function approveIncentivePayout(
  staffId: string,
  month: string,
  status: "APPROVED" | "REJECTED",
  approvedBy: string,
  rejectionReason?: string
): Promise<void> {
  const payoutDocId = `${staffId}_${month}`;
  const payoutRef = adminDb.collection("incentive_payouts").doc(payoutDocId);

  await payoutRef.set(
    {
      status,
      approvedBy,
      rejectionReason: rejectionReason || null,
      resolvedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Fetches pending incentive payout requests requiring manager review
 */
export async function getPendingIncentivePayouts(
  tenantId?: string | null,
  branchCode?: string | null
): Promise<any[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collection("incentive_payouts")
    .where("status", "==", "PENDING_MANAGER_APPROVAL");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode && branchCode !== "ALL" && branchCode !== "HQ") {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.orderBy("createdAtMs", "desc").get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}
