"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPosCounter,
  resetPosCounterPin,
  togglePosCounterActive,
  closePosShift,
} from "@/actions/pos-counter";
import { PosCounterWithShift } from "@/lib/services/pos-counter-service";
import { StaffRow } from "@/lib/services/staff-service";

interface CounterManagementProps {
  counters: PosCounterWithShift[];
  staffList: StaffRow[];
  maxAllowedCounters: number;
  planName: string;
  branchCode?: string | null;
  canEdit?: boolean;
}

export function CounterManagement({
  counters,
  staffList,
  maxAllowedCounters,
  planName,
  branchCode,
  canEdit = true,
}: CounterManagementProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetPinCounter, setResetPinCounter] = useState<PosCounterWithShift | null>(null);
  const [closeShiftCounter, setCloseShiftCounter] = useState<PosCounterWithShift | null>(null);

  // Form states for Add Counter
  const [newName, setNewName] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [formError, setFormError] = useState("");

  // Form states for Reset PIN
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetConfirmPin, setResetConfirmPin] = useState("");
  const [resetError, setResetError] = useState("");

  // Form states for Close Shift
  const [closingCash, setClosingCash] = useState<string>("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closeShiftError, setCloseShiftError] = useState("");

  const totalUsed = counters.length;
  const isLimitReached = totalUsed >= maxAllowedCounters;

  const cashiers = staffList.filter((s) => s.isActive && (s.role === "cashier" || s.role === "manager"));

  function handleAddCounter(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!newName.trim()) {
      setFormError("Counter name is required.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setFormError("PIN must be exactly 4 numeric digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setFormError("PIN and Confirm PIN do not match.");
      return;
    }

    const assignedStaff = staffList.find((s) => s.id === selectedStaffId || s.empId === selectedStaffId);

    startTransition(async () => {
      const res = await createPosCounter({
        name: newName.trim(),
        pin: newPin,
        assignedStaffId: assignedStaff?.empId || assignedStaff?.id,
        assignedStaffName: assignedStaff?.name,
        branchCode: branchCode ?? undefined,
      });

      if (!res.ok) {
        setFormError(res.error || "Failed to create counter.");
      } else {
        setShowAddModal(false);
        setNewName("");
        setSelectedStaffId("");
        setNewPin("");
        setConfirmPin("");
        router.refresh();
      }
    });
  }

  function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPinCounter) return;
    setResetError("");

    if (!/^\d{4}$/.test(resetNewPin)) {
      setResetError("New PIN must be exactly 4 numeric digits.");
      return;
    }
    if (resetNewPin !== resetConfirmPin) {
      setResetError("PIN and Confirm PIN do not match.");
      return;
    }

    startTransition(async () => {
      const res = await resetPosCounterPin({
        counterId: resetPinCounter.id,
        newPin: resetNewPin,
      });

      if (!res.ok) {
        setResetError(res.error || "Failed to reset PIN.");
      } else {
        setResetPinCounter(null);
        setResetNewPin("");
        setResetConfirmPin("");
        router.refresh();
      }
    });
  }

  function handleCloseShift(e: React.FormEvent) {
    e.preventDefault();
    if (!closeShiftCounter?.activeShift) return;
    setCloseShiftError("");

    const cashNum = parseFloat(closingCash);
    if (isNaN(cashNum) || cashNum < 0) {
      setCloseShiftError("Please enter a valid closing cash amount.");
      return;
    }

    startTransition(async () => {
      const res = await closePosShift({
        shiftId: closeShiftCounter.activeShift!.id,
        closingCash: cashNum,
        notes: closingNotes,
        targetBranchCode: branchCode ?? undefined,
      });

      if (!res.ok) {
        setCloseShiftError(res.error || "Failed to close shift.");
      } else {
        setCloseShiftCounter(null);
        setClosingCash("");
        setClosingNotes("");
        router.refresh();
      }
    });
  }

  function handleToggleActive(counter: PosCounterWithShift) {
    startTransition(async () => {
      await togglePosCounterActive({
        counterId: counter.id,
        isActive: !counter.isActive,
      });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          background: "var(--card-bg)",
          padding: "18px 24px",
          borderRadius: 18,
          border: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🖥️</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", margin: 0 }}>
                POS Counters &amp; Terminals
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "3px 0 0" }}>
                Your plan allows <strong>{maxAllowedCounters}</strong> counter{maxAllowedCounters > 1 ? "s" : ""}.{" "}
                <span style={{ color: isLimitReached ? "var(--accent-orange)" : "var(--success)", fontWeight: 700 }}>
                  {totalUsed}/{maxAllowedCounters} configured
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            disabled={!canEdit || isLimitReached}
            style={{
              padding: "9px 18px",
              borderRadius: 12,
              border: "none",
              background: isLimitReached ? "rgba(255, 255, 255, 0.08)" : "var(--cta-bg)",
              color: isLimitReached ? "var(--text-secondary)" : "var(--cta-text)",
              fontSize: 13,
              fontWeight: 800,
              cursor: isLimitReached || !canEdit ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: isLimitReached ? "none" : "0 4px 14px rgba(0, 210, 106, 0.3)",
            }}
          >
            <span>+ Add Counter</span>
          </button>
        </div>
      </div>

      {/* Counters Grid */}
      {counters.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            background: "var(--card-bg)",
            borderRadius: 18,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            No POS Counters Created Yet
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 16px" }}>
            Add counters to enable multiple cashiers to ring up customer sales simultaneously.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              border: "none",
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + Create First Counter
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {counters.map((c) => {
            const isOpen = c.activeShift && c.activeShift.status === "OPEN";
            const shift = c.activeShift;

            return (
              <div
                key={c.id}
                style={{
                  padding: "20px 24px",
                  borderRadius: 18,
                  background: "var(--card-bg)",
                  border: isOpen ? "1px solid rgba(0, 210, 106, 0.4)" : "1px solid var(--border)",
                  boxShadow: isOpen ? "0 4px 18px rgba(0, 210, 106, 0.08)" : "0 2px 6px rgba(0,0,0,0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                  opacity: c.isActive ? 1 : 0.6,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text-primary)", margin: 0 }}>
                      {c.name}
                    </h3>

                    {isOpen ? (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 12,
                          background: "rgba(0, 210, 106, 0.15)",
                          color: "var(--success)",
                          fontSize: 11,
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
                        Open — {shift?.openedByName}
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 12,
                          background: "rgba(255, 255, 255, 0.06)",
                          color: "var(--text-secondary)",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ⚪ Closed
                      </span>
                    )}

                    {!c.isActive && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          background: "rgba(239, 68, 68, 0.1)",
                          color: "var(--danger)",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Disabled
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Assigned: <strong>{c.assignedStaffName || "Any Staff"}</strong></span>
                    <span>·</span>
                    <span>Today: <strong style={{ color: "var(--text-primary)" }}>₹{c.todayTotalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong> ({c.todayTransactionCount} txns)</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setResetPinCounter(c)}
                    disabled={!canEdit}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Reset PIN
                  </button>

                  {isOpen && (
                    <button
                      type="button"
                      onClick={() => setCloseShiftCounter(c)}
                      disabled={!canEdit}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--danger)",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "var(--danger)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Close Shift
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleActive(c)}
                    disabled={!canEdit}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: c.isActive ? "var(--text-secondary)" : "var(--success)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD COUNTER */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setShowAddModal(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", margin: "0 0 16px" }}>
              Add New POS Terminal Counter
            </h3>

            {formError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleAddCounter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Counter Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Counter 1 — Ground Floor"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Assign to Cashier Staff (Optional)
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">Any Staff (General Counter)</option>
                  {cashiers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.empId || s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Set 4-Digit PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 16,
                      fontWeight: 900,
                      letterSpacing: 4,
                      textAlign: "center",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Confirm PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 16,
                      fontWeight: 900,
                      letterSpacing: 4,
                      textAlign: "center",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isPending}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "Saving..." : "Save Counter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RESET PIN */}
      {resetPinCounter && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setResetPinCounter(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", margin: "0 0 6px" }}>
              Reset PIN: {resetPinCounter.name}
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Manager override: No need to know previous PIN.
            </p>

            {resetError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Enter New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={resetNewPin}
                  onChange={(e) => setResetNewPin(e.target.value.replace(/\D/g, ""))}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: 6,
                    textAlign: "center",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={resetConfirmPin}
                  onChange={(e) => setResetConfirmPin(e.target.value.replace(/\D/g, ""))}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: 6,
                    textAlign: "center",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setResetPinCounter(null)}
                  disabled={isPending}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "Updating..." : "Update PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CLOSE SHIFT */}
      {closeShiftCounter && closeShiftCounter.activeShift && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setCloseShiftCounter(null);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
              padding: 24,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", margin: "0 0 4px" }}>
              Close Shift: {closeShiftCounter.name}
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Cashier: <strong>{closeShiftCounter.activeShift.openedByName}</strong>
            </p>

            {closeShiftError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {closeShiftError}
              </div>
            )}

            {/* Reconciliation KPI summary */}
            <div
              style={{
                padding: "14px",
                borderRadius: 12,
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Opening Float:</span>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                  ₹{(closeShiftCounter.activeShift.openingCash || 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Shift Total:</span>
                <div style={{ fontSize: 14, fontWeight: 900, color: "var(--success)" }}>
                  ₹{closeShiftCounter.activeShift.shiftTotalAmount.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            <form onSubmit={handleCloseShift} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Physical Cash Counted in Drawer (₹) *
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Count cash in drawer..."
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 16,
                    fontWeight: 900,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Difference Preview */}
              {closingCash && !isNaN(parseFloat(closingCash)) && (
                (() => {
                  const expected = (closeShiftCounter.activeShift.openingCash || 0) + closeShiftCounter.activeShift.shiftTotalAmount;
                  const diff = parseFloat(closingCash) - expected;
                  const isMatch = Math.abs(diff) < 0.01;
                  const isSurplus = diff > 0;

                  return (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: isMatch
                          ? "rgba(0, 210, 106, 0.12)"
                          : isSurplus
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(239, 68, 68, 0.12)",
                        border: `1px solid ${isMatch ? "var(--success)" : isSurplus ? "#3b82f6" : "var(--danger)"}`,
                        fontSize: 12,
                        fontWeight: 800,
                        color: isMatch ? "var(--success)" : isSurplus ? "#3b82f6" : "var(--danger)",
                      }}
                    >
                      {isMatch
                        ? "✓ Cash matches expected float exactly!"
                        : isSurplus
                        ? `▲ Cash Surplus: +₹${diff.toFixed(2)}`
                        : `▼ Cash Shortage: -₹${Math.abs(diff).toFixed(2)}`}
                    </div>
                  );
                })()
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Manager Handover Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Verified by Store Manager, shift closed cleanly."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setCloseShiftCounter(null)}
                  disabled={isPending}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--danger)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "Closing..." : "Confirm Close Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
