import { requireRole, resolveStoreScope } from "@/lib/rbac";
import {
  scanForChurn,
  getLiveShoppers,
  getGhostVisitors,
  getGrowthConfig,
} from "@/lib/services/churn-service";
import { ChurnRadar } from "@/components/churn-radar";
import { FeatureLockWidget } from "@/components/subscription/FeatureLockWidget";

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { role, tenantId, storeId, canEdit } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const [vips, liveShoppers, ghostVisitors, config] = await Promise.all([
    scanForChurn(role, tenantId, effectiveStoreId),
    getLiveShoppers(role, tenantId, effectiveStoreId),
    getGhostVisitors(role, tenantId, effectiveStoreId),
    getGrowthConfig(tenantId, effectiveStoreId),
  ]);

  // Deep sanitize to guarantee 100% plain serializable objects across Server-to-Client boundary
  const safeVips = JSON.parse(JSON.stringify(vips));
  const safeLiveShoppers = JSON.parse(JSON.stringify(liveShoppers));
  const safeGhostVisitors = JSON.parse(JSON.stringify(ghostVisitors));
  const safeConfig = JSON.parse(JSON.stringify(config));

  return (
    <FeatureLockWidget route="growth">
      <div style={{ padding: "24px 32px", minHeight: "100vh" }}>
        <ChurnRadar
          vips={safeVips}
          liveShoppers={safeLiveShoppers}
          ghostVisitors={safeGhostVisitors}
          config={safeConfig}
          branchCode={effectiveStoreId}
          canEdit={canEdit}
        />
      </div>
    </FeatureLockWidget>
  );
}