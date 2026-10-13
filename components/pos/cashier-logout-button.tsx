"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { clientAuth } from "@/lib/firebase-client";
import Link from "next/link";

export function CashierLogoutButton({
  role,
  cashierName,
}: {
  role?: string;
  cashierName?: string;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    const confirmLogout = window.confirm("Are you sure you want to end your cashier session and logout?");
    if (!confirmLogout) return;

    setLoggingOut(true);
    try {
      try {
        await clientAuth.signOut().catch(() => {});
      } catch {}
      await signOut({ callbackUrl: "/login" });
    } catch {
      window.location.href = "/login";
    }
  }

  const isManagement = role === "super_admin" || role === "tenant_admin" || role === "manager";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {cashierName && (
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>👤</span>
          <strong style={{ color: "var(--text-primary)" }}>{cashierName}</strong>
        </span>
      )}

      {isManagement && (
        <Link
          href={role === "manager" ? "/manager" : "/dashboard"}
          className="co-btn co-btn-ghost"
          style={{ fontSize: 13, textDecoration: "none", padding: "8px 14px", borderRadius: 8 }}
        >
          ← Back to Console
        </Link>
      )}

      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          background: "rgba(239, 68, 68, 0.12)",
          color: "#ef4444",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          cursor: loggingOut ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          boxShadow: "0 1px 3px rgba(239, 68, 68, 0.1)",
        }}
        title="End Shift and Logout"
      >
        <span style={{ fontSize: 14 }}>⏻</span>
        <span>{loggingOut ? "Signing out..." : "Logout"}</span>
      </button>
    </div>
  );
}
