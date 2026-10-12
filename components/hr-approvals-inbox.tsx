"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getPendingLeavesAction,
  getPendingRegularizationsAction,
  getPendingHrQueriesAction,
  getApprovalHistoryAction,
  approveLeave,
  rejectLeave,
  approveRegularization,
  rejectRegularization,
  resolveHrQueryAction,
} from "@/actions/hr";
import { SimpleStaff } from "@/components/hr-attendance-table";

interface HrApprovalsInboxProps {
  staffList?: SimpleStaff[];
  userRole: string;
}

export function HrApprovalsInbox({ staffList, userRole }: HrApprovalsInboxProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Main Tab State: "PENDING" | "HISTORY"
  const [mainTab, setMainTab] = useState<"PENDING" | "HISTORY">("PENDING");

  // Pending State
  const [leaves, setLeaves] = useState<any[]>([]);
  const [regularizations, setRegularizations] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFilter, setPendingFilter] = useState<"ALL" | "LEAVES" | "REGULARIZATIONS" | "QUERIES">("ALL");

  // History / Archive State
  const [historyMonth, setHistoryMonth] = useState<string>(currentMonthStr);
  const [historyCategory, setHistoryCategory] = useState<"ALL" | "LEAVES" | "REGULARIZATIONS" | "QUERIES">("ALL");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("ALL");
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyLeaves, setHistoryLeaves] = useState<any[]>([]);
  const [historyRegs, setHistoryRegs] = useState<any[]>([]);
  const [historyQueries, setHistoryQueries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject modal state
  const [rejectItem, setRejectItem] = useState<{
    type: "LEAVE" | "REGULARIZATION";
    staffId: string;
    id: string;
    name: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Resolve Query modal state
  const [resolveQueryItem, setResolveQueryItem] = useState<{
    staffId: string;
    id: string;
    name: string;
    subject: string;
  } | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const loadPendingData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [leaveRes, regRes, queryRes] = await Promise.all([
        getPendingLeavesAction(),
        getPendingRegularizationsAction(),
        getPendingHrQueriesAction(),
      ]);

      if (leaveRes.ok && leaveRes.pendingLeaves) {
        setLeaves(leaveRes.pendingLeaves);
      }
      if (regRes.ok && regRes.pendingRegularizations) {
        setRegularizations(regRes.pendingRegularizations);
      }
      if (queryRes.ok && queryRes.pendingQueries) {
        setQueries(queryRes.pendingQueries);
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to load approval requests.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryData = async (month: string) => {
    setHistoryLoading(true);
    try {
      const res = await getApprovalHistoryAction(month);
      if (res.ok && res.history) {
        setHistoryList(res.history);
        setHistoryLeaves(res.leaves || []);
        setHistoryRegs(res.regularizations || []);
        setHistoryQueries(res.queries || []);
      }
    } catch (err: any) {
      console.error("Failed to load approval history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadPendingData();
    loadHistoryData(historyMonth);
  }, []);

  useEffect(() => {
    if (mainTab === "HISTORY") {
      loadHistoryData(historyMonth);
    }
  }, [mainTab, historyMonth]);

  const handleApproveLeave = (staffId: string, leaveId: string) => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await approveLeave(staffId, leaveId);
      if (res.ok) {
        setActionSuccess("Leave request approved successfully.");
        await loadPendingData();
        loadHistoryData(historyMonth);
      } else {
        setActionError(res.error || "Failed to approve leave.");
      }
    });
  };

  const handleApproveRegularization = (staffId: string, reqId: string) => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await approveRegularization(staffId, reqId);
      if (res.ok) {
        setActionSuccess("Attendance regularization approved successfully.");
        await loadPendingData();
        loadHistoryData(historyMonth);
      } else {
        setActionError(res.error || "Failed to approve regularization.");
      }
    });
  };

  const handleConfirmReject = () => {
    if (!rejectItem) return;
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      if (rejectItem.type === "LEAVE") {
        const res = await rejectLeave(rejectItem.staffId, rejectItem.id, rejectionReason);
        if (res.ok) {
          setActionSuccess("Leave rejected.");
          setRejectItem(null);
          setRejectionReason("");
          await loadPendingData();
          loadHistoryData(historyMonth);
        } else {
          setActionError(res.error || "Failed to reject leave.");
        }
      } else {
        const res = await rejectRegularization(rejectItem.staffId, rejectItem.id, rejectionReason);
        if (res.ok) {
          setActionSuccess("Regularization rejected.");
          setRejectItem(null);
          setRejectionReason("");
          await loadPendingData();
          loadHistoryData(historyMonth);
        } else {
          setActionError(res.error || "Failed to reject regularization.");
        }
      }
    });
  };

  const handleResolveQuery = () => {
    if (!resolveQueryItem) return;
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await resolveHrQueryAction(
        resolveQueryItem.staffId,
        resolveQueryItem.id,
        resolutionNote
      );
      if (res.ok) {
        setActionSuccess("Query marked as resolved.");
        setResolveQueryItem(null);
        setResolutionNote("");
        await loadPendingData();
        loadHistoryData(historyMonth);
      } else {
        setActionError(res.error || "Failed to resolve query.");
      }
    });
  };

  const staffMap = new Map((staffList || []).map((s) => [s.id, s]));
  const totalPending = leaves.length + regularizations.length + queries.length;

  const filteredHistory = historyList.filter((item) => {
    if (historyCategory === "LEAVES" && item.type !== "LEAVE") return false;
    if (historyCategory === "REGULARIZATIONS" && item.type !== "REGULARIZATION") return false;
    if (historyCategory === "QUERIES" && item.type !== "QUERY") return false;
    if (historyStatusFilter !== "ALL" && item.status !== historyStatusFilter) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Filter Tabs: All Pending, Leaves, Regularizations, HR Queries, and History */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => { setMainTab("PENDING"); setPendingFilter("ALL"); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: mainTab === "PENDING" && pendingFilter === "ALL" ? "var(--cta-bg)" : "var(--card-bg)",
              color: mainTab === "PENDING" && pendingFilter === "ALL" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            All Pending ({totalPending})
          </button>
          <button
            type="button"
            onClick={() => { setMainTab("PENDING"); setPendingFilter("LEAVES"); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: mainTab === "PENDING" && pendingFilter === "LEAVES" ? "var(--cta-bg)" : "var(--card-bg)",
              color: mainTab === "PENDING" && pendingFilter === "LEAVES" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            🌴 Leaves ({leaves.length})
          </button>
          <button
            type="button"
            onClick={() => { setMainTab("PENDING"); setPendingFilter("REGULARIZATIONS"); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: mainTab === "PENDING" && pendingFilter === "REGULARIZATIONS" ? "var(--cta-bg)" : "var(--card-bg)",
              color: mainTab === "PENDING" && pendingFilter === "REGULARIZATIONS" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            ⏱️ Regularizations ({regularizations.length})
          </button>
          <button
            type="button"
            onClick={() => { setMainTab("PENDING"); setPendingFilter("QUERIES"); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: mainTab === "PENDING" && pendingFilter === "QUERIES" ? "var(--cta-bg)" : "var(--card-bg)",
              color: mainTab === "PENDING" && pendingFilter === "QUERIES" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            💬 HR Queries ({queries.length})
          </button>
          <button
            type="button"
            onClick={() => setMainTab("HISTORY")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: mainTab === "HISTORY" ? "var(--cta-bg)" : "var(--card-bg)",
              color: mainTab === "HISTORY" ? "var(--cta-text)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
            }}
          >
            📜 History ({historyList.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            loadPendingData();
            loadHistoryData(historyMonth);
          }}
          disabled={loading || historyLoading || isPending}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            color: "var(--text-primary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {actionError && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#22c55e",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ✅ {actionSuccess}
        </div>
      )}

      {/* VIEW 1: PENDING INBOX */}
      {mainTab === "PENDING" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {loading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--text-secondary)",
                background: "var(--card-bg)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              ⏳ Loading pending approval requests...
            </div>
          ) : totalPending === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--text-secondary)",
                background: "var(--card-bg)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 32 }}>🎉</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                Inbox Zero! No pending requests.
              </div>
              <div style={{ fontSize: 13 }}>
                All leave applications and attendance regularization requests have been reviewed.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Leaves Section */}
              {(pendingFilter === "ALL" || pendingFilter === "LEAVES") && leaves.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🌴</span> Pending Leave Requests ({leaves.length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                    {leaves.map((leave) => {
                      const staff = staffMap.get(leave.staffId);
                      const staffName = staff?.name || leave.staffName || `Staff (${leave.staffId})`;
                      const empId = staff?.empId || leave.staffEmpId || "";
                      const branch = staff?.branchCode || leave.branchCode || "HQ";

                      return (
                        <div
                          key={leave.id}
                          style={{
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{staffName}</div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {empId && `[${empId}] `}• {branch}
                              </div>
                            </div>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#3b82f6",
                              }}
                            >
                              {leave.type} LEAVE
                            </span>
                          </div>

                          <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
                            <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>Duration:</div>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                              {leave.fromDate} → {leave.toDate}
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                            <strong>Reason:</strong> {leave.reason}
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                            <button
                              type="button"
                              onClick={() => handleApproveLeave(leave.staffId, leave.id)}
                              disabled={isPending}
                              style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "#16a34a",
                                border: "none",
                                color: "#fff",
                              }}
                            >
                              ✅ Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectItem({ type: "LEAVE", staffId: leave.staffId, id: leave.id, name: staffName })}
                              disabled={isPending}
                              style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                color: "#ef4444",
                              }}
                            >
                              ❌ Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Regularizations Section */}
              {(pendingFilter === "ALL" || pendingFilter === "REGULARIZATIONS") && regularizations.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>⏱️</span> Pending Regularizations ({regularizations.length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                    {regularizations.map((reg) => {
                      const staff = staffMap.get(reg.staffId);
                      const staffName = staff?.name || reg.staffName || `Staff (${reg.staffId})`;
                      const empId = staff?.empId || reg.staffEmpId || "";
                      const branch = staff?.branchCode || reg.branchCode || "HQ";

                      return (
                        <div
                          key={reg.id}
                          style={{
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{staffName}</div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {empId && `[${empId}] `}• {branch}
                              </div>
                            </div>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background: "rgba(234, 179, 8, 0.15)",
                                color: "#eab308",
                              }}
                            >
                              {reg.requestType?.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
                            <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>Target Date:</div>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{reg.date}</div>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                            <strong>Reason:</strong> {reg.reason}
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                            <button
                              type="button"
                              onClick={() => handleApproveRegularization(reg.staffId, reg.id)}
                              disabled={isPending}
                              style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "#16a34a",
                                border: "none",
                                color: "#fff",
                              }}
                            >
                              ✅ Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectItem({ type: "REGULARIZATION", staffId: reg.staffId, id: reg.id, name: staffName })}
                              disabled={isPending}
                              style={{
                                flex: 1,
                                padding: "8px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                color: "#ef4444",
                              }}
                            >
                              ❌ Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* HR Queries Section */}
              {(pendingFilter === "ALL" || pendingFilter === "QUERIES") && queries.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>💬</span> Open HR Queries ({queries.length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                    {queries.map((q) => {
                      const staff = staffMap.get(q.staffId);
                      const staffName = staff?.name || q.staffName || `Staff (${q.staffId})`;

                      return (
                        <div
                          key={q.id}
                          style={{
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>{staffName}</div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{q.branchCode || "HQ"}</div>
                            </div>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background: "rgba(168, 85, 247, 0.15)",
                                color: "#a855f7",
                              }}
                            >
                              OPEN QUERY
                            </span>
                          </div>

                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{q.subject}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4, background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8 }}>
                            {q.message}
                          </div>

                          <button
                            type="button"
                            onClick={() => setResolveQueryItem({ staffId: q.staffId, id: q.id, name: staffName, subject: q.subject })}
                            disabled={isPending}
                            style={{
                              marginTop: "auto",
                              padding: "8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              background: "#3b82f6",
                              border: "none",
                              color: "#fff",
                            }}
                          >
                            💬 Mark as Resolved
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: MONTHLY APPROVALS ARCHIVE */}
      {mainTab === "HISTORY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* History Filters Header */}
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Month:</label>
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Type:</label>
                <select
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Types</option>
                  <option value="LEAVES">Leaves</option>
                  <option value="REGULARIZATIONS">Regularizations</option>
                  <option value="QUERIES">HR Queries</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Status:</label>
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Showing {filteredHistory.length} record{filteredHistory.length === 1 ? "" : "s"} for {historyMonth}
            </div>
          </div>

          {/* History Records Table */}
          {historyLoading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--text-secondary)",
                background: "var(--card-bg)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              ⏳ Loading approvals history for {historyMonth}...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--text-secondary)",
                background: "var(--card-bg)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 32 }}>📁</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                No approval records found for {historyMonth}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                No leave requests, attendance regularizations, or HR queries have been resolved in this period.
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.15)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <th style={{ padding: "12px 16px" }}>Employee</th>
                      <th style={{ padding: "12px 16px" }}>Request Type</th>
                      <th style={{ padding: "12px 16px" }}>Status</th>
                      <th style={{ padding: "12px 16px" }}>Decision Info</th>
                      <th style={{ padding: "12px 16px" }}>Request Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item) => {
                      const isApproved = item.status === "APPROVED";
                      const isRejected = item.status === "REJECTED";

                      return (
                        <tr key={`${item.type}_${item.id}`} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
                              {item.staffName}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              {item.staffEmpId ? `[${item.staffEmpId}]` : ""} • Branch: {item.branchCode || "HQ"}
                            </div>
                          </td>

                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background:
                                  item.type === "LEAVE"
                                    ? "rgba(59, 130, 246, 0.15)"
                                    : item.type === "REGULARIZATION"
                                    ? "rgba(234, 179, 8, 0.15)"
                                    : "rgba(168, 85, 247, 0.15)",
                                color:
                                  item.type === "LEAVE"
                                    ? "#3b82f6"
                                    : item.type === "REGULARIZATION"
                                    ? "#eab308"
                                    : "#a855f7",
                              }}
                            >
                              {item.type === "LEAVE"
                                ? "🌴 Leave"
                                : item.type === "REGULARIZATION"
                                ? "⏱️ Regularization"
                                : "💬 HR Query"}
                            </span>
                            {item.originalRequestDate && (
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                                Req: {item.originalRequestDate}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background: isApproved
                                  ? "rgba(34, 197, 94, 0.15)"
                                  : isRejected
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(59, 130, 246, 0.15)",
                                color: isApproved ? "#22c55e" : isRejected ? "#ef4444" : "#3b82f6",
                                border: `1px solid ${
                                  isApproved
                                    ? "rgba(34, 197, 94, 0.3)"
                                    : isRejected
                                    ? "rgba(239, 68, 68, 0.3)"
                                    : "rgba(59, 130, 246, 0.3)"
                                }`,
                              }}
                            >
                              {item.status}
                            </span>
                          </td>

                          <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                              {item.decisionDate || "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                              By: <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.decisionBy || "Manager"}</span>
                            </div>
                          </td>

                          <td style={{ padding: "14px 16px", verticalAlign: "top", maxWidth: 420 }}>
                            {item.type === "LEAVE" && (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                  {item.leaveType} Leave: {item.dates}
                                </div>
                                {item.reason && (
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                                    Reason: <span style={{ color: "var(--text-primary)" }}>{item.reason}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {item.type === "REGULARIZATION" && (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                  Date: {item.date} → Requested:{" "}
                                  <span style={{ color: "#22c55e", fontWeight: 800 }}>{item.requestedStatus}</span>
                                  {item.originalStatus && (
                                    <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
                                      {" "}
                                      (was {item.originalStatus})
                                    </span>
                                  )}
                                </div>
                                {item.reason && (
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                                    Reason: <span style={{ color: "var(--text-primary)" }}>{item.reason}</span>
                                  </div>
                                )}
                                {item.rejectionReason && (
                                  <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2, fontWeight: 600 }}>
                                    Rejection Note: {item.rejectionReason}
                                  </div>
                                )}
                              </div>
                            )}

                            {item.type === "QUERY" && (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                  {item.subject ? `${item.subject}: ` : ""}
                                  <span style={{ fontWeight: 500 }}>"{item.queryText}"</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                                  Response:{" "}
                                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                                    "{item.responseText}"
                                  </span>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 440,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              Reject {rejectItem.type === "LEAVE" ? "Leave Application" : "Regularization Request"}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Are you sure you want to reject this request for <strong>{rejectItem.name}</strong>?
            </p>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Reason for Rejection (Optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Critical sales event during this period..."
                rows={3}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setRejectItem(null)}
                disabled={isPending}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isPending}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "#ef4444",
                  border: "none",
                  color: "#ffffff",
                }}
              >
                {isPending ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Query Modal */}
      {resolveQueryItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 460,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              Resolve Staff HR Query
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Resolving query "<strong>{resolveQueryItem.subject}</strong>" from <strong>{resolveQueryItem.name}</strong>.
            </p>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Resolution Note (Optional)
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="e.g. Discussed with employee and payroll adjustment processed."
                rows={3}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setResolveQueryItem(null)}
                disabled={isPending}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveQuery}
                disabled={isPending}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "#22c55e",
                  border: "none",
                  color: "#ffffff",
                }}
              >
                {isPending ? "Resolving..." : "Confirm Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
