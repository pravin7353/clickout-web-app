"use client";

import React, { useState, useEffect, useRef } from "react";

export interface FlashSaleCountdownProps {
  expiryMs: number;
  size?: "sm" | "md";
  labelPrefix?: string;
  showIcon?: boolean;
  onExpire?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function calculateRemaining(expiryMs: number) {
  const now = Date.now();
  const diff = expiryMs - now;

  if (diff <= 0) {
    return {
      totalMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      formatted: "00:00:00",
    };
  }

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  const formatted =
    days > 0
      ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    totalMs: diff,
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    formatted,
  };
}

export function FlashSaleCountdown({
  expiryMs,
  size = "md",
  labelPrefix = "Ends in",
  showIcon = true,
  onExpire,
  className = "",
  style = {},
}: FlashSaleCountdownProps) {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(() => calculateRemaining(expiryMs));
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    const initial = calculateRemaining(expiryMs);
    setTime(initial);

    if (initial.isExpired && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire?.();
    }

    const interval = setInterval(() => {
      const current = calculateRemaining(expiryMs);
      setTime(current);

      if (current.isExpired) {
        clearInterval(interval);
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpire?.();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiryMs, onExpire]);

  // Don't render if invalid or expired without onExpire display
  if (expiryMs <= 0) return null;

  const isUrgent = !time.isExpired && time.totalMs < 15 * 60 * 1000; // Under 15 minutes left

  // Default SSR rendering or pre-mount safe view
  const displayTime = mounted ? time.formatted : "--:--:--";

  if (mounted && time.isExpired) {
    return (
      <div
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: size === "sm" ? 4 : 6,
          padding: size === "sm" ? "2px 6px" : "5px 10px",
          borderRadius: size === "sm" ? 4 : 8,
          background: "rgba(120, 118, 111, 0.1)",
          border: "1px solid rgba(120, 118, 111, 0.25)",
          color: "var(--text-secondary)",
          fontSize: size === "sm" ? 10 : 12,
          fontWeight: 700,
          lineHeight: 1.2,
          ...style,
        }}
      >
        <span>⚡ Flash Sale Expired</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? 4 : 6,
        padding: size === "sm" ? "2px 6px" : "6px 10px",
        borderRadius: size === "sm" ? 4 : 8,
        background: isUrgent
          ? "rgba(239, 68, 68, 0.15)"
          : "rgba(239, 68, 68, 0.08)",
        border: isUrgent
          ? "1px solid rgba(239, 68, 68, 0.45)"
          : "1px solid rgba(239, 68, 68, 0.25)",
        color: "var(--danger, #EF4444)",
        fontSize: size === "sm" ? 10 : 12,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2,
        animation: isUrgent ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
        transition: "background 0.2s ease, border-color 0.2s ease",
        ...style,
      }}
      title={`Flash sale countdown: ${displayTime}`}
    >
      {showIcon && (
        <svg
          width={size === "sm" ? 11 : 14}
          height={size === "sm" ? 11 : 14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            opacity: 0.95,
          }}
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
      <span>
        {isUrgent && size !== "sm" ? "🔥 Ending Soon: " : labelPrefix ? `${labelPrefix} ` : ""}
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            letterSpacing: size === "sm" ? "0.02em" : "0.04em",
          }}
        >
          {displayTime}
        </span>
      </span>
    </div>
  );
}
