import { requireRole } from "@/lib/rbac";
import { getSuspectStaff, getHighRiskOrders, getLeakageBuckets } from "@/lib/services/fraud-service";
import { SuspectStaffCard } from "@/components/suspect-staff-card";

export default async function FraudControlPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const [suspects, highRiskOrders, leakage] = await Promise.all([
    getSuspectStaff(role, tenantId, storeId),
    getHighRiskOrders(role, tenantId),
    getLeakageBuckets(role, tenantId, storeId),
  ]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Fraud Control & Radar</h1>
      <p style={{ color: "#888" }}>Live employee monitoring & leakage tracking</p>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>Live Leakage Radar</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
        <LeakageStat label="Normal (0-5m)" value={leakage.normal} color="#3b82f6" />
        <LeakageStat label="Warning (5-30m)" value={leakage.warning} color="#f97316" />
        <LeakageStat label="Critical (30-120m)" value={leakage.critical} color="#ef4444" />
        <LeakageStat label="Escalated (2hr+)" value={leakage.escalated} color="#991b1b" />
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>Suspect Watchlist (Low Trust Score)</h2>
      {suspects.length === 0 ? (
        <SafeZone msg="No high-risk staff detected. Team is clean." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
          {suspects.map((s) => <SuspectStaffCard key={s.id} staff={s} />)}
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>High Risk Transactions</h2>
      {highRiskOrders.length === 0 ? (
        <SafeZone msg="No high-risk transactions detected recently." />
      ) : (
        <div style={{ marginTop: 16 }}>
          {highRiskOrders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #333" }}>
              <span>Order: {o.id.slice(0, 8).toUpperCase()}</span>
              <span style={{ color: "#888" }}>Status: {o.exitStatus}</span>
              <span style={{ fontWeight: 700 }}>₹{o.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeakageStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${color}`, borderRadius: 12, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
    </div>
  );
}

function SafeZone({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 20, borderRadius: 12, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontWeight: 700, marginTop: 16 }}>
      {msg}
    </div>
  );
}