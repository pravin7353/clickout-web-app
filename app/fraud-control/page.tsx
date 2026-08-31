import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getSuspectStaff, getHighRiskOrders, getLeakageBuckets } from "@/lib/services/fraud-service";
import { SuspectStaffCard } from "@/components/suspect-staff-card";
import { PageHeader, InfoTooltip } from "@/components/ui";

export default async function FraudControlPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [suspects, highRiskOrders, leakage] = await Promise.all([
    getSuspectStaff(role, tenantId, effectiveStoreId),
    getHighRiskOrders(role, tenantId),
    getLeakageBuckets(role, tenantId, effectiveStoreId),
  ]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "color-mix(in srgb, var(--danger) 15%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          🛡️
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", margin: 0 }}>
            Fraud Control & Radar <InfoTooltip text="Monitors leakage between payment and gate exit, flags low-trust staff, and surfaces high-risk transactions." />
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>Live employee monitoring & leakage tracking</p>
        </div>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, color: "var(--text-primary)", display: "flex", alignItems: "center" }}>
        Live Leakage Radar <InfoTooltip text="Orders that are paid but haven't exited the gate yet, bucketed by how long they've been waiting." />
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 16 }}>
        <LeakageBucket label="Normal (0-5m)" value={leakage.normal} color="var(--success)" info="Just paid — well within normal exit time." />
        <LeakageBucket label="Warning (5-30m)" value={leakage.warning} color="var(--warning)" info="Taking longer than usual — worth a glance." />
        <LeakageBucket label="Critical (30-120m)" value={leakage.critical} color="var(--danger)" info="Significantly overdue — investigate this order." />
        <LeakageBucket label="Escalated (2hr+)" value={leakage.escalated} color="#991b1b" info="Extremely overdue — likely a leakage or fraud case." />
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, color: "var(--text-primary)", display: "flex", alignItems: "center" }}>
        Suspect Watchlist (Low Trust Score) <InfoTooltip text="Cashiers/guards whose trust score has dropped below 80, based on flagged incidents." />
      </h2>
      {suspects.length === 0 ? (
        <ClearBanner message="No high-risk staff detected. Team is clean." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
          {suspects.map((s) => <SuspectStaffCard key={s.id} staff={s} />)}
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, color: "var(--text-primary)", display: "flex", alignItems: "center" }}>
        High Risk Transactions <InfoTooltip text="Orders in the last 7 days flagged HIGH risk by the fraud model." />
      </h2>
      {highRiskOrders.length === 0 ? (
        <ClearBanner message="No high-risk transactions detected recently." />
      ) : (
        <div style={{ marginTop: 16 }}>
          {highRiskOrders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <span>Order: {o.id.slice(0, 8).toUpperCase()}</span>
              <span style={{ color: "var(--text-secondary)" }}>Status: {o.exitStatus}</span>
              <span style={{ fontWeight: 700 }}>₹{o.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeakageBucket({ label, value, color, info }: { label: string; value: number; color: string; info: string }) {
  const isClear = value === 0;
  return (
    <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 6%, transparent)`, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <InfoTooltip text={info} />
          <span style={{ background: color, color: "#000", borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {value}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 28 }}>{isClear ? "✅" : "⚠️"}</div>
      <div style={{ fontWeight: 700, color, marginTop: 4 }}>{isClear ? "Clear" : "Attention needed"}</div>
    </div>
  );
}

function ClearBanner({ message }: { message: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 12, background: "color-mix(in srgb, var(--success) 10%, transparent)", border: "1px solid var(--success)", color: "var(--success)", fontWeight: 600, marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
      ✅ {message}
    </div>
  );
}