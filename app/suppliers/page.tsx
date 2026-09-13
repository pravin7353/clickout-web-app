import { requireRole } from "@/lib/rbac";
import { getSuppliers } from "@/lib/services/supplier-service";
import { SupplierList } from "@/components/supplier-list";
import { PageHeader } from "@/components/ui";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { role, tenantId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { page: pageParam } = (await searchParams) || {};
  const rawPage = parseInt(pageParam || "1", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = 25;

  const suppliers = await getSuppliers(role, tenantId, { page, pageSize });

  return (
    <FeatureLockWidget route="suppliers">
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader
          title="Distributor Directory — Vendor Intelligence"
          subtitle="Manage supplier contacts, merchandise categories, and bulk CSV distributor onboarding."
        />
        <SupplierList suppliers={suppliers} canEdit={canEdit} />
      </div>
    </FeatureLockWidget>
  );
}