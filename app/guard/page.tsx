import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getPendingExits, getGateHistory } from "@/lib/services/gate-service";
import { GuardConsole } from "@/components/guard-console";
import { PageHeader } from "@/components/ui";

export default async function GuardPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "guard",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [pending, history] = await Promise.all([
    getPendingExits(role, tenantId, effectiveStoreId),
    getGateHistory(role, tenantId, effectiveStoreId),
  ]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Guard Console — Exit Gate Verification"
        subtitle="Live gate pass validation, bag inspection, QR checkout authorization, and emergency overrides."
      />
      <GuardConsole
        pending={pending}
        history={history}
        branchCode={effectiveStoreId}
        canEdit={canEdit}
      />
    </div>
  );
}