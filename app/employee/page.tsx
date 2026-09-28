import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmployeeDashboardDataAction } from "@/actions/hr";
import { EmployeeDashboardClient } from "@/components/employee-dashboard-client";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";
import Link from "next/link";

export default async function EmployeePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/employee/login");
  }

  const user = session.user as any;
  const staffId = user.staffId;

  // A session with a staffId custom claim (from OTP login) goes into the portal.
  // tenant_admin / super_admin / manager-without-staffId sessions get the "Staff Account Required" message.
  const hasStaffIdClaim = Boolean(staffId);

  if (!hasStaffIdClaim) {
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
          gap: 14,
        }}
      >
        <span style={{ fontSize: 36 }}>ℹ️</span>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
          Staff Account Required
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 440, lineHeight: 1.5 }}>
          Employee Self-Service is for staff accounts (cashier, guard, manager) who have linked their phone device. Please log in with your verified phone number to access this portal.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Link
            href="/employee/login"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Employee Phone Login →
          </Link>
          <Link
            href="/"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  let res: any;
  try {
    res = await getEmployeeDashboardDataAction();
  } catch (err: any) {
    if (err?.message === "SESSION_REVOKED" || err?.message?.includes("SESSION_REVOKED")) {
      redirect("/employee/login?revoked=1");
    }
    throw err;
  }

  if (!res || !res.ok || !res.data) {
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
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 440, lineHeight: 1.5 }}>
          {res?.error ||
            "Your user account is not linked to an active staff record in this tenant. Please contact your Store Manager or HR Admin to onboard your employee profile."}
        </p>
      </div>
    );
  }

  return (
    <FeatureLockWidget route="employee">
      <EmployeeDashboardClient initialData={res.data} />
    </FeatureLockWidget>
  );
}
