"use client";

import { useState, useTransition } from "react";
import { saveGrowthConfig } from "@/actions/growth";
import { GrowthConfig } from "@/lib/services/churn-service";
import { useRouter } from "next/navigation";

const BUSINESS_CATEGORIES = [
  "General Retail",
  "Kirana & Supermarket",
  "Medical & Pharmacy",
  "Mobile & Electronics",
  "Hardware & Sanitary",
  "Garments & Boutique",
  "Jewellery & Gems",
  "Salon, Spa & Beauty",
  "Bakery & Sweets",
  "Restaurant & Cafe",
  "Dairy & FMCG",
  "Stationery & Books",
  "Footwear & Shoes",
  "Opticals & Eyewear",
  "Automobile Spare Parts",
  "Perfumes & Cosmetics",
  "Bags & Luggage",
  "Toys & Gifts",
  "Furniture & Decor",
  "Pet Supplies",
  "Sports & Fitness",
];

const VIP_STEPS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

export function AiGrowthSetupModal({
  config,
  branchCode,
  onClose,
}: {
  config: GrowthConfig;
  branchCode?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [businessCategory, setBusinessCategory] = useState(
    config.businessType ?? "General Retail"
  );
  const [highRiskMult, setHighRiskMult] = useState(
    config.churnMultiplierHigh || 2.1
  );
  const [medRiskMult, setMedRiskMult] = useState(
    config.churnMultiplierMedium || 1.2
  );

  // VIP Threshold index
  const initialVipIndex = Math.max(
    0,
    VIP_STEPS.findIndex((s) => s >= (config.vipThreshold || 1000))
  );
  const [vipIndex, setVipIndex] = useState(
    initialVipIndex === -1 ? 1 : initialVipIndex
  );
  const currentVipThreshold = VIP_STEPS[vipIndex] ?? 1000;

  const expectedCycleDays = config.expectedCycleDays || 15;
  const highRiskDays = Math.round(expectedCycleDays * highRiskMult);
  const medRiskDays = Math.round(expectedCycleDays * medRiskMult);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      const res = await saveGrowthConfig({
        branchCode: branchCode ?? undefined,
        businessType: businessCategory,
        vipThreshold: currentVipThreshold,
        expectedCycleDays,
        churnMultiplierMedium: medRiskMult,
        churnMultiplierHigh: highRiskMult,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to save configuration.");
      } else {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 800);
      }
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
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
          maxWidth: 520,
          background: "var(--card-bg)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
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
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                AI Growth Setup
              </h2>
              <span
                style={{
                  fontSize: 14,
                  cursor: "help",
                  color: "var(--text-secondary)",
                }}
                title="AI Growth Setup configures the churn detection algorithm and thresholds for this specific store branch."
              >
                ℹ️
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              Configure AI churn rules per specific store branch
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
        <form onSubmit={handleSave} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
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

          {success && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(0, 210, 106, 0.15)",
                border: "1px solid var(--success)",
                color: "var(--success)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              ✓ AI Configuration Saved Successfully!
            </div>
          )}

          {/* Target Store Auto-Assigned Card */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(0, 210, 106, 0.08)",
              border: "1px solid rgba(0, 210, 106, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>🏬</span>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--success)",
                    fontWeight: 600,
                    letterSpacing: 0.5,
                  }}
                >
                  Target Store (Auto-Assigned)
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--success)",
                    marginTop: 2,
                  }}
                >
                  {branchCode || "UNKNOWN"}
                </div>
              </div>
            </div>
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 12,
                background: "var(--success)",
                color: "#000",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0.5,
              }}
            >
              LOCKED
            </span>
          </div>

          {/* Business Category */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Business Category
            </label>
            <select
              value={businessCategory}
              onChange={(e) => setBusinessCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* High Risk Trigger Slider */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                High risk trigger (beyond cycle)
              </label>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--danger)",
                }}
              >
                {highRiskMult.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="1.5"
              max="4.0"
              step="0.1"
              value={highRiskMult}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setHighRiskMult(val);
                if (val <= medRiskMult) {
                  setMedRiskMult(Math.max(1.0, parseFloat((val - 0.3).toFixed(1))));
                }
              }}
              style={{
                width: "100%",
                accentColor: "var(--danger)",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Medium Risk Trigger Slider */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Medium risk trigger (beyond cycle)
              </label>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--accent-orange)",
                }}
              >
                {medRiskMult.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.1"
              value={medRiskMult}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setMedRiskMult(val);
                if (val >= highRiskMult) {
                  setHighRiskMult(Math.min(4.0, parseFloat((val + 0.3).toFixed(1))));
                }
              }}
              style={{
                width: "100%",
                accentColor: "var(--accent-orange)",
                cursor: "pointer",
              }}
            />
          </div>

          {/* VIP Spend Threshold Slider */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                VIP spend threshold (₹)
              </label>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--success)",
                }}
              >
                ₹{currentVipThreshold.toLocaleString("en-IN")}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={VIP_STEPS.length - 1}
              step="1"
              value={vipIndex}
              onChange={(e) => setVipIndex(parseInt(e.target.value, 10))}
              style={{
                width: "100%",
                accentColor: "var(--success)",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--text-secondary)",
                marginTop: 4,
              }}
            >
              <span>₹500</span>
              <span>₹5,000</span>
              <span>₹1,00,000</span>
            </div>
          </div>

          {/* RISK THRESHOLDS (AUTO-CALCULATED) Card */}
          <div
            style={{
              padding: "16px",
              borderRadius: 10,
              background: "var(--scaffold-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "var(--text-secondary)",
                letterSpacing: 0.8,
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              RISK THRESHOLDS (AUTO-CALCULATED)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>High risk fires after</span>
                <strong style={{ color: "var(--danger)" }}>{highRiskDays} days no visit</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Medium risk fires after</span>
                <strong style={{ color: "var(--accent-orange)" }}>{medRiskDays} days no visit</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Coupon - high risk</span>
                <strong style={{ color: "var(--text-primary)" }}>20% off</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Coupon - medium risk</span>
                <strong style={{ color: "var(--text-primary)" }}>10% off</strong>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 10,
              border: "none",
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontSize: 14,
              fontWeight: 800,
              cursor: isPending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "transform 0.1s ease",
            }}
          >
            {isPending ? "Saving AI Config..." : "Save AI config for this store ↗"}
          </button>
        </form>
      </div>
    </div>
  );
}
