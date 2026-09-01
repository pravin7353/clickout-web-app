 import { requireRole } from "@/lib/rbac";
import { getStores } from "@/lib/services/store-service";
import { getTenantMetrics } from "@/lib/services/tenant-metrics-service";
import { getTenantOnboardingStatus } from "@/actions/tenant-onboarding";
import { CreateStoreForm } from "@/components/create-store-form";
import { TenantOnboardingForm } from "@/components/tenant-onboarding-form";
import { StoreTable } from "@/components/store-table";

export default async function TenantAdminPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);

  if (role === "tenant_admin") {
    const { isOnboardingComplete } = await getTenantOnboardingStatus(tenantId);
    if (!isOnboardingComplete) return <TenantOnboardingForm />;
  }

  const stores = await getStores(role, tenantId);
  const metrics = await getTenantMetrics(tenantId as string, stores.length);

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Command Center</h1>
            <span style={{ background: "var(--cta-bg)", color: "var(--cta-text)", fontSize: 10, fontWeight: "bold", padding: "4px 8px", borderRadius: 4 }}>PRO</span>
          </div>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 13 }}>TENANT ID: {tenantId}</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <CreateStoreForm />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 }}>
        <MetricCard title="Total Stores" value={metrics.totalStores} />
        <MetricCard title="Total Staff" value={metrics.totalStaff} />
        <MetricCard title="Active Today" value={metrics.activeToday} />
        <MetricCard title="Pending Alerts" value={metrics.pendingAlerts} color={metrics.pendingAlerts > 0 ? "var(--danger)" : undefined} />
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Store Locations</h2>
      {stores.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No stores yet — create your first one.</p>
      ) : (
        <StoreTable stores={stores} />
      )}
    </div>
  );
}

function MetricCard({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <div className="co-card" style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card-bg)" }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}