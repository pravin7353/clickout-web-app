import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function usageRef(tenantId: string) {
  return adminDb.collection("tenants").doc(tenantId).collection("usageLedger").doc(currentMonthKey());
}

export async function incrementTransactionUsage(tenantId: string) {
  await usageRef(tenantId).set({ transactionCount: FieldValue.increment(1), lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function incrementStaffUsage(tenantId: string) {
  await usageRef(tenantId).set({ staffCount: FieldValue.increment(1), lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function decrementStaffUsage(tenantId: string) {
  await usageRef(tenantId).set({ staffCount: FieldValue.increment(-1), lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function incrementCampaignUsage(tenantId: string) {
  await usageRef(tenantId).set({ campaignCount: FieldValue.increment(1), lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function decrementCampaignUsage(tenantId: string) {
  await usageRef(tenantId).set({ campaignCount: FieldValue.increment(-1), lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

import { PLAN_LIMITS, getEffectiveTxnLimit } from "@/lib/subscription/feature-flag-matrix";
import { checkAndAutoDowngradeExpiredTrial } from "@/lib/services/trial-service";
import { getActivePosTerminalSessions } from "@/lib/services/pos-session-service";

export type UsageData = {
  transactionCount: number;
  staffCount: number;
  campaignCount: number;
  storeCount: number;
  posCounterCount: number;
};

export type TenantLimits = {
  maxUsers: number;
  baseStaff: number;
  extraStaffPurchased: number;
  extraStaffBlocksPurchased: number;
  maxStores: number;
  baseStores: number;
  maxExtraStores: number;
  extraStoresPurchased: number;
  maxTransactions: number;
  maxCampaigns: number;
  maxPosCounters: number;
  subscriptionPlan: string;
  planDisplayName: string;
  planBadge: "FREE" | "PRO" | "GROWTH" | "ENTERPRISE" | "SPARK";
  isSparkLite: boolean;
  monthlyPrice: number;
  benefits: string[];
  txnLimitExceeded: boolean;
};

export async function getUsage(tenantId: string): Promise<{ usage: UsageData; limits: TenantLimits }> {
  const [usageDoc, tenantDoc, storesSnap, staffSnap, activeSessions] = await Promise.all([
    usageRef(tenantId).get(),
    adminDb.collection("tenants").doc(tenantId).get(),
    adminDb.collection("stores").where("tenantId", "==", tenantId).get(),
    adminDb.collection("staff").where("tenantId", "==", tenantId).get(),
    getActivePosTerminalSessions(tenantId),
  ]);

  const u = usageDoc.data() ?? {};
  let t = tenantDoc.data() ?? {};

  // Step 2: Auto-downgrade expired trial if needed
  t = await checkAndAutoDowngradeExpiredTrial(tenantId, t);

  const rawPlanKey = (t.subscriptionPlan ?? t.plan ?? "spark_lite").toString().toLowerCase();
  const limitsDef = PLAN_LIMITS[rawPlanKey] ?? PLAN_LIMITS["spark_lite"];

  const activeStores = storesSnap.docs.filter((d) => d.data().isDeleted !== true);
  const activeStaff = staffSnap.docs.filter((d) => d.data().isDeleted !== true);

  const extraStoresOnDocs = activeStores.filter((d) => {
    const sData = d.data();
    return sData.isExtraStore === true || (sData.storeIndex ?? 0) > 0 || sData.isExtraPaid === true;
  }).length;
  const extraStoresPurchased = Math.max(
    Number(t.extraStoresPurchased ?? 0),
    extraStoresOnDocs
  );

  const baseStores = limitsDef.maxStores;
  const maxExtraStores = limitsDef.maxExtraStores;
  const maxStores = baseStores + extraStoresPurchased;

  const maxTransactions = getEffectiveTxnLimit(rawPlanKey, extraStoresPurchased);
  const extraStaffPurchased = Number(
    t.extraStaffPurchased ?? (t.extraStaffBlocksPurchased ? Number(t.extraStaffBlocksPurchased) * 10 : 0)
  );
  const extraStaffBlocksPurchased = Number(
    t.extraStaffBlocksPurchased ?? (extraStaffPurchased > 0 ? Math.floor(extraStaffPurchased / 10) : 0)
  );
  const baseStaff = limitsDef.maxStaff;
  const maxUsers = limitsDef.maxStaff + extraStaffPurchased;
  const extraPosCounters = Number(t.extraPosCountersPurchased ?? 0);
  const maxPosCounters = limitsDef.maxPosCounters + extraPosCounters;

  const isSparkLite = rawPlanKey === "spark_lite";
  const txnLimitExceeded = Boolean(t.txnLimitExceeded || (u.transactionCount ?? 0) >= maxTransactions);

  let planBadge: "FREE" | "PRO" | "GROWTH" | "ENTERPRISE" | "SPARK" = "FREE";
  if (isSparkLite) planBadge = "FREE";
  else if (rawPlanKey === "spark" || rawPlanKey === "mini") planBadge = "SPARK";
  else if (rawPlanKey === "pro") planBadge = "PRO";
  else if (rawPlanKey === "growth" || rawPlanKey === "trial") planBadge = "GROWTH";
  else if (rawPlanKey === "enterprise" || rawPlanKey === "business") planBadge = "ENTERPRISE";

  let monthlyPrice = 0;
  let planDisplayName = "Spark Lite";
  let maxCampaigns = 1;
  let benefits = [
    "1 Store included base",
    "100 transactions/month",
    "3 staff accounts",
    "1 POS billing counter",
    "Free Forever",
  ];

  if (rawPlanKey === "spark" || rawPlanKey === "mini") {
    monthlyPrice = 399;
    planDisplayName = "Spark";
    maxCampaigns = 2;
    benefits = [
      "1 Store included base",
      "500 transactions/month",
      "5 staff accounts",
      "1 POS billing counter",
    ];
  } else if (rawPlanKey === "pro") {
    monthlyPrice = 799;
    planDisplayName = "Pro";
    maxCampaigns = 5;
    benefits = [
      "1 Store included base",
      "2,500 transactions/month base",
      "Up to 2 extra stores @ ₹299/mo (+2,500 txns each)",
      "15 staff accounts",
      "2 POS billing counters",
      "Growth radar and auto-winback engine",
    ];
  } else if (rawPlanKey === "growth" || rawPlanKey === "trial") {
    monthlyPrice = 1499;
    planDisplayName = "Growth";
    maxCampaigns = 20;
    benefits = [
      "1 Store included base",
      "6,000 transactions/month base",
      "Up to 4 extra stores @ ₹399/mo (+6,000 txns each)",
      "50 staff accounts",
      "5 POS billing counters",
      "HR & CA-Suitable Finance suites",
    ];
  } else if (rawPlanKey === "enterprise" || rawPlanKey === "business") {
    monthlyPrice = 4999;
    planDisplayName = "Enterprise";
    maxCampaigns = 999999;
    benefits = [
      "Unlimited stores & transactions",
      "Custom staff limits & POS counters",
      "Dedicated multi-store ERP integration webhooks",
      "Priority CA audit support and SLA guarantees",
    ];
  }

  return {
    usage: {
      transactionCount: u.transactionCount ?? 0,
      staffCount: activeStaff.length > 0 ? activeStaff.length : (u.staffCount ?? 0),
      campaignCount: u.campaignCount ?? 0,
      storeCount: activeStores.length,
      posCounterCount: activeSessions.length,
    },
    limits: {
      maxUsers: t.maxUsers ?? maxUsers,
      baseStaff,
      extraStaffPurchased,
      extraStaffBlocksPurchased,
      maxStores: t.maxStores ?? maxStores,
      baseStores,
      maxExtraStores,
      extraStoresPurchased,
      maxTransactions,
      maxCampaigns,
      maxPosCounters,
      subscriptionPlan: planBadge,
      planDisplayName,
      planBadge,
      isSparkLite,
      monthlyPrice,
      benefits,
      txnLimitExceeded,
    },
  };
}