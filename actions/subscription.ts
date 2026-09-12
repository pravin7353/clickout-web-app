"use server";

import { adminDb } from "@/lib/firebase-admin";
import { auth } from "@/lib/auth";
import { planFromString, SubscriptionPlan } from "@/lib/subscription/plan";

export type TenantSubscriptionInfo = {
  plan: SubscriptionPlan;
  billingStatus: string;
  trialEndsAt: string | null;
  extraStoresPurchased: number;
  currentTransactions: number;
  currentStaffCount: number;
  currentStoreCount: number;
};

export async function getTenantSubscriptionInfo(): Promise<TenantSubscriptionInfo> {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | null;

  const fallback: TenantSubscriptionInfo = {
    plan: "mini",
    billingStatus: "active",
    trialEndsAt: null,
    extraStoresPurchased: 0,
    currentTransactions: 0,
    currentStaffCount: 0,
    currentStoreCount: 0,
  };

  if (!tenantId) return fallback;

  try {
    const doc = await adminDb.collection("tenants").doc(tenantId).get();
    if (!doc.exists) return fallback;

    const data = doc.data()!;
    let trialEndsAtStr: string | null = null;

    if (data.trialEndsAt?.toDate) {
      trialEndsAtStr = data.trialEndsAt.toDate().toISOString();
    } else if (data.trialEndsAt instanceof Date) {
      trialEndsAtStr = data.trialEndsAt.toISOString();
    } else if (typeof data.trialEndsAt === "string" || typeof data.trialEndsAt === "number") {
      trialEndsAtStr = new Date(data.trialEndsAt).toISOString();
    } else if (data.trialStartAt) {
      const start = data.trialStartAt.toDate ? data.trialStartAt.toDate() : new Date();
      trialEndsAtStr = new Date(start.getTime() + 14 * 86400000).toISOString();
    }

    return {
      plan: planFromString(data.subscriptionPlan),
      billingStatus: (data.billingStatus ?? "active").toString().toLowerCase(),
      trialEndsAt: trialEndsAtStr,
      extraStoresPurchased: Number(data.extraStoresPurchased ?? 0),
      currentTransactions: Number(data.currentTransactions ?? 0),
      currentStaffCount: Number(data.activeStaff ?? data.staffCount ?? 0),
      currentStoreCount: Number(data.activeStores ?? 0),
    };
  } catch {
    return fallback;
  }
}
