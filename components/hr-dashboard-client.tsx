"use client";

import { useState, useEffect } from "react";
import { HrAttendanceTable, SimpleStaff } from "@/components/hr-attendance-table";
import { HrLeaveRequests } from "@/components/hr-leave-requests";
import { HrSalaryEditor } from "@/components/hr-salary-editor";
import { HrIncentiveTable } from "@/components/hr-incentive-table";
import { HrIncentiveRulesEditor } from "@/components/hr-incentive-rules-editor";
import { HrApprovalsInbox } from "@/components/hr-approvals-inbox";
import { HrAttendanceSettings } from "@/components/hr-attendance-settings";
import {
  getTotalPendingApprovalsCountAction,
  getSalesExecMonthlyStatsAction,
  getAllSalesExecMonthlyStatsAction,
} from "@/actions/hr";
import { QRCodeSVG } from "qrcode.react";

interface HrDashboardClientProps {
  staffList: SimpleStaff[];
  userRole: string;
  canEdit: boolean;
  storeId?: string | null;
  tenantId?: string | null;
}

export function HrDashboardClient({
  staffList,
  userRole,
  canEdit,
  storeId,
  tenantId,
}: HrDashboardClientProps) {
  const isManager = userRole === "manager";

  // 4 Core Primary Sections
  // 1. "people" -> People (Staff list, roles, branch)
  // 2. "time_leave" -> Time & Leave (Attendance log, shifts, leaves)
  // 3. "pay_incentives" -> Pay & Incentives (Salary, rules, payouts, "Why?")
  // 4. "approvals" -> Approvals (Pending badge, all approval types)
  const [activeTab, setActiveTab] = useState<"people" | "time_leave" | "pay_incentives" | "approvals">("approvals");

  // Sub-tab toggles
  const [timeSubTab, setTimeSubTab] = useState<"attendance" | "leaves">("attendance");
  const [paySubTab, setPaySubTab] = useState<"incentives" | "rules" | "salary">("incentives");

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [employeePortalUrl, setEmployeePortalUrl] = useState("/employee/login");
  const [copied, setCopied] = useState(false);

  // Live Approvals Badge Count
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Sales Executive Monthly Stats (Chunk 34C)
  const [selectedExec, setSelectedExec] = useState<SimpleStaff | null>(null);
  const [execStats, setExecStats] = useState<{
    totalAssistedOrders: number;
    totalAssistedRevenue: number;
    estimatedCommission: number;
    month: string;
  } | null>(null);
  const [loadingExecStats, setLoadingExecStats] = useState(false);
  const [allExecStatsMap, setAllExecStatsMap] = useState<
    Record<
      string,
      {
        totalAssistedOrders: number;
        totalAssistedRevenue: number;
        estimatedCommission: number;
        month: string;
      }
    >
  >({});

  const handleViewExecPerformance = async (staff: SimpleStaff) => {
    setSelectedExec(staff);
    if (!tenantId) return;
    setLoadingExecStats(true);
    try {
      const res = await getSalesExecMonthlyStatsAction({
        tenantId,
        empId: staff.empId,
      });
      if (res.ok && res.stats) {
        setExecStats(res.stats);
      }
    } catch (e) {
      // fallback
    } finally {
      setLoadingExecStats(false);
    }
  };

  const fetchPendingCount = async () => {
    try {
      const res = await getTotalPendingApprovalsCountAction();
      if (res.ok && typeof res.totalCount === "number") {
        setPendingCount(res.totalCount);
      }
    } catch (e) {
      // ignore silently
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeePortalUrl(`${window.location.origin}/employee/login`);
    }
    fetchPendingCount();

    const interval = setInterval(() => {
      fetchPendingCount();
    }, 60000); // 60s live refresh

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "people" && tenantId) {
      getAllSalesExecMonthlyStatsAction({ tenantId }).then((res) => {
        if (res.ok && res.statsMap) {
          setAllExecStatsMap(res.statsMap);
        }
      });
    }
  }, [activeTab, tenantId]);

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
            HR & Workforce Operations
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            Simplified team management: Staff roster, attendance & shifts, performance incentives, and manager approvals
            {isManager && storeId ? ` for branch [${storeId}]` : ""}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Settings Button (Moved out of primary tabs) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            style={{
              padding: "9px 15px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
          >
            <span>⚙️</span> Attendance Settings
          </button>

          {/* Get Employee App */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            style={{
              padding: "9px 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              background: "rgba(59, 130, 246, 0.1)",
              color: "var(--text-primary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.15)",
              transition: "all 0.15s ease",
            }}
          >
            <span>📱</span> Get Employee App
          </button>
        </div>
      </div>

      {/* 4 Clear Primary Navigation Tabs */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 12, overflowX: "auto" }}>
        {/* 1. People */}
        <button
          type="button"
          onClick={() => setActiveTab("people")}
          style={{
            padding: "9px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "people" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "people" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "people" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>👥</span> People ({staffList.length})
        </button>

        {/* 2. Time & Leave */}
        <button
          type="button"
          onClick={() => setActiveTab("time_leave")}
          style={{
            padding: "9px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "time_leave" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "time_leave" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "time_leave" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>🕐</span> Time & Leave
        </button>

        {/* 3. Pay & Incentives */}
        <button
          type="button"
          onClick={() => setActiveTab("pay_incentives")}
          style={{
            padding: "9px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "pay_incentives" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "pay_incentives" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "pay_incentives" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>💰</span> Pay & Incentives
        </button>

        {/* 4. Approvals Inbox with live badge */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("approvals");
            fetchPendingCount();
          }}
          style={{
            padding: "9px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            border: activeTab === "approvals" ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
            background: activeTab === "approvals" ? "var(--cta-bg)" : "var(--card-bg)",
            color: activeTab === "approvals" ? "var(--cta-text)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✅</span> Approvals
          {pendingCount > 0 ? (
            <span
              style={{
                background: "#ef4444",
                color: "#ffffff",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 900,
                marginLeft: 4,
              }}
            >
              {pendingCount}
            </span>
          ) : (
            <span
              style={{
                background: "rgba(34, 197, 94, 0.2)",
                color: "#22c55e",
                padding: "2px 7px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                marginLeft: 4,
              }}
            >
              0
            </span>
          )}
        </button>
      </div>

      {/* SECTION 1: People */}
      {activeTab === "people" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                  Store Staff & Personnel ({staffList.length})
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Active team roster, branch assignments, and system designations
                </span>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>NAME</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>EMP ID</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>DESIGNATION</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>ASSIGNED BRANCH</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>STATUS</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>ACTIONS / METRICS</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                        No personnel enrolled.
                      </td>
                    </tr>
                  ) : (
                    staffList.map((s) => {
                      const isSalesExec = s.role?.toLowerCase() === "sales_executive";
                      const isSelected = selectedExec?.id === s.id;
                      return (
                        <tr
                          key={s.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            fontSize: 13,
                            background: isSelected ? "color-mix(in srgb, var(--cta-bg) 8%, transparent)" : "transparent",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                            {s.name}
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                            {s.empId || "-"}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span
                              style={{
                                padding: "3px 10px",
                                borderRadius: 14,
                                fontSize: 11,
                                fontWeight: 800,
                                background: isSalesExec
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : s.role?.toLowerCase() === "cashier"
                                  ? "rgba(59, 130, 246, 0.15)"
                                  : s.role?.toLowerCase() === "guard"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(168, 85, 247, 0.15)",
                                color: isSalesExec
                                  ? "#10b981"
                                  : s.role?.toLowerCase() === "cashier"
                                  ? "#60a5fa"
                                  : s.role?.toLowerCase() === "guard"
                                  ? "#fbbf24"
                                  : "#c084fc",
                              }}
                            >
                              {s.role?.toUpperCase() || "STAFF"}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--text-primary)", fontWeight: 600 }}>
                            {s.branchCode || "HQ"}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span
                              style={{
                                color: s.isActive ? "#22c55e" : "#ef4444",
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {s.isActive ? "● Active" : "● Suspended"}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            {isSalesExec ? (
                              <button
                                type="button"
                                onClick={() => handleViewExecPerformance(s)}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: isSelected
                                    ? "var(--cta-bg)"
                                    : "rgba(16, 185, 129, 0.12)",
                                  color: isSelected ? "var(--cta-text)" : "#10b981",
                                  border: "1px solid rgba(16, 185, 129, 0.3)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span>📈</span>
                                <span>Monthly Performance</span>
                              </button>
                            ) : (
                              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Performance Section (Chunk 34C: Read-Only, Sourced from salesExecStats) */}
          {selectedExec && (
            <div
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>👔</span>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                      Monthly Performance — {selectedExec.name} ({selectedExec.empId})
                    </h3>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 800,
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#10b981",
                      }}
                    >
                      Sales Executive
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                    <strong>{new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}</strong> • Store: {selectedExec.branchCode || "HQ"} • Self-Checkout Referral Attribution
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedExec(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                  title="Close performance view"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--card-bg) 85%, var(--scaffold-bg))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Assisted Orders
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
                    {loadingExecStats
                      ? "..."
                      : (execStats?.totalAssistedOrders ?? allExecStatsMap[selectedExec.empId]?.totalAssistedOrders ?? 0)}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                    Total checkout referrals completed
                  </span>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--card-bg) 85%, var(--scaffold-bg))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Assisted Revenue
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>
                    {loadingExecStats
                      ? "..."
                      : `₹${(execStats?.totalAssistedRevenue ?? allExecStatsMap[selectedExec.empId]?.totalAssistedRevenue ?? 0).toLocaleString("en-IN")}`}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                    Gross sales volume attributed
                  </span>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--card-bg) 85%, var(--scaffold-bg))",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Earned Commission (estimate)
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--warning, #f59e0b)" }}>
                    {loadingExecStats
                      ? "..."
                      : `₹${(execStats?.estimatedCommission ?? allExecStatsMap[selectedExec.empId]?.estimatedCommission ?? 0).toLocaleString("en-IN")}`}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                    Calculated from active incentive rules
                  </span>
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🔒</span>
                <span>Read-only performance log sourced from <code>salesExecStats</code>. Generated automatically via customer self-checkout assist.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Time & Leave */}
      {activeTab === "time_leave" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Sub Navigation */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setTimeSubTab("attendance")}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: timeSubTab === "attendance" ? "1px solid var(--border)" : "1px solid transparent",
                background: timeSubTab === "attendance" ? "rgba(255,255,255,0.08)" : "transparent",
                color: timeSubTab === "attendance" ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              📅 Attendance Log & Shifts
            </button>
            <button
              type="button"
              onClick={() => setTimeSubTab("leaves")}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: timeSubTab === "leaves" ? "1px solid var(--border)" : "1px solid transparent",
                background: timeSubTab === "leaves" ? "rgba(255,255,255,0.08)" : "transparent",
                color: timeSubTab === "leaves" ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              🏖️ Leave Requests & Quotas
            </button>
          </div>

          {timeSubTab === "attendance" && (
            <HrAttendanceTable staffList={staffList} canEdit={canEdit} userRole={userRole} />
          )}

          {timeSubTab === "leaves" && (
            <HrLeaveRequests staffList={staffList} canEdit={canEdit} userRole={userRole} />
          )}
        </div>
      )}

      {/* SECTION 3: Pay & Incentives */}
      {activeTab === "pay_incentives" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Sub Navigation */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setPaySubTab("incentives")}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: paySubTab === "incentives" ? "1px solid var(--border)" : "1px solid transparent",
                background: paySubTab === "incentives" ? "rgba(255,255,255,0.08)" : "transparent",
                color: paySubTab === "incentives" ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              🏆 Monthly Incentives & Payouts
            </button>

            {!isManager && (
              <button
                type="button"
                onClick={() => setPaySubTab("rules")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: paySubTab === "rules" ? "1px solid var(--border)" : "1px solid transparent",
                  background: paySubTab === "rules" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: paySubTab === "rules" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                🎯 Incentive Rules Wizard
              </button>
            )}

            {!isManager && (
              <button
                type="button"
                onClick={() => setPaySubTab("salary")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: paySubTab === "salary" ? "1px solid var(--border)" : "1px solid transparent",
                  background: paySubTab === "salary" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: paySubTab === "salary" ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                💵 Base Salary Structure
              </button>
            )}
          </div>

          {paySubTab === "incentives" && (
            <HrIncentiveTable branchCode={storeId} userRole={userRole} />
          )}

          {paySubTab === "rules" && !isManager && (
            <HrIncentiveRulesEditor tenantId={tenantId} userRole={userRole} />
          )}

          {paySubTab === "salary" && !isManager && (
            <HrSalaryEditor staffList={staffList} userRole={userRole} />
          )}
        </div>
      )}

      {/* SECTION 4: Approvals Inbox */}
      {activeTab === "approvals" && (
        <HrApprovalsInbox staffList={staffList} userRole={userRole} />
      )}

      {/* ⚙️ Attendance Settings Modal */}
      {showSettingsModal && (
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
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              maxWidth: 760,
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚙️</span> Attendance & Shift Settings
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              <HrAttendanceSettings tenantId={tenantId} canEdit={canEdit} userRole={userRole} staffList={staffList} />
            </div>
          </div>
        </div>
      )}

      {/* 📱 Get Employee App Modal */}
      {showQrModal && (
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
            padding: 20,
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 28,
              maxWidth: 460,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📱</span> Employee Mobile App (PWA)
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "#ffffff", padding: 16, borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
              <QRCodeSVG value={employeePortalUrl} size={200} level="M" />
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
              Staff members can scan this QR code with their mobile camera to check in, view monthly incentives, and submit leaves.
            </p>

            <div style={{ width: "100%", display: "flex", gap: 8 }}>
              <input
                type="text"
                readOnly
                value={employeePortalUrl}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(employeePortalUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "var(--cta-bg, #22c55e)",
                  color: "var(--cta-text, #000)",
                  border: "none",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
