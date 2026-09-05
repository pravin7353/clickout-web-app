"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchExpiredOrders, reactivateQR, ExpiredOrder } from "@/actions/risk";
import { Card, Button, Input, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { Modal } from "@/components/profile-menu";

interface QrBailoutProps {
  initialStoreId?: string | null;
  adminName?: string;
  adminRole?: string;
  canEdit?: boolean;
}

export function QrBailout({
  initialStoreId = null,
  adminName = "Admin",
  adminRole = "manager",
  canEdit = true,
}: QrBailoutProps) {
  const [orders, setOrders] = useState<ExpiredOrder[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Clock state
  const [currentTime, setCurrentTime] = useState("");

  // Modal Bailout target
  const [selectedOrder, setSelectedOrder] = useState<ExpiredOrder | null>(null);
  const [bailoutReason, setBailoutReason] = useState("");
  const [reactivatedIds, setReactivatedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  function load(query: string) {
    startTransition(async () => {
      try {
        const res = await fetchExpiredOrders(query, initialStoreId || undefined);
        setOrders(res.orders);
      } catch (err: any) {
        setError(err.message ?? "Failed to query expired orders");
      }
    });
  }

  useEffect(() => {
    const t = setTimeout(() => load(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput, initialStoreId]);

  function handleConfirmBailout() {
    if (!selectedOrder) return;
    setError("");
    setSuccessMsg("");
    const targetId = selectedOrder.id;
    const branchCode = selectedOrder.branchCode || initialStoreId || "STORE";
    const reasonText = bailoutReason.trim() || "Emergency customer gate timeout bailout";

    startTransition(async () => {
      const res = await reactivateQR(targetId, branchCode, reasonText);
      if (!res.ok) {
        setError(res.error ?? "Failed to reactivate QR");
      } else {
        setSuccessMsg(`Gate pass for Order ${targetId} reactivated for 60 minutes.`);
        setReactivatedIds((prev) => new Set(prev).add(targetId));
        setSelectedOrder(null);
        setBailoutReason("");
        load(searchInput);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Top Header Card */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>⏳</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                QR Bailout Desk — Gate Pass Recovery
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                Rescue paid orders whose exit QR expired before customer cleared security. Max 2 reactivations per order.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ color: "var(--primary)" }}>🕒</span> {currentTime || "Live"}
          </div>

          <Badge color="var(--primary)">
            🏬 {initialStoreId ? `Store: ${initialStoreId}` : "All Stores (HQ)"}
          </Badge>

          <Badge color="var(--text-secondary)">
            👤 {adminName} ({adminRole})
          </Badge>
        </div>
      </Card>

      {/* Search & Alerts */}
      <Card style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, position: "relative" }}>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search exact Order ID or filter list..."
              style={{ width: "100%" }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={() => load(searchInput)}
            disabled={isPending}
          >
            {isPending ? "Refreshing..." : "Refresh Queue"}
          </Button>
        </div>

        {error && <ErrorBanner message={error} />}

        {successMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--success)",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Counter Badge */}
        {!isPending && orders.length > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "var(--danger)",
              fontSize: 13,
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />
            <span>{orders.length} Expired QR Pass{orders.length > 1 ? "es" : ""} Awaiting Bailout</span>
          </div>
        )}
      </Card>

      {/* Orders List / Empty State */}
      {isPending && orders.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
          Scanning expired gate passes...
        </Card>
      ) : orders.length === 0 ? (
        <EmptyState
          icon="🛡️"
          message={
            searchInput
              ? `No expired orders matching "${searchInput}". Check Order ID or verify if payment was completed.`
              : "Store exit operations are running smoothly. All paying customers exited within gate validity."
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orders.map((o) => {
            const isLiveReactivated = reactivatedIds.has(o.id);
            const diffMins = Math.max(0, Math.floor((Date.now() - o.qrExpiresAtMs) / (60 * 1000)));

            let stripColor = "var(--success)";
            let timeText = `Expired ${diffMins}m ago`;
            if (diffMins > 60) {
              stripColor = "var(--danger)";
            } else if (diffMins > 15) {
              stripColor = "var(--warning, #f59e0b)";
            }
            if (isLiveReactivated) {
              stripColor = "var(--success)";
              timeText = "Reactivated (Live 60m)";
            }

            const limitReached = o.qrRegenCount >= 2;

            return (
              <Card
                key={o.id}
                style={{
                  borderLeft: `5px solid ${stripColor}`,
                  display: "grid",
                  gap: 12,
                  padding: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                        {o.id}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: `color-mix(in srgb, ${stripColor} 15%, transparent)`,
                          color: stripColor,
                        }}
                      >
                        {isLiveReactivated ? "LIVE PASS" : timeText}
                      </span>
                      {o.branchCode && (
                        <Badge color="var(--text-secondary)">Store: {o.branchCode}</Badge>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      <span>👤 {o.customerName || "Walk-in Shopper"}</span>
                      <span>🛍️ {o.itemCount ?? 0} item{o.itemCount === 1 ? "" : "s"}</span>
                      <span>💳 {o.paymentMethod || "UPI"}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                        ₹{o.amount.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: limitReached ? "var(--danger)" : "var(--text-secondary)", fontWeight: 600 }}>
                        Regen: {o.qrRegenCount}/2 {limitReached && "• Limit Reached"}
                      </div>
                    </div>

                    {isLiveReactivated ? (
                      <span style={{ color: "var(--success)", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                        ✓ PASS ACTIVE
                      </span>
                    ) : (
                      <Button
                        variant={limitReached ? "secondary" : "primary"}
                        disabled={limitReached || isPending || !canEdit}
                        onClick={() => setSelectedOrder(o)}
                      >
                        {limitReached ? "Refund Required" : "Bailout QR"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bailout Confirmation Modal */}
      {selectedOrder && (
        <Modal onClose={() => setSelectedOrder(null)}>
          <Card style={{ width: 440, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  Authorize Emergency Exit Bailout?
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                  Order: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{selectedOrder.id}</span>
                </p>
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "grid",
                gap: 6,
              }}
            >
              <div>• <strong>Pass Extension:</strong> Extends customer gate validity by <strong>60 minutes</strong>.</div>
              <div>• <strong>Regeneration:</strong> Uses attempt <strong>{selectedOrder.qrRegenCount + 1} of 2</strong>.</div>
              <div>• <strong>Security Audit:</strong> Permanently logged in <code style={{ color: "var(--primary)" }}>admin_audit_logs</code> under <strong>{adminName}</strong>.</div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Reason for Bailout (Optional Audit Note):
              </label>
              <Input
                value={bailoutReason}
                onChange={(e) => setBailoutReason(e.target.value)}
                placeholder="e.g. Delayed at packing desk / POS network glitch"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button
                variant="secondary"
                onClick={() => setSelectedOrder(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmBailout}
                disabled={isPending}
              >
                {isPending ? "Reactivating..." : "Confirm Bailout"}
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}