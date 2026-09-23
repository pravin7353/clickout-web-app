"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getPendingLeavesAction,
  getPendingRegularizationsAction,
  approveLeave,
  rejectLeave,
  approveRegularization,
  rejectRegularization,
} from "@/actions/hr";
import { SimpleStaff } from "@/components/hr-attendance-table";

interface HrApprovalsInboxProps {
  staffList?: SimpleStaff[];
  userRole: string;
}

export function HrApprovalsInbox({ staffList, userRole }: HrApprovalsInboxProps) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [regularizations, setRegularizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "LEAVES" | "REGULARIZATIONS">("ALL");
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

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [leaveRes, regRes] = await Promise.all([
        getPendingLeavesAction(),
        getPendingRegularizationsAction(),
      ]);

      if (leaveRes.ok && leaveRes.pendingLeaves) {
        setLeaves(leaveRes.pendingLeaves);
      }
      if (regRes.ok && regRes.pendingRegularizations) {
        setRegularizations(regRes.pendingRegularizations);
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to load approval requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveLeave = (staffId: string, leaveId: string) => {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const res = await approveLeave(staffId, leaveId);
      if (res.ok) {
        setActionSuccess("Leave request approved successfully.");
        await loadData();
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
        await loadData();
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
          await loadData();
        } else {
          setActionError(res.error || "Failed to reject leave.");
        }
      } else {
        const res = await rejectRegularization(rejectItem.staffId, rejectItem.id, rejectionReason);
        if (res.ok) {
          setActionSuccess("Regularization rejected.");
          setRejectItem(null);
          setRejectionReason("");
          await loadData();
        } else {
          setActionError(res.error || "Failed to reject regularization.");
        }
      }
    });
  };

  const staffMap = new Map((staffList || []).map((s) => [s.id, s]));

  const totalPending = leaves.length + regularizations.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top action bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: filter === "ALL" ? "var(--cta-bg)" : "var(--card-bg)",
              color: filter === "ALL" ? "var(--cta-text)" : "var(--text-secondary)",
            }}
          >
            All Pending ({totalPending})
          </button>
          <button
            type="button"
            onClick={() => setFilter("LEAVES")}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: filter === "LEAVES" ? "var(--cta-bg)" : "var(--card-bg)",
              color: filter === "LEAVES" ? "var(--cta-text)" : "var(--text-secondary)",
            }}
          >
            🌴 Leaves ({leaves.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("REGULARIZATIONS")}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: filter === "REGULARIZATIONS" ? "var(--cta-bg)" : "var(--card-bg)",
              color: filter === "REGULARIZATIONS" ? "var(--cta-text)" : "var(--text-secondary)",
            }}
          >
            ⏱️ Regularizations ({regularizations.length})
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading || isPending}
          style={{
            padding: "6px 14px",
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
            All leave and attendance regularization requests have been reviewed.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Leaves Section */}
          {(filter === "ALL" || filter === "LEAVES") && leaves.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🌴</span> Pending Leave Requests ({leaves.length})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                {leaves.map((leave) => {
                  const staff = staffMap.get(leave.staffId);
                  const staffName = staff?.name || leave.staffName || `Staff (${leave.staffId})`;
                  const empId = staff?.empId || leave.empId || "";
                  const branch = staff?.branchCode || leave.branchCode || "HQ";

                  return (
                    <div
                      key={leave.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: "var(--card-bg)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
                            {staffName}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            {empId ? `${empId} • ` : ""}Branch: {branch}
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

                      <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: 12 }}>
                          <span>Duration:</span>
                          <strong style={{ color: "var(--text-primary)" }}>
                            {leave.fromDate} → {leave.toDate}
                          </strong>
                        </div>
                        {leave.reason && (
                          <div style={{ marginTop: 6, color: "var(--text-primary)", fontStyle: "italic", fontSize: 12 }}>
                            "{leave.reason}"
                          </div>
                        )}
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
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "#22c55e",
                            color: "#ffffff",
                            border: "none",
                          }}
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRejectItem({
                              type: "LEAVE",
                              staffId: leave.staffId,
                              id: leave.id,
                              name: staffName,
                            })
                          }
                          disabled={isPending}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "transparent",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regularizations Section */}
          {(filter === "ALL" || filter === "REGULARIZATIONS") && regularizations.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>⏱️</span> Pending Attendance Regularizations ({regularizations.length})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
                {regularizations.map((reg) => {
                  const staff = staffMap.get(reg.staffId);
                  const staffName = staff?.name || reg.staffName || `Staff (${reg.staffId})`;
                  const empId = staff?.empId || reg.empId || "";
                  const branch = staff?.branchCode || reg.branchCode || "HQ";

                  return (
                    <div
                      key={reg.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: "var(--card-bg)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
                            {staffName}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            {empId ? `${empId} • ` : ""}Branch: {branch}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                          }}
                        >
                          {reg.requestType.replace("_", " ")}
                        </span>
                      </div>

                      <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: 12 }}>
                          <span>Target Date:</span>
                          <strong style={{ color: "var(--text-primary)" }}>{reg.date}</strong>
                        </div>
                        {reg.reason && (
                          <div style={{ marginTop: 6, color: "var(--text-primary)", fontStyle: "italic", fontSize: 12 }}>
                            "{reg.reason}"
                          </div>
                        )}
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
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "#22c55e",
                            color: "#ffffff",
                            border: "none",
                          }}
                        >
                          ✓ Approve & Fix
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRejectItem({
                              type: "REGULARIZATION",
                              staffId: reg.staffId,
                              id: reg.id,
                              name: staffName,
                            })
                          }
                          disabled={isPending}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            background: "transparent",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
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
              Reject {rejectItem.type === "LEAVE" ? "Leave" : "Regularization"} Request
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Provide an optional reason for rejecting the request from{" "}
              <strong>{rejectItem.name}</strong>.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Critical store shift / Unverified attendance"
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
    </div>
  );
}
