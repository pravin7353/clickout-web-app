"use client";

import React from "react";
import { Modal } from "@/components/profile-menu";
import {
  SubscriptionPlan,
  PLAN_CONFIG,
  planFromString,
} from "@/lib/subscription/plan";

const PLAN_FEATURES: Record<SubscriptionPlan, string[]> = {
  trial: [
    "Full access to all modules",
    "Self-Checkout & Cashier POS",
    "AI Fraud & Audit Suite",
    "Multi-Store Analytics",
  ],
  mini: [
    "Self-Checkout (Customer App)",
    "Cashier POS + Billing",
    "Guard Exit Verification",
    "Basic Inventory Tracking",
    "Email Support",
  ],
  pro: [
    "Everything in Mini",
    "Full Inventory + Low-Stock Alerts",
    "AI Fraud Detection",
    "Procurement + Suppliers",
    "Priority Email + Chat Support",
  ],
  growth: [
    "Everything in Pro",
    "Multi-Store Analytics Dashboard",
    "Churn Radar + Auto-Winback",
    "Staff Verification + Manpower",
    "Automated GST Reports (CA-grade)",
    "Dedicated Account Manager",
  ],
  business: [
    "Everything in Growth, across all businesses",
    "Multiple Tenants (multi-business login)",
    "Custom Integrations + ERP API Access",
    "Dedicated Infrastructure & SLA",
    "White-Glove Onboarding",
    "24/7 Priority Support",
  ],
};

const DISPLAY_PLANS: SubscriptionPlan[] = ["mini", "pro", "growth", "business"];

export function UpgradePopup({
  isOpen,
  onClose,
  currentPlan,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: SubscriptionPlan | string;
}) {
  if (!isOpen) return null;

  const resolvedCurrent = currentPlan ? planFromString(currentPlan) : null;

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 1040,
          maxWidth: "94vw",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--card-bg)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.6)",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          position: "relative",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: 20,
            cursor: "pointer",
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 20,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#F59E0B",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            ✨ Upgrade ClickOut
          </div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Choose the Right Plan for Your Store
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Scale your locations, fraud prevention, and operational automation seamlessly.
          </p>
        </div>

        {/* Plans Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {DISPLAY_PLANS.map((planKey) => {
            const config = PLAN_CONFIG[planKey];
            const isPopular = planKey === "pro";
            const isCurrent = resolvedCurrent === planKey;
            const features = PLAN_FEATURES[planKey];

            return (
              <div
                key={planKey}
                style={{
                  background: isPopular
                    ? "color-mix(in srgb, var(--card-bg) 90%, #F59E0B 10%)"
                    : "var(--scaffold-bg)",
                  border: isPopular
                    ? "2px solid #F59E0B"
                    : "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isPopular
                    ? "0 8px 32px rgba(245, 158, 11, 0.15)"
                    : "none",
                }}
              >
                {/* Popular Pill */}
                {isPopular && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#F59E0B",
                      color: "#000000",
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      boxShadow: "0 2px 8px rgba(245, 158, 11, 0.4)",
                    }}
                  >
                    ★ Most Popular
                  </div>
                )}

                {/* Title */}
                <div style={{ marginBottom: 12 }}>
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {config.displayName}
                  </h3>
                </div>

                {/* Price */}
                <div style={{ marginBottom: 16 }}>
                  {config.monthlyPrice === 0 ? (
                    <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>
                      Custom
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>
                        ₹{config.monthlyPrice}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        /month
                      </span>
                    </div>
                  )}
                </div>

                {/* Store & Tx Badges */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginBottom: 16,
                    padding: "10px 12px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                    🏪 {config.baseStores} Store{config.baseStores !== 1 ? "s" : ""} included
                  </div>
                  {config.extraStorePrice !== null && (
                    <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>
                      +₹{config.extraStorePrice}/extra store
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    💳 {typeof config.baseTx === "number" ? config.baseTx.toLocaleString() : config.baseTx} tx/mo base
                  </div>
                  {config.extraStoreTx > 0 && (
                    <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                      +{config.extraStoreTx.toLocaleString()} tx per extra store
                    </div>
                  )}
                </div>

                {/* Features List */}
                <div style={{ flex: 1, marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "var(--text-secondary)",
                      marginBottom: 10,
                    }}
                  >
                    Features
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                    {features.map((feat, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 12,
                          color: "var(--text-primary)",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ color: isPopular ? "#F59E0B" : "var(--primary)", flexShrink: 0 }}>
                          ✓
                        </span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Upgrade Button */}
                <div>
                  {isCurrent ? (
                    <button
                      disabled
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "not-allowed",
                      }}
                    >
                      Current Plan
                    </button>
                  ) : (
                    <a
                      href="https://clickout.in/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: isPopular ? "none" : "1px solid var(--border)",
                        background: isPopular
                          ? "linear-gradient(135deg, #F59E0B, #D97706)"
                          : "var(--card-bg)",
                        color: isPopular ? "#000000" : "var(--text-primary)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        textDecoration: "none",
                        boxShadow: isPopular ? "0 4px 12px rgba(245, 158, 11, 0.3)" : "none",
                        transition: "transform 0.1s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                    >
                      {config.monthlyPrice === 0 ? "Contact Sales" : `Upgrade to ${config.displayName}`}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
