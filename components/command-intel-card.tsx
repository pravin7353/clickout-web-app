"use client";

import { useState, useTransition } from "react";
import { Card, InfoTooltip, Button } from "@/components/ui";
import { ForecastResult } from "@/lib/services/manpower-service";
import { fetchStaffingForecastAction } from "@/actions/analytics";

const RUSH_COLORS: Record<string, string> = {
  CRITICAL: "#c084fc",
  HIGH: "var(--danger)",
  MEDIUM: "#f97316",
  LOW: "var(--success)",
};

export function CommandIntelCard({
  initialForecast,
  storeCode,
}: {
  initialForecast: ForecastResult | null;
  storeCode?: string | null;
}) {
  const [forecast, setForecast] = useState<ForecastResult | null>(initialForecast);
  const [isOffline, setIsOffline] = useState(!initialForecast);
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const res = await fetchStaffingForecastAction(storeCode ?? undefined);
      if (res.ok && res.forecast) {
        setForecast(res.forecast);
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
    });
  }

  if (isOffline || !forecast) {
    return (
      <Card style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}>
          Radar Offline: Failed to load staffing forecast.
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
          Statistical radar could not connect to historical data for this branch.
        </p>
        <Button onClick={handleRetry} disabled={isPending}>
          {isPending ? "Connecting..." : "Retry"}
        </Button>
      </Card>
    );
  }

  const threatColor = forecast.hasSufficientData
    ? (RUSH_COLORS[forecast.rushLevel] ?? "var(--text-secondary)")
    : "var(--text-secondary)";

  return (
    <Card style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            Command Intel 📡
          </h3>
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Predictive Staffing Radar 🤖
          </span>
          <InfoTooltip text="Forecasts footfall, orders and staffing needs from historical same-weekday patterns." />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.5px",
            padding: "4px 10px",
            borderRadius: 12,
            background: `color-mix(in srgb, ${threatColor} 12%, transparent)`,
            color: threatColor,
            border: `1px solid ${threatColor}`,
          }}
        >
          {forecast.hasSufficientData ? `${forecast.rushLevel} RUSH` : "LEARNING"}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>
        {forecast.hasSufficientData
          ? `Forecast for ${forecast.period} • ${forecast.comparisonPeriod}`
          : `Not enough history yet for ${forecast.period} (${forecast.sampleCount}/3 samples)`}
      </div>

      {/* Deployment Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 16 }}>
        <StatBox
          title="EXPECTED FOOTFALL (EST.)"
          value={forecast.expectedOrders}
          sub={forecast.hasSufficientData ? `${forecast.ordersLowerBound}–${forecast.ordersUpperBound}` : undefined}
          color="#3b82f6"
        />
        <StatBox
          title="CASHIERS NEEDED"
          value={forecast.cashiersRequired}
          sub={forecast.backupStaffRequired > 0 ? "+backup required" : undefined}
          color={threatColor}
        />
        <StatBox
          title="GUARDS NEEDED"
          value={forecast.guardsRequired}
          color={threatColor}
        />
      </div>

      {/* Confidence */}
      {forecast.hasSufficientData && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 16 }}>
          Confidence: {forecast.confidence}% ({forecast.sampleCount} historical samples)
        </div>
      )}

      {/* Commander's Advice */}
      <div
        style={{
          width: "100%",
          padding: 16,
          borderRadius: 12,
          background: "var(--scaffold-bg)",
          border: "1px solid var(--border)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "1px",
            color: threatColor,
            marginBottom: 6,
          }}
        >
          COMMANDER&apos;S ADVICE
        </div>
        <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 8 }}>
          {forecast.recommendation}
        </div>
        {forecast.contributingFactors.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {forecast.contributingFactors.map((factor, idx) => (
              <div key={idx} style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.3 }}>
                • {factor}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Comparison */}
      {forecast.hasSufficientData && (
        <div
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 12,
            background: "var(--scaffold-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "1px",
              color: "var(--text-secondary)",
              marginBottom: 10,
            }}
          >
            HISTORICAL COMPARISON
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                CURRENT PERIOD
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                Today
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                BASELINE MATCH
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                {forecast.comparisonPeriod}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                TARGET VOL.
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                {forecast.expectedOrders} Orders
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatBox({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: number | string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "var(--scaffold-bg)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</span>}
      </div>
    </div>
  );
}
