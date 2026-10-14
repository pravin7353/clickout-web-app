"use client";

import { useState, useTransition } from "react";
import { enforcePlanStaffSuspension } from "@/actions/staff";
import { useRouter } from "next/navigation";

export function StaffQuotaAlert({
  totalActive,
  maxAllowed,
  planName,
  excessCount,
}: {
  totalActive: number;
  maxAllowed: number;
  planName: string;
  excessCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const router = useRouter();

  if (excessCount <= 0 && !resultMsg) return null;

  const handleAutoSuspend = () => {
    if (!confirm(`Are you sure you want to suspend ${excessCount} excess staff? The top ${maxAllowed} staff (Owners & Managers) will remain Active.`)) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await enforcePlanStaffSuspension();
        if (res.ok) {
          setResultMsg(res.message || "Plan limits enforced successfully.");
          router.refresh();
        } else {
          alert(res.error || "Failed to enforce plan limits");
        }
      } catch (err: any) {
        alert(err.message || "An error occurred");
      }
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--warning, #f59e0b) 12%, var(--card-bg))",
        border: "1.5px solid var(--warning, #f59e0b)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--warning, #f59e0b)" }}>
            Plan Staff Quota Exceeded ({totalActive}/{maxAllowed} Active Staff)
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            Your <strong>{planName.toUpperCase()}</strong> plan includes up to {maxAllowed} active staff accounts.
            Currently, {excessCount} excess staff accounts are active.
          </div>
          {resultMsg && (
            <div style={{ fontSize: 12, color: "var(--success)", fontWeight: 700, marginTop: 4 }}>
              ✓ {resultMsg}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          disabled={isPending}
          onClick={handleAutoSuspend}
          style={{
            background: "var(--warning, #f59e0b)",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 800,
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: "0 2px 8px rgba(245, 158, 11, 0.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isPending ? "Suspending..." : `⚡ Auto-Suspend ${excessCount} Excess Staff`}
        </button>
      </div>
    </div>
  );
}
