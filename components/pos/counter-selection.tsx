"use client";

import { useState } from "react";
import Link from "next/link";
import { PosCounterWithShift } from "@/lib/services/pos-counter-service";
import { PinPadModal } from "@/components/pos/pin-pad-modal";

interface CounterSelectionProps {
  storeName: string;
  storeId?: string;
  tenantId?: string;
  counters: PosCounterWithShift[];
  maxAllowedCounters: number;
}

export function CounterSelection({
  storeName,
  storeId,
  tenantId,
  counters,
  maxAllowedCounters,
}: CounterSelectionProps) {
  const [selectedCounter, setSelectedCounter] = useState<PosCounterWithShift | null>(null);

  const activeCountersCount = counters.filter((c) => c.activeShift && c.activeShift.status === "OPEN").length;
  const isAtPlanLimit = activeCountersCount >= maxAllowedCounters;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--scaffold-bg)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "36px 24px 24px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* App Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 14px",
              borderRadius: 20,
              background: "rgba(0, 210, 106, 0.12)",
              color: "var(--success)",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 10,
              border: "1px solid rgba(0, 210, 106, 0.25)",
            }}
          >
            <span>⚡ ClickOut POS Terminal</span>
          </div>

          <h1
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            {storeName}
          </h1>

          <p
            style={{
              fontSize: 16,
              color: "var(--text-secondary)",
              margin: "8px 0 0",
              fontWeight: 600,
            }}
          >
            Select your counter to start cashier billing:
          </p>

          {/* Active Counters Counter Badge */}
          <div style={{ marginTop: 12, display: "inline-flex", gap: 10, alignItems: "center" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 12,
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                color: isAtPlanLimit ? "var(--accent-orange)" : "var(--text-secondary)",
              }}
            >
              Active Terminals: {activeCountersCount} / {maxAllowedCounters}
            </span>
            {isAtPlanLimit && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-orange)" }}>
                ⚠️ Plan limit reached
              </span>
            )}
          </div>
        </div>

        {/* Counter Grid */}
        {counters.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 12 }}>🏪</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              No POS Counters Configured
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 20px" }}>
              A manager must create and configure POS terminals before cashiers can open shifts.
            </p>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                borderRadius: 12,
                background: "var(--cta-bg)",
                color: "var(--cta-text)",
                fontWeight: 800,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Manager Login to Setup Counters →
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {counters.map((c) => {
              const isOpen = c.activeShift && c.activeShift.status === "OPEN";
              const isLocked = c.isLocked;
              const isAvailable = !isOpen && !isLocked && c.isActive;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (isAvailable) setSelectedCounter(c);
                  }}
                  style={{
                    padding: "24px 22px",
                    borderRadius: 20,
                    background: "var(--card-bg)",
                    border: isAvailable
                      ? "2px solid var(--success)"
                      : isOpen
                      ? "1px solid rgba(239, 68, 68, 0.4)"
                      : "1px solid var(--border)",
                    boxShadow: isAvailable ? "0 8px 24px rgba(0, 210, 106, 0.12)" : "0 2px 8px rgba(0,0,0,0.1)",
                    cursor: isAvailable ? "pointer" : "default",
                    opacity: c.isActive ? (isAvailable ? 1 : 0.85) : 0.5,
                    transition: "all 0.18s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: 180,
                  }}
                  onMouseEnter={(e) => {
                    if (isAvailable) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 12px 30px rgba(0, 210, 106, 0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isAvailable) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 210, 106, 0.12)";
                    }
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <h3
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {c.name}
                      </h3>
                      <span style={{ fontSize: 20 }}>
                        {isOpen ? "🔴" : isLocked ? "⚠️" : "🟢"}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, fontWeight: 500 }}>
                      {c.assignedStaffName ? `Assigned: ${c.assignedStaffName}` : "General Counter"}
                    </p>
                  </div>

                  {/* Status Indicator Pill */}
                  <div style={{ marginTop: 20 }}>
                    {isOpen ? (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "var(--danger)",
                          fontSize: 12,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>🔴 In Use — {c.activeShift?.openedByName}</span>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Shift Live</span>
                      </div>
                    ) : isLocked ? (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          color: "#f59e0b",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        ⚠️ Locked (Too many attempts)
                      </div>
                    ) : !c.isActive ? (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "var(--text-secondary)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ⚪ Disabled by Manager
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "rgba(0, 210, 106, 0.15)",
                          border: "1px solid var(--success)",
                          color: "var(--success)",
                          fontSize: 13,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>🟢 Available</span>
                        <span>Enter PIN →</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Footer Navigation */}
      <div
        style={{
          maxWidth: 1100,
          margin: "32px auto 0",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--border)",
          paddingTop: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          ClickOut POS Counter System · Secure 4-Digit Unlock
        </div>
        <Link
          href="/login"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>Manager Login →</span>
        </Link>
      </div>

      {/* PIN Unlock Modal */}
      {selectedCounter && (
        <PinPadModal
          counter={selectedCounter}
          storeId={storeId}
          tenantId={tenantId}
          onClose={() => setSelectedCounter(null)}
        />
      )}
    </div>
  );
}
