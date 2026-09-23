import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmployeeDashboardDataAction } from "@/actions/hr";
import { EmployeeDashboardClient } from "@/components/employee-dashboard-client";

export default async function EmployeePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const res = await getEmployeeDashboardDataAction();

  if (!res.ok || !res.data) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          background: "var(--card-bg)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 36 }}>⚠️</span>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
          Employee Profile Not Found
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 400 }}>
          {res.error ||
            "Your user account is not linked to an active staff record in this tenant. Please contact your Store Manager or HR Admin to onboard your employee profile."}
        </p>
      </div>
    );
  }

  return <EmployeeDashboardClient initialData={res.data} />;
}
