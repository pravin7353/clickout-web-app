import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  planFromString,
  effectiveMaxStores,
  effectiveMaxTx,
  PLAN_CONFIG,
} from "@/lib/subscription/plan";

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

export type UsageData = {
  transactionCount: number;
  staffCount: number;
  campaignCount: number;
  storeCount: number;
};

export type TenantLimits = {
  maxUsers: number;
  maxStores: number;
  maxTransactions: number;
  maxCampaigns: number;
  subscriptionPlan: string;
  planDisplayName: string;
  monthlyPrice: number;
  benefits: string[];
  extraStoresPurchased: number;
};

export async function getUsage(tenantId: string): Promise<{ usage: UsageData; limits: TenantLimits }> {
  const [usageDoc, tenantDoc, storesSnap, staffSnap] = await Promise.all([
    usageRef(tenantId).get(),
    adminDb.collection("tenants").doc(tenantId).get(),
    adminDb.collection("stores").where("tenantId", "==", tenantId).where("isDeleted", "==", false).get(),
    adminDb.collection("staff").where("tenantId", "==", tenantId).where("isDeleted", "==", false).get(),
  ]);

  const u = usageDoc.data() ?? {};
  const t = tenantDoc.data() ?? {};

  const rawPlan = (t.subscriptionPlan ?? "PRO").toString().toUpperCase();
  const normalizedPlan = rawPlan === "ENTERPRISE" ? "business" : planFromString(rawPlan);
  const extraStoresPurchased = Number(t.extraStoresPurchased ?? 0);

  const cfg = PLAN_CONFIG[normalizedPlan];
  const planDisplayName = `${cfg.displayName} Plan`;

  const calcMaxTx = effectiveMaxTx(normalizedPlan, extraStoresPurchased);
  const calcMaxStores = effectiveMaxStores(normalizedPlan, extraStoresPurchased);
  const maxTransactions = calcMaxTx === "unlimited" ? 999999 : calcMaxTx;
  const maxStores = calcMaxStores === "unlimited" ? 999999 : calcMaxStores;
  const maxUsers = cfg.maxStaff === "unlimited" ? 999999 : cfg.maxStaff;
  const monthlyPrice = cfg.monthlyPrice;

  let maxCampaigns = 5;
  let benefits = [
    `Up to ${maxTransactions.toLocaleString()} checkout transactions/month`,
    `Up to ${maxUsers === 999999 ? "Unlimited" : maxUsers} active staff accounts`,
    `Up to ${maxStores === 999999 ? "Unlimited" : maxStores} store locations`,
    "Growth radar and auto-winback engine",
  ];

  if (normalizedPlan === "mini") {
    maxCampaigns = 1;
    benefits = [
      `Up to ${maxTransactions.toLocaleString()} monthly checkout transactions`,
      `Up to ${maxUsers} staff accounts`,
      "Single store location",
      "Basic POS assisted checkout",
    ];
  } else if (normalizedPlan === "growth") {
    maxCampaigns = 20;
    benefits = [
      `Up to ${maxTransactions === 999999 ? "Unlimited" : maxTransactions.toLocaleString()} checkout transactions`,
      "Unlimited staff & supervisor accounts",
      `Up to ${maxStores} store locations`,
      "Risk engine, QR bailout desk, and AI reorder intelligence",
    ];
  } else if (normalizedPlan === "business") {
    maxCampaigns = 999999;
    benefits = [
      "Unlimited transactions, staff, and stores",
      "Dedicated multi-store ERP integration webhooks",
      "Priority CA audit support and SLA guarantees",
      "Multi-tenant brand management in one login",
    ];
  }

  const effectivePlanName = normalizedPlan === "business" ? "BUSINESS" : rawPlan;

  return {
    usage: {
      transactionCount: u.transactionCount ?? 0,
      staffCount: staffSnap.size > 0 ? staffSnap.size : (u.staffCount ?? 0),
      campaignCount: u.campaignCount ?? 0,
      storeCount: storesSnap.size,
    },
    limits: {
      maxUsers: t.maxUsers ?? maxUsers,
      maxStores: t.maxStores ?? maxStores,
      maxTransactions,
      maxCampaigns,
      subscriptionPlan: effectivePlanName,
      planDisplayName,
      monthlyPrice,
      benefits,
      extraStoresPurchased,
    },
  };
}