"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ label = "Sign Out / Switch Account" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        background: "transparent",
        color: "var(--danger, #ef4444)",
        border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)",
        borderRadius: 8,
        padding: "8px 16px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
