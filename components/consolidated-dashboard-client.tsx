"use client";

import React from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { ConsolidatedOwnerMetrics } from "@/lib/services/tenant-metrics-service";

interface ConsolidatedDashboardClientProps {
  consolidatedMetrics: ConsolidatedOwnerMetrics | null;
  currentPlan: string;
}

export function ConsolidatedDashboardClient({
  consolidatedMetrics,
  currentPlan,
}: ConsolidatedDashboardClientProps) {
  const normPlan = (currentPlan || "").toLowerCase();
  const isHighTier =
    normPlan === "growth" ||
    normPlan === "enterprise" ||
    normPlan === "business" ||
    normPlan === "trial";

  // If metrics are null
  if (!consolidatedMetrics) {
    if (!isHighTier) {
      return (
        <Card
          style={{
            padding: 24,
            background: "color-mix(in srgb, var(--primary) 5%, var(--card-bg))",
            border: "1px dashed color-mix(in srgb, var(--primary) 30%, var(--border))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>🔒</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  Consolidated Chain Analytics (Multi-Branch)
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  Chain Analytics is a Growth plan feature. Upgrade to compare store sales rankings, cross-branch revenue, and godown efficiency.
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/settings/subscription"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              background: "var(--primary)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Upgrade to Growth →
          </Link>
        </Card>
      );
    }
    // Single store on Growth or no metrics needed
    return null;
  }

  const {
    totalBranches,
    chainTodayRevenue,
    chainTodayOrders,
    chainMonthRevenue,
    chainMonthOrders,
    chainAvgOrderValue,
    branches,
    topBranch,
    bottomBranch,
  } = consolidatedMetrics;

  const currentMonthName = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const activeBranchCount = branches.filter((b) => b.todayOrders > 0).length;
  const topRevenue = topBranch && topBranch.monthRevenue > 0 ? topBranch.monthRevenue : 1;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* ========================================================
          SECTION A: CHAIN SUMMARY BAR
         ======================================================== */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Chain Consolidated Executive Matrix
            </h2>
            <Badge color="var(--success)">GROWTH ANALYTICS</Badge>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Aggregated across {totalBranches} retail locations
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {/* 1. Chain Revenue Today */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Chain Revenue Today
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
              ₹{chainTodayRevenue.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              {chainTodayOrders.toLocaleString("en-IN")} orders today
            </div>
          </Card>

          {/* 2. Chain Revenue MTD */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Chain Revenue MTD
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)", marginTop: 4 }}>
              ₹{chainMonthRevenue.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              {chainMonthOrders.toLocaleString("en-IN")} orders this month
            </div>
          </Card>

          {/* 3. Avg Order Value */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Avg Order Value
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#a855f7", marginTop: 4 }}>
              ₹{Math.round(chainAvgOrderValue).toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              across all branches
            </div>
          </Card>

          {/* 4. Active Branches */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Active Branches
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)", marginTop: 4 }}>
              {activeBranchCount} / {totalBranches}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              had activity today
            </div>
          </Card>
        </div>
      </div>

      {/* ========================================================
          SECTION B: BRANCH PERFORMANCE TABLE
         ======================================================== */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Branch Revenue Comparison — {currentMonthName}
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Cross-store rankings by monthly transaction volume and physical godown activity.
            </p>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  textAlign: "left",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                <th style={{ padding: "10px 12px", width: 60 }}>Rank</th>
                <th style={{ padding: "10px 12px" }}>Branch</th>
                <th style={{ padding: "10px 12px" }}>Today&apos;s Revenue</th>
                <th style={{ padding: "10px 12px", minWidth: 200 }}>MTD Revenue</th>
                <th style={{ padding: "10px 12px" }}>MTD Orders</th>
                <th style={{ padding: "10px 12px" }}>Avg Order</th>
                <th style={{ padding: "10px 12px" }}>Active Staff</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                let rankBadge = `#${b.rank}`;
                if (b.rank === 1) rankBadge = "🥇 #1";
                else if (b.rank === 2) rankBadge = "🥈 #2";
                else if (b.rank === 3) rankBadge = "🥉 #3";

                const percentOfTop = Math.min(100, Math.round((b.monthRevenue / topRevenue) * 100));
                let barColor = "var(--text-secondary)";
                if (b.rank === 1) barColor = "var(--success)";
                else if (b.rank <= 3) barColor = "#3b82f6";

                return (
                  <tr
                    key={b.branchCode}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.2s ease",
                    }}
                  >
                    {/* Rank */}
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      <span
                        style={{
                          fontSize: b.rank <= 3 ? 14 : 12,
                          color: b.rank === 1 ? "var(--success)" : b.rank <= 3 ? "#3b82f6" : "var(--text-secondary)",
                        }}
                      >
                        {rankBadge}
                      </span>
                    </td>

                    {/* Branch */}
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{b.branchName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {b.branchCode}
                      </div>
                    </td>

                    {/* Today's Revenue */}
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {b.todayRevenue > 0 ? (
                        <div>
                          <div>₹{b.todayRevenue.toLocaleString("en-IN")}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
                            {b.todayOrders} orders
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>—</span>
                      )}
                    </td>

                    {/* MTD Revenue + Progress Bar */}
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        ₹{b.monthRevenue.toLocaleString("en-IN")}
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: "var(--border)",
                          marginTop: 6,
                          overflow: "hidden",
                          width: "100%",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.max(4, percentOfTop)}%`,
                            background: barColor,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </td>

                    {/* MTD Orders */}
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {b.monthOrders.toLocaleString("en-IN")}
                    </td>

                    {/* Avg Order Value */}
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      ₹{Math.round(b.avgOrderValue).toLocaleString("en-IN")}
                    </td>

                    {/* Active Staff */}
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontWeight: 600, color: b.activeStaff > 0 ? "var(--success)" : "var(--text-secondary)" }}>
                        {b.activeStaff} online
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <Link
                        href={`/dashboard?store=${b.branchCode}`}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--card-bg)",
                          color: "var(--primary)",
                          textDecoration: "none",
                          fontWeight: 700,
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer Row: Chain Total */}
            <tfoot>
              <tr
                style={{
                  background: "color-mix(in srgb, var(--primary) 5%, var(--card-bg))",
                  borderTop: "2px solid var(--border)",
                  fontWeight: 800,
                }}
              >
                <td style={{ padding: "14px 12px" }}>—</td>
                <td style={{ padding: "14px 12px", fontSize: 14 }}>Chain Total</td>
                <td style={{ padding: "14px 12px", fontSize: 14 }}>
                  ₹{chainTodayRevenue.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "14px 12px", fontSize: 14, color: "var(--primary)" }}>
                  ₹{chainMonthRevenue.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "14px 12px", fontSize: 14 }}>
                  {chainMonthOrders.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "14px 12px", fontSize: 14 }}>
                  ₹{Math.round(chainAvgOrderValue).toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "14px 12px" }}>
                  {branches.reduce((sum, b) => sum + b.activeStaff, 0)} online
                </td>
                <td style={{ padding: "14px 12px", textAlign: "right" }}>
                  <Link
                    href="/dashboard"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "var(--primary)",
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    All Stores →
                  </Link>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ========================================================
          SECTION C: TOP & BOTTOM BRANCH CALLOUT
         ======================================================== */}
      {topBranch && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {/* Best Performing Branch */}
          <Card
            style={{
              padding: 20,
              border: "1.5px solid var(--success)",
              background: "color-mix(in srgb, var(--success) 6%, var(--card-bg))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--success)", textTransform: "uppercase" }}>
                  Best Performing Branch
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                {topBranch.branchName}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                ₹{topBranch.monthRevenue.toLocaleString("en-IN")} MTD · {topBranch.monthOrders} orders
              </div>
            </div>

            <Link
              href={`/dashboard?store=${topBranch.branchCode}`}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--success)",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              View Dashboard →
            </Link>
          </Card>

          {/* Needs Attention Branch (only if > 2 branches and bottomBranch exists) */}
          {totalBranches > 2 && bottomBranch && bottomBranch.branchCode !== topBranch.branchCode && (
            <Card
              style={{
                padding: 20,
                border: "1.5px solid var(--warning)",
                background: "color-mix(in srgb, var(--warning) 6%, var(--card-bg))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>📉</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--warning)", textTransform: "uppercase" }}>
                    Needs Attention
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                  {bottomBranch.branchName}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                  ₹{bottomBranch.monthRevenue.toLocaleString("en-IN")} MTD · {bottomBranch.monthOrders} orders
                </div>
                {bottomBranch.monthOrders === 0 && (
                  <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, fontWeight: 600 }}>
                    ⚠️ No transactions recorded this month
                  </div>
                )}
              </div>

              <Link
                href={`/dashboard?store=${bottomBranch.branchCode}`}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--warning)",
                  background: "transparent",
                  color: "var(--warning)",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                View Dashboard →
              </Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
