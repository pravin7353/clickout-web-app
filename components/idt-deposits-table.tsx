"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchIdtDeposits, IdtDeposit } from "@/actions/idt";

export function IdtDepositsTable() {
  const [deposits, setDeposits] = useState<IdtDeposit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function loadInitial() {
    startTransition(async () => {
      setError("");
      try {
        const res = await fetchIdtDeposits(null);
        setDeposits(res.deposits);
        setHasMore(res.hasMore);
      } catch {
        setError("Failed to load. Please try again.");
      }
    });
  }

  function loadMore() {
    if (deposits.length === 0) return;
    const cursor = deposits[deposits.length - 1].timestampMs;
    startTransition(async () => {
      const res = await fetchIdtDeposits(cursor);
      setDeposits((prev) => [...prev, ...res.deposits]);
      setHasMore(res.hasMore);
    });
  }

  useEffect(() => { loadInitial(); }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>IDT Deposits</h1>

      {error ? (
        <div style={{ color: "#ef4444" }}>{error} <button onClick={loadInitial}>Retry</button></div>
      ) : deposits.length === 0 && !isPending ? (
        <p style={{ color: "#888" }}>No verified deposits yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Product</th>
              <th style={{ padding: 10 }}>Qty</th>
              <th style={{ padding: 10 }}>Branch</th>
              <th style={{ padding: 10 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: 10 }}>{d.productName}</td>
                <td style={{ padding: 10 }}>{d.quantity}</td>
                <td style={{ padding: 10 }}>{d.branchCode}</td>
                <td style={{ padding: 10, color: "#888" }}>{new Date(d.timestampMs).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMore && (
        <button onClick={loadMore} disabled={isPending} style={{ marginTop: 16, padding: "8px 16px" }}>
          {isPending ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}