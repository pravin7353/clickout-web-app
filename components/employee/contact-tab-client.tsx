"use client";

import { useState, useTransition } from "react";
import { submitHrQueryAction, getEmployeeDashboardDataAction } from "@/actions/hr";
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

interface ContactTabClientProps {
  initialData: any;
}

export function ContactTabClient({ initialData }: ContactTabClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [showQuerySheet, setShowQuerySheet] = useState(false);
  const [querySubject, setQuerySubject] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [queryMsg, setQueryMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const staff = data?.staff;
  const store = data?.store;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        setQueryMsg({ type: "error", text: err?.message || "An unexpected error occurred." });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Heading */}
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--text-primary, #0f172a)" }}>
        Your HR Contact
      </h2>

      {/* Manager / Branch Contact Card */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            🏢
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-primary, #0f172a)" }}>
              {store?.name || staff?.branchCode || "HQ Operations"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)", marginTop: 2 }}>
              Store / Branch Management
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", lineHeight: 1.5 }}>
          Your branch manager handles HR queries, attendance regularization approvals, and workplace escalations.
        </div>

        {store?.address && (
          <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>
            📍 Address: <b>{store.address}{store.city ? `, ${store.city}` : ""}</b>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setQueryMsg(null);
            setShowQuerySheet(true);
          }}
          style={{
            marginTop: 4,
            padding: "12px 16px",
            borderRadius: 12,
            background: "#22c55e",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.35)",
          }}
        >
          <span>💬</span> Send a Query to HR
        </button>
      </div>

      {/* Past Queries History */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
          Recent Queries ({hrQueries.length})
        </div>

        {hrQueries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hrQueries.map((q: any) => (
              <div
                key={q.id}
                style={{
                  borderRadius: 14,
                  background: "var(--bg, #f8fafc)",
                  border: "1px solid var(--border, rgba(0,0,0,0.06))",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
                    {q.subject}
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
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
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)", textAlign: "center", padding: "12px 0" }}>
            No past queries submitted.
          </div>
        )}
      </div>

      {/* Bottom Sheet Query Form */}
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>
              SUBJECT
            </label>
            <input
              type="text"
              value={querySubject}
              onChange={(e) => setQuerySubject(e.target.value)}
              placeholder="e.g. Salary clarification, shift timing..."
              disabled={isPending}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border, #cbd5e1)",
                background: "var(--bg, #f8fafc)",
                color: "var(--text-primary, #0f172a)",
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>
              MESSAGE
            </label>
            <textarea
              rows={4}
              value={queryMessage}
              onChange={(e) => setQueryMessage(e.target.value)}
              placeholder="Provide details about your query..."
              disabled={isPending}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border, #cbd5e1)",
                background: "var(--bg, #f8fafc)",
                color: "var(--text-primary, #0f172a)",
                fontSize: 13,
                resize: "none",
              }}
            />
          </div>

          <button
            type="submit"
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
              boxShadow: "0 2px 10px rgba(34, 197, 94, 0.35)",
            }}
          >
            {isPending ? "Sending..." : "Submit Query"}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
