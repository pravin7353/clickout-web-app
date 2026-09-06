import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = ((session.user as any)?.role || "").toString().toLowerCase();

  if (role === "cashier") {
    redirect("/cashier");
  } else if (role === "guard") {
    redirect("/guard");
  } else if (role === "auditor") {
    const accessibleTenants = ((session.user as any)?.accessibleTenants as any[]) || [];
    if (accessibleTenants.length > 1) {
      redirect("/select-company");
    } else {
      const singleTenant = accessibleTenants[0]?.tenantId;
      redirect(singleTenant ? `/auditor?tenant=${encodeURIComponent(singleTenant)}` : "/auditor");
    }
  } else if (role === "tenant_admin") {
    redirect("/tenant-admin");
  } else {
    redirect("/dashboard");
  }
}