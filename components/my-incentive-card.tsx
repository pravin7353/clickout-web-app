"use client";

import { useState, useEffect } from "react";
import { Card, Badge, SkeletonRow } from "@/components/ui";
import { getMyIncentive } from "@/actions/incentive";

interface MyIncentiveCardProps {
  staffId: string;
  role: string;
}

export function MyIncentiveCard({ staffId, role }: MyIncentiveCardProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!staffId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await getMyIncentive(staffId, currentMonthStr);
        if (isMounted) {
          if (res.ok && res.incentive) {
            setData(res.incentive);
          } else {
            setErrorMsg(res.error || "Unable to fetch incentive data.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || "Unable to load incentive.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [staffId, currentMonthStr]);

  const isCashier = role.toLowerCase() === "cashier";
  const isGuard = role.toLowerCase() === "guard";
  const isManager = role.toLowerCase() === "manager";

  if (!isCashier && !isGuard && !isManager) {
    return null;
  }

  const currentMonthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <Card
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid color-mix(in srgb, var(--cta-bg, #F9A826) 35%, var(--border))",
        background: "color-mix(in srgb, var(--card-bg) 92%, var(--scaffold-bg))",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏆</span>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
              {isManager ? "Store Manager Milestone Bonus" : "My Incentive"} • {currentMonthName}
            </h3>
            <Badge color="var(--cta-bg, #F9A826)">
              {isManager ? `${data?.storeName || data?.branchCode || "Branch"} Performance` : "Live Performance"}
            </Badge>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            {isManager
              ? "Branch sales revenue target milestone & manager performance bonus."
              : isCashier
              ? "Performance bonus earned from assisted checkouts and scanned volumes."
              : "Security reward for gate discrepancy intercepts and high-risk catches."}
          </p>
        </div>

        <div>
          {loading ? (
            <div style={{ width: 120 }}>
              <SkeletonRow height={28} />
            </div>
          ) : errorMsg ? (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>{errorMsg}</span>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>
                {isManager ? (data?.isAchieved ? "BONUS UNLOCKED" : "TARGET BONUS") : "ESTIMATED BONUS"}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isManager && !data?.isAchieved ? "var(--primary)" : "#22c55e" }}>
                ₹{((isManager ? data?.monthlyManagerBonus : data?.incentiveAmount) ?? 0).toLocaleString("en-IN")}
              </div>
              {isManager && (
                <div style={{ fontSize: 11, fontWeight: 800, color: data?.isAchieved ? "#22c55e" : "#f59e0b", marginTop: 2 }}>
                  {data?.isAchieved ? "🎉 ACHIEVED" : `${data?.percentAchieved || 0}% REACHED`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!loading && data && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          {isManager && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Progress Bar Container */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-primary)" }}>
                    Store Revenue: ₹{(data.currentRevenue || 0).toLocaleString("en-IN")}
                  </span>
                  <span style={{ color: data.isAchieved ? "#22c55e" : "var(--text-secondary)" }}>
                    Target: ₹{(data.monthlyTargetRevenue || 0).toLocaleString("en-IN")} ({data.percentAchieved || 0}%)
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(3, Math.min(100, data.percentAchieved || 0))}%`,
                      background: data.isAchieved ? "#22c55e" : "var(--cta-bg, #F9A826)",
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>

              {/* 3 Metric Tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700 }}>MTD SALES</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                    ₹{(data.currentRevenue || 0).toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    {data.currentOrders || 0} bills completed
                  </div>
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700 }}>REVENUE MILESTONE</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--primary)", marginTop: 2 }}>
                    ₹{(data.monthlyTargetRevenue || 0).toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    {data.daysRemaining || 0} days left this month
                  </div>
                </div>

                <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700 }}>MANAGER BONUS</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", marginTop: 2 }}>
                    ₹{(data.monthlyManagerBonus || 0).toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: 11, color: data.isAchieved ? "#22c55e" : "var(--text-secondary)", fontWeight: 600, marginTop: 2 }}>
                    {data.isAchieved ? "✓ Unlocked & approved" : "Pending target achievement"}
                  </div>
                </div>
              </div>

              {/* Status Note */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  background: data.isAchieved ? "rgba(34, 197, 94, 0.1)" : "rgba(249, 168, 38, 0.1)",
                  color: data.isAchieved ? "#22c55e" : "var(--text-primary)",
                  border: `1px solid ${data.isAchieved ? "rgba(34, 197, 94, 0.25)" : "rgba(249, 168, 38, 0.25)"}`,
                  fontWeight: 600,
                }}
              >
                {data.appliedRules?.[0] || "Manager milestone tracking active."}
              </div>

              {/* Past Performance Track Record */}
              {data.history && data.history.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.5px" }}>
                    📊 Branch Performance Track Record (Past Months)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                    {data.history.map((h: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{h.month}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", marginTop: 2 }}>
                          ₹{h.revenue.toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{h.orders} orders</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isManager && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              {isCashier && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Orders Processed</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                      {data.ordersProcessed ?? 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Processed Volume</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                      ₹{(data.totalValue ?? 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                </>
              )}

              {isGuard && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Fraud Catches</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>
                      {data.fraudCatches ?? 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Value Prevented</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                      ₹{(data.fraudValuePrevented ?? 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                </>
              )}

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Applied Incentive Formula & Rules</span>
              {data.categoryBreakdown && data.categoryBreakdown.length > 0 && (
                <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>
                  {data.categoryBreakdown.length} Categories Matched
                </span>
              )}
            </div>

            {data.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {data.categoryBreakdown.map((cat: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{cat.category}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>
                        Sales: ₹{cat.eligibleSales.toLocaleString("en-IN")} • {cat.ruleDetails}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#22c55e" }}>
                      +₹{cat.incentive.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : data.appliedRules && data.appliedRules.length > 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2 }}>
                {data.appliedRules.map((rule: string, i: number) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      background: "color-mix(in srgb, #22c55e 12%, transparent)",
                      color: "#22c55e",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      marginRight: 6,
                      marginTop: 2,
                    }}
                  >
                    ✓ {rule}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: 12 }}>
                Standard performance calculation active.
              </span>
            )}
          </div>
        </div>
      )}
        </div>
      )}
    </Card>
  );
}
