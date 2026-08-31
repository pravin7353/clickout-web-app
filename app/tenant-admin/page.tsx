import { requireRole } from "@/lib/rbac";
import { getStores } from "@/lib/services/store-service";
import { getTenantOnboardingStatus } from "@/actions/tenant-onboarding";
import { CreateStoreForm } from "@/components/create-store-form";
import { TenantOnboardingForm } from "@/components/tenant-onboarding-form";
import { StoreCard } from "@/components/store-card";
import { PageHeader } from "@/components/ui";

export default async function TenantAdminPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);

  if (role === "tenant_admin") {
    const { isOnboardingComplete } = await getTenantOnboardingStatus(tenantId);
    if (!isOnboardingComplete) return <TenantOnboardingForm />;
  }

  const stores = await getStores(role, tenantId);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Stores & Branches" action={<CreateStoreForm />} />

      {stores.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No stores yet — create your first one.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {stores.map((s) => <StoreCard key={s.id} store={s} />)}
        </div>
      )}
    </div>
  );
}