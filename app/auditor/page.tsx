import { requireRole, resolveStoreScope } from "@/lib/rbac";
import {
  getDailyFinancials,
  getAuditorOrders,
  getCashReconciliation,
} from "@/lib/services/auditor-service";
import { AuditorConsole } from "@/components/auditor-console";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function AuditorPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; tenant?: string }>;
}) {
  const { role, tenantId, storeId, canEdit, accessibleTenants } = await requireRole([
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

  const [financials, orders, cashRecon] = await Promise.all([
    getDailyFinancials(role, effectiveTenantId, effectiveStoreId),
    getAuditorOrders(role, effectiveTenantId, effectiveStoreId),
    getCashReconciliation(role, effectiveTenantId, effectiveStoreId),
  ]);

  const activeTenantName =
    accessibleTenants.find((t) => t.tenantId === effectiveTenantId)?.companyName ||
    effectiveTenantId ||
    "Consolidated View";

  return (
    <FeatureLockWidget route="auditor">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Super Auditor — CA Reconciliation & Financial Audit"
        subtitle="Item-level sales registers, cash-to-vault reconciliation, leakage detection, and order autopsy."
        action={
          <Link
            href={`/auditor/terminal${effectiveTenantId ? `?tenant=${encodeURIComponent(effectiveTenantId)}` : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 10,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.15s ease",
            }}
          >
            <span>💻</span>
            <span>Audit Activity Vault</span>
          </Link>
        }
      />

      {/* Universal Auditor Multi-Tenant Client Switcher */}
      {role === "auditor" && accessibleTenants.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
            padding: "12px 18px",
            borderRadius: 12,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🏢</span>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Active Audit Client
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {activeTenantName}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Switch Organization:
            </span>
            {accessibleTenants.map((t) => {
              const isSelected = t.tenantId === effectiveTenantId;
              return (
                <Link
                  key={t.tenantId}
                  href={`/auditor?tenant=${encodeURIComponent(t.tenantId)}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 600,
                    textDecoration: "none",
                    background: isSelected ? "#2563eb" : "var(--scaffold-bg)",
                    color: isSelected ? "#ffffff" : "var(--text-primary)",
                    border: isSelected ? "1px solid #2563eb" : "1px solid var(--border)",
                    boxShadow: isSelected ? "0 2px 6px rgba(37,99,235,0.3)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{isSelected ? "✓" : "•"}</span>
                  <span>{t.companyName}</span>
                  <span style={{ opacity: 0.7, fontSize: 11, fontFamily: "monospace" }}>
                    ({t.tenantId})
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <AuditorConsole
        financials={financials}
        orders={orders}
        cashRecon={cashRecon}
        branchCode={effectiveStoreId}
        tenantId={effectiveTenantId}
        canEdit={canEdit}
      />
    </div>
    </FeatureLockWidget>
  );
}