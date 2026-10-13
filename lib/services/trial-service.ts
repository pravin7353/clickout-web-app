import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Checks if a tenant's trial has expired and they have no active paid plan.
 * If expired:
 *  - Sets tenant's plan to "spark_lite" in Firestore
 *  - Sets tenant's planStatus to "free_forever" and billingStatus to "free_forever"
 *  - Keeps tenant active on spark_lite
 *  - Logs "PLAN_AUTO_DOWNGRADE" in admin_audit_logs
 */
export async function checkAndAutoDowngradeExpiredTrial(
  tenantId: string,
  tenantData: Record<string, any>
): Promise<Record<string, any>> {
  if (!tenantId) return tenantData;

  const currentPlan = (tenantData.subscriptionPlan || tenantData.plan || "trial").toLowerCase();
  const billingStatus = (tenantData.billingStatus || "").toLowerCase();
  const planStatus = (tenantData.planStatus || "").toLowerCase();

  // If already on an active paid plan or already spark_lite, no auto-downgrade needed
  const isPaidPlan = ["spark", "pro", "growth", "enterprise", "business"].includes(currentPlan);
  const isPaidActive = isPaidPlan && (billingStatus === "active" || planStatus === "active");
  if (isPaidActive || currentPlan === "spark_lite") {
    return tenantData;
  }

  // Calculate trial end
  let trialEndsAt: Date | null = null;
  if (tenantData.trialEndsAt?.toDate) {
    trialEndsAt = tenantData.trialEndsAt.toDate();
  } else if (tenantData.trialEndsAt instanceof Date) {
    trialEndsAt = tenantData.trialEndsAt;
  } else if (tenantData.trialEndsAt) {
    trialEndsAt = new Date(tenantData.trialEndsAt);
  } else if (tenantData.trialStartAt) {
    const start = tenantData.trialStartAt.toDate ? tenantData.trialStartAt.toDate() : new Date();
    trialEndsAt = new Date(start.getTime() + 14 * 86400000);
  }

  const isExpired = trialEndsAt ? Date.now() >= trialEndsAt.getTime() : false;

  if (isExpired && !isPaidActive) {
    try {
      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      await tenantRef.update({
        subscriptionPlan: "spark_lite",
        plan: "spark_lite",
        planStatus: "free_forever",
        billingStatus: "free_forever",
        updatedAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection("admin_audit_logs").add({
        action: "PLAN_AUTO_DOWNGRADE",
        actionType: "PLAN_AUTO_DOWNGRADE",
        tenantId,
        actor: "system",
        actorId: "system",
        details: "Trial expired, moved to Spark Lite free plan",
        severity: "INFO",
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ...tenantData,
        subscriptionPlan: "spark_lite",
        plan: "spark_lite",
        planStatus: "free_forever",
        billingStatus: "free_forever",
      };
    } catch (err) {
      console.error("[TrialDowngrade] Error auto-downgrading tenant:", tenantId, err);
      return tenantData;
    }
  }

  return tenantData;
}
