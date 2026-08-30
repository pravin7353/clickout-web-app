import { requireRole } from "@/lib/rbac";
import { getUsage } from "@/lib/services/usage-service";

export default async function UsagePage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) return <div style={{ padding: 24 }}>Usage is tracked per-tenant.</div>;

  const { usage, limits } = await getUsage(tenantId);
  const staffPercent = Math.min(100, (usage.staffCount / limits.maxUsers) * 100);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Usage & Plan</h1>
      <p style={{ color: "#888" }}>Plan: <strong>{limits.subscriptionPlan}</strong></p>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Staff</span><span>{usage.staffCount} / {limits.maxUsers}</span>
        </div>
        <div style={{ height: 8, background: "#333", borderRadius: 4, marginTop: 4 }}>
          <div style={{ height: 8, width: `${staffPercent}%`, background: staffPercent > 90 ? "#ef4444" : "#22c55e", borderRadius: 4 }} />
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#888" }}>Transactions this month</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.transactionCount}</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#888" }}>Active Campaigns</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.campaignCount}</div>
        </div>
      </div>
    </div>
  );
}