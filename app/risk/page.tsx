import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getRejectedOrders } from "@/lib/services/risk-engine-service";
import { RiskConsole } from "@/components/risk-console";
import { PageHeader } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function RiskEnginePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const orders = await getRejectedOrders(role, tenantId, effectiveStoreId);

  return (
    <FeatureLockWidget route="risk">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader
          title="Risk Engine — Live Fraud Detection & Gate Rejections"
          subtitle="Real-time surveillance of failed gate scans, discrepancy justifications, and fraud alert levels."
        />
        <RiskConsole
          orders={orders}
          branchCode={effectiveStoreId}
          canEdit={canEdit}
        />
      </div>
    </FeatureLockWidget>
  );
}