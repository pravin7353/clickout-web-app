"use client";

import { useState, useTransition } from "react";
import { searchOrderForRefund, processRefund } from "@/actions/refund";

type Order = { id: string; status: string; exitStatus: string; totalAmount: number; trustScore: number };

export function RefundDecision() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dialogTier, setDialogTier] = useState<"WALLET" | "SOURCE" | "PARTIAL" | null>(null);

  function search() {
    if (!orderId.trim()) return;
    setError("");
    startTransition(async () => {
      const res = await searchOrderForRefund(orderId.trim());
      if (!res.ok) { setError(res.error!); setOrder(null); }
      else setOrder(res.order!);
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Refund Decision Engine</h1>
      <p style={{ color: "#888" }}>3-Tier Smart Refunds. Protect revenue by prioritizing Wallet refunds over Source.</p>

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Enter Order ID to process refund..."
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #444", background: "transparent", color: "inherit" }}
        />
        <button onClick={search} disabled={isPending} style={{ padding: "12px 20px", borderRadius: 10, background: "#3b82f6", color: "#fff", border: "none", fontWeight: 700 }}>
          {isPending ? "..." : "FETCH INTEL"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
          🚨 {error}
        </div>
      )}

      {order && !error && order.status === "REFUNDED" && (
        <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}>
          🔒 ALREADY REFUNDED. IDEMPOTENCY LOCK ACTIVE.
        </div>
      )}

      {order && !error && order.status !== "REFUNDED" && (
        <>
          <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
            <InfoCard title="Total Amount" value={`₹${order.totalAmount.toFixed(2)}`} color="#3b82f6" />
            <InfoCard title="Trust Score" value={`${order.trustScore}/100`} color={order.trustScore > 80 ? "#22c55e" : "#ef4444"} />
          </div>

          <h3 style={{ marginTop: 24, fontWeight: 700 }}>Select Refund Tier:</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
            <TierCard title="Tier 1: Wallet (Instant)" subtitle="Retains capital inside the system." color="#22c55e" recommended={order.trustScore >= 80} onClick={() => setDialogTier("WALLET")} />
            <TierCard title="Tier 2: Source (Bank)" subtitle="Takes T+3 Days. High risk profiles." color="#f97316" recommended={order.trustScore < 80} onClick={() => setDialogTier("SOURCE")} />
            <TierCard title="Tier 3: Partial" subtitle="Refund only specific items." color="#a855f7" recommended={false} onClick={() => setDialogTier("PARTIAL")} />
          </div>
        </>
      )}

      {dialogTier && order && (
        <RefundDialog
          orderId={order.id}
          maxAmount={order.totalAmount}
          tier={dialogTier}
          onClose={() => setDialogTier(null)}
          onDone={() => { setDialogTier(null); search(); }}
        />
      )}
    </div>
  );
}

function InfoCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${color}55`, minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "#888" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function TierCard({ title, subtitle, color, recommended, onClick }: { title: string; subtitle: string; color: string; recommended: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer", padding: 16, borderRadius: 12, border: `${recommended ? 2 : 1}px solid ${color}`, minHeight: 120 }}>
      {recommended && <span style={{ fontSize: 10, fontWeight: 700, background: color, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>RECOMMENDED</span>}
      <div style={{ fontWeight: 900, color, marginTop: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

function RefundDialog({ orderId, maxAmount, tier, onClose, onDone }: { orderId: string; maxAmount: number; tier: "WALLET" | "SOURCE" | "PARTIAL"; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(maxAmount);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!reason.trim()) { setError("Refund reason is strictly required for Audit logs."); return; }
    if (tier === "PARTIAL" && (amount <= 0 || amount > maxAmount)) {
      setError("Invalid Partial Amount! Must be greater than 0 and less than total.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await processRefund({ orderId, refundTier: tier, refundAmount: tier === "PARTIAL" ? amount : maxAmount, reason: reason.trim() });
      if (!res.ok) setError(res.error!);
      else onDone();
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#1a1a1a", padding: 24, borderRadius: 16, width: 420 }}>
        <h3 style={{ fontWeight: 900 }}>{tier === "WALLET" ? "Instant Wallet Refund" : tier === "SOURCE" ? "Bank Source Refund" : "Partial Order Refund"}</h3>
        <p style={{ fontSize: 12, color: "#888" }}>Order: {orderId} · Max: ₹{maxAmount.toFixed(2)}</p>

        {tier === "PARTIAL" && (
          <input type="number" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} placeholder="Refund amount" style={{ width: "100%", padding: 10, marginTop: 12 }} />
        )}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Audit compliance reason (required)" style={{ width: "100%", padding: 10, marginTop: 12, minHeight: 60 }} />

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>🚨 {error}</p>}

        <p style={{ fontSize: 11, color: "#f97316", marginTop: 12 }}>⚠ This action is irreversible and will be permanently recorded in the Audit Trail.</p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={isPending}>Cancel</button>
          <button onClick={confirm} disabled={isPending} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700 }}>
            {isPending ? "AUTHORIZING..." : "AUTHORIZE REFUND"}
          </button>
        </div>
      </div>
    </div>
  );
}