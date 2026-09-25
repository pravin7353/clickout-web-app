import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getSuspectStaff, getHighRiskOrders, getLeakageBuckets } from "@/lib/services/fraud-service";
import { getResellerFlags } from "@/lib/services/trust-service";
import { SuspectStaffCard } from "@/components/suspect-staff-card";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function FraudControlPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [suspects, highRiskOrders, leakage, resellerFlags] = await Promise.all([
    getSuspectStaff(role, tenantId, effectiveStoreId),
    getHighRiskOrders(role, tenantId),
    getLeakageBuckets(role, tenantId, effectiveStoreId),
    role === "super_admin" ? getResellerFlags() : Promise.resolve([]),
  ]);

  return (
    <FeatureLockWidget route="fraud-control">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
      <PageHeader
        title="Fraud Control & Live Leakage Radar"
        subtitle="Monitors paid-but-unexited store leakage, flags low-trust staff members, and tracks high-risk transactions."
      />

      {/* Super Admin: Anti-Reseller & Multi-Tenant Account Sharing Radar */}
      {role === "super_admin" && (
        <div style={{ background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#f59e0b", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🛡️</span> Platform Trust: Anti-Reseller IP Radar (Super Admin Only)
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                Flags IP addresses shared by &gt;10 distinct tenants over rolling 7-day windows. Human review only (never auto-suspends).
              </p>
            </div>
            <Badge color="#f59e0b">{resellerFlags.length} Flagged</Badge>
          </div>

          {resellerFlags.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600, padding: "8px 0" }}>
              ✓ No shared IP anomalies detected across tenants in the past 7 days.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {resellerFlags.map((flag) => (
                <div
                  key={flag.id}
                  style={{
                    padding: "12px 16px",
                    background: "var(--card-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                      IP Address: <span style={{ fontFamily: "monospace" }}>{flag.ipAddress}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      Shared across {flag.tenantCount} distinct tenant accounts: {flag.distinctTenantIds.slice(0, 4).join(", ")}
                      {flag.distinctTenantIds.length > 4 ? ` +${flag.distinctTenantIds.length - 4} more` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 6, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                      Risk Score: {flag.riskScore}/100
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 6, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                      {flag.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scope banner */}
      {effectiveStoreId && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Active Store Scope:</span>
          <Badge color="var(--primary)">{effectiveStoreId}</Badge>
        </div>
      )}

      {/* Live Leakage Radar Buckets */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Live Leakage Radar
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Paid orders waiting at gate by elapsed duration
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <LeakageBucket
            label="Normal (0–5m)"
            value={leakage.normal}
            color="var(--success)"
            info="Recently paid — normal customer walk to gate."
          />
          <LeakageBucket
            label="Warning (5–30m)"
            value={leakage.warning}
            color="var(--warning)"
            info="Taking longer than typical walk-out window."
          />
          <LeakageBucket
            label="Critical (30–120m)"
            value={leakage.critical}
            color="var(--danger)"
            info="Significantly overdue exit — investigate possible gate congestion or leakage."
          />
          <LeakageBucket
            label="Escalated (2hr+)"
            value={leakage.escalated}
            color="#991b1b"
            info="Extremely overdue — likely unverified exit or system discrepancy."
          />
        </div>
      </div>

      {/* Suspect Watchlist */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Suspect Watchlist (Low Trust Score &lt;80)
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Staff with flagged overrides or failed verification events
          </span>
        </div>

        {suspects.length === 0 ? (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid var(--success)",
              color: "var(--success)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ✓ No high-risk staff detected. Store security team trust score is clean.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {suspects.map((s) => (
              <SuspectStaffCard key={s.id} staff={s} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>

      {/* High Risk Transactions */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            High-Risk Transactions (Last 7 Days)
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Orders flagged by AI risk scoring engine
          </span>
        </div>

        {highRiskOrders.length === 0 ? (
          <EmptyState message="No high-risk transactions detected in the past 7 days." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ORDER ID</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>EXIT STATUS</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {highRiskOrders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {o.id.slice(0, 10).toUpperCase()}
                      </td>
                      <td style={{ padding: 12 }}>
                        <Badge color={o.exitStatus === "APPROVED" ? "var(--success)" : "var(--danger)"}>
                          {o.exitStatus}
                        </Badge>
                      </td>
                      <td style={{ padding: 12, textAlign: "right", fontWeight: 700, color: "var(--danger)" }}>
                        ₹{o.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      </div>
    </FeatureLockWidget>
  );
}

function LeakageBucket({
  label,
  value,
  color,
  info,
}: {
  label: string;
  value: number;
  color: string;
  info: string;
}) {
  const isClear = value === 0;
  return (
    <Card
      style={{
        padding: 16,
        border: `1px solid ${color}`,
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
        <Badge color={color}>{value}</Badge>
      </div>
      <div style={{ marginTop: 14, fontSize: 24, fontWeight: 800, color }}>
        {isClear ? "✓ Clear" : `${value} Orders`}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
        {info}
      </div>
    </Card>
  );
}