export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase-admin";
import { PLAN_CONFIG } from "@/lib/plan-config";
import { BillingPlanCard } from "@/components/billing-plan-card";
import { UsageMeter } from "@/components/usage-meter";
import { PageHeader } from "@/components/ui";

export default async function BillingPage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  if (!tenantId) {
    return (
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
        <PageHeader
          title="Billing & Plan Limits"
          subtitle="System usage is tracked per-tenant. Please log in with a tenant admin account."
        />
      </div>
    );
  }

  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const tData = tenantSnap.data() || {};
  const rawPlan = (tData.plan ?? tData.subscriptionPlan ?? "spark_lite").toLowerCase();
  const planConfig = PLAN_CONFIG[rawPlan] || PLAN_CONFIG["spark_lite"];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 28 }}>
      <PageHeader
        title="Subscription & Plan Limits"
        subtitle="Manage your ClickOut subscription, monitor quota consumption, and upgrade your plan."
      />

      {/* Current Plan Card */}
      <BillingPlanCard
        planName={rawPlan}
        displayName={planConfig.displayName}
        monthlyPrice={planConfig.monthlyPrice}
        description={planConfig.description}
        extraStoresPurchased={Number(tData.extraStoresPurchased ?? 0)}
        extraStaffBlocksPurchased={Number(tData.extraStaffBlocksPurchased ?? 0)}
        extraPosCountersPurchased={Number(tData.extraPosCountersPurchased ?? 0)}
      />

      {/* Usage Meter - Resource consumption vs Plan limits */}
      <UsageMeter tenantId={tenantId} />
    </div>
  );
}
