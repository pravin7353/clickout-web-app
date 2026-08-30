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

export type UsageData = { transactionCount: number; staffCount: number; campaignCount: number };
export type TenantLimits = { maxUsers: number; maxStores: number; subscriptionPlan: string };

export async function getUsage(tenantId: string): Promise<{ usage: UsageData; limits: TenantLimits }> {
  const [usageDoc, tenantDoc] = await Promise.all([
    usageRef(tenantId).get(),
    adminDb.collection("tenants").doc(tenantId).get(),
  ]);

  const u = usageDoc.data() ?? {};
  const t = tenantDoc.data() ?? {};

  return {
    usage: { transactionCount: u.transactionCount ?? 0, staffCount: u.staffCount ?? 0, campaignCount: u.campaignCount ?? 0 },
    limits: { maxUsers: t.maxUsers ?? 100, maxStores: t.maxStores ?? 5, subscriptionPlan: t.subscriptionPlan ?? "BASIC" },
  };
}