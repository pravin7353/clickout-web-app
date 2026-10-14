"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Input, Select, Button, ErrorBanner } from "@/components/ui";
import { getMonthlyIncentiveReport, getMyIncentive } from "@/actions/incentive";
import { postIncentiveVoucherAction } from "@/actions/finance";
import { MonthlyIncentiveReport } from "@/lib/services/incentive-service";

interface HrIncentiveTableProps {
  branchCode?: string | null;
  userRole: string;
}

export function HrIncentiveTable({ branchCode, userRole }: HrIncentiveTableProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedBranch, setSelectedBranch] = useState<string>(branchCode || "HQ");
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<MonthlyIncentiveReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [postingStaffId, setPostingStaffId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // "Why this amount?" Breakdown Drawer State
  const [whyDrawerStaff, setWhyDrawerStaff] = useState<any | null>(null);
  const [whyDrawerData, setWhyDrawerData] = useState<any | null>(null);
  const [whyLoading, setWhyLoading] = useState<boolean>(false);
  const [whyError, setWhyError] = useState<string | null>(null);

  const isManager = userRole === "manager";
  const canPostFinance = userRole === "tenant_admin" || userRole === "super_admin";

  const handlePostIncentive = async (staffId: string, staffName: string, amount: number) => {
    setPostingStaffId(staffId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await postIncentiveVoucherAction(staffId, selectedMonth, amount);
      if (!res.ok) {
        setErrorMsg(res.error || `Failed to post incentive for ${staffName}.`);
      } else if (res.alreadyPosted) {
        setSuccessMsg(`Incentive for ${staffName} (${selectedMonth}) was already posted as Voucher #${res.voucherNo || ""}.`);
      } else {
        setSuccessMsg(`Successfully booked incentive of ₹${amount.toLocaleString("en-IN")} for ${staffName} (${selectedMonth}) as Voucher #${res.voucherNo || ""}.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to post incentive voucher.");
    } finally {
      setPostingStaffId(null);
    }
  };

  const loadReport = async (branch: string, month: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await getMonthlyIncentiveReport(branch, month);
      if (res.ok && res.report) {
        setReport(res.report);
      } else {
        setErrorMsg("Failed to generate monthly incentive report.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load incentive report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(selectedBranch, selectedMonth);
  }, [selectedBranch, selectedMonth]);

  const handleOpenWhyDrawer = async (staff: any) => {
    setWhyDrawerStaff(staff);
    setWhyDrawerData(null);
    setWhyLoading(true);
    setWhyError(null);

    try {
      const res = await getMyIncentive(staff.staffId, selectedMonth);
      if (res.ok && res.incentive) {
        setWhyDrawerData(res.incentive);
      } else {
        setWhyError(res.error || "Breakdown details could not be loaded.");
      }
    } catch (err: any) {
      setWhyError(err.message || "Failed to load breakdown details.");
    } finally {
      setWhyLoading(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge color="#22c55e">✅ Approved</Badge>;
      case "AUTO_APPROVED":
        return <Badge color="#3b82f6">⚡ Auto-Approved</Badge>;
      case "REJECTED":
        return <Badge color="#ef4444">❌ Rejected</Badge>;
      case "PENDING_MANAGER_APPROVAL":
      default:
        return <Badge color="#f59e0b">⏳ Pending Approval</Badge>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Controls */}
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                SELECT MONTH
              </label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ minWidth: 160 }}
              />
            </div>

            {!isManager && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  BRANCH FILTER
                </label>
                <Input
                  type="text"
                  placeholder="e.g. HQ or ALL"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  style={{ minWidth: 140 }}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadReport(selectedBranch, selectedMonth)}
            disabled={loading}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "8px 16px",
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            🔄 Refresh Report
          </button>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}
      {successMsg && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", fontSize: 13, fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Aggregate KPI Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total Incentive Payout</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e" }}>
            ₹{(report?.totalIncentivePayout ?? 0).toLocaleString("en-IN")}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total Base Salaries</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>
            ₹{(report?.totalBaseSalaries ?? 0).toLocaleString("en-IN")}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total Gross Payroll</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--cta-bg, #F9A826)" }}>
            ₹{(report?.totalGrossPayout ?? 0).toLocaleString("en-IN")}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Cashier Orders Processed</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>
            {report?.totalOrdersProcessed ?? 0}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Guard Fraud Intercepts</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444" }}>
            {report?.totalFraudCatches ?? 0}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            ₹{(report?.totalFraudValuePrevented ?? 0).toLocaleString("en-IN")} saved
          </div>
        </Card>
      </div>

      {/* Staff Breakdown Table */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
              Monthly Staff Performance & Incentive Roster
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Branch [{selectedBranch}] • {selectedMonth}
            </span>
          </div>
          {loading && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Calculating...</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>EMPLOYEE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>ROLE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>PERFORMANCE METRIC</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BASE SALARY</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>INCENTIVE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>TOTAL PAYOUT</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>STATUS</th>
                {canPostFinance && (
                  <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textAlign: "right" }}>ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canPostFinance ? 8 : 7} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                    Computing performance metrics...
                  </td>
                </tr>
              ) : !report || report.staffPayouts.length === 0 ? (
                <tr>
                  <td colSpan={canPostFinance ? 8 : 7} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    No staff records found for this branch and month.
                  </td>
                </tr>
              ) : (
                report.staffPayouts.map((s) => (
                  <tr key={s.staffId} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {s.empId ? `${s.empId} • ` : ""}{s.branchCode}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <Badge
                        color={
                          s.role.toLowerCase() === "cashier"
                            ? "#3b82f6"
                            : s.role.toLowerCase() === "guard"
                            ? "#f59e0b"
                            : "var(--text-secondary)"
                        }
                      >
                        {s.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {s.role.toLowerCase() === "cashier" && (
                        <div>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                            {s.ordersProcessed ?? 0} orders
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>
                            ₹{(s.totalValue ?? 0).toLocaleString("en-IN")} vol
                          </span>
                        </div>
                      )}
                      {s.role.toLowerCase() === "guard" && (
                        <div>
                          <span style={{ fontWeight: 700, color: "#ef4444" }}>
                            {s.fraudCatches ?? 0} catches
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>
                            ₹{(s.fraudValuePrevented ?? 0).toLocaleString("en-IN")} saved
                          </span>
                        </div>
                      )}
                      {s.role.toLowerCase() !== "cashier" && s.role.toLowerCase() !== "guard" && (
                        <span style={{ color: "var(--text-secondary)" }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                      ₹{s.baseSalary.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, color: s.incentiveAmount > 0 ? "#22c55e" : "var(--text-secondary)" }}>
                          +₹{s.incentiveAmount.toLocaleString("en-IN")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenWhyDrawer(s)}
                          style={{
                            background: "rgba(59, 130, 246, 0.12)",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            color: "#60a5fa",
                            borderRadius: 6,
                            padding: "2px 7px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Why? →
                        </button>
                      </div>
                      {s.appliedRules && s.appliedRules.length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                          {s.appliedRules[0]}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 900, color: "var(--text-primary)" }}>
                      ₹{s.totalPayout.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {getStatusBadge(s.status)}
                    </td>
                    {canPostFinance && (
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          onClick={() => handlePostIncentive(s.staffId, s.name, s.incentiveAmount)}
                          disabled={postingStaffId === s.staffId || s.incentiveAmount <= 0}
                          style={{ fontSize: 12, padding: "6px 12px" }}
                        >
                          {postingStaffId === s.staffId ? "Posting..." : "📑 Post to Finance"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* "Why this amount?" Transparency Drawer / Modal */}
      {whyDrawerStaff && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setWhyDrawerStaff(null)}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              maxWidth: 560,
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🔍</span>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    Incentive Breakdown Transparency
                  </h3>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {whyDrawerStaff.name} ({whyDrawerStaff.role.toUpperCase()}) • {selectedMonth}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWhyDrawerStaff(null)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
              {whyLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                  Calculating transparent formula breakdown...
                </div>
              ) : whyError ? (
                <div style={{ padding: 14, borderRadius: 10, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: 13 }}>
                  ⚠️ {whyError}
                </div>
              ) : whyDrawerData ? (
                <>
                  {/* Summary Bar */}
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 16,
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 12,
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Base Salary</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                        ₹{(whyDrawerStaff.baseSalary || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Incentive Bonus</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#22c55e", marginTop: 2 }}>
                        ₹{(whyDrawerData.incentiveAmount || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total Payout</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "var(--cta-bg, #F9A826)", marginTop: 2 }}>
                        ₹{((whyDrawerStaff.baseSalary || 0) + (whyDrawerData.incentiveAmount || 0)).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  {/* Cashier Specific Breakdown */}
                  {whyDrawerStaff.role.toLowerCase() === "cashier" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
                        SALES & ELIGIBILITY BREAKDOWN
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(255,255,255,0.02)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-secondary)" }}>Total Sales Processed:</span>
                          <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                            ₹{(whyDrawerData.totalValue || 0).toLocaleString("en-IN")} ({whyDrawerData.ordersProcessed || 0} orders)
                          </span>
                        </div>

                        {whyDrawerData.categoryBreakdown && whyDrawerData.categoryBreakdown.length > 0 ? (
                          whyDrawerData.categoryBreakdown.map((cat: any, i: number) => (
                            <div key={i} style={{ borderTop: "1px dashed var(--border)", paddingTop: 8, marginTop: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                <span style={{ fontWeight: 700, color: "#60a5fa" }}>Category: {cat.category}</span>
                                <span style={{ fontWeight: 800, color: "#22c55e" }}>+₹{cat.incentive.toFixed(2)}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                Eligible Sales: ₹{cat.eligibleSales.toLocaleString("en-IN")} ({cat.qualifyingOrdersCount} qualifying sales)
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                Rule Formula: {cat.ruleDetails}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>
                            Standard category baseline applied across all checkouts.
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.02)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-secondary)" }}>Gross Incentive:</span>
                          <span style={{ fontWeight: 700 }}>₹{(whyDrawerData.incentiveAmount || 0).toFixed(2)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-secondary)" }}>Adjustments / Penalties:</span>
                          <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>₹0.00</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                          <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>Final Incentive:</span>
                          <span style={{ fontWeight: 900, color: "#22c55e" }}>₹{(whyDrawerData.incentiveAmount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Guard Specific Breakdown */}
                  {whyDrawerStaff.role.toLowerCase() === "guard" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
                        THEFT PREVENTION BREAKDOWN
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(255,255,255,0.02)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-secondary)" }}>Verified Fraud Intercepts:</span>
                          <span style={{ fontWeight: 800, color: "#ef4444" }}>
                            {whyDrawerData.fraudCatches || 0} catches
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-secondary)" }}>Total Value Prevented / Saved:</span>
                          <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                            ₹{(whyDrawerData.fraudValuePrevented || 0).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      <div style={{ background: "rgba(255,255,255,0.02)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                          Applied Guard Security Rules:
                        </div>
                        {whyDrawerData.appliedRules && whyDrawerData.appliedRules.length > 0 ? (
                          whyDrawerData.appliedRules.map((r: string, idx: number) => (
                            <div key={idx} style={{ fontSize: 12, color: "#22c55e", marginBottom: 4 }}>
                              ✓ {r}
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            Standard security gate catch baseline applied.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Approval Status Card */}
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>APPROVAL STATUS</div>
                      <div style={{ marginTop: 4 }}>{getStatusBadge(whyDrawerData.status)}</div>
                      {whyDrawerData.approvedBy && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                          Approved by: {whyDrawerData.approvedBy}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Auto-Approve Limit</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                        ₹{whyDrawerData.autoApproveThreshold ?? 500}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 10,
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🖨️ Export Statement / Print
              </button>

              <button
                type="button"
                onClick={() => setWhyDrawerStaff(null)}
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 10,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
