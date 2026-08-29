import { requireRole } from "@/lib/rbac";
import { getStaffList } from "@/lib/services/staff-service";
import { OnboardStaffForm } from "@/components/onboard-staff-form";
import { StaffRow } from "@/components/staff-row";

export default async function ManagerPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const staff = await getStaffList(role, tenantId, storeId, "ALL");

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Staff Management</h1>
        <OnboardStaffForm />
      </div>

      {staff.length === 0 ? (
        <p style={{ color: "#888" }}>No staff yet — onboard your first employee.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Emp ID</th>
              <th style={{ padding: 10 }}>Name</th>
              <th style={{ padding: 10 }}>Role</th>
              <th style={{ padding: 10 }}>Branch</th>
              <th style={{ padding: 10 }}>Phone</th>
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => <StaffRow key={s.id} staff={s} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}