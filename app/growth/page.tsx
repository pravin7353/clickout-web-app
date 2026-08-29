import { requireRole } from "@/lib/rbac";
import { scanForChurn } from "@/lib/services/churn-service";
import { ChurnRadar } from "@/components/churn-radar";

export default async function GrowthPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const customers = await scanForChurn(role, tenantId, storeId);
  return <ChurnRadar customers={customers} />;
}