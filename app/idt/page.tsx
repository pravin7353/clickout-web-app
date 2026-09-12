import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { IdtDepositsTable } from "@/components/idt-deposits-table";
import { PageHeader } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function IdtPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  return (
    <FeatureLockWidget route="idt">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "grid", gap: 20 }}>
        <PageHeader
          title="IDT Deposits — Inward Inventory Terminal"
          subtitle="Physical goods intake, barcode scanning, bulk tax enrichment, and live product catalog commits."
        />
        <IdtDepositsTable branchCode={effectiveStoreId} canEdit={canEdit} />
      </div>
    </FeatureLockWidget>
  );
}