"use client";

import { useState, useTransition } from "react";
import {
  searchOrderForRefund,
  processRefund,
  RefundOrderDetails,
  RefundPayoutMethod,
} from "@/actions/refund";
import { generateInvoicePdf } from "@/actions/invoice";
import {
  Card,
  Button,
  Input,
  Badge,
  EmptyState,
  ErrorBanner,
} from "@/components/ui";
import { Modal } from "@/components/profile-menu";

interface RefundDecisionProps {
  initialStoreId?: string | null;
  adminName?: string;
  adminRole?: string;
  canEdit?: boolean;
}

export function RefundDecision({
  initialStoreId = null,
  adminName = "Admin",
  adminRole = "manager",
  canEdit = true,
}: RefundDecisionProps) {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<RefundOrderDetails | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Execution Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  function handleSearch() {
    const q = orderId.trim();
    if (!q) return;
    setError("");
    setSuccessMsg("");
    startTransition(async () => {
      const res = await searchOrderForRefund(q, initialStoreId || undefined);
      if (!res.ok) {
        setError(res.error || "Order lookup failed.");
        setOrder(null);
      } else {
        setOrder(res.order || null);
      }
    });
  }

  function handleRefundComplete(amount: number, method: string, refId: string) {
    setShowRefundModal(false);
    setSuccessMsg(`₹${amount.toFixed(2)} refund authorized successfully via ${method.replace(/_/g, " ")}. Audit reference: ${refId}`);
    handleSearch();
  }

  async function handleDownloadPdf(targetOrderId: string) {
    setIsDownloadingPdf(true);
    try {
      const res = await generateInvoicePdf(targetOrderId);
      if (!res.ok || !res.data) {
        alert(res.error || "Failed to generate PDF");
        return;
      }
      const byteCharacters = atob(res.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `CreditNote_${targetOrderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("PDF download failed: " + e.message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const isAlreadyRefunded =
    order && (order.status === "REFUNDED" || Boolean(order.existingRefund));
  const isCash = order?.paymentMethod === "CASH";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Top Header Card */}
      <Card
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          background: "var(--card-bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "color-mix(in srgb, var(--primary) 12%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            💸
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Retail Refund & Return Desk
            </h2>
            <p style={{ margin: "3px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Policy validation, till cash handover, gateway bank reversals, and GST credit note issuance.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Badge color="var(--primary)">
            🏬 {initialStoreId ? `Branch: ${initialStoreId}` : "All Branches (HQ)"}
          </Badge>
          <Badge color="var(--text-secondary)">
            👤 {adminName} ({adminRole})
          </Badge>
        </div>
      </Card>

      {/* Search Input Bar */}
      <Card style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
            <Input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Scan or enter Order ID (e.g. ord_2zZssUq3ggNgE5pH0L6Z)..."
              style={{ width: "100%", paddingRight: 40 }}
            />
            {orderId && (
              <button
                onClick={() => {
                  setOrderId("");
                  setOrder(null);
                  setError("");
                  setSuccessMsg("");
                }}
                style={{
                  position: "absolute",
                  right: 12,
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
            variant="primary"
            onClick={handleSearch}
            disabled={isPending || !orderId.trim()}
            style={{ minWidth: 140 }}
          >
            {isPending ? "Searching..." : "Lookup Order"}
          </Button>
        </div>

        {error && <ErrorBanner message={error} />}

        {successMsg && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--success) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
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
      </Card>

      {/* Awaiting state */}
      {!order && !isPending && !error && (
        <EmptyState
          icon="🔍"
          message="Enter an Order ID above to inspect payment verification, return policy eligibility, and process retail cash or gateway refunds."
        />
      )}

      {/* Order Details & Refund Operations */}
      {order && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Policy & Eligibility Banner */}
          <Card
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              background:
                order.returnPolicy.eligibilityStatus === "ELIGIBLE"
                  ? "color-mix(in srgb, var(--success) 8%, var(--card-bg))"
                  : order.returnPolicy.eligibilityStatus === "ALREADY_REFUNDED"
                  ? "color-mix(in srgb, var(--primary) 8%, var(--card-bg))"
                  : order.returnPolicy.eligibilityStatus === "EXPIRED"
                  ? "rgba(245, 158, 11, 0.08)"
                  : "rgba(239, 68, 68, 0.08)",
              border:
                order.returnPolicy.eligibilityStatus === "ELIGIBLE"
                  ? "1px solid color-mix(in srgb, var(--success) 30%, transparent)"
                  : order.returnPolicy.eligibilityStatus === "ALREADY_REFUNDED"
                  ? "1px solid color-mix(in srgb, var(--primary) 30%, transparent)"
                  : order.returnPolicy.eligibilityStatus === "EXPIRED"
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 28 }}>
                {order.returnPolicy.eligibilityStatus === "ELIGIBLE"
                  ? "✅"
                  : order.returnPolicy.eligibilityStatus === "ALREADY_REFUNDED"
                  ? "🔒"
                  : order.returnPolicy.eligibilityStatus === "EXPIRED"
                  ? "⏳"
                  : "🚫"}
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    Store Return Policy:{" "}
                    {order.returnPolicy.policyType === "NON_REFUNDABLE"
                      ? "Non-Refundable"
                      : `${order.returnPolicy.returnWindowDays}-Day Return Window`}
                  </h4>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background:
                        order.returnPolicy.eligibilityStatus === "ELIGIBLE"
                          ? "var(--cta-bg)"
                          : order.returnPolicy.eligibilityStatus === "ALREADY_REFUNDED"
                          ? "color-mix(in srgb, var(--cta-bg) 20%, var(--card-bg))"
                          : order.returnPolicy.eligibilityStatus === "EXPIRED"
                          ? "#f59e0b"
                          : "var(--danger)",
                      color:
                        order.returnPolicy.eligibilityStatus === "ELIGIBLE"
                          ? "var(--cta-text)"
                          : order.returnPolicy.eligibilityStatus === "ALREADY_REFUNDED"
                          ? "var(--text-primary)"
                          : "#fff",
                    }}
                  >
                    {order.returnPolicy.eligibilityStatus.replace(/_/g, " ")}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {order.returnPolicy.policyMessage}
                </p>
              </div>
            </div>

            {isAlreadyRefunded ? (
              <Button
                variant="secondary"
                onClick={() => handleDownloadPdf(order.id)}
                disabled={isDownloadingPdf}
              >
                {isDownloadingPdf ? "Generating..." : "📄 Download GST Credit Note"}
              </Button>
            ) : (
              canEdit && (
                <Button
                  variant="primary"
                  onClick={() => setShowRefundModal(true)}
                  style={{ minWidth: 160 }}
                >
                  Proceed to Refund →
                </Button>
              )
            )}
          </Card>

          {/* Already Refunded Details Card */}
          {isAlreadyRefunded && order.existingRefund && (
            <Card
              style={{
                background: "color-mix(in srgb, var(--success) 6%, var(--card-bg))",
                border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📑</span>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--success)" }}>
                    SETTLED REFUND & CREDIT NOTE RECORD
                  </h4>
                </div>
                <Badge color="var(--success)">STATUS: {order.existingRefund.status}</Badge>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Refund Reference</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {order.existingRefund.reference || order.existingRefund.id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Refunded Amount</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "var(--danger)" }}>
                    -₹{order.existingRefund.amount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Refund Payout Method</div>
                  <div style={{ fontWeight: 700 }}>
                    {order.existingRefund.method.replace(/_/g, " ")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Staff / Cashier Sign-off</div>
                  <div style={{ fontWeight: 600 }}>{order.existingRefund.processedBy}</div>
                </div>
                {order.existingRefund.staffConfirmedCashHandover && (
                  <div style={{ gridColumn: "1 / -1", color: "var(--success)", fontSize: 12, fontWeight: 600 }}>
                    ✓ Staff verified physical cash was returned to customer at till.
                  </div>
                )}
                {order.existingRefund.reason && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Audit Compliance Reason</div>
                    <div style={{ fontStyle: "italic", color: "var(--text-primary)", marginTop: 2 }}>
                      &ldquo;{order.existingRefund.reason}&rdquo;
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Key Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Order Gross Value</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text-primary)", marginTop: 6, fontFamily: "monospace" }}>
                ₹{order.totalAmount.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · Billed on {new Date(order.createdAtMs || Date.now()).toLocaleDateString()}
              </div>
            </Card>

            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Original Payment Method</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 22 }}>{isCash ? "💵" : "📱"}</span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: isCash ? "var(--success)" : "#3b82f6",
                  }}
                >
                  {order.paymentMethod}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {isCash ? "Cash at Till Float" : `Ref: ${order.gatewayTxnId || "Digital"}`}
              </div>
            </Card>

            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Customer Identity</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>
                {order.customerName}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {order.customerPhone ? `Phone: ${order.customerPhone}` : "Walk-in Guest"} · Branch: {order.branchCode}
              </div>
            </Card>

            <Card style={{ padding: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Security Exit Status</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, color: order.exitStatus === "APPROVED" ? "var(--success)" : "var(--text-primary)" }}>
                {order.exitStatus || "PENDING"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                Customer Trust Score: {order.trustScore}/100
              </div>
            </Card>
          </div>

          {/* Purchased Line Items */}
          {order.items.length > 0 && (
            <Card style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Purchased Items ({order.items.length} Lines)
                </h4>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Verified Billed Prices
                </span>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {order.items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--scaffold-bg) 60%, transparent)",
                      border: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{it.name}</span>
                      <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>
                        x{it.quantity} @ ₹{(it.price || 0).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      ₹{((it.price || 0) * (it.quantity || 1)).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Refund Execution Modal */}
      {showRefundModal && order && (
        <RefundExecutionModal
          order={order}
          adminName={adminName}
          onClose={() => setShowRefundModal(false)}
          onSuccess={handleRefundComplete}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Retail Refund Execution Modal
// -------------------------------------------------------------
// -------------------------------------------------------------
// Retail Refund Execution Modal (Clean, Simple & Frictionless)
// -------------------------------------------------------------
function RefundExecutionModal({
  order,
  adminName,
  onClose,
  onSuccess,
}: {
  order: RefundOrderDetails;
  adminName: string;
  onClose: () => void;
  onSuccess: (amount: number, method: string, refId: string) => void;
}) {
  const isOriginalCash = order.paymentMethod === "CASH";

  const [payoutMethod, setPayoutMethod] = useState<RefundPayoutMethod>(
    isOriginalCash ? "CASH_COUNTER" : "ORIGINAL_PAYMENT"
  );
  const [isPartial, setIsPartial] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [reason, setReason] = useState("Customer Return");
  const [gatewayRef, setGatewayRef] = useState(
    isOriginalCash ? "" : order.gatewayTxnId !== "N/A" ? order.gatewayTxnId : ""
  );
  const [cashHandedConfirmed, setCashHandedConfirmed] = useState(false);
  const [restockInventory, setRestockInventory] = useState(true);
  const [managerOverride, setManagerOverride] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const finalAmount = isPartial ? parseFloat(customAmount) || 0 : order.totalAmount;
  const isPolicyRestricted =
    order.returnPolicy.eligibilityStatus === "EXPIRED" ||
    order.returnPolicy.eligibilityStatus === "POLICY_BLOCKED";

  const quickReasons = [
    "Customer Return",
    "Defective Item",
    "Wrong Size",
    "Billing Error",
  ];

  function handleConfirm() {
    setError("");

    if (finalAmount <= 0 || finalAmount > order.totalAmount) {
      setError(`Please enter a valid amount between ₹1 and ₹${order.totalAmount.toFixed(2)}.`);
      return;
    }

    if (!reason.trim()) {
      setError("Please specify a reason for this refund.");
      return;
    }

    if (payoutMethod === "CASH_COUNTER" && !cashHandedConfirmed) {
      setError("Please confirm that physical cash was handed to the customer.");
      return;
    }

    if (isPolicyRestricted && !managerOverride) {
      setError(`Policy restriction: ${order.returnPolicy.policyMessage}. Please check manager override.`);
      return;
    }

    startTransition(async () => {
      const refNumber = gatewayRef.trim() || `REF-${Date.now().toString().slice(-6)}`;
      const res = await processRefund({
        orderId: order.id,
        refundMethod: payoutMethod,
        refundAmount: finalAmount,
        reason: reason.trim(),
        refundReference: refNumber,
        staffConfirmedCashHandover: payoutMethod === "CASH_COUNTER" ? cashHandedConfirmed : false,
        restockInventory,
        managerPolicyOverride: managerOverride,
      });

      if (!res.ok) {
        setError(res.error || "Refund execution failed.");
      } else {
        onSuccess(finalAmount, payoutMethod, refNumber);
      }
    });
  }

  const canSubmit =
    !isPending &&
    finalAmount > 0 &&
    finalAmount <= order.totalAmount &&
    (payoutMethod !== "CASH_COUNTER" || cashHandedConfirmed);

  return (
    <Modal onClose={onClose}>
      <Card
        style={{
          width: 480,
          maxWidth: "94vw",
          padding: 22,
          borderRadius: 16,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
          display: "grid",
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              Issue Refund
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Order: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{order.id.slice(0, 14)}...</span> · Paid via{" "}
              <strong style={{ color: isOriginalCash ? "var(--success)" : "#3b82f6" }}>
                {order.paymentMethod}
              </strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Policy Restriction Banner if any */}
        {isPolicyRestricted && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              fontSize: 12,
              color: "#d97706",
              display: "grid",
              gap: 6,
            }}
          >
            <div>⚠ {order.returnPolicy.policyMessage}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={managerOverride}
                onChange={(e) => setManagerOverride(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Manager Exception Override</span>
            </label>
          </div>
        )}

        {/* Amount Card */}
        <div
          style={{
            padding: "16px 18px",
            borderRadius: 12,
            background: "var(--scaffold-bg)",
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Refund Amount
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)", fontFamily: "monospace", marginTop: 2 }}>
              ₹{finalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 3,
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setIsPartial(false)}
              style={{
                background: !isPartial ? "var(--cta-bg)" : "transparent",
                color: !isPartial ? "var(--cta-text)" : "var(--text-secondary)",
                border: !isPartial ? "1px solid rgba(0,0,0,0.12)" : "1px solid transparent",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: !isPartial ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: !isPartial ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              }}
            >
              Full Order
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPartial(true);
                if (!customAmount) setCustomAmount(order.totalAmount.toFixed(2));
              }}
              style={{
                background: isPartial ? "var(--cta-bg)" : "transparent",
                color: isPartial ? "var(--cta-text)" : "var(--text-secondary)",
                border: isPartial ? "1px solid rgba(0,0,0,0.12)" : "1px solid transparent",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: isPartial ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: isPartial ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              }}
            >
              Partial
            </button>
          </div>
        </div>

        {/* Partial input if active */}
        {isPartial && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Enter Custom Refund Amount (₹)
            </label>
            <Input
              type="number"
              step="0.01"
              max={order.totalAmount}
              min={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="0.00"
              style={{ fontSize: 14, fontWeight: 700 }}
            />
          </div>
        )}

        {/* Method Selector (Pills) */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Payout Method
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPayoutMethod("CASH_COUNTER")}
              style={{
                padding: "12px",
                borderRadius: 10,
                border: payoutMethod === "CASH_COUNTER" ? "2px solid var(--cta-bg)" : "1px solid var(--border)",
                background: payoutMethod === "CASH_COUNTER" ? "color-mix(in srgb, var(--cta-bg) 14%, var(--card-bg))" : "var(--card-bg)",
                color: "var(--text-primary)",
                fontWeight: payoutMethod === "CASH_COUNTER" ? 800 : 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 16 }}>💵</span>
              <span>Cash at Counter</span>
            </button>

            <button
              type="button"
              onClick={() => setPayoutMethod(isOriginalCash ? "MANUAL_BANK_UPI" : "ORIGINAL_PAYMENT")}
              style={{
                padding: "12px",
                borderRadius: 10,
                border: payoutMethod !== "CASH_COUNTER" ? "2px solid var(--cta-bg)" : "1px solid var(--border)",
                background: payoutMethod !== "CASH_COUNTER" ? "color-mix(in srgb, var(--cta-bg) 14%, var(--card-bg))" : "var(--card-bg)",
                color: "var(--text-primary)",
                fontWeight: payoutMethod !== "CASH_COUNTER" ? 800 : 600,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 16 }}>📱</span>
              <span>{isOriginalCash ? "Bank / UPI Transfer" : "Gateway Reversal"}</span>
            </button>
          </div>
        </div>

        {/* If Cash Counter: Handover confirmation */}
        {payoutMethod === "CASH_COUNTER" ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--cta-bg) 12%, var(--card-bg))",
              border: "1px solid color-mix(in srgb, var(--cta-bg) 35%, transparent)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            <input
              type="checkbox"
              checked={cashHandedConfirmed}
              onChange={(e) => setCashHandedConfirmed(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--cta-bg)" }}
            />
            <span>
              I confirm <strong>₹{finalAmount.toFixed(2)}</strong> cash was returned to customer
            </span>
          </label>
        ) : (
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Reference / UTR / Gateway Refund ID
            </label>
            <Input
              value={gatewayRef}
              onChange={(e) => setGatewayRef(e.target.value)}
              placeholder="e.g. UTR-491823 or Gateway Ref"
            />
          </div>
        )}

        {/* Quick Reason Chips */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Refund Reason
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {quickReasons.map((r) => {
              const active = reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: active ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                    background: active ? "var(--cta-bg)" : "var(--scaffold-bg)",
                    color: active ? "var(--cta-text)" : "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: active ? 800 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>

          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type custom reason..."
            style={{ fontSize: 12 }}
          />
        </div>

        {/* Restock Inventory Toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <input
            type="checkbox"
            checked={restockInventory}
            onChange={(e) => setRestockInventory(e.target.checked)}
          />
          <span>Restock returned items to store physical inventory</span>
        </label>

        {error && <ErrorBanner message={error} />}

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!canSubmit}
            style={{ minWidth: 160 }}
          >
            {isPending ? "Processing..." : `Refund ₹${finalAmount.toFixed(2)}`}
          </Button>
        </div>
      </Card>
    </Modal>
  );
}