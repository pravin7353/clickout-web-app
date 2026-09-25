"use server";

import { adminDb } from "@/lib/firebase-admin";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { planFromString, SubscriptionPlan, PLAN_CONFIG } from "@/lib/subscription/plan";
import { upgradeTenantPlanSchema } from "@/lib/schemas/tenant-schema";
import { scanResellerIpPatterns, getResellerFlags } from "@/lib/services/trust-service";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

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

/**
 * Validates tenant plan, charges/confirms extra store add-on price,
 * increments extraStoresPurchased by 1 on tenant document, and writes audit log.
 * Restricted to tenant_admin and super_admin only.
 */
export async function purchaseExtraStore(tenantId?: string) {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantId || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  if (role !== "super_admin" && tenantId && tenantId !== sessionTenantId) {
    return { ok: false, error: "Unauthorized tenant access." };
  }

  const tenantRef = adminDb.collection("tenants").doc(effectiveTenantId);
  const tenantDoc = await tenantRef.get();
  if (!tenantDoc.exists) {
    return { ok: false, error: "Tenant record not found." };
  }

  const tenantData = tenantDoc.data() || {};
  const currentPlan = planFromString(tenantData.subscriptionPlan);
  const planConfig = PLAN_CONFIG[currentPlan];

  if (planConfig.extraStorePrice === null) {
    return {
      ok: false,
      error: `Your current plan (${planConfig.displayName}) does not support purchasing additional store slots. Please upgrade to Pro or Growth.`,
    };
  }

  const price = planConfig.extraStorePrice;
  const currentExtraStores = Number(tenantData.extraStoresPurchased ?? 0);
  const newExtraStores = currentExtraStores + 1;

  try {
    // 1. Increment extraStoresPurchased on tenant document
    await tenantRef.update({
      extraStoresPurchased: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 2. Audit Log
    const actorEmail = session.user?.email || (session.user as any)?.uid || "Admin";
    await adminDb.collection("admin_audit_logs").add({
      action: "STORE_SLOT_PURCHASED",
      actionType: "STORE_SLOT_PURCHASED",
      tenantId: effectiveTenantId,
      actor: actorEmail,
      actorId: actorEmail,
      plan: currentPlan,
      amountPaid: price,
      currency: "INR",
      previousExtraStores: currentExtraStores,
      newExtraStores,
      details: `Purchased 1 extra store slot for ₹${price}/mo under ${planConfig.displayName} plan. Total extra stores: ${newExtraStores}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/usage");
    revalidatePath("/tenant-admin");
    revalidatePath("/dashboard");
    revalidatePath("/manager");

    return {
      ok: true,
      extraStoresPurchased: newExtraStores,
      price,
      message: `Successfully purchased 1 extra store slot for ₹${price}/month!`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Failed to complete extra store slot purchase.",
    };
  }
}

/**
 * Upgrades tenant subscription plan with strict annual contract and KYC verification for Business/Enterprise.
 * Enforces: If plan == "business", contractType MUST be "ANNUAL" (rejects "MONTHLY"),
 * and gstNumber + businessProofUrl are mandatory.
 */
export async function upgradeTenantPlan(raw: {
  tenantId?: string;
  plan: string;
  contractType?: "MONTHLY" | "ANNUAL";
  gstNumber?: string;
  businessProofUrl?: string;
}) {
  const { session, role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (raw.tenantId || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID is required." };
  }

  const parsed = upgradeTenantPlanSchema.safeParse({
    tenantId: effectiveTenantId,
    plan: raw.plan.toLowerCase(),
    contractType: raw.contractType || "MONTHLY",
    gstNumber: raw.gstNumber,
    businessProofUrl: raw.businessProofUrl,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid plan upgrade parameters." };
  }

  const { plan, contractType, gstNumber, businessProofUrl } = parsed.data;
  const isBusinessPlan = plan === "business";

  // Re-verify business plan rule: contractType must be ANNUAL
  if (isBusinessPlan && contractType !== "ANNUAL") {
    return {
      ok: false,
      error: "Business and Enterprise plans require an ANNUAL contract agreement.",
    };
  }

  const tenantRef = adminDb.collection("tenants").doc(effectiveTenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    return { ok: false, error: "Tenant not found." };
  }

  const updateData: Record<string, any> = {
    subscriptionPlan: plan.toUpperCase(),
    contractType,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (gstNumber) updateData.gstNumber = gstNumber.trim().toUpperCase();
  if (businessProofUrl) {
    updateData.businessProofUrl = businessProofUrl.trim();
    updateData.kycStatus = isBusinessPlan ? "PENDING" : "VERIFIED";
  }

  try {
    await tenantRef.set(updateData, { merge: true });

    const actorEmail = session.user?.email || "Admin";
    await adminDb.collection("admin_audit_logs").add({
      action: "TENANT_PLAN_UPGRADED",
      actionType: "TENANT_PLAN_UPGRADED",
      tenantId: effectiveTenantId,
      actor: actorEmail,
      actorId: actorEmail,
      newPlan: plan,
      contractType,
      kycStatus: updateData.kycStatus || "NONE",
      details: `Tenant ${effectiveTenantId} upgraded plan to ${plan.toUpperCase()} with ${contractType} contract.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/usage");
    revalidatePath("/tenant-admin");
    revalidatePath("/super-admin");

    return {
      ok: true,
      plan: plan.toUpperCase(),
      contractType,
      message: `Plan upgraded successfully to ${plan.toUpperCase()} (${contractType} contract).`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to upgrade tenant plan." };
  }
}

/**
 * Super Admin Action: Trigger rolling 7-day reseller IP scan.
 */
export async function runResellerIpScanAction() {
  await requireRole(["super_admin"]);
  try {
    const result = await scanResellerIpPatterns();
    revalidatePath("/super-admin");
    return { ok: true, ...result };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to execute reseller IP scan." };
  }
}

/**
 * Super Admin Action: Fetch all reseller flags.
 */
export async function getResellerFlagsAction() {
  await requireRole(["super_admin"]);
  try {
    const flags = await getResellerFlags();
    return { ok: true, flags };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load reseller flags." };
  }
}
