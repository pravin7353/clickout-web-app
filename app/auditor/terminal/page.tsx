"use client";

import { useState } from "react";
import Link from "next/link";

type Log = { id: string; action: string; actor: string; target: string; details: string; severity: string; timestamp: string };

export function AuditTerminal({ initialLogs }: { initialLogs: Log[] }) {
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("ALL_TIME");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const filteredLogs = initialLogs.filter(log => {
    if (severityFilter !== "ALL" && log.severity !== severityFilter) return false;
    
    const logDate = new Date(log.timestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7 = new Date(today); 
    last7.setDate(today.getDate() - 7);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    if (timeFilter === "TODAY" && logDate < today) return false;
    if (timeFilter === "LAST_7_DAYS" && logDate < last7) return false;
    if (timeFilter === "THIS_MONTH" && logDate < thisMonth) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div style={{ padding: 24, background: "var(--scaffold-bg)", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/auditor" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 12, fontWeight: "bold", letterSpacing: 1 }}>
          ← BACK TO COMMAND CENTER
        </Link>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, letterSpacing: 1.5, color: "var(--text-primary)" }}>Audit Vault</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "8px 0 0 0" }}>Immutable System Activity Terminal</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <select className="co-input" value={timeFilter} onChange={e => { setTimeFilter(e.target.value); setPage(0); }}>
            <option value="ALL_TIME">All Time</option>
            <option value="TODAY">Today</option>
            <option value="LAST_7_DAYS">Last 7 Days</option>
            <option value="THIS_MONTH">This Month</option>
          </select>
          <select className="co-input" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(0); }}>
            <option value="ALL">All Severities</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
      </div>

      <div style={{ background: "#0A0A0A", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", height: "calc(100vh - 180px)", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "10px 16px", background: "#1A1A1A", borderBottom: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px 12px 0 0", color: "#9CA3AF", fontFamily: "monospace", fontSize: 12 }}>
          root@clickout-os:~# tail -f /var/log/audit.log
        </div>
        
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {paginatedLogs.length === 0 ? (
            <div style={{ color: "#4ADE80", fontFamily: "monospace" }}>{">"} No audit logs found...</div>
          ) : (
            paginatedLogs.map(log => {
              const color = log.severity === "CRITICAL" ? "#EF4444" : log.severity === "WARNING" ? "#F59E0B" : "#38BDF8";
              return (
                <div key={log.id} style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.5, marginBottom: 8, wordBreak: "break-all" }}>
                  <span style={{ color: "#6B7280" }}>[{log.timestamp.replace("T", " ").substring(2, 19)}]</span>{" "}
                  <span style={{ color, fontWeight: "bold" }}>[{log.severity}] {log.action}</span>{" "}
                  <span style={{ color: "#C084FC" }}>by &lt;{log.actor}&gt;</span>{" "}
                  {log.target && <span style={{ color: "#FDE047" }}>on [{log.target}]</span>}{" "}
                  <span style={{ color: log.severity === "CRITICAL" ? "#FECACA" : "#D1D5DB" }}>» {log.details}</span>
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: "12px 16px", background: "#1A1A1A", borderTop: "1px solid rgba(255,255,255,0.1)", borderRadius: "0 0 12px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#6B7280", fontFamily: "monospace", fontSize: 12 }}>
            Showing {filteredLogs.length > 0 ? page * pageSize + 1 : 0}-{Math.min((page + 1) * pageSize, filteredLogs.length)} of {filteredLogs.length} logs
          </span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: "transparent", border: "none", color: page === 0 ? "#374151" : "#4ADE80", cursor: page === 0 ? "not-allowed" : "pointer" }}>{"< Prev"}</button>
            <span style={{ color: "#4ADE80", fontFamily: "monospace", fontSize: 12, fontWeight: "bold" }}>PAGE {page + 1} / {Math.max(1, totalPages)}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: "transparent", border: "none", color: page >= totalPages - 1 ? "#374151" : "#4ADE80", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}>{"Next >"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuditorTerminalPage() {
  return <AuditTerminal initialLogs={[]} />;
}
