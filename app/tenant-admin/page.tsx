import { requireRole } from "@/lib/rbac";
import { getStores } from "@/lib/services/store-service";
import { CreateStoreForm } from "@/components/create-store-form";

export default async function TenantAdminPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  const stores = await getStores(role, tenantId);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Stores & Branches</h1>
        <CreateStoreForm />
      </div>

      {stores.length === 0 ? (
        <p style={{ color: "#888" }}>No stores yet — create your first one.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {stores.map((s) => (
            <div key={s.id} style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
              <div style={{ fontWeight: 700 }}>{s.storeName}</div>
              <div style={{ color: "#888", fontSize: 13 }}>{s.branchCode} · {s.city}</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Manager: {s.managerName}</div>
              {s.bankDetailsPending && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#f97316", border: "1px solid #f97316", padding: "2px 8px", borderRadius: 12, display: "inline-block" }}>
                  Bank details pending
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}