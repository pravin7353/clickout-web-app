import { requireRole } from "@/lib/rbac";
import { getUsage } from "@/lib/services/usage-service";
import { Card, Badge, PageHeader } from "@/components/ui";

export default async function UsagePage() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) {
    return (
      <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto" }}>
        <PageHeader
          title="Usage & Subscription Dashboard"
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

  const currentPeriod = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());

  let planColor = "var(--primary)";
  if (limits.subscriptionPlan === "GROWTH") planColor = "var(--success)";
  if (limits.subscriptionPlan === "ENTERPRISE") planColor = "#a855f7";
  if (limits.subscriptionPlan === "MINI") planColor = "var(--text-secondary)";

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>
      {/* Header */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>📊</span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Usage & Subscription Matrix
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
              padding: "6px 16px",
              borderRadius: 20,
              background: `color-mix(in srgb, ${planColor} 15%, transparent)`,
              border: `1px solid ${planColor}`,
              color: planColor,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.5px",
            }}
          >
            {limits.subscriptionPlan} PLAN
          </div>
        </div>
      </Card>

      {/* 4 Core Usage Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        {/* Transactions */}
        <UsageCard
          icon="🧾"
          title="POS Transactions"
          current={usage.transactionCount}
          max={limits.maxTransactions}
          isUnlimited={isUnlimitedTx}
          percent={txPercent}
          color="#3b82f6"
          unit="orders"
        />

        {/* Staff Accounts */}
        <UsageCard
          icon="👥"
          title="Staff Accounts"
          current={usage.staffCount}
          max={limits.maxUsers}
          isUnlimited={isUnlimitedStaff}
          percent={staffPercent}
          color="#a855f7"
          unit="members"
        />

        {/* Active Campaigns */}
        <UsageCard
          icon="📢"
          title="Offer Campaigns"
          current={usage.campaignCount}
          max={limits.maxCampaigns}
          isUnlimited={isUnlimitedCampaigns}
          percent={campaignPercent}
          color="#f97316"
          unit="active"
        />

        {/* Store Locations */}
        <UsageCard
          icon="🏬"
          title="Store Locations"
          current={usage.storeCount}
          max={limits.maxStores}
          isUnlimited={isUnlimitedStores}
          percent={storePercent}
          color="var(--success)"
          unit="branches"
        />
      </div>

      {/* Current Plan Benefits & Feature Matrix */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <Card style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Active {limits.planDisplayName} Entitlements
            </h3>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--primary)" }}>
              ₹{limits.monthlyPrice}/month
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
                <span>Growth Plan</span>
                <span style={{ color: "var(--success)" }}>₹699/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Unlimited transactions & staff · 10 store locations · Risk Engine & QR Bailout suite
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Enterprise HQ</span>
                <span style={{ color: "#a855f7" }}>Custom</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Unlimited stores · SAP / Tally ERP connectors · CA-grade SLA support
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
}: {
  icon: string;
  title: string;
  current: number;
  max: number;
  isUnlimited: boolean;
  percent: number;
  color: string;
  unit: string;
}) {
  const isCritical = !isUnlimited && percent >= 90;

  return (
    <Card style={{ display: "grid", gap: 14, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
        </div>

        {isUnlimited ? (
          <Badge color="var(--success)">UNLIMITED</Badge>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: isCritical ? "var(--danger)" : "var(--text-secondary)" }}>
            {percent}%
          </span>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: isCritical ? "var(--danger)" : "var(--text-primary)" }}>
            {current.toLocaleString()}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            / {isUnlimited ? "∞" : max.toLocaleString()} {unit}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 8, borderRadius: 4, background: "var(--border)", marginTop: 10, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: isUnlimited ? "100%" : `${Math.max(4, percent)}%`,
              background: isUnlimited ? "var(--success)" : isCritical ? "var(--danger)" : color,
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </Card>
  );
}