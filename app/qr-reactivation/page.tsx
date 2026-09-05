import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { QrBailout } from "@/components/qr-bailout";
import { PageHeader } from "@/components/ui";

export default async function QrReactivationPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const adminName = session.user?.name || session.user?.email || "Admin";

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "grid", gap: 20 }}>
      <PageHeader
        title="QR Bailout & Exit Pass Reactivation"
        subtitle="Manage and re-authorize expired customer exit passes. Every bailout is logged to audit trail."
      />
      <QrBailout
        initialStoreId={effectiveStoreId}
        adminName={adminName}
        adminRole={role}
        canEdit={canEdit}
      />
    </div>
  );
}