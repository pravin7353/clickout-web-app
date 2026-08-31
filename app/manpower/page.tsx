import { requireRole } from "@/lib/rbac";
import { getStaffingForecast } from "@/lib/services/manpower-service";

const RUSH_COLORS: Record<string, string> = { LOW: "#22c55e", MEDIUM: "#f97316", HIGH: "#ef4444", CRITICAL: "#991b1b" };

export default async function ManpowerPage() {
  const { tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const forecast = await getStaffingForecast(tenantId, storeId);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Manpower AI — Staffing Forecast</h1>
      <p style={{ color: "#888" }}>Statistical forecast for {forecast.period}, based on {forecast.comparisonPeriod}.</p>

      {!forecast.hasSufficientData ? (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316" }}>
          {forecast.recommendation}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: `2px solid ${RUSH_COLORS[forecast.rushLevel]}` }}>
            <span style={{ fontWeight: 900, color: RUSH_COLORS[forecast.rushLevel] }}>{forecast.rushLevel} RUSH</span>
            <p style={{ marginTop: 8 }}>{forecast.recommendation}</p>
            <p style={{ fontSize: 12, color: "#888" }}>Confidence: {forecast.confidence}%</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 20 }}>
            <Metric label="Expected Orders" value={`${forecast.expectedOrders}`} sub={`${forecast.ordersLowerBound}–${forecast.ordersUpperBound}`} />
            <Metric label="Expected Revenue" value={`₹${forecast.expectedRevenue.toFixed(0)}`} sub={`₹${forecast.revenueLowerBound.toFixed(0)}–₹${forecast.revenueUpperBound.toFixed(0)}`} />
            <Metric label="Cashiers Needed" value={`${forecast.cashiersRequired}`} />
            <Metric label="Guards Needed" value={`${forecast.guardsRequired}`} />
          </div>

          {forecast.backupStaffRequired > 0 && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 13 }}>
              ⚠️ Spike risk — keep 1 backup staff member on standby.
            </div>
          )}

          <h3 style={{ marginTop: 24, fontWeight: 700 }}>Why this forecast:</h3>
          <ul style={{ fontSize: 13, color: "#888" }}>
            {forecast.contributingFactors.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#888" }}>{sub}</div>}
    </div>
  );
}