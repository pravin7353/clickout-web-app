import { requireRole } from "@/lib/rbac";
import { getCampaigns } from "@/lib/services/campaign-service";
import { CampaignManager } from "@/components/campaign-manager";

export default async function CampaignManagerPage() {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const campaigns = await getCampaigns(role, tenantId);
  return <CampaignManager campaigns={campaigns} />;
}