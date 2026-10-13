export const dynamic = "force-dynamic";

import { requireRole } from "@/lib/rbac";
import { getUsage } from "@/lib/services/usage-service";
import { Card, Badge, PageHeader } from "@/components/ui";
import Link from "next/link";

export default async function UsagePage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) {
    return (
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
        <PageHeader
          title="Plan & Limits Dashboard"
          subtitle="System usage is tracked per-tenant. Please log in with a tenant admin account."
        />
      </div>
    );
  }

  const { usage, limits } = await getUsage(tenantId);

  const isUnlimitedTx = limits.maxTransactions >= 999999;
  const isUnlimitedStaff = limits.maxUsers >= 999999;
  const isUnlimitedCampaigns = limits.maxCampaigns >= 999999;
  const isUnlimitedStores = limits.maxStores >= 999999;

  const txPercent = isUnlimitedTx ? 0 : Math.min(100, Math.round((usage.transactionCount / limits.maxTransactions) * 100));
  const staffPercent = isUnlimitedStaff ? 0 : Math.min(100, Math.round((usage.staffCount / limits.maxUsers) * 100));
  const campaignPercent = isUnlimitedCampaigns ? 0 : Math.min(100, Math.round((usage.campaignCount / limits.maxCampaigns) * 100));
  const storePercent = isUnlimitedStores ? 0 : Math.min(100, Math.round((usage.storeCount / limits.maxStores) * 100));
  const posCounterPercent = Math.min(100, Math.round((usage.posCounterCount / Math.max(1, limits.maxPosCounters)) * 100));

  const currentPeriod = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());

  let planColor = "var(--primary)";
  if (limits.planBadge === "FREE") planColor = "var(--text-secondary)";
  if (limits.planBadge === "SPARK") planColor = "#0284c7";
  if (limits.planBadge === "PRO") planColor = "var(--primary)";
  if (limits.planBadge === "GROWTH") planColor = "var(--success)";
  if (limits.planBadge === "ENTERPRISE") planColor = "#a855f7";

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>
      {/* Red Warning Banner if Transaction Limit Exceeded */}
      {limits.txnLimitExceeded && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--danger) 12%, var(--card-bg))",
            border: "1.5px solid var(--danger)",
            color: "var(--danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontWeight: 700,
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                Transaction limit exceeded this month. Upgrade your plan to avoid service interruption.
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9, marginTop: 2 }}>
                Current transactions: {usage.transactionCount.toLocaleString()} / {limits.maxTransactions.toLocaleString()} included in plan.
              </div>
            </div>
          </div>
          <Link
            href="/settings/subscription"
            style={{
              background: "var(--danger)",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            Upgrade Plan →
          </Link>
        </div>
      )}

      {/* Free Forever Plan Banner for spark_lite */}
      {limits.isSparkLite && (
        <div
          style={{
            padding: "18px 22px",
            borderRadius: 12,
            background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--card-bg)), var(--card-bg))",
            border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>✨</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
                Free Forever Plan
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                  color: "var(--primary)",
                  fontWeight: 800,
                  letterSpacing: "0.5px",
                }}
              >
                SPARK LITE
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", maxWidth: 700 }}>
              You are currently using the Spark Lite free tier (1 store, 100 txns/mo, 3 staff accounts, 1 POS counter).
              Upgrade to unlock multi-store branch expansion, higher transaction capacity, and automated business intelligence.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            style={{
              background: "var(--primary)",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              whiteSpace: "nowrap",
            }}
          >
            Upgrade Plan →
          </Link>
        </div>
      )}

      {/* Header Card */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>📊</span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Plan & Limits
              </h1>
              <p style={{ margin: "2px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                Current billing period: <strong>{currentPeriod}</strong> · Tenant: <span style={{ fontFamily: "monospace" }}>{tenantId}</span>
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              padding: "6px 18px",
              borderRadius: 20,
              background: `color-mix(in srgb, ${planColor} 15%, transparent)`,
              border: `1.5px solid ${planColor}`,
              color: planColor,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.5px",
            }}
          >
            {limits.planBadge} PLAN
          </div>
        </div>
      </Card>

      {/* Core Plan Limits Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {/* Stores: X / Y used (base: 1, extra purchased: N, max extra: M) */}
        <UsageCard
          icon="🏬"
          title="Store Locations"
          current={usage.storeCount}
          max={limits.maxStores}
          isUnlimited={isUnlimitedStores}
          percent={storePercent}
          color="var(--success)"
          unit="stores"
          subDetail={`base: ${limits.baseStores}, extra purchased: ${limits.extraStoresPurchased}, max extra: ${limits.maxExtraStores}`}
          forceRed={storePercent > 80}
        />

        {/* Transactions this month: X / Y (progress bar, red when >80%) */}
        <UsageCard
          icon="🧾"
          title="Transactions This Month"
          current={usage.transactionCount}
          max={limits.maxTransactions}
          isUnlimited={isUnlimitedTx}
          percent={txPercent}
          color="#3b82f6"
          unit="orders"
          subDetail={limits.txnLimitExceeded ? "⚠️ Monthly limit exceeded" : "Soft-capped live POS"}
          forceRed={txPercent > 80}
        />

        {/* Staff accounts: X / Y */}
        <UsageCard
          icon="👥"
          title="Staff Accounts"
          current={usage.staffCount}
          max={limits.maxUsers}
          isUnlimited={isUnlimitedStaff}
          percent={staffPercent}
          color="#a855f7"
          unit="staff"
          subDetail="Role-based team accounts"
          forceRed={staffPercent > 80}
        />

        {/* POS Counters: X / Y */}
        <UsageCard
          icon="💻"
          title="POS Counters"
          current={usage.posCounterCount}
          max={limits.maxPosCounters}
          isUnlimited={false}
          percent={posCounterPercent}
          color="#0284c7"
          unit="counters"
          subDetail="Active simultaneous billing sessions"
          forceRed={posCounterPercent > 80}
        />
      </div>

      {/* Active Plan Entitlements & Higher Tier Scaling */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <Card style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Active {limits.planDisplayName} Entitlements
            </h3>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--primary)" }}>
              {limits.monthlyPrice === 0 ? "Free" : `₹${limits.monthlyPrice}/month`}
            </span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {limits.benefits.map((b, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--success)", fontWeight: 800 }}>✓</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          style={{
            display: "grid",
            gap: 14,
            background: "color-mix(in srgb, var(--primary) 5%, var(--card-bg))",
            border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Higher Tier Scaling Options
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Upgrade seamlessly as your physical retail footprint expands.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
            <div style={{ padding: 10, borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Pro Plan</span>
                <span style={{ color: "var(--primary)" }}>₹799/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                2,500 txns/mo · 15 staff · 2 POS counters · Extra store add-ons @ ₹299/mo
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Growth Plan</span>
                <span style={{ color: "var(--success)" }}>₹1,499/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                6,000 txns/mo · 50 staff · 5 POS counters · HR & CA-Suitable Finance suites
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Enterprise HQ</span>
                <span style={{ color: "#a855f7" }}>₹4,999/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Unlimited stores & transactions · SAP / Tally ERP connectors · CA-grade SLA support
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function UsageCard({
  icon,
  title,
  current,
  max,
  isUnlimited,
  percent,
  color,
  unit,
  subDetail,
  forceRed,
}: {
  icon: string;
  title: string;
  current: number;
  max: number;
  isUnlimited: boolean;
  percent: number;
  color: string;
  unit: string;
  subDetail?: string;
  forceRed?: boolean;
}) {
  const isRed = forceRed || (!isUnlimited && percent > 80);

  return (
    <Card style={{ display: "grid", gap: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
        </div>

        {isUnlimited ? (
          <Badge color="var(--success)">UNLIMITED</Badge>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 800, color: isRed ? "var(--danger)" : "var(--text-secondary)" }}>
            {percent}%
          </span>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: isRed ? "var(--danger)" : "var(--text-primary)" }}>
            {current.toLocaleString()}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            / {isUnlimited ? "∞" : max.toLocaleString()} {unit}
          </span>
        </div>

        {/* Sub-detail description */}
        {subDetail && (
          <div style={{ fontSize: 11, color: isRed ? "var(--danger)" : "var(--text-secondary)", marginTop: 4, fontWeight: 500 }}>
            {subDetail}
          </div>
        )}

        {/* Progress Bar (turns red when >80%) */}
        <div style={{ height: 8, borderRadius: 4, background: "var(--border)", marginTop: 10, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: isUnlimited ? "100%" : `${Math.max(4, percent)}%`,
              background: isUnlimited ? "var(--success)" : isRed ? "var(--danger)" : color,
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </Card>
  );
}