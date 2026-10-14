import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { CashierLogoutButton } from "@/components/pos/cashier-logout-button";
import { MyIncentiveCard } from "@/components/my-incentive-card";
import { CashierTabsClient } from "@/components/pos/cashier-tabs-client";
import { getPosCountersWithStatus } from "@/lib/services/pos-counter-service";
import { getStaffList } from "@/lib/services/staff-service";
import { getStores } from "@/lib/services/store-service";
import { adminDb } from "@/lib/firebase-admin";
import { getMaxPosCounters } from "@/lib/plan-limits";
import Link from "next/link";

export default async function CashierPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { session, role, tenantId, storeId, canEdit } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
  ]);
  const { store: queryStore } = await searchParams;
  const effectiveStoreId = resolveStoreScope(role, storeId, queryStore);

  const staffIdentifier = (session.user as any)?.id || session.user?.email || "";

  let counters: any[] = [];
  let staffList: any[] = [];
  let maxAllowedCounters = 1;
  let planName = "Mini";

  if (tenantId) {
    const [rawCounters, rawStaff, tDoc, stores] = await Promise.all([
      getPosCountersWithStatus(tenantId, effectiveStoreId),
      getStaffList(role, tenantId, effectiveStoreId, "ALL"),
      adminDb.collection("tenants").doc(tenantId).get(),
      getStores(role, tenantId),
    ]);

    counters = rawCounters;
    staffList = rawStaff;

    const tData = tDoc.data() || {};
    planName = tData.subscriptionPlan || "Mini";
    const extraCounters = Number(tData.extraPosCountersPurchased || 0);
    maxAllowedCounters = getMaxPosCounters(planName, extraCounters);

    const currentStore = stores.find(
      (s) => s.branchCode.toUpperCase() === (effectiveStoreId || "").toUpperCase()
    );
    if (currentStore?.isFrozen) {
      return (
        <div style={{ padding: 32, maxWidth: 640, margin: "60px auto", textAlign: "center" }}>
          <Card style={{ padding: 40, border: "1.5px solid rgba(56, 189, 248, 0.4)", borderRadius: 16 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>❄️</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Branch {effectiveStoreId} is Frozen
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, margin: "14px 0 24px" }}>
              This retail location exceeds your organization&apos;s current plan (<span style={{ textTransform: "uppercase", fontWeight: 700 }}>{planName}</span>) allowance (1 store allowed).
              POS and cashier billing operations are disabled for this branch.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/tenant-admin"
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "var(--primary)",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                ← Return to Organization HQ
              </Link>
              <Link
                href="/usage"
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Upgrade to Pro / Growth
              </Link>
            </div>
          </Card>
        </div>
      );
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title="Assisted Checkout — POS Terminal"
        subtitle="Staff-assisted direct checkout for cashier billing."
        action={<CashierLogoutButton role={role} cashierName={session.user?.name || undefined} branchCode={effectiveStoreId} />}
      />

      {role === "cashier" && (
        <MyIncentiveCard staffId={staffIdentifier} role={role} />
      )}

      <CashierTabsClient
        branchCode={effectiveStoreId}
        canEdit={canEdit || role === "cashier"}
        role={role}
        counters={counters}
        staffList={staffList}
        maxAllowedCounters={maxAllowedCounters}
        planName={planName}
        currentUser={{
          name: session.user?.name || "Cashier Staff",
          email: session.user?.email || "",
          staffId: staffIdentifier,
          role,
        }}
      />
    </div>
  );
}
