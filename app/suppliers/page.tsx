import { requireRole } from "@/lib/rbac";
import { getSuppliers } from "@/lib/services/supplier-service";
import { SupplierList } from "@/components/supplier-list";

export default async function SuppliersPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const suppliers = await getSuppliers(role, tenantId);
  return <SupplierList suppliers={suppliers} />;
}