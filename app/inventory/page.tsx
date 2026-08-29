import { requireRole } from "@/lib/rbac";
import { getLedger } from "@/lib/services/inventory-service";
import { AddProductForm } from "@/components/add-product-form";

export default async function InventoryPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const ledger = await getLedger(role, tenantId, storeId);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Inventory & Godown Ledger</h1>
        <AddProductForm />
      </div>

      {ledger.length === 0 ? (
        <p style={{ color: "#888" }}>No products yet — add your first one.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Name</th>
              <th style={{ padding: 10 }}>Opening</th>
              <th style={{ padding: 10 }}>Purchased</th>
              <th style={{ padding: 10 }}>Sold</th>
              <th style={{ padding: 10 }}>Damaged</th>
              <th style={{ padding: 10 }}>Expired</th>
              <th style={{ padding: 10 }}>Closing</th>
              <th style={{ padding: 10 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.productId} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: 10 }}>{row.name}</td>
                <td style={{ padding: 10 }}>{row.openingStock}</td>
                <td style={{ padding: 10 }}>{row.purchasedStock}</td>
                <td style={{ padding: 10 }}>{row.soldStock}</td>
                <td style={{ padding: 10 }}>{row.damagedStock}</td>
                <td style={{ padding: 10 }}>{row.expiredStock}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{row.closingStock}</td>
                <td style={{ padding: 10 }}>
                  {row.isDeadStock && (
                    <span style={{ color: "#f97316", fontSize: 12, fontWeight: 700, border: "1px solid #f97316", padding: "2px 8px", borderRadius: 12 }}>
                      DEAD STOCK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}