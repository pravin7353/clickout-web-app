import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { getCampaigns } from "@/lib/services/campaign-service";
import { CampaignManager } from "@/components/campaign-manager";
import { PageHeader } from "@/components/ui";

export default async function CampaignManagerPage({
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

  const campaigns = await getCampaigns(role, tenantId, effectiveStoreId);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="In-Store Marketing & Campaign Manager"
        subtitle="Manage live customer app promotions, brand sponsorships, and checkout rewards."
      />
      <CampaignManager
        campaigns={campaigns}
        initialStoreId={effectiveStoreId}
        canEdit={canEdit}
      />
    </div>
  );
}