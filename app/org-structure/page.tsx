import { requireRole } from "@/lib/rbac";
import { getOrgStructure } from "@/lib/services/org-service";
import { OrgTree } from "@/components/org-tree";

export default async function OrgStructurePage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  const roles = await getOrgStructure(tenantId);
  return <OrgTree roles={roles} />;
}