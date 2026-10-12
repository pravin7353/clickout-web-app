"use client";

import { useState, useTransition } from "react";
import { joinFeatureWaitlist, FeatureWaitlistChannel } from "@/actions/growth-radar";

interface CampaignChannelSelectProps {
  recipientLabel?: string;
  onSelectPush: () => void;
  onClose?: () => void;
  initialWaitlist?: { sms: boolean; whatsapp: boolean };
}

export function CampaignChannelSelect({
  recipientLabel,
  onSelectPush,
  onClose,
  initialWaitlist = { sms: false, whatsapp: false },
}: CampaignChannelSelectProps) {
  const [waitlistStatus, setWaitlistStatus] = useState<{ sms: boolean; whatsapp: boolean }>(initialWaitlist);
  const [pendingChannel, setPendingChannel] = useState<FeatureWaitlistChannel | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function handleNotifyMe(channel: FeatureWaitlistChannel, e: React.MouseEvent) {
    e.stopPropagation(); // prevent any card clicks
    if (waitlistStatus[channel]) return;

    setPendingChannel(channel);
    startTransition(async () => {
      const res = await joinFeatureWaitlist(channel);
      setPendingChannel(null);
      if (res.ok) {
        setWaitlistStatus((prev) => ({ ...prev, [channel]: true }));
        setFeedbackMsg(
          `✓ You're on the waitlist for ${channel === "sms" ? "SMS" : "WhatsApp"} campaigns! We'll notify you as soon as early access goes live.`
        );
      } else {
        setFeedbackMsg(res.error || "Failed to join waitlist. Please try again.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📢</span>
            <h2
              style={{
                fontSize: 19,
                fontWeight: 900,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.3px",
              }}
            >
              Choose Campaign Channel
            </h2>
          </div>
          {recipientLabel && (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              Audience: <strong style={{ color: "var(--success)" }}>{recipientLabel}</strong>
            </p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
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
        )}
      </div>

      {feedbackMsg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(0, 210, 106, 0.12)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          {feedbackMsg}
        </div>
      )}

      {/* 3 Channel Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* CARD 1: Push Notification (Available / Clickable) */}
        <div
          onClick={onSelectPush}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelectPush();
          }}
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "var(--card-bg)",
            border: "2px solid var(--success)",
            boxShadow: "0 4px 18px rgba(0, 210, 106, 0.15)",
            cursor: "pointer",
            transition: "all 0.18s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 210, 106, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 18px rgba(0, 210, 106, 0.15)";
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: "rgba(0, 210, 106, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              🔔
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  Push Notification
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "rgba(0, 210, 106, 0.15)",
                    color: "var(--success)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  ✅ Available
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: "3px 0 0 0",
                  fontWeight: 500,
                }}
              >
                Free · Instant delivery
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPush();
            }}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              border: "none",
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0, 210, 106, 0.3)",
              whiteSpace: "nowrap",
            }}
          >
            Select Channel →
          </button>
        </div>

        {/* CARD 2: SMS (In Progress / Disabled state / Notify Me) */}
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--border)",
            opacity: 0.85,
            cursor: "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              💬
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  SMS
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#f59e0b",
                    fontSize: 11,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>🕐</span> Implementation in Progress
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: "3px 0 0 0",
                  fontWeight: 500,
                }}
              >
                Reaches any mobile number
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => handleNotifyMe("sms", e)}
            disabled={isPending || waitlistStatus.sms}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: waitlistStatus.sms ? "1px solid var(--success)" : "1px solid var(--border)",
              background: waitlistStatus.sms
                ? "rgba(0, 210, 106, 0.15)"
                : "rgba(255, 255, 255, 0.05)",
              color: waitlistStatus.sms ? "var(--success)" : "var(--text-primary)",
              fontWeight: 700,
              fontSize: 12,
              cursor: waitlistStatus.sms ? "default" : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {pendingChannel === "sms"
              ? "Saving..."
              : waitlistStatus.sms
              ? "✓ You're on the Waitlist"
              : "Notify Me When Ready"}
          </button>
        </div>

        {/* CARD 3: WhatsApp (In Progress / Disabled state / Notify Me) */}
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed var(--border)",
            opacity: 0.85,
            cursor: "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              📱
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  WhatsApp
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#f59e0b",
                    fontSize: 11,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>🕐</span> Implementation in Progress
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: "3px 0 0 0",
                  fontWeight: 500,
                }}
              >
                Highest open rates
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => handleNotifyMe("whatsapp", e)}
            disabled={isPending || waitlistStatus.whatsapp}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: waitlistStatus.whatsapp ? "1px solid var(--success)" : "1px solid var(--border)",
              background: waitlistStatus.whatsapp
                ? "rgba(0, 210, 106, 0.15)"
                : "rgba(255, 255, 255, 0.05)",
              color: waitlistStatus.whatsapp ? "var(--success)" : "var(--text-primary)",
              fontWeight: 700,
              fontSize: 12,
              cursor: waitlistStatus.whatsapp ? "default" : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {pendingChannel === "whatsapp"
              ? "Saving..."
              : waitlistStatus.whatsapp
              ? "✓ You're on the Waitlist"
              : "Notify Me When Ready"}
          </button>
        </div>
      </div>

      {/* Informative Footer Note */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>💡</span>
        <span>
          SMS and WhatsApp broadcasting are currently in development with TRAI DLT and Meta WABA integration.
          Existing Pro &amp; Growth tenants will receive early access invitations upon launch.
        </span>
      </div>
    </div>
  );
}
