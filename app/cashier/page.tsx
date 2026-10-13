import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { MyIncentiveCard } from "@/components/my-incentive-card";
import { CashierTabsClient } from "@/components/pos/cashier-tabs-client";
import { getPosCountersWithStatus } from "@/lib/services/pos-counter-service";
import { getStaffList } from "@/lib/services/staff-service";
import { adminDb } from "@/lib/firebase-admin";
import { getMaxPosCounters } from "@/lib/plan-limits";

export default async function CashierPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const staffIdentifier = (session.user as any)?.id || session.user?.email || "";

  let counters: any[] = [];
  let staffList: any[] = [];
  let maxAllowedCounters = 1;
  let planName = "Mini";

  if (tenantId) {
    const [rawCounters, rawStaff, tDoc] = await Promise.all([
      getPosCountersWithStatus(tenantId, effectiveStoreId),
      getStaffList(role, tenantId, effectiveStoreId, "ALL"),
      adminDb.collection("tenants").doc(tenantId).get(),
    ]);

    counters = rawCounters;
    staffList = rawStaff;

    const tData = tDoc.data() || {};
    planName = tData.subscriptionPlan || "Mini";
    const extraCounters = Number(tData.extraPosCountersPurchased || 0);
    maxAllowedCounters = getMaxPosCounters(planName, extraCounters);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title="Assisted Checkout — POS Terminal"
        subtitle="Staff-assisted direct checkout for cashier billing."
      />

      {role === "cashier" && (
        <MyIncentiveCard staffId={staffIdentifier} role={role} />
      )}

      <CashierTabsClient
        branchCode={effectiveStoreId}
        canEdit={canEdit || role === "cashier"}
        role={role}
        counters={counters}
        staffList={staffList}
        maxAllowedCounters={maxAllowedCounters}
        planName={planName}
        currentUser={{
          name: session.user?.name || "Cashier Staff",
          email: session.user?.email || "",
          staffId: staffIdentifier,
          role,
        }}
      />
    </div>
  );
}
