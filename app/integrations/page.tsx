import { requireRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase-admin";
import { getFailedDeliveries } from "@/lib/services/webhook-service";
import { IntegrationsPanel } from "@/components/integrations-panel";

export default async function IntegrationsPage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin"]);
  let existingKey: string | null = null;
  let partnerMode = { enabled: false, webhookUrl: "", webhookSecret: null as string | null };
  let failedDeliveries: Awaited<ReturnType<typeof getFailedDeliveries>> = [];

  if (tenantId) {
    const doc = await adminDb.collection("tenants").doc(tenantId).get();
    existingKey = doc.data()?.erpApiKey ?? null;
    partnerMode = { ...partnerMode, ...(doc.data()?.partnerMode ?? {}) };
    failedDeliveries = await getFailedDeliveries(tenantId);
  }

  return <IntegrationsPanel existingKey={existingKey} partnerMode={partnerMode} failedDeliveries={failedDeliveries} />;
}