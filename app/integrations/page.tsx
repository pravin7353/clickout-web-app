import { requireRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase-admin";
import { getFailedDeliveries } from "@/lib/services/webhook-service";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { PageHeader } from "@/components/ui";

export default async function IntegrationsPage() {
  const { tenantId } = await requireRole(["tenant_admin"]);
  let existingKey: string | null = null;
  let partnerMode = { enabled: false, webhookUrl: "", webhookSecret: null as string | null };
  let failedDeliveries: Awaited<ReturnType<typeof getFailedDeliveries>> = [];
  let paymentConfigStatus = {
    phonepe: { configured: false, merchantId: "", saltIndex: "" },
    razorpay: { configured: false, keyId: "" },
  };

  if (tenantId) {
    // 🔒 Non-secret config from public tenant doc
    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    const tData = tenantDoc.data();
    partnerMode = {
      enabled: Boolean(tData?.partnerMode?.enabled),
      webhookUrl: tData?.partnerMode?.webhookUrl || "",
      webhookSecret: null,
    };

    // 🔒 Secret fields read from private subcollection
    const secretsDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("private")
      .doc("secrets")
      .get();

    if (secretsDoc.exists) {
      const sData = secretsDoc.data() || {};
      existingKey = sData.erpApiKey ?? null;
      partnerMode.webhookSecret = sData.webhookSecret ?? null;

      const pConfig = sData.paymentConfig || {};
      const phonepe = pConfig.PHONEPE;
      const razorpay = pConfig.RAZORPAY;

      paymentConfigStatus = {
        phonepe: {
          configured: Boolean(phonepe?.merchantId && phonepe?.saltKey),
          merchantId: phonepe?.merchantId || "",
          saltIndex: phonepe?.saltIndex || "",
        },
        razorpay: {
          configured: Boolean(razorpay?.keyId && razorpay?.keySecret),
          keyId: razorpay?.keyId || "",
        },
      };
    }

    failedDeliveries = await getFailedDeliveries(tenantId);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="Integrations, Payment Gateway & Webhooks"
        subtitle="Manage payment gateway credentials, secure ERP access tokens, and real-time webhook endpoints."
      />
      <IntegrationsPanel
        existingKey={existingKey}
        partnerMode={partnerMode}
        failedDeliveries={failedDeliveries}
        paymentConfigStatus={paymentConfigStatus}
      />
    </div>
  );
}