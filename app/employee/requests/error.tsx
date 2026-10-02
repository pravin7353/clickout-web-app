"use client";

import { useEffect } from "react";

export default function RequestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Requests page error:", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "36px 20px",
        borderRadius: 20,
        background: "var(--card-bg, #ffffff)",
        border: "1px solid var(--border, rgba(0,0,0,0.08))",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
      }}
    >
      <span style={{ fontSize: 36 }}>⚠️</span>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "var(--text-primary, #0f172a)" }}>
        Failed to load requests
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary, #64748b)", lineHeight: 1.5, maxWidth: 320 }}>
        {error?.message || "Could not retrieve your leaves and regularization requests."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          marginTop: 6,
          padding: "10px 20px",
          borderRadius: 12,
          background: "#22c55e",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
        }}
      >
        🔄 Retry
      </button>
    </div>
  );
}
