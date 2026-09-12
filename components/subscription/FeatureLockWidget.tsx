"use client";

import React, { useState } from "react";
import { useTenantSubscription } from "@/lib/subscription/use-subscription";
import {
  isRouteAllowed,
  getUpgradeMessage,
  getFeatureBullets,
  getRequiredPlanName,
} from "@/lib/subscription/access-engine";
import { SubscriptionPlan } from "@/lib/subscription/plan";
import { UpgradePopup } from "./UpgradePopup";

interface FeatureLockWidgetProps {
  route: string;
  children: React.ReactNode;
  plan?: SubscriptionPlan | string;
  isTrialActive?: boolean;
}

export function FeatureLockWidget({
  route,
  children,
  plan: propPlan,
  isTrialActive: propIsTrialActive,
}: FeatureLockWidgetProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sub = useTenantSubscription();

  const plan = propPlan ?? sub.plan;
  const trialActive = propIsTrialActive ?? sub.isTrialActive;

  const isAllowed = isRouteAllowed({
    route,
    plan,
    isTrialActive: trialActive,
  });

  if (isAllowed) {
    return <>{children}</>;
  }

  const upgradeMessage = getUpgradeMessage(route);
  const bullets = getFeatureBullets(route);
  const requiredPlanName = getRequiredPlanName(route);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "60vh" }}>
      {/* Blurred & Inactive Children */}
      <div
        style={{
          filter: "blur(5px)",
          opacity: 0.15,
          pointerEvents: "none",
          userSelect: "none",
          height: "100%",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Centered Lock Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            background: "var(--card-bg)",
            borderRadius: 22,
            border: "1px solid rgba(245, 158, 11, 0.3)",
            boxShadow:
              "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 24px rgba(245, 158, 11, 0.08)",
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 16,
          }}
        >
          {/* Lock Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            🔒
          </div>

          {/* Required Plan Badge */}
          {requiredPlanName && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                padding: "4px 12px",
                borderRadius: 20,
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "#F59E0B",
              }}
            >
              {requiredPlanName} Plan Required
            </span>
          )}

          {/* Upgrade Message */}
          <div>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {upgradeMessage}
            </h3>
          </div>

          {/* Feature Bullets */}
          {bullets.length > 0 && (
            <div
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "16px 18px",
                textAlign: "left",
                marginTop: 4,
              }}
            >
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
                Included in {requiredPlanName}:
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 8,
                }}
              >
                {bullets.map((bullet, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ color: "#F59E0B", fontWeight: 900, fontSize: 14 }}>
                      ✓
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Upgrade Now Button */}
          <button
            onClick={() => setShowUpgrade(true)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "12px 20px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#000000",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(245, 158, 11, 0.35)",
              transition: "transform 0.1s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
          >
            Upgrade Now
          </button>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradePopup
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentPlan={plan}
      />
    </div>
  );
}
