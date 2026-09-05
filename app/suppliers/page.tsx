import { requireRole } from "@/lib/rbac";
import { getSuppliers } from "@/lib/services/supplier-service";
import { SupplierList } from "@/components/supplier-list";
import { PageHeader } from "@/components/ui";

export default async function SuppliersPage() {
  const { role, tenantId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const suppliers = await getSuppliers(role, tenantId);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Distributor Directory — Vendor Intelligence"
        subtitle="Manage supplier contacts, merchandise categories, and bulk CSV distributor onboarding."
      />
      <SupplierList suppliers={suppliers} canEdit={canEdit} />
    </div>
  );
}