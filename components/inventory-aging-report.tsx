"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { InventoryAgingReport, AgingBucket } from "@/lib/services/inventory-service";

interface InventoryAgingReportProps {
  report: InventoryAgingReport;
  branchCode?: string | null;
}

export function InventoryAgingReportClient({ report, branchCode }: InventoryAgingReportProps) {
  const [selectedBucketKey, setSelectedBucketKey] = useState<"0_30" | "31_60" | "61_90" | "90_PLUS">("90_PLUS");

  const b0_30 = report.buckets["0_30"];
  const b31_60 = report.buckets["31_60"];
  const b61_90 = report.buckets["61_90"];
  const b90_plus = report.buckets["90_PLUS"];

  const criticalLockedCapital = Math.round((b61_90.lockedCapital + b90_plus.lockedCapital) * 100) / 100;
  const criticalPercentage =
    report.totalLockedCapital > 0
      ? Math.round((criticalLockedCapital / report.totalLockedCapital) * 1000) / 10
      : 0;

  const currentBucket = report.buckets[selectedBucketKey];

  const getBucketColor = (key: string) => {
    switch (key) {
      case "0_30":
        return "#22c55e"; // green
      case "31_60":
        return "#3b82f6"; // blue
      case "61_90":
        return "#f59e0b"; // amber
      case "90_PLUS":
        return "#ef4444"; // red
      default:
        return "var(--text-secondary)";
    }
  };

  const getRecommendation = (days: number) => {
    if (days <= 30) return { label: "Optimal Turnover", action: "Maintain stock levels" };
    if (days <= 60) return { label: "Slow Moving", action: "Monitor demand & feature on shelves" };
    if (days <= 90) return { label: "At Risk", action: "Run flash promotion or bundle" };
    return { label: "Stagnant Capital", action: "Aggressive clearance or return to vendor" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Headline Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Total Locked Capital
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary)" }}>
            ₹{report.totalLockedCapital.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Across {report.totalSkus} active SKUs ({report.totalClosingUnits.toLocaleString()} units)
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            High-Risk Capital (&gt;60 Days)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: criticalLockedCapital > 0 ? "#ef4444" : "#22c55e" }}>
            ₹{criticalLockedCapital.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {criticalPercentage}% of total tied-up inventory funds
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Stagnant Dead Stock (90+ Days)
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#ef4444" }}>
            ₹{b90_plus.lockedCapital.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {b90_plus.productCount} SKUs ({b90_plus.totalUnits.toLocaleString()} units) with no recent sales
          </div>
        </Card>
      </div>

      {/* Visual Capital Allocation Breakdown Bar */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
            Capital Allocation by Aging Horizon
          </h3>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {branchCode ? `Branch: ${branchCode}` : "All Branches Combined"}
          </span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "var(--border)", marginBottom: 16 }}>
          <div style={{ width: `${b0_30.percentageOfLockedCapital}%`, background: "#22c55e" }} title={`0-30d: ${b0_30.percentageOfLockedCapital}%`} />
          <div style={{ width: `${b31_60.percentageOfLockedCapital}%`, background: "#3b82f6" }} title={`31-60d: ${b31_60.percentageOfLockedCapital}%`} />
          <div style={{ width: `${b61_90.percentageOfLockedCapital}%`, background: "#f59e0b" }} title={`61-90d: ${b61_90.percentageOfLockedCapital}%`} />
          <div style={{ width: `${b90_plus.percentageOfLockedCapital}%`, background: "#ef4444" }} title={`90+d: ${b90_plus.percentageOfLockedCapital}%`} />
        </div>

        {/* Bucket Selector Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[b0_30, b31_60, b61_90, b90_plus].map((b) => {
            const isSelected = selectedBucketKey === b.key;
            const color = getBucketColor(b.key);

            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setSelectedBucketKey(b.key)}
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: isSelected ? `2px solid ${color}` : "1px solid var(--border)",
                  background: isSelected ? `color-mix(in srgb, ${color} 10%, var(--card-bg))` : "var(--card-bg)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>{b.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color }}>
                  ₹{b.lockedCapital.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {b.productCount} SKUs ({b.totalUnits} units) • {b.percentageOfLockedCapital}% capital
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Top 10 High-Value Items in Selected Bucket */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: getBucketColor(currentBucket.key) }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                Top Capital Locked SKUs in {currentBucket.label}
              </h3>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Showing highest-value inventory items ranked by locked capital (Unit Cost × Closing Stock)
            </p>
          </div>

          <Badge color={getBucketColor(currentBucket.key)}>
            {currentBucket.topItems.length} Key SKUs
          </Badge>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>PRODUCT</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BARCODE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DAYS INACTIVE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>CLOSING STOCK</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>UNIT COST</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>LOCKED CAPITAL</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>RECOMMENDED ACTION</th>
              </tr>
            </thead>
            <tbody>
              {currentBucket.topItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    🎉 No products found in this aging bucket.
                  </td>
                </tr>
              ) : (
                currentBucket.topItems.map((item, idx) => {
                  const rec = getRecommendation(item.daysSinceLastSold);
                  const color = getBucketColor(currentBucket.key);

                  return (
                    <tr key={item.productId || idx} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          Selling Price: ₹{item.price.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 12 }}>
                        {item.barcode || "-"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontWeight: 700, color }}>
                          {item.daysSinceLastSold >= 900 ? "Never Sold" : `${item.daysSinceLastSold} days`}
                        </span>
                        {item.lastSoldDate && (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                            Last: {item.lastSoldDate}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 800, color: "var(--text-primary)" }}>
                        {item.closingStock} units
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                        ₹{item.unitCost.toFixed(2)}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 900, color }}>
                        ₹{item.lockedCapital.toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text-primary)" }}>
                          {rec.label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {rec.action}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
