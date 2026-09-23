import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { PosTerminal } from "@/components/pos-terminal";
import { PageHeader } from "@/components/ui";
import { MyIncentiveCard } from "@/components/my-incentive-card";

export default async function CashierPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const staffIdentifier = (session.user as any)?.id || session.user?.email || "";

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Assisted Checkout — POS Terminal"
        subtitle="Staff-assisted direct checkout with barcode scanning, instant manager offers, and thermal receipts."
      />
      {role === "cashier" && (
        <MyIncentiveCard staffId={staffIdentifier} role={role} />
      )}
      <PosTerminal branchCode={effectiveStoreId} canEdit={canEdit} />
    </div>
  );
}
