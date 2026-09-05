"use client";

import { useState, useRef, useEffect } from "react";

export type OptionItem = {
  value: string;
  label: string;
  icon?: string;
  badge?: string;
};

export function CustomSelect({
  value,
  onChange,
  options,
  prefixIcon,
  placeholder = "Select an option...",
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  options: OptionItem[];
  prefixIcon?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--scaffold-bg)",
          border: isOpen ? "1px solid var(--cta-bg-accent)" : "1px solid var(--border)",
          borderRadius: 12,
          padding: "11px 14px",
          color: "var(--text-primary)",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          fontSize: 13,
          fontWeight: 600,
          outline: "none",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxShadow: isOpen ? "0 0 0 3px color-mix(in srgb, var(--cta-bg-accent) 18%, transparent)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          {prefixIcon && <span style={{ fontSize: 16, flexShrink: 0 }}>{prefixIcon}</span>}
          {selectedOption ? (
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedOption.icon && <span style={{ marginRight: 6 }}>{selectedOption.icon}</span>}
              {selectedOption.label}
            </span>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>{placeholder}</span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s ease",
            marginLeft: 8,
          }}
        >
          ▼
        </span>
      </button>

      {/* Floating Options Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "0 14px 35px rgba(0, 0, 0, 0.45)",
            zIndex: 9999,
            maxHeight: 250,
            overflowY: "auto",
            padding: "6px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isSelected
                    ? "color-mix(in srgb, var(--cta-bg-accent) 15%, var(--scaffold-bg))"
                    : "transparent",
                  color: isSelected ? "var(--cta-bg-accent)" : "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 500,
                  textAlign: "left",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "color-mix(in srgb, var(--text-primary) 6%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {opt.icon && <span>{opt.icon}</span>}
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <span style={{ fontSize: 13, fontWeight: 900, color: "var(--cta-bg-accent)" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
