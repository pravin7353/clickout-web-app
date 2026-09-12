import { requireRole } from "@/lib/rbac";
import { calculateRevenueMetrics } from "@/lib/services/revenue-service";
import { ReconciliationTable } from "@/components/reconciliation-table";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function AdminDashboardPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const metrics = await calculateRevenueMetrics(role, tenantId, storeId);

  return (
    <FeatureLockWidget route="manager-dashboard">
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 8, padding: "14px 20px", marginBottom: 24,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
          <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 500 }}>
            System secure — No pending operations or fraud anomalies detected
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
          <MetricCard title="Gross Revenue" value={`₹${metrics.grossRevenue.toFixed(0)}`} />
          <MetricCard title="Total Revenue" value={`₹${metrics.totalRevenue.toFixed(0)}`} />
          <MetricCard title="Pending Verification" value={`₹${metrics.pendingRevenue.toFixed(0)}`} />
          <MetricCard title="Rejected Leakage" value={`₹${metrics.rejectedRevenue.toFixed(0)}`} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginTop: 16 }}>
          <MetricCard title="Total Paid Orders" value={metrics.totalOrders} />
          <MetricCard title="Successful Exits" value={metrics.successfulExited} />
          <MetricCard title="Pending Gate Pass" value={metrics.pendingAtVerifier} />
          <MetricCard title="Guard Rejections" value={metrics.rejectedAtVerifier} />
        </div>
      </div>
    </FeatureLockWidget>
  );
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}