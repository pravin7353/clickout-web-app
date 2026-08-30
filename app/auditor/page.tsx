import { requireRole } from "@/lib/rbac";
import { getDailyFinancials } from "@/lib/services/auditor-service";

export default async function AuditorPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const f = await getDailyFinancials(role, tenantId, storeId);

  const isEmpty = role === "super_admin" || !tenantId || !storeId;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Auditor — CA-Level Daily Financials</h1>

      {isEmpty ? (
        <p style={{ color: "#888", marginTop: 20 }}>Auditor view is per-store — super_admin should open a specific store to see this.</p>
      ) : (
        <>
          {f.activeAlerts.length > 0 && (
            <div style={{ marginTop: 20 }}>
              {f.activeAlerts.map((a, i) => (
                <div key={i} style={{ padding: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, marginBottom: 8 }}>
                  🚨 {a}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginTop: 24 }}>
            <Card title="Total Revenue" value={`₹${f.totalRevenue.toFixed(0)}`} />
            <Card title="Cash Expected" value={`₹${f.cashExpected.toFixed(0)}`} />
            <Card title="Digital Expected" value={`₹${f.digitalExpected.toFixed(0)}`} />
            <Card title="Total Leakage" value={`₹${f.totalLeakage.toFixed(0)}`} color="#ef4444" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginTop: 16 }}>
            <Card title="Total Orders" value={f.totalOrders} />
            <Card title="Rejected" value={f.rejectedCount} color="#ef4444" />
            <Card title="Pending" value={f.pendingCount} color="#f97316" />
            <Card title="Refunds" value={`${f.refundCount} (₹${f.refundAmount.toFixed(0)})`} color="#a855f7" />
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${color ?? "#333"}`, borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "#888" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "inherit" }}>{value}</div>
    </div>
  );
}