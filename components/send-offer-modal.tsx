"use client";

import { useState, useTransition } from "react";
import { sendWinbackOffer, bulkSendWinbackOffers } from "@/actions/growth";
import { useRouter } from "next/navigation";

const DISCOUNT_PRESETS = [10, 15, 20, 25, 30];

export function SendOfferModal({
  targetCustomer,
  bulkUserIds,
  branchCode,
  onClose,
  onSuccess,
}: {
  targetCustomer?: { id: string; name: string } | null;
  bulkUserIds?: string[];
  branchCode?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isBulk = !targetCustomer && (bulkUserIds?.length ?? 0) > 0;
  const recipientCount = isBulk ? bulkUserIds!.length : 1;
  const recipientLabel = targetCustomer ? targetCustomer.name : `${recipientCount} Selected Customers`;

  const [discountPercent, setDiscountPercent] = useState<number>(15);
  const [expiryDays, setExpiryDays] = useState<number>(3);
  const [title, setTitle] = useState(
    targetCustomer ? `Special Deal for ${targetCustomer.name}! 🎁` : "Exclusive Store Offer! 🎁"
  );
  const [message, setMessage] = useState(
    "Get an instant discount on your in-store shopping visit at ClickOut! Apply at checkout."
  );

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const sampleCouponCode = `WIN${discountPercent}XPRO`;

  function handleSelectTemplate(type: "nudge" | "winback" | "flash") {
    if (type === "nudge") {
      setDiscountPercent(10);
      setTitle("Exclusive In-Store Voucher! 🛍️");
      setMessage("Shop in-store today and get an instant 10% off your entire cart at ClickOut checkout!");
    } else if (type === "winback") {
      setDiscountPercent(20);
      setTitle(`We Miss You, ${targetCustomer ? targetCustomer.name : "VIP Shopper"}! ❤️`);
      setMessage("It's been a while! Come back this week and enjoy a special 20% discount on your next visit.");
    } else {
      setDiscountPercent(25);
      setExpiryDays(1);
      setTitle("⚡ 24-Hour Flash Sale!");
      setMessage("Limited-time flash sale for today only! Enjoy 25% off on your shopping before midnight.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      if (targetCustomer) {
        const res = await sendWinbackOffer({
          targetUserId: targetCustomer.id,
          branchCode: branchCode ?? undefined,
          discountPercent,
          expiryDays,
          title,
          message,
        });

        if (!res.ok) {
          setError(res.error ?? "Failed to dispatch offer.");
        } else {
          setSuccessMsg(`✓ Offer sent successfully! Promo Code: ${res.couponCode}`);
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
            router.refresh();
          }, 900);
        }
      } else if (bulkUserIds && bulkUserIds.length > 0) {
        const res = await bulkSendWinbackOffers({
          targetUserIds: bulkUserIds,
          branchCode: branchCode ?? undefined,
          discountPercent,
          expiryDays,
          title,
          message,
        });

        if (!res.ok) {
          setError(res.error ?? "Failed to dispatch bulk offers.");
        } else {
          setSuccessMsg(`✓ Successfully dispatched offers to ${res.count} customers!`);
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
            router.refresh();
          }, 900);
        }
      }
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 540,
          background: "var(--card-bg)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 30px 60px -12px rgba(0, 0, 0, 0.7)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>📢</span>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                Send Promotional Offer
              </h2>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              Targeting: <strong style={{ color: "var(--success)" }}>{recipientLabel}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(0, 210, 106, 0.15)",
                  border: "1px solid var(--success)",
                  color: "var(--success)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {successMsg}
              </div>
            )}

            {/* Quick Template Preset Chips */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Quick Smart Templates
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate("nudge")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🛍️ In-Store Nudge (10%)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate("winback")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ❤️ VIP Winback (20%)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate("flash")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ⚡ 24h Flash (25%)
                </button>
              </div>
            </div>

            {/* Discount Preset Chips & Select */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  Discount Amount (%)
                </label>
                <span style={{ fontSize: 14, fontWeight: 900, color: "var(--success)" }}>
                  {discountPercent}% OFF
                </span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {DISCOUNT_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountPercent(pct)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      border: discountPercent === pct ? "2px solid var(--success)" : "1px solid var(--border)",
                      background: discountPercent === pct ? "rgba(0, 210, 106, 0.12)" : "var(--scaffold-bg)",
                      color: discountPercent === pct ? "var(--success)" : "var(--text-primary)",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Validity Duration */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Coupon Validity (Days)
              </label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  outline: "none",
                }}
              >
                <option value={1}>1 Day (Urgent Flash Sale)</option>
                <option value={2}>2 Days (Weekend Deal)</option>
                <option value={3}>3 Days (Recommended)</option>
                <option value={7}>7 Days (1 Week)</option>
                <option value={14}>14 Days (Extended)</option>
              </select>
            </div>

            {/* Notification Title */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Push Notification Headline
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Offer Message */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Notification Message Body
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "none",
                }}
              />
            </div>

            {/* Real Smartphone Notification Preview Mockup */}
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
                📱 Mobile Push Preview
              </div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>🛍️</span>
                  <strong style={{ fontSize: 12, color: "var(--text-primary)" }}>ClickOut Store</strong>
                  <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: "auto" }}>Now</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)" }}>
                  {title}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                  {message}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(0, 210, 106, 0.12)",
                    color: "var(--success)",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                  }}
                >
                  PROMO: {sampleCouponCode}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 4px 14px rgba(0, 210, 106, 0.3)",
                }}
              >
                {isPending ? "Dispatching..." : `Send to ${recipientLabel} 🚀`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
