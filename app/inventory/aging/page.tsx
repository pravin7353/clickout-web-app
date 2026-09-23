import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getInventoryAgingReport } from "@/lib/services/inventory-service";
import { InventoryAgingReportClient } from "@/components/inventory-aging-report";
import { PageHeader } from "@/components/ui";
import Link from "next/link";

export default async function InventoryAgingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const report = await getInventoryAgingReport(role, tenantId, effectiveStoreId);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        title="Inventory Aging & Locked Capital Analysis"
        subtitle="Analyze holding period horizons, identify slow-moving capital, and prioritize high-risk stagnant stock clearance."
        action={
          <Link
            href={`/inventory${effectiveStoreId ? `?store=${effectiveStoreId}` : ""}`}
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back to Inventory Ledger
          </Link>
        }
      />

      <InventoryAgingReportClient report={report} branchCode={effectiveStoreId} />
    </div>
  );
}
