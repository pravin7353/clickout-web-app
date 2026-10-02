import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmployeeDashboardDataAction } from "@/actions/hr";
import { RequestsTabClient } from "@/components/employee/requests-tab-client";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

interface RequestsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
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

  const resolvedSearchParams = await searchParams;
  const defaultTabParam = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab.toUpperCase() : undefined;
  const defaultTab = defaultTabParam === "REGULARIZATIONS" || defaultTabParam === "QUERIES" ? defaultTabParam : "LEAVES";
  const defaultDate = typeof resolvedSearchParams?.date === "string" ? resolvedSearchParams.date : undefined;

  return (
    <FeatureLockWidget route="employee">
      <RequestsTabClient
        initialData={res.data}
        defaultTab={defaultTab as any}
        defaultDate={defaultDate}
      />
    </FeatureLockWidget>
  );
}
