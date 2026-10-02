"use client";

import React, { useEffect } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: "var(--card-bg, #ffffff)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          border: "1px solid var(--border, rgba(0,0,0,0.1))",
          padding: "16px 20px 32px 20px",
          boxShadow: "0 -8px 30px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--border, #cbd5e1)",
            alignSelf: "center",
            marginBottom: 2,
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              color: "var(--text-primary, #0f172a)",
            }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1px solid var(--border, rgba(0,0,0,0.1))",
              background: "var(--bg, #f8fafc)",
              color: "var(--text-secondary, #64748b)",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
