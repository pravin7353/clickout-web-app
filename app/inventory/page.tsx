import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getLedger } from "@/lib/services/inventory-service";
import { AddProductForm } from "@/components/add-product-form";
import { CsvImport } from "@/components/csv-import";
import { BlockBatchButton } from "@/components/block-batch-button";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);
  const ledger = await getLedger(role, tenantId, effectiveStoreId);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Inventory & Godown Ledger"
        subtitle={!canEdit ? "View-only — contact your store manager to make changes" : undefined}
        action={canEdit ? <div style={{ display: "flex", gap: 8 }}><CsvImport /><AddProductForm /></div> : undefined}
      />

      {ledger.length === 0 ? (
        <EmptyState message="No products yet." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Name</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Opening</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Purchased</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Sold</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Damaged</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Expired</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Closing</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Status</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.productId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.name}</td>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.openingStock}</td>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.purchasedStock}</td>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.soldStock}</td>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.damagedStock}</td>
                  <td style={{ padding: 12, color: "var(--text-primary)" }}>{row.expiredStock}</td>
                  <td style={{ padding: 12, fontWeight: 700, color: "var(--text-primary)" }}>{row.closingStock}</td>
                  <td style={{ padding: 12 }}>{row.isDeadStock && <Badge color="var(--warning)">DEAD STOCK</Badge>}</td>
                  <td style={{ padding: 12 }}>
                    {canEdit && <BlockBatchButton productId={row.productId} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}