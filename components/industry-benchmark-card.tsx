import { Card, InfoTooltip } from "@/components/ui";

export function IndustryBenchmarkCard({
  shrinkageRate,
  industryAvg,
}: {
  shrinkageRate: number;
  industryAvg: number;
}) {
  const isBetterThanAvg = shrinkageRate <= industryAvg;
  const statusColor = isBetterThanAvg ? "var(--success)" : "var(--danger)";
  const progressClamped = Math.min(100, Math.max(0, (shrinkageRate / 10) * 100));

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Industry Benchmark 📊
          </h3>
          <InfoTooltip text="Compares your at-risk revenue (pending verification + gate rejections) against the published retail shrinkage benchmark." />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 8px",
            borderRadius: 6,
            background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
            color: statusColor,
            border: `1px solid ${statusColor}`,
          }}
        >
          {isBetterThanAvg ? "HEALTHY" : "ELEVATED RISK"}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Your Shrinkage Rate
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: statusColor, lineHeight: 1 }}>
            {shrinkageRate.toFixed(1)}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Industry Average
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
            ~{industryAvg.toFixed(1)}%
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          height: 8,
          borderRadius: 4,
          background: "var(--border)",
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: `${progressClamped}%`,
            height: "100%",
            background: statusColor,
            borderRadius: 4,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {isBetterThanAvg
          ? "Performing better than industry shrinkage benchmark — keep gate verification strict."
          : "Shrinkage rate is above industry average — inspect Risk Engine and Fraud Control for leakages."}
      </div>
    </Card>
  );
}
