import { requireRole, resolveStoreScope } from "@/lib/rbac";
import {
  getDailyFinancials,
  getAuditorOrders,
  getCashReconciliation,
} from "@/lib/services/auditor-service";
import { AuditorConsole } from "@/components/auditor-console";
import { PageHeader } from "@/components/ui";

export default async function AuditorPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [financials, orders, cashRecon] = await Promise.all([
    getDailyFinancials(role, tenantId, effectiveStoreId),
    getAuditorOrders(role, tenantId, effectiveStoreId),
    getCashReconciliation(role, tenantId, effectiveStoreId),
  ]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Super Auditor — CA Reconciliation & Financial Audit"
        subtitle="Item-level sales registers, cash-to-vault reconciliation, leakage detection, and order autopsy."
      />
      <AuditorConsole
        financials={financials}
        orders={orders}
        cashRecon={cashRecon}
        branchCode={effectiveStoreId}
        canEdit={canEdit}
      />
    </div>
  );
}