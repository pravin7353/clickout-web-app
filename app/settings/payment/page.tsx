import { requireRole } from "@/lib/rbac";
import { getPaymentSettings } from "@/actions/payment-settings";
import { PaymentSettingsClient } from "@/components/settings/PaymentSettingsClient";
import { adminDb } from "@/lib/firebase-admin";
import { planFromString } from "@/lib/subscription/plan";

export default async function PaymentSettingsPage() {
  const { role, tenantId } = await requireRole(["tenant_admin", "manager", "super_admin"]);

  let currentPlan = "pro";
  if (tenantId) {
    const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
    if (tDoc.exists) {
      currentPlan = planFromString(tDoc.data()?.subscriptionPlan);
    }
  }

  const { settings } = await getPaymentSettings();

  return (
    <PaymentSettingsClient
      initialSettings={settings}
      currentPlan={currentPlan}
    />
  );
}
