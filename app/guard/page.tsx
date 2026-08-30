import { requireRole } from "@/lib/rbac";
import { getPendingExits, getGateHistory } from "@/lib/services/gate-service";
import { GuardConsole } from "@/components/guard-console";

export default async function GuardPage() {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const [pending, history] = await Promise.all([
    getPendingExits(role, tenantId, storeId),
    getGateHistory(role, tenantId, storeId),
  ]);
  return <GuardConsole pending={pending} history={history} />;
}