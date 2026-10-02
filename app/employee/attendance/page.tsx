import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmployeeDashboardDataAction } from "@/actions/hr";
import { AttendanceTabClient } from "@/components/employee/attendance-tab-client";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function AttendancePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/employee/login");
  }

  const user = session.user as any;
  const staffId = user.staffId;

  if (!staffId) {
    redirect("/employee/login");
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
    redirect("/employee/login");
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <FeatureLockWidget route="employee">
      <AttendanceTabClient
        staffId={staffId}
        initialMonth={currentMonth}
        settings={res.data.settings || {}}
      />
    </FeatureLockWidget>
  );
}
