import { requireRole, resolveStoreScope } from "@/lib/rbac";
import {
  getAiSuggestions,
  getPurchaseOrders,
  getQuantumPromotionData,
  getSuppliers,
} from "@/lib/services/po-service";
import { ProcurementHub } from "@/components/procurement-hub";

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [promotionData, suppliers, suggestions, pos] = await Promise.all([
    getQuantumPromotionData(role, tenantId, effectiveStoreId),
    getSuppliers(tenantId),
    getAiSuggestions(role, tenantId, effectiveStoreId),
    getPurchaseOrders(role, tenantId, effectiveStoreId),
  ]);

  // Deep sanitize to guarantee 100% plain serializable objects across Server-to-Client boundary
  const safeMetrics = JSON.parse(JSON.stringify(promotionData.metrics));
  const safeProducts = JSON.parse(JSON.stringify(promotionData.products));
  const safeSuppliers = JSON.parse(JSON.stringify(suppliers));
  const safeSuggestions = JSON.parse(JSON.stringify(suggestions));
  const safePos = JSON.parse(JSON.stringify(pos));

  return (
    <div style={{ padding: "24px 32px", minHeight: "100vh" }}>
      <ProcurementHub
        metrics={safeMetrics}
        products={safeProducts}
        suppliers={safeSuppliers}
        suggestions={safeSuggestions}
        pos={safePos}
        branchCode={effectiveStoreId}
        canEdit={canEdit}
      />
    </div>
  );
}