"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchOrdersPage, OrderRow } from "@/actions/orders";

const STATUS_OPTIONS = ["ALL", "Clear Exit", "Gate Pass Pending", "Reject", "Fix & Exit", "QR Expire", "Refund"];

const STATUS_COLORS: Record<string, string> = {
  "Clear Exit": "#22c55e",
  "Gate Pass Pending": "#f97316",
  "Reject": "#ef4444",
  "Fix & Exit": "#a855f7",
  "Refund": "#3b82f6",
  "QR Expire": "#9ca3af",
  "Pending": "#9ca3af",
};

export function ReconciliationTable() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [cursorStack, setCursorStack] = useState<(number | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function load(cursor: number | null) {
    startTransition(async () => {
      setError("");
      try {
        const res = await fetchOrdersPage({ statusFilter, searchQuery, sortDesc, cursorTimestampMs: cursor });
        setOrders(res.orders);
        setHasMore(res.hasMore);
      } catch {
        setError("Data load nahi hui — dobara try karo.");
      }
    });
  }

  useEffect(() => {
    setCursorStack([null]);
    setPageIndex(0);
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchQuery, sortDesc]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  function nextPage() {
    if (!hasMore || orders.length === 0) return;
    const lastTs = orders[orders.length - 1].timestampMs;
    setCursorStack((prev) => [...prev, lastTs]);
    setPageIndex((p) => p + 1);
    load(lastTs);
  }

  function prevPage() {
    if (pageIndex === 0) return;
    const newStack = cursorStack.slice(0, pageIndex);
    const cursor = newStack[newStack.length - 1];
    setCursorStack(newStack);
    setPageIndex((p) => p - 1);
    load(cursor);
  }

  return (
    <div style={{ border: "1px solid #333", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 20 }}>
        <input
          placeholder="Search exact Order ID..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: "1 1 250px", padding: 10, borderRadius: 30, border: "1px solid #444", background: "transparent", color: "inherit" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 10, borderRadius: 30, border: "1px solid #444", background: "transparent", color: "inherit" }}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => setSortDesc((s) => !s)} style={{ padding: "10px 16px", borderRadius: 30, border: "1px solid #444", background: "transparent", color: "inherit" }}>
          {sortDesc ? "Latest" : "Oldest"}
        </button>
      </div>

      <div style={{ borderTop: "1px solid #333" }}>
        {isPending && orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
            {error} <button onClick={() => load(cursorStack[pageIndex])}>Retry</button>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>No records match your criteria.</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #222" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{o.orderId.slice(0, 8)}</span>
              <span style={{ color: "#888", fontSize: 13 }}>{new Date(o.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ fontWeight: 900 }}>₹{o.amount}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{o.paymentMode}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: `1px solid ${STATUS_COLORS[o.status] ?? "#888"}`, color: STATUS_COLORS[o.status] ?? "#888" }}>
                {o.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, padding: 15 }}>
        {isPending && <span style={{ fontSize: 12 }}>...</span>}
        <button onClick={prevPage} disabled={pageIndex === 0}>‹</button>
        <span>Page {pageIndex + 1}</span>
        <button onClick={nextPage} disabled={!hasMore}>›</button>
      </div>
    </div>
  );
}