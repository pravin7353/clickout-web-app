"use client";

import Link from "next/link";

interface PlanLimitAlertProps {
  error: string | null | undefined;
}

export function PlanLimitAlert({ error }: PlanLimitAlertProps) {
  if (!error) return null;
  const lower = error.toLowerCase();
  const isLimitError =
    lower.includes("limit reached") ||
    lower.includes("upgrade") ||
    lower.includes("quota");

  if (!isLimitError) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--warning, #f59e0b) 14%, var(--card-bg, #18181b))",
        border: "1.5px solid var(--warning, #f59e0b)",
        color: "var(--text-primary, #ffffff)",
        marginBottom: 16,
      }}
      role="alert"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--warning, #f59e0b)", letterSpacing: "-0.01em" }}>
            Plan Limit Notice
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary, #a1a1aa)", marginTop: 2, lineHeight: 1.4 }}>
            {error}
          </div>
        </div>
      </div>

      <Link
        href="/settings/billing"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--warning, #f59e0b)",
          color: "#000000",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 800,
          textDecoration: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(245, 158, 11, 0.25)",
        }}
      >
        Upgrade Plan →
      </Link>
    </div>
  );
}
