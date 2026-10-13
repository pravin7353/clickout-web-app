export const dynamic = "force-dynamic";

import Link from "next/link";
import { adminDb } from "@/lib/firebase-admin";
import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getStockTransfers } from "@/actions/inventory";
import { TransfersDashboardClient } from "@/components/inventory-transfers-client";
import { PageHeader } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function InventoryTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; status?: string }>;
}) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const { store: queryStore, status: queryStatus } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  // 1. Fetch all active stores for this tenant
  let storesList: { branchCode: string; storeName: string }[] = [];
  if (tenantId) {
    const storesSnap = await adminDb
      .collection("stores")
      .where("tenantId", "==", tenantId)
      .get();

    storesList = storesSnap.docs
      .filter((d) => d.data().isDeleted !== true)
      .map((d) => {
        const data = d.data();
        return {
          branchCode: data.branchCode || d.id,
          storeName: data.storeName || data.branchCode || "Branch",
        };
      });
  }

  // 2. Fetch transfers
  const transfersRes = await getStockTransfers(
    effectiveStoreId ?? undefined,
    queryStatus ?? undefined
  );
  const transfers = transfersRes.ok && transfersRes.transfers ? transfersRes.transfers : [];

  return (
    <FeatureLockWidget route="inventory_transfer">
      <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto", display: "grid", gap: 20 }}>
        <PageHeader
          title="Inter-Branch Stock Transfers"
          subtitle="Cross-store godown logistics, in-transit stock reconciliation, and delivery gate pass challans."
          action={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Link
                href="/inventory"
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ← Back to Inventory
              </Link>
            </div>
          }
        />

        <TransfersDashboardClient
          stores={storesList}
          initialTransfers={transfers}
          userRole={role}
          userBranchCode={storeId}
        />
      </div>
    </FeatureLockWidget>
  );
}
