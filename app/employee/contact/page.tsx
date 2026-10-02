import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmployeeDashboardDataAction } from "@/actions/hr";
import { ContactTabClient } from "@/components/employee/contact-tab-client";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function ContactPage() {
  const session = await auth();

  if (!session?.user) {
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

  return (
    <FeatureLockWidget route="employee">
      <ContactTabClient initialData={res.data} />
    </FeatureLockWidget>
  );
}
