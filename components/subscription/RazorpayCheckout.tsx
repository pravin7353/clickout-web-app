"use client";

import React, { useState } from "react";

export interface RazorpayCheckoutProps {
  planKey: string;
  planLabel: string;
  amountRs: number;
  billingCycle?: "monthly" | "annual";
  tenantId: string;
  tenantName?: string;
  userEmail?: string;
  purchaseType?: "plan_upgrade" | "extra_store";
  buttonText?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}

export function RazorpayCheckout({
  planKey,
  planLabel,
  amountRs,
  billingCycle = "monthly",
  tenantId,
  tenantName = "ClickOut",
  userEmail = "",
  purchaseType = "plan_upgrade",
  buttonText,
  className,
  style,
  disabled = false,
  onSuccess,
  onCancel,
  children,
}: RazorpayCheckoutProps) {
  const [loading, setLoading] = useState(false);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      if ((window as any).Razorpay) return resolve(true);

      const existingScript = document.querySelector(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(true));
        existingScript.addEventListener("error", () => resolve(false));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePay = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (disabled || loading) return;

    if (!tenantId) {
      alert("Tenant ID is required for checkout. Please log in.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create order on server
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          billingCycle,
          tenantId,
          purchaseType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.orderId) {
        throw new Error(data.error || "Failed to initialize checkout order.");
      }

      // 2. Load script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Failed to load Razorpay payment SDK. Please check your network.");
      }

      const keyId = data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      // 3. Open Razorpay modal
      const options: any = {
        key: keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "ClickOut Retail OS",
        description:
          purchaseType === "extra_store"
            ? `Extra Store Location Slot (+1)`
            : `${planLabel} Plan - ${billingCycle === "annual" ? "Annual" : "Monthly"}`,
        prefill: {
          email: userEmail,
        },
        // UPI + NetBanking only (no card)
        config: {
          display: {
            blocks: {
              upi: { name: "Pay via UPI", instruments: [{ method: "upi" }] },
              netbanking: { name: "Pay via NetBanking", instruments: [{ method: "netbanking" }] },
            },
            sequence: ["block.upi", "block.netbanking"],
            preferences: { show_default_blocks: false },
          },
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            onCancel?.();
          },
        },
        handler: async (response: any) => {
          try {
            setLoading(true);
            const verifyRes = await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...response,
                tenantId,
                planKey,
                billingCycle,
                purchaseType,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.ok) {
              onSuccess();
            } else {
              alert(verifyData.error || "Payment verification failed. Please contact support.");
            }
          } catch (verifyErr: any) {
            console.error("Payment verification request failed:", verifyErr);
            alert("Error confirming payment. Please contact ClickOut support.");
          } finally {
            setLoading(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (failRes: any) => {
        console.error("Razorpay payment failed:", failRes);
        setLoading(false);
        alert(failRes?.error?.description || "Payment was cancelled or failed.");
      });
      rzp.open();
    } catch (err: any) {
      console.error("Razorpay checkout error:", err);
      alert(err?.message || "Failed to launch payment.");
      setLoading(false);
    }
  };

  if (children) {
    return (
      <span onClick={handlePay} style={{ display: "inline-block", cursor: disabled ? "not-allowed" : "pointer" }}>
        {children}
      </span>
    );
  }

  const defaultText =
    buttonText ||
    (loading
      ? "Launching Payment..."
      : purchaseType === "extra_store"
      ? `Buy Extra Store (₹${amountRs})`
      : `Upgrade to ${planLabel}`);

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={disabled || loading}
      className={className}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "none",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        fontSize: 12,
        fontWeight: 800,
        opacity: disabled || loading ? 0.7 : 1,
        ...style,
      }}
    >
      {loading ? "Processing..." : defaultText}
    </button>
  );
}
