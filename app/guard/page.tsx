import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getPendingExits, getGateHistory } from "@/lib/services/gate-service";
import { getPosCountersWithStatus } from "@/lib/services/pos-counter-service";
import { GuardConsole } from "@/components/guard-console";
import { PageHeader } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";
import { MyIncentiveCard } from "@/components/my-incentive-card";

export default async function GuardPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "guard",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const staffIdentifier = (session.user as any)?.id || session.user?.email || "";

  const [pending, history, counters] = await Promise.all([
    getPendingExits(role, tenantId, effectiveStoreId),
    getGateHistory(role, tenantId, effectiveStoreId),
    tenantId ? getPosCountersWithStatus(tenantId, effectiveStoreId) : Promise.resolve([]),
  ]);

  return (
    <FeatureLockWidget route="guard">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader
          title="Guard Console — Exit Gate Verification"
          subtitle="Live gate pass validation, bag inspection, QR checkout authorization, and emergency overrides."
        />
        {role === "guard" && (
          <MyIncentiveCard staffId={staffIdentifier} role={role} />
        )}
        <GuardConsole
          pending={pending}
          history={history}
          counters={counters}
          branchCode={effectiveStoreId}
          canEdit={canEdit}
        />
      </div>
    </FeatureLockWidget>
  );
}
