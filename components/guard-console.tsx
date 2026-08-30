"use client";

import { useState, useTransition } from "react";
import { authorizeExit, rejectGatePass, forceOverride } from "@/actions/guard";
import { GateOrder } from "@/lib/services/gate-service";
import { useRouter } from "next/navigation";

export function GuardConsole({ pending, history }: { pending: GateOrder[]; history: GateOrder[] }) {
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function authorize(id: string) {
    setError("");
    startTransition(async () => { const r = await authorizeExit(id); if (!r.ok) setError(r.error!); router.refresh(); });
  }
  function reject(id: string) {
    if (!overrideReason.trim() && !confirm("Reject without a reason?")) return;
    startTransition(async () => { await rejectGatePass(id); router.refresh(); });
  }
  function override() {
    if (!overrideReason.trim()) { setError("Reason is required!"); return; }
    setError("");
    startTransition(async () => { const r = await forceOverride(overrideReason, manualId); if (!r.ok) setError(r.error!); else { setOverrideReason(""); setManualId(""); router.refresh(); } });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Guard Console — Gate Verification</h1>
      {error && <p style={{ color: "#ef4444" }}>🚨 {error}</p>}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>Pending Exits ({pending.length})</h2>
      {pending.length === 0 ? (
        <p style={{ color: "#888" }}>No pending gate passes.</p>
      ) : (
        pending.map((o) => (
          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottom: "1px solid #222" }}>
            <span style={{ fontFamily: "monospace" }}>{o.id.slice(0, 10)}</span>
            <span style={{ fontWeight: 700 }}>₹{o.amount}</span>
            <span style={{ fontSize: 12, color: "#888" }}>{o.paymentMode}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => authorize(o.id)} disabled={isPending} style={{ padding: "4px 12px", background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>Approve</button>
              <button onClick={() => reject(o.id)} disabled={isPending} style={{ padding: "4px 12px", background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6 }}>Reject</button>
            </div>
          </div>
        ))
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, color: "#ef4444" }}>Manual Override (Critical)</h2>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Linked Order ID (optional)" style={{ padding: 8, flex: 1 }} />
        <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason (required)" style={{ padding: 8, flex: 2 }} />
        <button onClick={override} disabled={isPending} style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6 }}>Force Open</button>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>Recent Gate Activity</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead><tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
          <th style={{ padding: 8 }}>Time</th><th style={{ padding: 8 }}>Order ID</th><th style={{ padding: 8 }}>Status</th>
        </tr></thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} style={{ borderBottom: "1px solid #222" }}>
              <td style={{ padding: 8 }}>{new Date(h.timestampMs).toLocaleTimeString()}</td>
              <td style={{ padding: 8, fontFamily: "monospace" }}>{h.id.slice(0, 10)}</td>
              <td style={{ padding: 8 }}>{h.exitStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}