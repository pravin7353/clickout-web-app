"use client";

import { useState, useTransition } from "react";
import {
  applyLeave,
  submitRegularization,
  submitHrQueryAction,
  getEmployeeDashboardDataAction,
} from "@/actions/hr";
import { LeaveType, RegularizationType } from "@/lib/schemas/hr-schema";
import { BottomSheet } from "@/components/employee/bottom-sheet";
import { handleEmployeeSessionRevocation } from "@/lib/utils/device";

async function handleRevocationCheck(resOrErr: any): Promise<boolean> {
  const errMsg = typeof resOrErr === "string" ? resOrErr : resOrErr?.error || resOrErr?.message;
  if (errMsg === "SESSION_REVOKED" || errMsg?.includes("SESSION_REVOKED")) {
    await handleEmployeeSessionRevocation();
    return true;
  }
  return false;
}

const REGULARIZATION_LABELS: Record<string, string> = {
  LATE_JUSTIFY: "Late Arrival Justification",
  WFH: "Work From Home",
  OUTSIDE_OFFICE: "Working Outside Office (OD)",
  MEETING: "Off-site Meeting",
  ABSENT_TO_LEAVE: "Convert Absent to Leave",
  FORGOT_CHECKIN: "Forgot Check-in",
  FORGOT_CHECKOUT: "Forgot Check-out",
  DEVICE_ISSUE: "GPS / Technical Issue",
  OTHER: "Other Reason",
};

interface RequestsTabClientProps {
  initialData: any;
  defaultTab?: "LEAVES" | "REGULARIZATIONS" | "QUERIES";
  defaultDate?: string;
  defaultAction?: string;
}

export function RequestsTabClient({
  initialData,
  defaultTab = "LEAVES",
  defaultDate,
  defaultAction,
}: RequestsTabClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [activeTab, setActiveTab] = useState<"LEAVES" | "REGULARIZATIONS" | "QUERIES">(defaultTab);
  const [isPending, startTransition] = useTransition();

  // Bottom sheets
  const [showLeaveSheet, setShowLeaveSheet] = useState(defaultAction === "apply");
  const [showRegSheet, setShowRegSheet] = useState(Boolean(defaultDate));
  const [showQuerySheet, setShowQuerySheet] = useState(false);

  // Leave Form
  const [leaveType, setLeaveType] = useState<LeaveType>("PL");
  const [leaveFrom, setLeaveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [leaveTo, setLeaveTo] = useState(new Date().toISOString().split("T")[0]);
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveMsg, setLeaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Regularization Form
  const [regDate, setRegDate] = useState(defaultDate || new Date().toISOString().split("T")[0]);
  const [regType, setRegType] = useState<string>("LATE_JUSTIFY");
  const [regReason, setRegReason] = useState("");
  const [regMsg, setRegMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Query Form
  const [querySubject, setQuerySubject] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [queryMsg, setQueryMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const staff = data?.staff;
  const leaves = data?.leaves || [];
  const regularizations = data?.regularizations || [];
  const hrQueries = data?.hrQueries || [];

  const refreshData = async () => {
    try {
      const res = await getEmployeeDashboardDataAction();
      if (!res.ok) {
        if (await handleRevocationCheck(res)) return;
      } else if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      if (await handleRevocationCheck(err)) return;
    }
  };

  const handleApplyLeave = () => {
    setLeaveMsg(null);
    if (!leaveReason.trim()) {
      setLeaveMsg({ type: "error", text: "Please provide a reason for the leave." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await applyLeave(staff?.id, leaveFrom, leaveTo, leaveType, leaveReason);
        if (res.ok) {
          setLeaveMsg({ type: "success", text: "Leave application submitted!" });
          setLeaveReason("");
          await refreshData();
          setTimeout(() => setShowLeaveSheet(false), 1200);
        } else {
          if (await handleRevocationCheck(res)) return;
          setLeaveMsg({ type: "error", text: res.error || "Failed to submit leave application." });
        }
      } catch (err: any) {
        if (await handleRevocationCheck(err)) return;
        setLeaveMsg({ type: "error", text: err?.message || "Failed to submit leave application." });
      }
    });
  };

  const handleApplyRegularization = () => {
    setRegMsg(null);
    if (!regReason.trim()) {
      setRegMsg({ type: "error", text: "Please provide a reason for regularization." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitRegularization(regDate, regType as RegularizationType, regReason);
        if (res.ok) {
          setRegMsg({ type: "success", text: "Regularization request submitted!" });
          setRegReason("");
          await refreshData();
          setTimeout(() => setShowRegSheet(false), 1200);
        } else {
          if (await handleRevocationCheck(res)) return;
          setRegMsg({ type: "error", text: res.error || "Failed to submit regularization." });
        }
      } catch (err: any) {
        if (await handleRevocationCheck(err)) return;
        setRegMsg({ type: "error", text: err?.message || "Failed to submit regularization." });
      }
    });
  };

  const handleSubmitQuery = () => {
    setQueryMsg(null);
    if (!querySubject.trim()) {
      setQueryMsg({ type: "error", text: "Please enter a subject." });
      return;
    }
    if (!queryMessage.trim()) {
      setQueryMsg({ type: "error", text: "Please enter your message." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitHrQueryAction(querySubject.trim(), queryMessage.trim());
        if (res.ok) {
          setQueryMsg({ type: "success", text: "Query submitted to HR / Management!" });
          setQuerySubject("");
          setQueryMessage("");
          await refreshData();
          setTimeout(() => setShowQuerySheet(false), 1200);
        } else {
          if (await handleRevocationCheck(res)) return;
          setQueryMsg({ type: "error", text: res.error || "Failed to submit query." });
        }
      } catch (err: any) {
        if (await handleRevocationCheck(err)) return;
        setQueryMsg({ type: "error", text: err?.message || "Failed to submit query." });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative", minHeight: "calc(100vh - 180px)" }}>
      {/* 3 Sub-Tabs Switcher */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          background: "var(--card-bg, #ffffff)",
          padding: 4,
          borderRadius: 14,
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          gap: 4,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("LEAVES")}
          style={{
            padding: "8px 0",
            borderRadius: 10,
            border: "none",
            background: activeTab === "LEAVES" ? "#22c55e" : "transparent",
            color: activeTab === "LEAVES" ? "#ffffff" : "var(--text-secondary, #64748b)",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Leaves ({leaves.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("REGULARIZATIONS")}
          style={{
            padding: "8px 0",
            borderRadius: 10,
            border: "none",
            background: activeTab === "REGULARIZATIONS" ? "#22c55e" : "transparent",
            color: activeTab === "REGULARIZATIONS" ? "#ffffff" : "var(--text-secondary, #64748b)",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Regularizations ({regularizations.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("QUERIES")}
          style={{
            padding: "8px 0",
            borderRadius: 10,
            border: "none",
            background: activeTab === "QUERIES" ? "#22c55e" : "transparent",
            color: activeTab === "QUERIES" ? "#ffffff" : "var(--text-secondary, #64748b)",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Queries ({hrQueries.length})
        </button>
      </div>

      {/* SUB-TAB 1: LEAVES */}
      {activeTab === "LEAVES" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {leaves.length > 0 ? (
            leaves.map((l: any) => (
              <div
                key={l.id}
                style={{
                  borderRadius: 16,
                  background: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      background: l.type === "PL" ? "rgba(59, 130, 246, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: l.type === "PL" ? "#3b82f6" : "#ef4444",
                    }}
                  >
                    {l.type} LEAVE
                  </span>

                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 800,
                      background:
                        l.status === "APPROVED"
                          ? "rgba(34, 197, 94, 0.15)"
                          : l.status === "REJECTED"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        l.status === "APPROVED" ? "#22c55e" : l.status === "REJECTED" ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    ● {l.status}
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
                  📅 {l.from} → {l.to} ({l.daysCount || 1} day{l.daysCount === 1 ? "" : "s"})
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)", lineHeight: 1.4 }}>
                  Reason: {l.reason}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary, #64748b)", fontSize: 13 }}>
              No leave requests submitted yet.
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: REGULARIZATIONS */}
      {activeTab === "REGULARIZATIONS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {regularizations.length > 0 ? (
            regularizations.map((r: any) => (
              <div
                key={r.id}
                style={{
                  borderRadius: 16,
                  background: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
                    📅 Date: {r.date}
                  </span>

                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 800,
                      background:
                        r.status === "APPROVED"
                          ? "rgba(34, 197, 94, 0.15)"
                          : r.status === "REJECTED"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        r.status === "APPROVED" ? "#22c55e" : r.status === "REJECTED" ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    ● {r.status}
                  </span>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>
                  Type: {REGULARIZATION_LABELS[r.requestType] || r.requestType?.replace(/_/g, " ")}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)", lineHeight: 1.4 }}>
                  Justification: {r.reason}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary, #64748b)", fontSize: 13 }}>
              No regularization requests logged.
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: QUERIES */}
      {activeTab === "QUERIES" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {hrQueries.length > 0 ? (
            hrQueries.map((q: any) => (
              <div
                key={q.id}
                style={{
                  borderRadius: 16,
                  background: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
                    {q.subject}
                  </div>

                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 800,
                      background:
                        q.status === "RESOLVED" ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.15)",
                      color: q.status === "RESOLVED" ? "#22c55e" : "#f59e0b",
                    }}
                  >
                    ● {q.status}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)", lineHeight: 1.4 }}>
                  {q.message}
                </div>

                {q.resolutionNote && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.2)",
                      fontSize: 11,
                      color: "#22c55e",
                      fontWeight: 600,
                    }}
                  >
                    <b>HR Resolution:</b> {q.resolutionNote}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary, #64748b)", fontSize: 13 }}>
              No HR queries submitted.
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom-Right "+" Action Button */}
      <button
        type="button"
        onClick={() => {
          if (activeTab === "LEAVES") {
            setLeaveMsg(null);
            setShowLeaveSheet(true);
          } else if (activeTab === "REGULARIZATIONS") {
            setRegMsg(null);
            setShowRegSheet(true);
          } else {
            setQueryMsg(null);
            setShowQuerySheet(true);
          }
        }}
        aria-label="Add new request"
        style={{
          position: "fixed",
          bottom: 84,
          right: "max(calc((100vw - 430px) / 2 + 18px), 18px)",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#22c55e",
          color: "#ffffff",
          border: "none",
          fontSize: 26,
          fontWeight: 900,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 20px rgba(34, 197, 94, 0.4)",
          zIndex: 45,
        }}
      >
        +
      </button>

      {/* BOTTOM SHEET 1: Apply Leave */}
      <BottomSheet
        isOpen={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        title="🌴 Apply for Leave"
      >
        {leaveMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              background: leaveMsg.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: leaveMsg.type === "success" ? "#22c55e" : "#ef4444",
            }}
          >
            {leaveMsg.text}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>LEAVE TYPE</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
          >
            <option value="PL">Paid Leave (PL)</option>
            <option value="SL">Sick Leave (SL)</option>
            <option value="CL">Casual Leave (CL)</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>FROM DATE</label>
            <input
              type="date"
              value={leaveFrom}
              onChange={(e) => setLeaveFrom(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>TO DATE</label>
            <input
              type="date"
              value={leaveTo}
              onChange={(e) => setLeaveTo(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>REASON</label>
          <textarea
            rows={3}
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            placeholder="Enter reason for leave..."
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontSize: 13, resize: "none" }}
          />
        </div>

        <button
          type="button"
          onClick={handleApplyLeave}
          disabled={isPending}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "#22c55e",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 14,
            border: "none",
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
          }}
        >
          {isPending ? "Submitting..." : "Submit Leave Application"}
        </button>
      </BottomSheet>

      {/* BOTTOM SHEET 2: Regularize Attendance */}
      <BottomSheet
        isOpen={showRegSheet}
        onClose={() => setShowRegSheet(false)}
        title="⏱️ Regularize Attendance"
      >
        {regMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              background: regMsg.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: regMsg.type === "success" ? "#22c55e" : "#ef4444",
            }}
          >
            {regMsg.text}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>DATE</label>
          <input
            type="date"
            value={regDate}
            onChange={(e) => setRegDate(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>REQUEST TYPE</label>
          <select
            value={regType}
            onChange={(e) => setRegType(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
          >
            <option value="LATE_JUSTIFY">Late Arrival Justification</option>
            <option value="WFH">Work From Home</option>
            <option value="OUTSIDE_OFFICE">Working Outside Office (OD)</option>
            <option value="MEETING">Off-site Meeting</option>
            <option value="ABSENT_TO_LEAVE">Convert Absent to Leave</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>JUSTIFICATION NOTE</label>
          <textarea
            rows={3}
            value={regReason}
            onChange={(e) => setRegReason(e.target.value)}
            placeholder="Explain attendance irregularity..."
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontSize: 13, resize: "none" }}
          />
        </div>

        <button
          type="button"
          onClick={handleApplyRegularization}
          disabled={isPending}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "#22c55e",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 14,
            border: "none",
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
          }}
        >
          {isPending ? "Submitting..." : "Submit Regularization Request"}
        </button>
      </BottomSheet>

      {/* BOTTOM SHEET 3: New Query */}
      <BottomSheet
        isOpen={showQuerySheet}
        onClose={() => setShowQuerySheet(false)}
        title="💬 Send Query to HR"
      >
        {queryMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              background: queryMsg.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: queryMsg.type === "success" ? "#22c55e" : "#ef4444",
            }}
          >
            {queryMsg.text}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>SUBJECT</label>
          <input
            type="text"
            value={querySubject}
            onChange={(e) => setQuerySubject(e.target.value)}
            placeholder="e.g. Salary structure, policy clarification..."
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontWeight: 700 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>MESSAGE</label>
          <textarea
            rows={4}
            value={queryMessage}
            onChange={(e) => setQueryMessage(e.target.value)}
            placeholder="Type your message to HR..."
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "var(--bg, #f8fafc)", color: "var(--text-primary, #0f172a)", fontSize: 13, resize: "none" }}
          />
        </div>

        <button
          type="button"
          onClick={handleSubmitQuery}
          disabled={isPending}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "#22c55e",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 14,
            border: "none",
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
          }}
        >
          {isPending ? "Sending..." : "Submit Query"}
        </button>
      </BottomSheet>
    </div>
  );
}
