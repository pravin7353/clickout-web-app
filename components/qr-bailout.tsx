"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchExpiredOrders, reactivateQR, ExpiredOrder } from "@/actions/risk";

export function QrBailout() {
  const [orders, setOrders] = useState<ExpiredOrder[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function load(query: string) {
    startTransition(async () => {
      const res = await fetchExpiredOrders(query);
      setOrders(res.orders as any);
    });
  }

  useEffect(() => {
    const t = setTimeout(() => load(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  function reactivate(orderId: string, branchCode: string) {
    setError("");
    startTransition(async () => {
      const res = await reactivateQR(orderId, branchCode);
      if (!res.ok) setError(res.error!);
      else load(searchInput);
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>QR Bailout — Expired Order Recovery</h1>
      <p style={{ color: "#888" }}>Paid orders whose exit QR expired before the customer left. Max 2 reactivations per order.</p>

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search exact Order ID..."
        style={{ marginTop: 20, padding: 10, width: "100%", maxWidth: 400, borderRadius: 8, border: "1px solid #444", background: "transparent", color: "inherit" }}
      />

      {error && <p style={{ color: "#ef4444", marginTop: 12 }}>🚨 {error}</p>}

      {isPending && orders.length === 0 ? (
        <p style={{ marginTop: 20, color: "#888" }}>Loading...</p>
      ) : orders.length === 0 ? (
        <p style={{ marginTop: 20, color: "#888" }}>No expired orders pending bailout.</p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {orders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottom: "1px solid #222" }}>
              <span style={{ fontFamily: "monospace" }}>{o.id.slice(0, 10)}</span>
              <span>{o.branchCode}</span>
              <span style={{ fontWeight: 700 }}>₹{o.amount}</span>
              <span style={{ color: "#888", fontSize: 12 }}>Regen: {o.qrRegenCount}/2</span>
              <button
                onClick={() => reactivate(o.id, o.branchCode)}
                disabled={isPending || o.qrRegenCount >= 2}
                style={{ padding: "6px 14px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6 }}
              >
                Reactivate QR
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}