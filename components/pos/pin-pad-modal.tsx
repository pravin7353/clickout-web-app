"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openPosCounter } from "@/actions/pos-counter";
import { PosCounterWithShift } from "@/lib/services/pos-counter-service";

interface PinPadModalProps {
  counter: PosCounterWithShift;
  storeId?: string;
  tenantId?: string;
  onClose: () => void;
}

export function PinPadModal({ counter, storeId, tenantId, onClose }: PinPadModalProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [openingCash, setOpeningCash] = useState<string>("500");
  const [errorMsg, setErrorMsg] = useState("");
  const [limitError, setLimitError] = useState<{ limit: number; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Listen for physical keyboard keys
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        if (pin.length < 4) {
          setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
        }
      } else if (e.key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && pin.length === 4) {
        submitPin(pin);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin]);

  // Auto-submit when 4th digit is entered
  useEffect(() => {
    if (pin.length === 4) {
      submitPin(pin);
    }
  }, [pin]);

  function handleNumClick(num: string) {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setPin("");
    setErrorMsg("");
  }

  function submitPin(enteredPin: string) {
    if (isPending) return;
    setErrorMsg("");
    setLimitError(null);

    startTransition(async () => {
      const res = await openPosCounter({
        counterId: counter.id,
        enteredPin,
        storeId,
        tenantId,
        openingCash: parseFloat(openingCash) || 0,
      });

      if (!res.ok) {
        setPin("");
        if (res.error === "COUNTER_LIMIT_REACHED") {
          setLimitError({
            limit: res.limit || 1,
            message: res.message || "Aapke plan mein aur POS counters allowed nahi hain.",
          });
        } else {
          setErrorMsg(res.message || "Galat PIN. Dobara try karo.");
        }
      } else if (res.shiftId) {
        // Save to browser sessionStorage per architecture requirement
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            "activeShift",
            JSON.stringify({
              shiftId: res.shiftId,
              counterId: counter.id,
              counterName: res.counterName || counter.name,
              openedByName: res.openedByName || counter.assignedStaffName || "Cashier",
              openedAt: new Date().toISOString(),
              openingCash: parseFloat(openingCash) || 0,
            })
          );
        }

        const queryParams = new URLSearchParams();
        if (storeId) queryParams.set("store", storeId);
        queryParams.set("shift", res.shiftId);

        router.push(`/pos/billing?${queryParams.toString()}`);
      }
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--card-bg)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          boxShadow: "0 30px 70px -15px rgba(0, 0, 0, 0.8)",
          padding: "28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* Counter Info Header */}
        <div style={{ textAlign: "center", width: "100%" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(0, 210, 106, 0.12)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 10px",
              border: "1px solid rgba(0, 210, 106, 0.25)",
            }}
          >
            🔒
          </div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.3px",
            }}
          >
            {counter.name}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: "4px 0 0",
              fontWeight: 500,
            }}
          >
            {counter.assignedStaffName ? (
              <span>Assigned: <strong style={{ color: "var(--text-primary)" }}>{counter.assignedStaffName}</strong></span>
            ) : (
              "Enter 4-Digit Counter PIN to unlock terminal"
            )}
          </p>
        </div>

        {/* Plan Limit Error Modal / Banner */}
        {limitError && (
          <div
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 16,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid var(--danger)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>❌</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
              Aapke plan mein sirf {limitError.limit} POS counter{limitError.limit > 1 ? "s" : ""} allowed hain.
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Growth plan pe upgrade karo — ₹1,499/month for 5 simultaneous counters.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => router.push("/usage")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Upgrade Now ⚡
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Regular Error Banner */}
        {errorMsg && !limitError && (
          <div
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Opening Cash Input */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Drawer Cash Float:
          </label>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: 13 }}>
              ₹
            </span>
            <input
              type="number"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0"
              style={{
                width: "100%",
                padding: "6px 12px 6px 26px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* 4-Digit Display Indicator Dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            padding: "12px 0",
          }}
        >
          {[0, 1, 2, 3].map((index) => {
            const hasDigit = pin.length > index;
            return (
              <div
                key={index}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: hasDigit ? "2px solid var(--success)" : "2px solid var(--border)",
                  background: hasDigit ? "var(--success)" : "transparent",
                  boxShadow: hasDigit ? "0 0 12px var(--success)" : "none",
                  transition: "all 0.15s ease",
                }}
              />
            );
          })}
        </div>

        {/* On-screen Touch Number Pad */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            width: "100%",
            maxWidth: 290,
          }}
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleNumClick(num)}
              disabled={isPending}
              style={{
                height: 60,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 22,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                transition: "all 0.1s ease",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {num}
            </button>
          ))}

          {/* Clear / Back button */}
          <button
            type="button"
            onClick={handleBackspace}
            disabled={isPending || pin.length === 0}
            style={{
              height: 60,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "rgba(239, 68, 68, 0.08)",
              color: "var(--danger)",
              fontSize: 18,
              fontWeight: 800,
              cursor: pin.length > 0 ? "pointer" : "not-allowed",
              opacity: pin.length > 0 ? 1 : 0.5,
              transition: "all 0.1s ease",
            }}
          >
            ⌫
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleNumClick("0")}
            disabled={isPending}
            style={{
              height: 60,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--scaffold-bg)",
              color: "var(--text-primary)",
              fontSize: 22,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              transition: "all 0.1s ease",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            0
          </button>

          {/* Cancel button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              height: 60,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--scaffold-bg)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.1s ease",
            }}
          >
            Cancel
          </button>
        </div>

        {/* Loading status */}
        {isPending && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)" }}>
            Verifying PIN &amp; opening shift...
          </div>
        )}
      </div>
    </div>
  );
}
