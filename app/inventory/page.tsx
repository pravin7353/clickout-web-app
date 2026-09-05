import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getLedger } from "@/lib/services/inventory-service";
import { AddProductForm } from "@/components/add-product-form";
import { CsvImport } from "@/components/csv-import";
import { ProductRow } from "@/components/product-row";
import { PageHeader, Card, EmptyState, InfoTooltip } from "@/components/ui";
import Link from "next/link";

const INVENTORY_FILTERS = [
  { label: "All Products", value: "ALL" },
  { label: "Low Stock (<10)", value: "LOW_STOCK" },
  { label: "Dead Stock (>15d)", value: "DEAD_STOCK" },
  { label: "Blocked Batches", value: "BLOCKED" },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; q?: string; filter?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore, q: searchQuery, filter: filterParam } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);
  const activeFilter = (filterParam ?? "ALL").toUpperCase();

  const ledger = await getLedger(role, tenantId, effectiveStoreId, searchQuery, activeFilter);

  // Stats across the ledger
  const totalSkus = ledger.length;
  const lowStockCount = ledger.filter((r) => r.physicalStock < 10).length;
  const deadStockCount = ledger.filter((r) => r.isDeadStock).length;
  const blockedCount = ledger.filter((r) => r.isBlocked).length;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Product Control & Godown Ledger"
        subtitle={!canEdit ? "View-only — contact your store manager to modify stock or add products" : "Enterprise master product catalog, barcode tracking, and godown reconciliation."}
        action={
          canEdit ? (
            <div style={{ display: "flex", gap: 10 }}>
              <CsvImport branchParam={effectiveStoreId ?? undefined} />
              <AddProductForm branchParam={effectiveStoreId ?? undefined} />
            </div>
          ) : undefined
        }
      />

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total SKUs</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{totalSkus}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "flex", alignItems: "center" }}>
            Low Stock Alerts
            <InfoTooltip text="Products with fewer than 10 units in godown inventory." />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: lowStockCount > 0 ? "var(--warning)" : "var(--success)" }}>
            {lowStockCount}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "flex", alignItems: "center" }}>
            Dead Stock SKUs
            <InfoTooltip text="Stock with 10+ units that has not had a sale recorded in the last 15 days." />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: deadStockCount > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {deadStockCount}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Blocked Batches</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: blockedCount > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
            {blockedCount}
          </div>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {INVENTORY_FILTERS.map((f) => {
            const isActive = activeFilter === f.value;
            const storePart = effectiveStoreId ? `store=${effectiveStoreId}&` : "";
            const searchPart = searchQuery ? `q=${encodeURIComponent(searchQuery)}&` : "";
            const href = `/inventory?${storePart}${searchPart}filter=${f.value}`;

            return (
              <Link
                key={f.value}
                href={href}
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  color: isActive ? "var(--cta-text)" : "var(--text-secondary)",
                  background: isActive ? "var(--cta-bg)" : "var(--card-bg)",
                  border: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {/* Search form */}
        <form method="GET" action="/inventory" style={{ display: "flex", gap: 8 }}>
          {effectiveStoreId && <input type="hidden" name="store" value={effectiveStoreId} />}
          {activeFilter !== "ALL" && <input type="hidden" name="filter" value={activeFilter} />}
          <input
            name="q"
            defaultValue={searchQuery ?? ""}
            placeholder="Search by name or barcode..."
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              width: 240,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: "var(--scaffold-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Ledger Table */}
      {ledger.length === 0 ? (
        <EmptyState message="No products match the selected criteria." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>BARCODE</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PRODUCT NAME</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PRICE</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>UNIT COST</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>OPENING</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PURCHASED</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>SOLD</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>CLOSING</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <ProductRow key={row.productId} row={row} canEdit={canEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}