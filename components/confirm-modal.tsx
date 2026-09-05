"use client";

import { Modal } from "@/components/profile-menu";

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isPending = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  const buttonColor =
    variant === "danger"
      ? "var(--danger)"
      : variant === "warning"
      ? "var(--warning)"
      : "var(--cta-bg)";

  const buttonTextColor = variant === "primary" ? "var(--cta-text)" : "#FFFFFF";

  return (
    <Modal onClose={onCancel}>
      <div
        style={{
          width: 440,
          maxWidth: "92vw",
          background: "var(--card-bg)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `color-mix(in srgb, ${buttonColor} 15%, transparent)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {variant === "danger" ? "🗑️" : variant === "warning" ? "⚠️" : "ℹ️"}
          </div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                margin: "0 0 6px 0",
                color: "var(--text-primary)",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {message}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            style={{
              padding: "9px 20px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              background: buttonColor,
              color: buttonTextColor,
              border: "none",
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isPending) e.currentTarget.style.filter = "brightness(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
          >
            {isPending ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
