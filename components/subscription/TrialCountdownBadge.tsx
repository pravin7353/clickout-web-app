"use client";

import React, { useState } from "react";
import { useTenantSubscription } from "@/lib/subscription/use-subscription";
import { isTrialActive, trialDaysRemaining } from "@/lib/subscription/access-engine";
import { SubscriptionPlan } from "@/lib/subscription/plan";
import { UpgradePopup } from "./UpgradePopup";

interface TrialCountdownBadgeProps {
  trialEndsAt?: Date | null;
  isTrialActive?: boolean;
  plan?: SubscriptionPlan | string;
  onClick?: () => void;
}

export function TrialCountdownBadge({
  trialEndsAt: propTrialEndsAt,
  isTrialActive: propIsTrialActive,
  plan: propPlan,
  onClick,
}: TrialCountdownBadgeProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sub = useTenantSubscription();

  const plan = propPlan ?? sub.plan;
  const trialEndsAt = propTrialEndsAt !== undefined ? propTrialEndsAt : sub.trialEndsAt;
  const active = propIsTrialActive !== undefined ? propIsTrialActive : isTrialActive(trialEndsAt);

  // Only show when trial is active
  if (!active || (plan !== "trial" && !active)) {
    return null;
  }

  const days = trialDaysRemaining(trialEndsAt);
  if (days < 0) return null;

  const label =
    days === 0
      ? "Last day of trial"
      : days === 1
      ? "1 day left in trial"
      : `${days} days left in trial`;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowUpgrade(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        title="Click to view upgrade plans"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 20,
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          color: "#F59E0B",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(245, 158, 11, 0.2)";
          e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(245, 158, 11, 0.12)";
          e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.35)";
        }}
      >
        <span style={{ fontSize: 13 }}>⏳</span>
        <span>{label}</span>
      </button>

      <UpgradePopup
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentPlan={plan}
      />
    </>
  );
}
