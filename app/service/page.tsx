import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getServices } from "@/lib/services/service-catalog-service";
import { ServiceCatalog } from "@/components/service-catalog";
import { PageHeader } from "@/components/ui";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const services = await getServices(role, tenantId, effectiveStoreId);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Service Master Roster ✂️"
        subtitle={!canEdit ? "View-only — contact your store manager to add or edit services" : "Enterprise Service & Labor Management — Fixed-price services, SAC classification & GST rates."}
      />
      <ServiceCatalog
        services={services}
        canEdit={canEdit}
        branchCode={effectiveStoreId}
      />
    </div>
  );
}