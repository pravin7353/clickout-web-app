"use client";

import { useState, useTransition } from "react";
import { authorizeExit, rejectGatePass, forceOverride } from "@/actions/guard";
import { GateOrder } from "@/lib/services/gate-service";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Input, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { QrCameraScannerModal } from "@/components/qr-camera-scanner-modal";
import { useRouter } from "next/navigation";

export function GuardConsole({
  pending,
  history,
  branchCode,
  canEdit = false,
}: {
  pending: GateOrder[];
  history: GateOrder[];
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [scanInput, setScanInput] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [selectedPass, setSelectedPass] = useState<GateOrder | null>(null);

  // Reject Modal State
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Override State
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideOrderId, setOverrideOrderId] = useState("");
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scanInput.trim()) return;
    setError("");
    setSuccess("");

    startTransition(async () => {
      const res = await authorizeExit(scanInput.trim(), branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Failed to authorize gate pass.");
      } else {
        setSuccess(`✅ ${res.msg ?? "Gate Authorized & Opened!"}`);
        setScanInput("");
        router.refresh();
      }
    });
  }

  function handleCameraScan(decodedText: string) {
    const clean = decodedText.trim();
    if (!clean) return;
    setScanInput(clean);
    setError("");
    setSuccess("");

    startTransition(async () => {
      const res = await authorizeExit(clean, branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Failed to authorize gate pass.");
      } else {
        setSuccess(`✅ ${res.msg ?? "Gate Authorized & Opened!"}`);
        setScanInput("");
        router.refresh();
      }
    });
  }

  function handleQuickApprove(id: string) {
    setError("");
    setSuccess("");
    startTransition(async () => {
      const res = await authorizeExit(id, branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Failed to authorize exit.");
      } else {
        setSuccess(`✅ Order ${id.slice(0, 8)} authorized! Gate opened.`);
        if (selectedPass?.id === id) setSelectedPass(null);
        router.refresh();
      }
    });
  }

  function confirmRejectPass(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectingOrderId) return;
    if (!rejectReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setError("");
    setSuccess("");
    startTransition(async () => {
      const res = await rejectGatePass(rejectingOrderId, rejectReason.trim(), branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Failed to reject pass.");
      } else {
        setSuccess(`🚨 Gate pass for order ${rejectingOrderId.slice(0, 8)} REJECTED and logged.`);
        setRejectingOrderId(null);
        setRejectReason("");
        if (selectedPass?.id === rejectingOrderId) setSelectedPass(null);
        router.refresh();
      }
    });
  }

  function handleExecuteOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setError("Override reason is strictly required.");
      return;
    }

    setError("");
    setSuccess("");
    startTransition(async () => {
      const res = await forceOverride(overrideReason.trim(), overrideOrderId.trim() || undefined, branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Force override failed.");
      } else {
        setSuccess(`🚨 Manual Gate Override executed successfully!`);
        setShowOverrideConfirm(false);
        setOverrideReason("");
        setOverrideOrderId("");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Scope Notice */}
      {branchCode && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Active Exit Gate Guard Post:</span>
          <Badge color="var(--primary)">{branchCode}</Badge>
        </div>
      )}

      {error && <ErrorBanner message={error} />}
      {success && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {/* Fast Barcode / QR Scanner Input */}
      <Card style={{ padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
          Scan Exit Gate Pass QR / Barcode
        </h3>
        <form onSubmit={handleScanSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Input
            placeholder="Scan customer gate pass QR or type Order ID..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            autoFocus
            style={{ flex: "1 1 280px" }}
          />
          <button
            type="button"
            onClick={() => setShowCameraScanner(true)}
            disabled={!canEdit || isPending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0 16px",
              height: 40,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              cursor: !canEdit || isPending ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (canEdit && !isPending) {
                e.currentTarget.style.borderColor = "var(--primary, #00D26A)";
                e.currentTarget.style.color = "var(--primary, #00D26A)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            title="Scan customer exit pass using laptop camera, webcam or mobile camera"
          >
            <span style={{ fontSize: 16 }}>📷</span>
            <span>Open Camera</span>
          </button>
          <Button type="submit" disabled={isPending || !scanInput.trim() || !canEdit}>
            {isPending ? "Verifying..." : "⚡ Verify & Open Gate"}
          </Button>
        </form>
      </Card>

      {/* Pending Exit Queue */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Pending Exits Awaiting Gate Verification ({pending.length})
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Real-time exit gate line
          </span>
        </div>

        {pending.length === 0 ? (
          <EmptyState message="No customer gate passes currently waiting for exit verification." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ORDER ID / INVOICE</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>CUSTOMER</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ITEMS</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>PAYMENT</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>AMOUNT</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {o.invoiceNo}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: "var(--text-primary)" }}>
                        {o.customerName || "Customer"}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                        {o.itemsCount} units
                      </td>
                      <td style={{ padding: 12 }}>
                        <Badge color={o.paymentMode === "CASH" ? "var(--warning)" : "var(--primary)"}>
                          {o.paymentMode}
                        </Badge>
                      </td>
                      <td style={{ padding: 12, fontWeight: 700, color: "var(--success)" }}>
                        ₹{o.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <Button
                            variant="secondary"
                            onClick={() => setSelectedPass(o)}
                            style={{ fontSize: 12, padding: "6px 10px" }}
                          >
                            👁️ Inspect Pass
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                onClick={() => handleQuickApprove(o.id)}
                                disabled={isPending}
                                style={{ fontSize: 12, padding: "6px 12px" }}
                              >
                                Approve Exit
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setRejectingOrderId(o.id);
                                  setRejectReason("");
                                }}
                                disabled={isPending}
                                style={{ color: "var(--danger)", fontSize: 12, padding: "6px 10px" }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Manual Gate Override (Critical) */}
      <Card style={{ padding: 20, border: "1px solid rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.03)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px 0", color: "var(--danger)" }}>
              Manual Gate Override (Critical Emergency)
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Forces gate open during power outages or system downtime. All events are logged to permanent audit trail.
            </span>
          </div>
          <Badge color="var(--danger)">RESTRICTED</Badge>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Input
            placeholder="Linked Order ID (optional)"
            value={overrideOrderId}
            onChange={(e) => setOverrideOrderId(e.target.value)}
            style={{ width: 220 }}
          />
          <Input
            placeholder="Mandatory justification reason for override..."
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            style={{ flex: 1, minWidth: 260 }}
          />
          <Button
            onClick={() => setShowOverrideConfirm(true)}
            disabled={isPending || !overrideReason.trim() || !canEdit}
            style={{ background: "var(--danger)", color: "#fff", border: "none" }}
          >
            Force Open Gate
          </Button>
        </div>
      </Card>

      {/* Recent Gate Activity History */}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px 0", color: "var(--text-primary)" }}>
          Today&apos;s Gate Verification Activity ({history.length})
        </h3>

        {history.length === 0 ? (
          <EmptyState message="No gate verifications recorded today." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>TIME</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ORDER ID / INVOICE</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ITEMS</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>AMOUNT</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>VERIFICATION STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                        {new Date(h.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {h.invoiceNo}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                        {h.itemsCount} units
                      </td>
                      <td style={{ padding: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                        ₹{h.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: 12 }}>
                        <Badge
                          color={
                            h.exitStatus === "APPROVED" || h.exitStatus === "COMPLETED"
                              ? "var(--success)"
                              : h.exitStatus === "REJECTED"
                              ? "var(--danger)"
                              : "var(--warning)"
                          }
                        >
                          {h.exitStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Digital Gate Pass Inspection Modal */}
      {selectedPass && (
        <Modal onClose={() => setSelectedPass(null)}>
          <Card style={{ width: 500, maxWidth: "92vw", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px 0", color: "var(--text-primary)" }}>
                  Digital Gate Pass ({selectedPass.invoiceNo})
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Order: <code>{selectedPass.id}</code>
                </span>
              </div>
              <Badge color="var(--success)">PAID ({selectedPass.paymentMode})</Badge>
            </div>

            {/* Customer Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "rgba(255, 255, 255, 0.02)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Customer</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedPass.customerName || "Shopper"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Mobile Phone</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedPass.customerPhone || "—"}</div>
              </div>
            </div>

            {/* Item List for Physical Verification */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Bag Contents for Physical Verification ({selectedPass.itemsCount} total units)
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: 8, color: "var(--text-secondary)" }}>Item Description</th>
                      <th style={{ padding: 8, color: "var(--text-secondary)", textAlign: "center" }}>Qty</th>
                      <th style={{ padding: 8, color: "var(--text-secondary)", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPass.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8, fontWeight: 600, color: "var(--text-primary)" }}>{it.name}</td>
                        <td style={{ padding: 8, textAlign: "center", fontWeight: 700, color: "var(--primary)" }}>
                          {it.quantity}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", color: "var(--text-primary)" }}>
                          ₹{(it.price * it.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>Verified Total</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "var(--success)" }}>
                ₹{selectedPass.amount.toFixed(2)}
              </span>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setSelectedPass(null)}>
                Close
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRejectingOrderId(selectedPass.id);
                      setRejectReason("");
                    }}
                    style={{ color: "var(--danger)" }}
                  >
                    Reject Pass
                  </Button>
                  <Button onClick={() => handleQuickApprove(selectedPass.id)} disabled={isPending}>
                    {isPending ? "Authorizing..." : "✓ Authorize & Open Gate"}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </Modal>
      )}

      {/* Reject Gate Pass Reason Modal */}
      {rejectingOrderId && (
        <Modal onClose={() => setRejectingOrderId(null)}>
          <Card style={{ width: 440, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--danger)" }}>
              Reject Customer Gate Pass
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Order will be blocked at exit and logged for manager and fraud investigation.
            </p>

            <form onSubmit={confirmRejectPass} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Discrepancy Reason *
                </label>
                <Input
                  placeholder="e.g. Extra unbilled product found in basket, bag weight mismatch..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setRejectingOrderId(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  style={{ background: "var(--danger)", color: "#fff", border: "none" }}
                >
                  {isPending ? "Blocking..." : "Confirm Gate Rejection"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Override Confirmation Modal */}
      {showOverrideConfirm && (
        <Modal onClose={() => setShowOverrideConfirm(false)}>
          <Card style={{ width: 440, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--danger)" }}>
              Confirm Forced Gate Override
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Are you sure you want to force open the exit gate with reason: <b>&ldquo;{overrideReason}&rdquo;</b>?
              This action creates a <b>CRITICAL</b> security audit record.
            </p>

            <form onSubmit={handleExecuteOverride} style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setShowOverrideConfirm(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                style={{ background: "var(--danger)", color: "#fff", border: "none" }}
              >
                {isPending ? "Executing..." : "Confirm & Force Open"}
              </Button>
            </form>
          </Card>
        </Modal>
      )}

      {/* Real-time Web & Mobile Camera QR Scanner Modal */}
      <QrCameraScannerModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={handleCameraScan}
        title="Exit Gate Pass Scanner"
        subtitle="Point your camera or mobile phone at customer's Exit Gate Pass QR code."
      />
    </div>
  );
}