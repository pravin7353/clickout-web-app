"use client";

import { PromotionMetrics } from "@/lib/services/po-service";

export function QuantumMetrics({ metrics }: { metrics: PromotionMetrics }) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20, color: "var(--accent-orange)" }}>📊</span>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              margin: 0,
              color: "var(--text-primary)",
              letterSpacing: "0.02em",
            }}
          >
            Promotion Analytics
          </h3>
          <span
            title="Real-time financial snapshot of your inventory and promotions."
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "1px solid var(--text-secondary)",
              color: "var(--text-secondary)",
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "help",
            }}
          >
            i
          </span>
        </div>

        {/* Dynamic Status Badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "4px 12px",
            borderRadius: 20,
            background:
              metrics.projectedMargin < 0
                ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                : metrics.projectedMargin < 15
                ? "color-mix(in srgb, var(--warning) 15%, transparent)"
                : "color-mix(in srgb, var(--success) 12%, transparent)",
            color:
              metrics.projectedMargin < 0
                ? "var(--danger)"
                : metrics.projectedMargin < 15
                ? "var(--warning)"
                : "var(--success)",
            border:
              metrics.projectedMargin < 0
                ? "1px solid color-mix(in srgb, var(--danger) 35%, transparent)"
                : metrics.projectedMargin < 15
                ? "1px solid color-mix(in srgb, var(--warning) 35%, transparent)"
                : "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
            letterSpacing: "0.04em",
          }}
        >
          {metrics.projectedMargin < 0
            ? "🚨 MARGIN AT RISK (NEGATIVE)"
            : metrics.projectedMargin === 0
            ? "⚠️ BREAK-EVEN (0.0% MARGIN)"
            : metrics.projectedMargin < 15
            ? "⚡ CAUTION: SLIM MARGIN"
            : "✅ OPTIMAL PROMOTIONS"}
        </span>
      </div>

      {/* 3 Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* Card 1: Total Inventory Value */}
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 18,
            padding: "20px 22px",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
            <span style={{ fontSize: 16, color: "#3b82f6" }}>🏪</span>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Total Inventory Value
            </span>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>
              {formatCurrency(metrics.totalInventoryValue)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Base retail value before offers
            </div>
          </div>
        </div>

        {/* Card 2: Promotion Impact */}
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 18,
            padding: "20px 22px",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
            <span style={{ fontSize: 16, color: metrics.promotionImpact > 0 ? "var(--danger)" : "var(--success)" }}>
              🏷️
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Promotion Impact
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: metrics.promotionImpact > 0 ? "var(--danger)" : "var(--success)",
              }}
            >
              {formatCurrency(metrics.promotionImpact)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Total discount given to customers
            </div>
          </div>
        </div>

        {/* Card 3: Projected Margin */}
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 18,
            padding: "20px 22px",
            border:
              metrics.projectedMargin < 0
                ? "1px solid color-mix(in srgb, var(--danger) 35%, transparent)"
                : "1px solid var(--border)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
            <span style={{ fontSize: 16 }}>
              {metrics.projectedMargin < 0 ? "🚨" : metrics.projectedMargin < 15 ? "⚠️" : "📈"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Proj. Margin
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color:
                  metrics.projectedMargin < 0
                    ? "var(--danger)"
                    : metrics.projectedMargin < 15
                    ? "var(--warning)"
                    : "var(--success)",
              }}
            >
              {metrics.projectedMargin > 0 ? "+" : ""}
              {metrics.projectedMargin.toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              {metrics.projectedMargin < 0
                ? "Promotions exceed product cost margins (Loss)"
                : metrics.projectedMargin < 15
                ? "Slim profit margin after active promotions"
                : "Estimated profit margin after active promotions"}
            </div>
          </div>
        </div>
      </div>

      {/* Loss Warning Callout if any products have offers below wholesale cost */}
      {metrics.lossProducts && metrics.lossProducts.length > 0 && (
        <div
          style={{
            marginTop: 16,
            background: "color-mix(in srgb, var(--danger) 8%, var(--card-bg))",
            border: "1px solid color-mix(in srgb, var(--danger) 28%, transparent)",
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--danger)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span>⚠️</span>
            <span>
              {metrics.lossProducts.length} Product{metrics.lossProducts.length > 1 ? "s" : ""} Selling Below Wholesale Cost (Margin Alert)
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Active promotions on these products set the effective selling price below their wholesale cost, reducing your overall store profit:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {metrics.lossProducts.map((lp) => (
              <div
                key={lp.productId}
                style={{
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 8,
                  background: "var(--card-bg)",
                  border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
                  color: "var(--text-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontWeight: 600 }}>{lp.name}</span>
                <span style={{ color: "var(--text-secondary)" }}>•</span>
                <span>Offer: <strong style={{ color: "var(--danger)" }}>₹{Math.round(lp.effectiveOfferPrice)}</strong></span>
                <span style={{ color: "var(--text-secondary)" }}>•</span>
                <span>Cost: <strong>₹{Math.round(lp.cost)}</strong></span>
                <span style={{ color: "var(--danger)", fontWeight: 700 }}>(-₹{Math.round(lp.lossPerUnit)}/unit)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
