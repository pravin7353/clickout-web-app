"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  effectiveMaxStaff,
} from "@/lib/subscription/plan";
import { purchaseExtraStore, purchaseStaffBlock } from "@/actions/subscription";
import { UpgradePopup } from "./UpgradePopup";
import { RazorpayCheckout } from "./RazorpayCheckout";

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
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

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
  const maxStaff = effectiveMaxStaff(resolvedPlan, sub.extraStaffPurchased);
  const isStaffLimitHit = maxStaff !== "unlimited" && currentStaffCount >= maxStaff;
  const staffApproaching =
    maxStaff !== "unlimited" && currentStaffCount >= maxStaff * 0.9;

  const maxStores = effectiveMaxStores(resolvedPlan, extraStoresPurchased);
  const isStoreLimitHit = maxStores !== "unlimited" && currentStoreCount >= maxStores;
  const isStoreCloseToLimit =
    maxStores !== "unlimited" &&
    (currentStoreCount >= maxStores || (maxStores > 1 && currentStoreCount >= maxStores - 1));

  if (!txWarning && !staffApproaching && !isStaffLimitHit && !isStoreCloseToLimit && !isStoreLimitHit) {
    return null;
  }

  let warningText = "You've used 90% of your monthly transactions. Upgrade to avoid disruption.";
  if (isStoreLimitHit) {
    warningText = `You have reached your store location limit (${currentStoreCount}/${maxStores} used). ${
      cfg.extraStorePrice !== null
        ? `Buy an extra store slot (+₹${cfg.extraStorePrice}/mo) or upgrade your plan.`
        : "Upgrade your plan to add more locations."
    }`;
  } else if (isStoreCloseToLimit) {
    warningText = `You are close to your store location limit (${currentStoreCount}/${maxStores} used). ${
      cfg.extraStorePrice !== null
        ? `Buy an extra store slot (+₹${cfg.extraStorePrice}/mo) to add more stores seamlessly.`
        : "Upgrade your plan to add more locations."
    }`;
  } else if (isStaffLimitHit) {
    warningText = `You have reached your staff account limit (${currentStaffCount}/${maxStaff} used). ${
      resolvedPlan === "pro" || resolvedPlan === "growth"
        ? "Buy a Staff Block (+10 for ₹199/mo) or upgrade your plan."
        : "Upgrade your plan to add more staff accounts."
    }`;
  } else if (staffApproaching) {
    warningText = `You are approaching your staff account limit (${currentStaffCount}/${maxStaff} used). ${
      resolvedPlan === "pro" || resolvedPlan === "growth"
        ? "Buy a Staff Block (+10 for ₹199/mo) or upgrade your plan."
        : "Upgrade your plan to add more staff accounts."
    }`;
  } else if (txWarning) {
    warningText = "You've used 90% of your monthly transactions. Upgrade to avoid disruption.";
  }

  const handleBuyExtraStore = () => {
    setActionMsg(null);
    startTransition(async () => {
      try {
        const res = await purchaseExtraStore(sub.tenantId || undefined);
        if (res.ok) {
          setActionMsg({
            type: "success",
            text: res.message || "Extra store slot added successfully!",
          });
          sub.refresh();
          setTimeout(() => setActionMsg(null), 5000);
        } else {
          setActionMsg({
            type: "error",
            text: res.error || "Failed to purchase extra store slot.",
          });
        }
      } catch (err: any) {
        setActionMsg({
          type: "error",
          text: err?.message || "Purchase failed. Please try again.",
        });
      }
    });
  };

  const handleBuyStaffBlock = () => {
    setActionMsg(null);
    startTransition(async () => {
      try {
        const res = await purchaseStaffBlock(sub.tenantId || undefined);
        if (res.ok) {
          setActionMsg({
            type: "success",
            text: res.message || "Staff Block (+10) added successfully!",
          });
          sub.refresh();
          setTimeout(() => setActionMsg(null), 5000);
        } else {
          setActionMsg({
            type: "error",
            text: res.error || "Failed to purchase staff block.",
          });
        }
      } catch (err: any) {
        setActionMsg({
          type: "error",
          text: err?.message || "Purchase failed. Please try again.",
        });
      }
    });
  };

  const canBuyExtraStore = (isStoreLimitHit || isStoreCloseToLimit) && cfg.extraStorePrice !== null;
  const canBuyStaffBlock =
    (resolvedPlan === "pro" || resolvedPlan === "growth") && (isStaffLimitHit || staffApproaching);

  return (
    <>
      <div
        className={className}
        style={{
          background: actionMsg?.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
          border: `1px solid ${
            actionMsg?.type === "success" ? "rgba(34, 197, 94, 0.35)" : "rgba(245, 158, 11, 0.35)"
          }`,
          borderRadius: 14,
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          color: actionMsg?.type === "success" ? "#22c55e" : "#F59E0B",
          ...style,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{actionMsg?.type === "success" ? "✅" : "⚠️"}</span>
          <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
            {actionMsg?.text || warningText}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {canBuyExtraStore && cfg.extraStorePrice !== null && (
            <RazorpayCheckout
              purchaseType="extra_store"
              planKey={resolvedPlan}
              planLabel={cfg.displayName}
              amountRs={cfg.extraStorePrice}
              tenantId={sub.tenantId || ""}
              buttonText={`+ Buy Extra Store (₹${cfg.extraStorePrice}/mo)`}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#22c55e",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(34, 197, 94, 0.25)",
                flexShrink: 0,
              }}
              onSuccess={() => {
                setActionMsg({
                  type: "success",
                  text: "🎉 Extra store slot purchased successfully!",
                });
                router.refresh();
                setTimeout(() => setActionMsg(null), 5000);
              }}
            />
          )}

          {canBuyStaffBlock && (
            <button
              type="button"
              onClick={handleBuyStaffBlock}
              disabled={isPending}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#a855f7",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 800,
                cursor: isPending ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
                boxShadow: "0 2px 8px rgba(168, 85, 247, 0.25)",
                flexShrink: 0,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? "Processing..." : "+ Buy Staff Block (+10 @ ₹199/mo)"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: canBuyExtraStore ? "1px solid rgba(245, 158, 11, 0.4)" : "none",
              background: canBuyExtraStore ? "transparent" : "#F59E0B",
              color: canBuyExtraStore ? "#F59E0B" : "#000000",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
              boxShadow: canBuyExtraStore ? "none" : "0 2px 8px rgba(245, 158, 11, 0.25)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!canBuyExtraStore) e.currentTarget.style.background = "#E0A855";
            }}
            onMouseLeave={(e) => {
              if (!canBuyExtraStore) e.currentTarget.style.background = "#F59E0B";
            }}
          >
            Upgrade Plan →
          </button>
        </div>
      </div>

      <UpgradePopup
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentPlan={plan}
      />
    </>
  );
}
