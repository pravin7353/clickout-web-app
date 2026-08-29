import { requireRole } from "@/lib/rbac";
import { getAiSuggestions, getPurchaseOrders } from "@/lib/services/po-service";
import { POList } from "@/components/po-list";

export default async function ProcurementPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const [suggestions, pos] = await Promise.all([getAiSuggestions(role, tenantId), getPurchaseOrders(role, tenantId)]);
  return <POList suggestions={suggestions} pos={pos} />;
}