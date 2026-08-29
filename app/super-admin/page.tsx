import { requireRole } from "@/lib/rbac";
import { getTenants } from "@/lib/services/tenant-service";
import { OnboardTenantForm } from "@/components/onboard-tenant-form";

export default async function SuperAdminPage() {
  await requireRole(["super_admin"]);
  const tenants = await getTenants();

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Tenant Network</h1>
        <OnboardTenantForm />
      </div>

      {tenants.length === 0 ? (
        <p style={{ color: "#888" }}>No tenants yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {tenants.map((t) => (
            <div key={t.id} style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
              <div style={{ fontWeight: 700 }}>{t.companyName}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{t.subscriptionPlan} · {t.billingStatus}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}