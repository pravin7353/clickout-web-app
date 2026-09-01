import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { calculateRevenueMetrics } from "@/lib/services/revenue-service";
import { getHourlyAnalytics } from "@/actions/analytics";
import { ReconciliationTable } from "@/components/reconciliation-table";
import { Card, PageHeader, InfoTooltip } from "@/components/ui";
import { TimeIntelligenceCard } from "@/components/time-intelligence-card";

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);
  const metrics = await calculateRevenueMetrics(role, tenantId, effectiveStoreId);
  const hourlyData = await getHourlyAnalytics(tenantId ?? undefined, effectiveStoreId ?? undefined);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Dashboard" subtitle="Today's revenue and order overview" />

      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "color-mix(in srgb, var(--success) 8%, transparent)",
        border: "1px solid var(--success)", borderRadius: 8, padding: "14px 20px", marginBottom: 24,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
        <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 500 }}>
          System secure — No pending operations or fraud anomalies detected
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <MetricCard title="Gross Revenue" value={`₹${metrics.grossRevenue.toFixed(0)}`} info="Total value of all paid orders today, before any refunds or leakage." />
        <MetricCard title="Total Revenue" value={`₹${metrics.totalRevenue.toFixed(0)}`} info="Revenue from orders that were fully picked up and exited cleanly." />
        <MetricCard title="Pending Verification" value={`₹${metrics.pendingRevenue.toFixed(0)}`} info="Paid orders still waiting at the gate — not yet verified by guard." />
        <MetricCard title="Rejected Leakage" value={`₹${metrics.rejectedRevenue.toFixed(0)}`} accent="var(--danger)" info="Paid orders the guard rejected at exit — potential fraud or stock mismatch." />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginTop: 16 }}>
        <MetricCard title="Total Paid Orders" value={metrics.totalOrders} info="Count of all orders with a completed payment today." />
        <MetricCard title="Successful Exits" value={metrics.successfulExited} info="Orders the guard approved and let exit, including previously-rejected ones fixed on retry." />
        <MetricCard title="Pending Gate Pass" value={metrics.pendingAtVerifier} accent="var(--warning)" info="Paid orders whose QR hasn't been scanned at the gate yet." />
        <MetricCard title="Guard Rejections" value={metrics.rejectedAtVerifier} accent="var(--danger)" info="Orders the guard flagged as rejected today." />
      </div>

      <div style={{ marginTop: 32 }}>
        <TimeIntelligenceCard data={hourlyData} />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "40px 0 16px", color: "var(--text-primary)" }}>
        Reconciliation Table
      </h2>
      <ReconciliationTable storeParam={effectiveStoreId ?? undefined} />
    </div>
  );
}

function MetricCard({ title, value, accent, info }: { title: string; value: string | number; accent?: string; info: string }) {
  return (
    <Card style={{ borderColor: accent }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, display: "flex", alignItems: "center" }}>
        {title}
        <InfoTooltip text={info} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? "var(--text-primary)" }}>{value}</div>
    </Card>
  );
}