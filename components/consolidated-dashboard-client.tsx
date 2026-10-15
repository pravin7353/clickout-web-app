"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { ConsolidatedOwnerMetrics, BranchRevenueSnapshot } from "@/lib/services/tenant-metrics-service";
import { updateStoreMilestoneTargetAction } from "@/actions/store";

interface ConsolidatedDashboardClientProps {
  consolidatedMetrics: ConsolidatedOwnerMetrics | null;
  currentPlan: string;
}

export function ConsolidatedDashboardClient({
  consolidatedMetrics,
  currentPlan,
}: ConsolidatedDashboardClientProps) {
  const router = useRouter();
  const [branchesList, setBranchesList] = useState<BranchRevenueSnapshot[]>(
    consolidatedMetrics?.branches || []
  );
  const [selectedBranch, setSelectedBranch] = useState<BranchRevenueSnapshot | null>(null);
  const [targetRevenueInput, setTargetRevenueInput] = useState<string>("");
  const [bonusInput, setBonusInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formFeedback, setFormFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (consolidatedMetrics?.branches) {
      setBranchesList(consolidatedMetrics.branches);
    }
  }, [consolidatedMetrics?.branches]);

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
    topBranch,
    bottomBranch,
  } = consolidatedMetrics;

  const currentMonthName = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const activeBranchCount = branchesList.filter((b) => b.todayOrders > 0).length;
  const topRevenue = topBranch && topBranch.monthRevenue > 0 ? topBranch.monthRevenue : 1;

  const handleOpenMilestone = (b: BranchRevenueSnapshot) => {
    setSelectedBranch(b);
    setTargetRevenueInput(b.monthlyTargetRevenue ? String(b.monthlyTargetRevenue) : "");
    setBonusInput(b.monthlyManagerBonus ? String(b.monthlyManagerBonus) : "");
    setNotesInput("");
    setFormFeedback(null);
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setIsSubmitting(true);
    setFormFeedback(null);

    const targetNum = Math.max(0, Number(targetRevenueInput) || 0);
    const bonusNum = Math.max(0, Number(bonusInput) || 0);

    try {
      const res = await updateStoreMilestoneTargetAction({
        storeIdOrBranchCode: selectedBranch.storeId || selectedBranch.branchCode,
        monthlyTargetRevenue: targetNum,
        monthlyManagerBonus: bonusNum,
        milestoneNotes: notesInput,
      });

      if (res.ok) {
        setFormFeedback({ ok: true, msg: res.message || "Milestone configuration saved successfully!" });
        const isAchieved = targetNum > 0 && selectedBranch.monthRevenue >= targetNum;
        const percent = targetNum > 0 ? Math.min(100, Math.round((selectedBranch.monthRevenue / targetNum) * 100)) : 0;
        setBranchesList((prev) =>
          prev.map((b) =>
            b.branchCode === selectedBranch.branchCode
              ? {
                  ...b,
                  monthlyTargetRevenue: targetNum,
                  monthlyManagerBonus: bonusNum,
                  isMilestoneAchieved: isAchieved,
                  milestonePercent: percent,
                }
              : b
          )
        );
        router.refresh();
        setTimeout(() => {
          setSelectedBranch(null);
          setFormFeedback(null);
        }, 1200);
      } else {
        setFormFeedback({ ok: false, msg: res.error || "Failed to update milestone settings." });
      }
    } catch (err: any) {
      setFormFeedback({ ok: false, msg: err?.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

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
              Cross-store rankings by monthly transaction volume, revenue milestone targets & manager performance bonuses.
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
                <th style={{ padding: "10px 12px", minWidth: 220 }}>MTD Revenue & Milestone</th>
                <th style={{ padding: "10px 12px" }}>MTD Orders</th>
                <th style={{ padding: "10px 12px" }}>Avg Order</th>
                <th style={{ padding: "10px 12px" }}>Active Staff</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {branchesList.map((b) => {
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

                    {/* MTD Revenue & Milestone Progress */}
                    <td style={{ padding: "12px", minWidth: 220 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          ₹{b.monthRevenue.toLocaleString("en-IN")}
                        </div>
                        {b.monthlyTargetRevenue && b.monthlyTargetRevenue > 0 ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: b.isMilestoneAchieved
                                ? "color-mix(in srgb, var(--success) 15%, transparent)"
                                : "color-mix(in srgb, var(--primary) 12%, transparent)",
                              color: b.isMilestoneAchieved ? "var(--success)" : "var(--primary)",
                            }}
                          >
                            {b.isMilestoneAchieved ? "🎉 TARGET HIT" : `TARGET: ₹${b.monthlyTargetRevenue.toLocaleString("en-IN")}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                            No milestone set
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {b.monthlyTargetRevenue && b.monthlyTargetRevenue > 0 ? (
                        <>
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
                                width: `${Math.max(4, Math.min(100, b.milestonePercent || 0))}%`,
                                background: b.isMilestoneAchieved ? "var(--success)" : "var(--primary)",
                                borderRadius: 3,
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 10,
                              color: "var(--text-secondary)",
                              marginTop: 4,
                              fontWeight: 600,
                            }}
                          >
                            <span>{b.milestonePercent ?? 0}% completed</span>
                            {b.monthlyManagerBonus && b.monthlyManagerBonus > 0 ? (
                              <span style={{ color: b.isMilestoneAchieved ? "var(--success)" : "var(--text-primary)" }}>
                                Bonus: ₹{b.monthlyManagerBonus.toLocaleString("en-IN")}
                              </span>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
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
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
                            {percentOfTop}% of top branch
                          </div>
                        </>
                      )}
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
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleOpenMilestone(b)}
                          title="Configure Store Manager Monthly Milestone Target & Bonus"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
                            background: "color-mix(in srgb, var(--primary) 8%, var(--card-bg))",
                            color: "var(--primary)",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          🎯 Milestone
                        </button>
                        <Link
                          href={`/dashboard?store=${b.branchCode}`}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--card-bg)",
                            color: "var(--text-primary)",
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
                      </div>
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
                  {branchesList.reduce((sum, b) => sum + b.activeStaff, 0)} online
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

      {/* ========================================================
          MODAL: STORE MANAGER MILESTONE BONUS CONFIGURATION
         ======================================================== */}
      {selectedBranch && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setSelectedBranch(null);
            }
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              padding: 24,
              boxShadow: "0 20px 45px rgba(0,0,0,0.4)",
              position: "relative",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🎯</span>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                    Store Manager Monthly Milestone Bonus
                  </h3>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {selectedBranch.branchName} • Branch Code: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{selectedBranch.branchCode}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setSelectedBranch(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 18,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Current MTD Strip */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--primary) 6%, var(--card-bg))",
                border: "1px solid color-mix(in srgb, var(--primary) 20%, var(--border))",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>Current MTD Revenue ({currentMonthName})</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", marginTop: 2 }}>
                  ₹{selectedBranch.monthRevenue.toLocaleString("en-IN")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Activity</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  {selectedBranch.monthOrders} orders
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMilestone} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Target Input */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  Monthly Target Revenue (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={targetRevenueInput}
                  onChange={(e) => setTargetRevenueInput(e.target.value)}
                  placeholder="e.g. 500000"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                {/* Quick Presets */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {[100000, 250000, 500000, 1000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTargetRevenueInput(String(preset))}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      ₹{(preset / 100000).toFixed(preset % 100000 === 0 ? 0 : 1)}L
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTargetRevenueInput("0")}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--danger)",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Bonus Input */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  Manager Milestone Bonus (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  placeholder="e.g. 15000"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                {/* Quick Presets */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {[5000, 10000, 15000, 25000, 50000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBonusInput(String(preset))}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      ₹{preset.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  Policy Remarks / Terms (Optional)
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Disbursed with monthly payroll upon achieving branch turnover."
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    resize: "none",
                  }}
                />
              </div>

              {/* Live Preview Box */}
              {Number(targetRevenueInput) > 0 && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Projected Achievement:</span>
                    <span style={{ color: selectedBranch.monthRevenue >= Number(targetRevenueInput) ? "var(--success)" : "var(--primary)" }}>
                      {Math.min(100, Math.round((selectedBranch.monthRevenue / Number(targetRevenueInput)) * 100))}%
                    </span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
                    {selectedBranch.monthRevenue >= Number(targetRevenueInput) ? (
                      <span style={{ color: "var(--success)", fontWeight: 700 }}>
                        🎉 Store Manager will unlock ₹{Number(bonusInput || 0).toLocaleString("en-IN")} bonus this month!
                      </span>
                    ) : (
                      <span>
                        ⚡ ₹{(Number(targetRevenueInput) - selectedBranch.monthRevenue).toLocaleString("en-IN")} remaining to unlock ₹{Number(bonusInput || 0).toLocaleString("en-IN")} bonus.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback Alert */}
              {formFeedback && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: formFeedback.ok ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    color: formFeedback.ok ? "var(--success)" : "var(--danger)",
                    border: `1px solid ${formFeedback.ok ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  }}
                >
                  {formFeedback.ok ? "✓ " : "✕ "} {formFeedback.msg}
                </div>
              )}

              {/* Modal Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setSelectedBranch(null)}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--primary)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? "Saving Target..." : "Save Milestone Target"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

