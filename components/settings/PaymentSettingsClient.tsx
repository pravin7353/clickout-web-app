"use client";

import React, { useState, useTransition } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";
import { TenantPaymentSettings, savePaymentSettings } from "@/actions/payment-settings";
import { generateUpiLink, generateUpiQrDataUrl } from "@/lib/utils/upi-link";
import { UpgradePopup } from "@/components/subscription/UpgradePopup";

interface PaymentSettingsClientProps {
  initialSettings: TenantPaymentSettings;
  currentPlan: string;
}

export function PaymentSettingsClient({
  initialSettings,
  currentPlan,
}: PaymentSettingsClientProps) {
  const normPlan = (currentPlan || "").toLowerCase();
  const isAllowedPlan =
    normPlan === "pro" ||
    normPlan === "growth" ||
    normPlan === "enterprise" ||
    normPlan === "business" ||
    normPlan === "trial";

  const [upiId, setUpiId] = useState(initialSettings.upiId || "");
  const [upiName, setUpiName] = useState(initialSettings.upiName || "");
  const [acceptsUpi, setAcceptsUpi] = useState(initialSettings.acceptsUpi);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    startTransition(async () => {
      try {
        const res = await savePaymentSettings({
          upiId,
          upiName,
          acceptsUpi,
        });

        if (res.ok) {
          setStatusMsg({ ok: true, message: res.message || "Payment settings updated successfully!" });
        } else {
          setStatusMsg({ ok: false, message: res.error || "Failed to update payment settings." });
        }
      } catch (err: any) {
        setStatusMsg({ ok: false, message: err?.message || "An unexpected error occurred." });
      }
    });
  };

  const previewUpiLink = upiId
    ? generateUpiLink({
        upiId,
        upiName: upiName || "Shop",
        amount: 100,
        invoiceNo: "DEMO-01",
        storeName: upiName || "Shop",
      })
    : "";

  const previewQrUrl = previewUpiLink ? generateUpiQrDataUrl(previewUpiLink) : "";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 24, padding: "24px 16px" }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>💳</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Merchant Payment & UPI Routing
          </h1>
          <Badge color={isAllowedPlan ? "var(--success)" : "var(--warning)"}>
            {isAllowedPlan ? "DIRECT SETTLEMENT" : "PRO FEATURE"}
          </Badge>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
          Configure your retail store’s bank UPI ID. Customer payments at POS and self-checkout will route directly to your account with zero platform middleman fees.
        </p>
      </div>

      {/* Plan Gate Alert for Spark / Mini */}
      {!isAllowedPlan && (
        <Card
          style={{
            padding: 24,
            border: "1px solid rgba(245, 158, 11, 0.4)",
            background: "color-mix(in srgb, #F59E0B 8%, var(--card-bg))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                Direct UPI Routing Requires Pro Plan
              </div>
            </div>
            <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "var(--text-secondary)", maxWidth: 540 }}>
              Spark and Mini plans support cash billing. Upgrade to Pro to accept direct customer UPI payments, generate dynamic checkout QR codes, and receive instant settlement in your shop account.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#F59E0B",
              color: "#000000",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.3)",
            }}
          >
            Upgrade to Pro →
          </button>
        </Card>
      )}

      {/* Settings Form & Live QR Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Left Column: Form */}
        <Card style={{ padding: 24, opacity: isAllowedPlan ? 1 : 0.65 }}>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Field 1: UPI ID */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Merchant UPI ID (VPA) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <Input
                type="text"
                disabled={!isAllowedPlan || isPending}
                placeholder="e.g. yourstore@okaxis, 9876543210@paytm"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                Payments will be routed directly to this UPI Virtual Payment Address.
              </span>
            </div>

            {/* Field 2: Display Name */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                UPI Payee Display Name
              </label>
              <Input
                type="text"
                disabled={!isAllowedPlan || isPending}
                placeholder="e.g. ClickOut Supermarket"
                value={upiName}
                onChange={(e) => setUpiName(e.target.value)}
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                Name shown to customers in their UPI app (PhonePe, GPay, Paytm) when paying.
              </span>
            </div>

            {/* Toggle: Accept UPI */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Accept UPI Payments
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Display UPI QR at Cashier POS and customer self-checkout
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!isAllowedPlan || isPending}
                checked={acceptsUpi}
                onChange={(e) => setAcceptsUpi(e.target.checked)}
                style={{ width: 18, height: 18, cursor: isAllowedPlan ? "pointer" : "not-allowed" }}
              />
            </div>

            {/* Toggle: Accept Cash (Always enabled) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Accept Cash Payments
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Physical cash settlement at billing counters (Always enabled)
                </div>
              </div>
              <input
                type="checkbox"
                disabled
                checked={true}
                style={{ width: 18, height: 18, cursor: "not-allowed" }}
              />
            </div>

            {/* Feedback Message */}
            {statusMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: statusMsg.ok ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: statusMsg.ok ? "var(--success)" : "var(--danger)",
                  border: `1px solid ${statusMsg.ok ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                {statusMsg.ok ? "✓ " : "✕ "} {statusMsg.message}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!isAllowedPlan || isPending}
              style={{
                marginTop: 4,
                padding: "11px 20px",
                fontWeight: 800,
                fontSize: 13,
                cursor: !isAllowedPlan || isPending ? "not-allowed" : "pointer",
              }}
            >
              {isPending ? "Saving Settings..." : "Save Payment Settings"}
            </Button>
          </form>
        </Card>

        {/* Right Column: Live QR Preview */}
        <Card style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: 0.5, marginBottom: 12 }}>
            Live Direct Checkout QR Preview
          </div>

          {upiId ? (
            <div
              style={{
                background: "#ffffff",
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--border)",
                display: "inline-block",
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                marginTop: 8,
              }}
            >
              <img
                src={previewQrUrl}
                alt="Merchant UPI QR Code"
                width={180}
                height={180}
                style={{ display: "block" }}
              />
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: "#000000" }}>
                {upiName || "ClickOut Merchant"}
              </div>
              <div style={{ fontSize: 11, color: "#666666", fontFamily: "monospace", marginTop: 2 }}>
                {upiId}
              </div>
            </div>
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: 16,
                border: "2px dashed var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "var(--text-secondary)",
                marginTop: 8,
              }}
            >
              <span style={{ fontSize: 28 }}>📱</span>
              <span style={{ fontSize: 12 }}>Enter your UPI ID to generate live QR</span>
            </div>
          )}

          <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: 300 }}>
            {acceptsUpi
              ? "✅ UPI is Active. Cashier POS terminal and customer self-checkout will present this dynamic QR for instant direct bank payment."
              : "⚠️ UPI is currently disabled. Customers will only see Cash options during checkout."}
          </div>
        </Card>
      </div>

      <UpgradePopup
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={currentPlan}
      />
    </div>
  );
}
