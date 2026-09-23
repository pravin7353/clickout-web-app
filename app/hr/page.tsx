import { requireRole } from "@/lib/rbac";
import { getStaffList } from "@/lib/services/staff-service";
import { HrDashboardClient } from "@/components/hr-dashboard-client";

export default async function HrPage() {
  const { role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffList(role, tenantId, storeId, "ALL");

  const simpleStaff = staff.map((s) => ({
    id: s.id,
    empId: s.empId,
    name: s.name,
    role: s.role,
    branchCode: s.branchCode,
    isActive: s.isActive,
  }));

  return (
    <HrDashboardClient
      staffList={simpleStaff}
      userRole={role}
      canEdit={canEdit}
      storeId={storeId}
      tenantId={tenantId}
    />
  );
}
