import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { PosTerminal } from "@/components/pos-terminal";
import { PageHeader } from "@/components/ui";

export default async function CashierPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Assisted Checkout — POS Terminal"
        subtitle="Staff-assisted direct checkout with barcode scanning, instant manager offers, and thermal receipts."
      />
      <PosTerminal branchCode={effectiveStoreId} canEdit={canEdit} />
    </div>
  );
}