import { requireRole } from "@/lib/rbac";
import { getServices } from "@/lib/services/service-catalog-service";
import { ServiceCatalog } from "@/components/service-catalog";

export default async function ServicePage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const services = await getServices(role, tenantId, storeId);
  return <ServiceCatalog services={services} />;
}