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
    redirect("/auditor");
  } else if (role === "tenant_admin") {
    redirect("/tenant-admin");
  } else {
    redirect("/dashboard");
  }
}