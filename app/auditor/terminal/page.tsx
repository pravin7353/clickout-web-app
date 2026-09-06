import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getAuditLogs } from "@/lib/services/auditor-service";
import { AuditTerminal } from "@/components/audit-terminal";
export { AuditTerminal };

export default async function AuditorTerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; tenant?: string }>;
}) {
  const { role, tenantId, storeId, accessibleTenants } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);
  const { store: queryStore, tenant: queryTenant } = await searchParams;

  // Multi-tenant Universal Auditor Scope Resolution
  let effectiveTenantId = tenantId;
  let effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  if (role === "auditor" && accessibleTenants.length > 0) {
    const matched = queryTenant
      ? accessibleTenants.find((t) => t.tenantId === queryTenant)
      : accessibleTenants[0];

    if (matched) {
      effectiveTenantId = matched.tenantId;
      effectiveStoreId =
        matched.branchCode && matched.branchCode !== "HQ"
          ? matched.branchCode
          : (queryStore?.trim() || null);
    }
  } else if (role === "super_admin" && queryTenant) {
    effectiveTenantId = queryTenant;
  }

  const logs = await getAuditLogs(role, effectiveTenantId, effectiveStoreId);

  return (
    <AuditTerminal
      initialLogs={logs}
      accessibleTenants={accessibleTenants}
      currentTenantId={effectiveTenantId}
    />
  );
}