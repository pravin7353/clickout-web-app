import { requireRole } from "@/lib/rbac";
import { getRejectedOrders } from "@/lib/services/risk-engine-service";

export default async function RiskEnginePage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const orders = await getRejectedOrders(role, tenantId, storeId);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>Risk Engine 🚨</h1>
      <p style={{ color: "#888" }}>Every REJECTED gate scan, real-time — detect fraud patterns, guard misuse, or system errors.</p>

      {orders.length === 0 ? (
        <p style={{ marginTop: 20, color: "#888" }}>No rejected orders — clean record.</p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {orders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #222" }}>
              <span style={{ fontFamily: "monospace" }}>{o.id.slice(0, 10)}</span>
              <span>{o.branchCode}</span>
              <span style={{ fontWeight: 700 }}>₹{o.amount}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{o.paymentMode}</span>
              <span style={{ color: "#888", fontSize: 12 }}>{new Date(o.timestampMs).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}