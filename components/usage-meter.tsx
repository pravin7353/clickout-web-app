import { getTenantUsageAndLimits, LimitKey } from "@/lib/plan-limits";

interface UsageMeterProps {
  tenantId: string;
}

interface MeterItem {
  key: LimitKey;
  label: string;
  icon: string;
  current: number;
  limit: number;
  unit?: string;
}

export async function UsageMeter({ tenantId }: UsageMeterProps) {
  const { planDisplayName, limits, currentCounts } = await getTenantUsageAndLimits(tenantId);

  const items: MeterItem[] = [
    {
      key: "maxProducts",
      label: "Products Catalog",
      icon: "📦",
      current: currentCounts.maxProducts,
      limit: limits.maxProducts,
      unit: "products",
    },
    {
      key: "maxStaff",
      label: "Staff Accounts",
      icon: "👥",
      current: currentCounts.maxStaff,
      limit: limits.maxStaff,
      unit: "accounts",
    },
    {
      key: "maxStores",
      label: "Store Branches",
      icon: "🏪",
      current: currentCounts.maxStores,
      limit: limits.maxStores,
      unit: "branches",
    },
    {
      key: "maxScansPerMonth",
      label: "Monthly Scans / Transactions",
      icon: "⚡",
      current: currentCounts.maxScansPerMonth,
      limit: limits.maxScansPerMonth,
      unit: "scans",
    },
    {
      key: "maxCashiers",
      label: "POS Billing Counters",
      icon: "🛒",
      current: currentCounts.maxCashiers,
      limit: limits.maxCashiers,
      unit: "counters",
    },
  ];

  return (
    <div
      style={{
        background: "var(--card-bg, #18181b)",
        border: "1px solid var(--border, #27272a)",
        borderRadius: 20,
        padding: "24px 28px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary, #ffffff)" }}>
            Resource Usage & Plan Limits
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary, #a1a1aa)" }}>
            Real-time server enforcement active for <strong>{planDisplayName}</strong>.
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "4px 10px",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--primary, #3b82f6) 15%, transparent)",
            color: "var(--primary, #3b82f6)",
            border: "1px solid color-mix(in srgb, var(--primary, #3b82f6) 30%, transparent)",
          }}
        >
          Live Tracking
        </span>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {items.map((item) => {
          const isUnlimited = item.limit === -1;
          const ratio = isUnlimited ? 0 : item.limit > 0 ? (item.current / item.limit) * 100 : 0;
          const percent = Math.min(100, Math.round(ratio));

          let barColor = "#10b981"; // green < 80%
          let badgeText = `${percent}%`;

          if (isUnlimited) {
            barColor = "#3b82f6"; // blue
            badgeText = "Unlimited";
          } else if (ratio > 95) {
            barColor = "#ef4444"; // red > 95%
          } else if (ratio >= 80) {
            barColor = "#f59e0b"; // yellow 80-95%
          }

          return (
            <div
              key={item.key}
              style={{
                background: "color-mix(in srgb, var(--scaffold-bg, #09090b) 60%, var(--card-bg, #18181b))",
                padding: "16px 18px",
                borderRadius: 14,
                border: "1px solid var(--border, #27272a)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #ffffff)" }}>
                      {item.label}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #ffffff)" }}>
                    {isUnlimited ? (
                      <span>
                        {item.current.toLocaleString()}{" "}
                        <span style={{ color: "var(--text-secondary, #a1a1aa)", fontWeight: 500 }}>
                          / Unlimited
                        </span>
                      </span>
                    ) : (
                      <span>
                        {item.current.toLocaleString()}{" "}
                        <span style={{ color: "var(--text-secondary, #a1a1aa)", fontWeight: 500 }}>
                          / {item.limit.toLocaleString()} {item.unit}
                        </span>
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: `color-mix(in srgb, ${barColor} 18%, transparent)`,
                      color: barColor,
                      border: `1px solid color-mix(in srgb, ${barColor} 30%, transparent)`,
                      minWidth: 46,
                      textAlign: "center",
                    }}
                  >
                    {badgeText}
                  </span>
                </div>
              </div>

              {/* Progress Bar Track */}
              <div
                style={{
                  height: 7,
                  width: "100%",
                  background: "var(--border, #27272a)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: isUnlimited ? (item.current > 0 ? "100%" : "0%") : `${percent}%`,
                    background: isUnlimited
                      ? "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)"
                      : barColor,
                    borderRadius: 99,
                    transition: "width 0.4s ease-in-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
