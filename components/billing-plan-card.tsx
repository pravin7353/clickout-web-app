"use client";

import { useState } from "react";
import { UpgradePopup } from "@/components/subscription/UpgradePopup";

interface BillingPlanCardProps {
  planName: string;
  displayName: string;
  monthlyPrice: number;
  description: string;
  extraStoresPurchased?: number;
  extraStaffBlocksPurchased?: number;
  extraPosCountersPurchased?: number;
}

export function BillingPlanCard({
  planName,
  displayName,
  monthlyPrice,
  description,
  extraStoresPurchased = 0,
  extraStaffBlocksPurchased = 0,
  extraPosCountersPurchased = 0,
}: BillingPlanCardProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isFree = monthlyPrice === 0;

  return (
    <>
      <div
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--primary, #3b82f6) 12%, var(--card-bg, #18181b)), var(--card-bg, #18181b))",
          border: "1px solid color-mix(in srgb, var(--primary, #3b82f6) 30%, var(--border, #27272a))",
          borderRadius: 20,
          padding: "26px 30px",
          boxShadow: "0 14px 40px rgba(0,0,0,0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--text-primary, #ffffff)", letterSpacing: "-0.02em" }}>
              {displayName} Plan
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 99,
                background: "var(--primary, #3b82f6)",
                color: "#ffffff",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Active Subscription
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary, #a1a1aa)", maxWidth: 500, lineHeight: 1.5 }}>
            {description}
          </p>

          {(extraStoresPurchased > 0 || extraStaffBlocksPurchased > 0 || extraPosCountersPurchased > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {extraStoresPurchased > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary, #a1a1aa)" }}>
                  +{extraStoresPurchased} Add-on Store{extraStoresPurchased > 1 ? "s" : ""}
                </span>
              )}
              {extraStaffBlocksPurchased > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary, #a1a1aa)" }}>
                  +{extraStaffBlocksPurchased * 10} Staff Capacity
                </span>
              )}
              {extraPosCountersPurchased > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "var(--text-secondary, #a1a1aa)" }}>
                  +{extraPosCountersPurchased} POS Billing Counter{extraPosCountersPurchased > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text-primary, #ffffff)" }}>
              {isFree ? "Free" : `₹${monthlyPrice.toLocaleString()}`}
              {!isFree && <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary, #a1a1aa)" }}>/mo</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary, #a1a1aa)", marginTop: 2 }}>
              {isFree ? "Starter tier" : "Billed monthly via Razorpay"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              color: "#000000",
              fontWeight: 800,
              fontSize: 13,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(245, 158, 11, 0.3)",
              transition: "transform 0.15s ease",
            }}
          >
            Upgrade Plan ⚡
          </button>
        </div>
      </div>

      <UpgradePopup
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={planName}
      />
    </>
  );
}
