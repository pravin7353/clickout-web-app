import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function usageRef(tenantId: string) {
  return adminDb.collection("tenants").doc(tenantId).collection("usageLedger").doc(currentMonthKey());
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
  let planDisplayName = "Pro Plan";
  let maxTransactions = 1000;
  let maxUsers = 4;
  let maxStores = 3;
  let maxCampaigns = 5;
  let monthlyPrice = 299;
  let benefits = [
    "Up to 1,000 POS checkout transactions/month",
    "Up to 4 active staff accounts (cashier & guard)",
    "Up to 3 branch stores",
    "Growth radar and auto-winback engine",
  ];

  if (rawPlan === "MINI") {
    planDisplayName = "Mini Plan";
    maxTransactions = 100;
    maxUsers = 2;
    maxStores = 1;
    maxCampaigns = 1;
    monthlyPrice = 99;
    benefits = [
      "Up to 100 monthly checkout transactions",
      "Up to 2 staff accounts",
      "Single store location",
      "Basic POS assisted checkout",
    ];
  } else if (rawPlan === "GROWTH") {
    planDisplayName = "Growth Plan";
    maxTransactions = 999999;
    maxUsers = 999999;
    maxStores = 10;
    maxCampaigns = 20;
    monthlyPrice = 699;
    benefits = [
      "Unlimited checkout transactions",
      "Unlimited staff & supervisor accounts",
      "Up to 10 store locations",
      "Risk engine, QR bailout desk, and AI reorder intelligence",
    ];
  } else if (rawPlan === "ENTERPRISE") {
    planDisplayName = "Enterprise HQ";
    maxTransactions = 999999;
    maxUsers = 999999;
    maxStores = 999999;
    maxCampaigns = 999999;
    monthlyPrice = 1499;
    benefits = [
      "Unlimited transactions, staff, and stores",
      "Dedicated multi-store ERP integration webhooks",
      "Priority CA audit support and SLA guarantees",
      "White-labeled tenant custom domain",
    ];
  }

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
      subscriptionPlan: rawPlan,
      planDisplayName,
      monthlyPrice,
      benefits,
    },
  };
}