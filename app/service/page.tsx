import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getServices } from "@/lib/services/service-catalog-service";
import { ServiceCatalog } from "@/components/service-catalog";
import { PageHeader } from "@/components/ui";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; page?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore, page: pageParam } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const services = await getServices(role, tenantId, effectiveStoreId);

  // Pagination (pageSize = 25)
  const totalCount = services.length;
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rawPage = parseInt(pageParam || "1", 10);
  const currentPage = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, totalPages);

  const paginatedServices = services.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Service Master Roster ✂️"
        subtitle={!canEdit ? "View-only — contact your store manager to add or edit services" : "Enterprise Service & Labor Management — Fixed-price services, SAC classification & GST rates."}
      />
      <ServiceCatalog
        services={paginatedServices}
        canEdit={canEdit}
        branchCode={effectiveStoreId}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}