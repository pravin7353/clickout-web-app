"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Input, Select, Button, ErrorBanner } from "@/components/ui";
import { getMonthlyIncentiveReport } from "@/actions/incentive";
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
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
                {canPostFinance && (
                  <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textAlign: "right" }}>ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canPostFinance ? 7 : 6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                    Computing performance metrics...
                  </td>
                </tr>
              ) : !report || report.staffPayouts.length === 0 ? (
                <tr>
                  <td colSpan={canPostFinance ? 7 : 6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
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
                      <span style={{ fontWeight: 800, color: s.incentiveAmount > 0 ? "#22c55e" : "var(--text-secondary)" }}>
                        +₹{s.incentiveAmount.toLocaleString("en-IN")}
                      </span>
                      {s.appliedRules && s.appliedRules.length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                          {s.appliedRules[0]}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 900, color: "var(--text-primary)" }}>
                      ₹{s.totalPayout.toLocaleString("en-IN")}
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
    </div>
  );
}
