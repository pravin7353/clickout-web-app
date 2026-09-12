"use client";

import React, { useState } from "react";
import { useTenantSubscription } from "@/lib/subscription/use-subscription";
import {
  isTransactionWarning,
  isStaffLimitReached,
  isStoreLimitReached,
} from "@/lib/subscription/access-engine";
import {
  SubscriptionPlan,
  PLAN_CONFIG,
  planFromString,
  effectiveMaxStores,
} from "@/lib/subscription/plan";
import { UpgradePopup } from "./UpgradePopup";

interface UsageLimitBannerProps {
  plan?: SubscriptionPlan | string;
  extraStoresPurchased?: number;
  currentTransactions?: number;
  currentStaffCount?: number;
  currentStoreCount?: number;
  isTrialActive?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function UsageLimitBanner({
  plan: propPlan,
  extraStoresPurchased: propExtraStores,
  currentTransactions: propTx,
  currentStaffCount: propStaff,
  currentStoreCount: propStores,
  isTrialActive: propTrialActive,
  style,
  className,
}: UsageLimitBannerProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sub = useTenantSubscription();

  const plan = propPlan ?? sub.plan;
  const resolvedPlan = planFromString(plan);
  const extraStoresPurchased = propExtraStores ?? sub.extraStoresPurchased;
  const currentTransactions = propTx ?? sub.currentTransactions;
  const currentStaffCount = propStaff ?? sub.currentStaffCount;
  const currentStoreCount = propStores ?? sub.currentStoreCount;
  const trialActive = propTrialActive ?? sub.isTrialActive;

  // Active trial or business plan has unlimited quotas
  if (trialActive || resolvedPlan === "trial" || resolvedPlan === "business") {
    return null;
  }

  const txWarning = isTransactionWarning(
    resolvedPlan,
    extraStoresPurchased,
    currentTransactions
  );

  const cfg = PLAN_CONFIG[resolvedPlan];
  const staffApproaching =
    cfg.maxStaff !== "unlimited" && currentStaffCount >= cfg.maxStaff * 0.9;

  const maxStores = effectiveMaxStores(resolvedPlan, extraStoresPurchased);
  const storeApproaching =
    maxStores !== "unlimited" && currentStoreCount >= maxStores;

  if (!txWarning && !staffApproaching && !storeApproaching) {
    return null;
  }

  let warningText = "You've used 90% of your monthly transactions. Upgrade to avoid disruption.";
  if (txWarning) {
    warningText = "You've used 90% of your monthly transactions. Upgrade to avoid disruption.";
  } else if (staffApproaching) {
    warningText = "You are approaching your staff account limit. Upgrade to add more team members.";
  } else if (storeApproaching) {
    warningText = "You have reached your store location limit. Add more stores or upgrade your plan.";
  }

  return (
    <>
      <div
        className={className}
        style={{
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: 14,
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          color: "#F59E0B",
          ...style,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
            {warningText}
          </span>
        </div>

        <button
          onClick={() => setShowUpgrade(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "#F59E0B",
            color: "#000000",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s ease",
            boxShadow: "0 2px 8px rgba(245, 158, 11, 0.25)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#E0A855")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
        >
          Upgrade Now →
        </button>
      </div>

      <UpgradePopup
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentPlan={plan}
      />
    </>
  );
}
