import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { RefundDecision } from "@/components/refund-decision";
import { PageHeader } from "@/components/ui";

export default async function RefundPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const adminName = session.user?.name || session.user?.email || "Admin";

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="Refund Decision Engine"
        subtitle="Process 3-tier customer returns, enforce idempotency fraud locks, and restock physical godown inventory."
      />
      <RefundDecision
        initialStoreId={effectiveStoreId}
        adminName={adminName}
        adminRole={role}
        canEdit={canEdit}
      />
    </div>
  );
}