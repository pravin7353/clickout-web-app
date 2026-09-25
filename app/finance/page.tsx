import { requireRole } from "@/lib/rbac";
import { getLedgerAccounts } from "@/lib/services/finance-service";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function FinancePage() {
  const { role, tenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = tenantId || "DEFAULT";
  const accounts = await getLedgerAccounts(effectiveTenantId);

  return (
    <FeatureLockWidget route="finance">
      <FinanceDashboard
        initialAccounts={accounts}
        tenantId={tenantId}
        userRole={role}
      />
    </FeatureLockWidget>
  );
}
