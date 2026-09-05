"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchOrdersPage, OrderRow } from "@/actions/orders";
import { SkeletonRow } from "@/components/ui";

const STATUS_OPTIONS = [
  "ALL",
  "Clear Exit",
  "Gate Pass Pending",
  "Reject",
  "Fix & Exit",
  "QR Expire",
  "Refund",
];

const STATUS_THEMES: Record<string, { text: string; bg: string; border: string }> = {
  "Clear Exit": {
    text: "var(--success)",
    bg: "color-mix(in srgb, var(--success) 12%, transparent)",
    border: "color-mix(in srgb, var(--success) 35%, transparent)",
  },
  "Gate Pass Pending": {
    text: "var(--warning)",
    bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
    border: "color-mix(in srgb, var(--warning) 35%, transparent)",
  },
  "Reject": {
    text: "var(--danger)",
    bg: "color-mix(in srgb, var(--danger) 12%, transparent)",
    border: "color-mix(in srgb, var(--danger) 35%, transparent)",
  },
  "Fix & Exit": {
    text: "#a855f7",
    bg: "rgba(168, 85, 247, 0.12)",
    border: "rgba(168, 85, 247, 0.35)",
  },
  "Refund": {
    text: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.35)",
  },
  "QR Expire": {
    text: "var(--text-secondary)",
    bg: "color-mix(in srgb, var(--text-secondary) 12%, transparent)",
    border: "color-mix(in srgb, var(--text-secondary) 30%, transparent)",
  },
  "Pending": {
    text: "var(--text-secondary)",
    bg: "color-mix(in srgb, var(--text-secondary) 12%, transparent)",
    border: "color-mix(in srgb, var(--text-secondary) 30%, transparent)",
  },
};

export function ReconciliationTable({ storeParam }: { storeParam?: string }) {
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
        const res = await fetchOrdersPage({ statusFilter, searchQuery, sortDesc, cursorTimestampMs: cursor, storeParam });
        setOrders(res.orders);
        setHasMore(res.hasMore);
      } catch {
        setError("Failed to load orders. Please try again.");
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
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Top Controls: Status Pills, Search Bar & Sort Toggle */}
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Status Filter Pills */}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {STATUS_OPTIONS.map((status) => {
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                  border: isActive ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                  background: isActive ? "var(--cta-bg)" : "var(--scaffold-bg)",
                  color: isActive ? "var(--cta-text)" : "var(--text-secondary)",
                  boxShadow: isActive ? "0 2px 8px color-mix(in srgb, var(--cta-bg) 30%, transparent)" : "none",
                }}
              >
                {status}
              </button>
            );
          })}
        </div>

        {/* Search & Sort Row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                color: "var(--text-secondary)",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              placeholder="Search exact Order ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 36px 9px 38px",
                borderRadius: 24,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 4,
                }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setSortDesc((s) => !s)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>{sortDesc ? "↓" : "↑"}</span>
              <span>{sortDesc ? "Newest First" : "Oldest First"}</span>
            </button>

            {isPending && orders.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                Refreshing…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
          <thead>
            <tr
              style={{
                background: "color-mix(in srgb, var(--card-bg) 92%, var(--scaffold-bg))",
                borderBottom: "1px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th
                style={{
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                ORDER ID
              </th>
              <th
                style={{
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                TIME
              </th>
              <th
                style={{
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                AMOUNT
              </th>
              <th
                style={{
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                PAYMENT MODE
              </th>
              <th
                style={{
                  padding: "12px 18px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                STATUS
              </th>
            </tr>
          </thead>
          <tbody>
            {isPending && orders.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "20px 18px" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonRow key={i} />
                  ))}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "var(--danger)" }}>
                  <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{error}</div>
                  <button
                    type="button"
                    onClick={() => load(cursorStack[pageIndex])}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 16,
                      border: "1px solid var(--danger)",
                      background: "transparent",
                      color: "var(--danger)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 48,
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
                  No orders match your filter criteria.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const theme = STATUS_THEMES[o.status] ?? {
                  text: "var(--text-secondary)",
                  bg: "color-mix(in srgb, var(--text-secondary) 10%, transparent)",
                  border: "color-mix(in srgb, var(--text-secondary) 25%, transparent)",
                };
                return (
                  <tr
                    key={o.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.12s ease",
                    }}
                  >
                    {/* ORDER ID */}
                    <td
                      style={{
                        padding: "14px 18px",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}
                    >
                      #{o.orderId.slice(0, 8)}
                    </td>

                    {/* TIME */}
                    <td
                      style={{
                        padding: "14px 18px",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                      }}
                    >
                      {new Date(o.timestampMs).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </td>

                    {/* AMOUNT */}
                    <td
                      style={{
                        padding: "14px 18px",
                        fontWeight: 800,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        textAlign: "right",
                      }}
                    >
                      ₹{o.amount.toLocaleString("en-IN")}
                    </td>

                    {/* PAYMENT MODE */}
                    <td style={{ padding: "14px 18px", textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 12,
                          background: "color-mix(in srgb, var(--text-primary) 6%, transparent)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {o.paymentMode || "N/A"}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 12px",
                          borderRadius: 20,
                          color: theme.text,
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: theme.text,
                          }}
                        />
                        {o.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 20px",
          borderTop: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {orders.length > 0 ? (
            <span>
              Showing <strong style={{ color: "var(--text-primary)" }}>{orders.length}</strong> orders on this page
            </span>
          ) : (
            <span>No orders to show</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={prevPage}
            disabled={pageIndex === 0}
            style={{
              padding: "6px 14px",
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              cursor: pageIndex === 0 ? "not-allowed" : "pointer",
              opacity: pageIndex === 0 ? 0.4 : 1,
              fontWeight: 600,
              fontSize: 12,
              transition: "all 0.15s ease",
            }}
          >
            ← Prev
          </button>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              padding: "0 6px",
              fontWeight: 500,
            }}
          >
            Page <strong style={{ color: "var(--text-primary)" }}>{pageIndex + 1}</strong>
          </span>
          <button
            type="button"
            onClick={nextPage}
            disabled={!hasMore}
            style={{
              padding: "6px 14px",
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              cursor: !hasMore ? "not-allowed" : "pointer",
              opacity: !hasMore ? 0.4 : 1,
              fontWeight: 600,
              fontSize: 12,
              transition: "all 0.15s ease",
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}