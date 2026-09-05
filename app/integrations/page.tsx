import { requireRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase-admin";
import { getFailedDeliveries } from "@/lib/services/webhook-service";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { PageHeader } from "@/components/ui";

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

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="ERP Integrations & Webhook Subscriptions"
        subtitle="Manage secure API credentials for financial ERPs and configure real-time webhook endpoints."
      />
      <IntegrationsPanel
        existingKey={existingKey}
        partnerMode={partnerMode}
        failedDeliveries={failedDeliveries}
      />
    </div>
  );
}