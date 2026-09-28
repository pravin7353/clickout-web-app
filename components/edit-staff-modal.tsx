"use client";

import { useState, useTransition } from "react";
import { updateStaff, resetStaffDeviceLink } from "@/actions/staff";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { StaffRow as StaffRowType } from "@/lib/services/staff-service";
import { CustomSelect, OptionItem } from "@/components/custom-select";

type BranchOption = { branchCode: string; storeName: string };

const ROLE_OPTIONS: OptionItem[] = [
  { value: "CASHIER", label: "CASHIER (Assisted POS)", icon: "🛒" },
  { value: "GUARD", label: "GUARD (Exit Verification)", icon: "🛡️" },
  { value: "MANAGER", label: "MANAGER (Store Ops)", icon: "💼" },
  { value: "AUDITOR", label: "AUDITOR (Financial CA Ledger)", icon: "📊" },
];

export function EditStaffModal({
  staff,
  branches,
  isBranchLocked = false,
  onClose,
}: {
  staff: StaffRowType;
  branches: BranchOption[];
  isBranchLocked?: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState(staff.role.toUpperCase());
  const [branchCode, setBranchCode] = useState(staff.branchCode || "HQ");
  const [phone, setPhone] = useState(staff.phone || "");
  const [email, setEmail] = useState(staff.email || "");
  const [error, setError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const branchOptionsList: OptionItem[] = isBranchLocked
    ? branches.map((b) => ({
        value: b.branchCode,
        label: `${b.branchCode} — ${b.storeName}`,
        icon: "🏪",
      }))
    : [
        { value: "HQ", label: "ALL BRANCHES (HQ)", icon: "🌐" },
        ...branches.map((b) => ({
          value: b.branchCode,
          label: `${b.branchCode} — ${b.storeName}`,
          icon: "🏪",
        })),
      ];

  const lockedBranchInfo = branches.find((b) => b.branchCode === (staff.branchCode || branchCode)) || branches[0];
  const lockedBranchDisplay = lockedBranchInfo
    ? `${lockedBranchInfo.branchCode} — ${lockedBranchInfo.storeName}`
    : (staff.branchCode || branchCode || "HQ");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!phone || phone.length !== 10) {
      setError("Strictly 10 digit mobile number is required.");
      return;
    }

    startTransition(async () => {
      const res = await updateStaff({
        id: staff.id,
        role,
        phone,
        email: email || undefined,
        branchCode,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to update staff member.");
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 520,
          maxWidth: "92vw",
          background: "var(--card-bg)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "color-mix(in srgb, #3b82f6 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "#3b82f6",
                flexShrink: 0,
              }}
            >
              🛠️
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                Edit Personnel
              </h3>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {staff.name} <span style={{ fontFamily: "monospace", fontWeight: 700 }}>({staff.empId || "N/A"})</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 8,
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Role Warning Banner */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--warning) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--warning)",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <span>🛡️</span>
            <span>Changing security role will immediately alter app permissions.</span>
          </div>

          {/* System Designation */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              System Designation *
            </label>
            <CustomSelect
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS}
              prefixIcon="🛡️"
            />
          </div>

          {/* Assign to Branch */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Assign to Branch *
            </label>
            {isBranchLocked ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "11px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🏪</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    {lockedBranchDisplay}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: 6,
                      background: "color-mix(in srgb, var(--cta-bg-accent) 15%, transparent)",
                      color: "var(--cta-bg-accent)",
                      border: "1px solid color-mix(in srgb, var(--cta-bg-accent) 30%, transparent)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    LOCKED
                  </span>
                </div>
                <span style={{ fontSize: 14, opacity: 0.7 }} title="Personnel is locked to this branch">🔒</span>
              </div>
            ) : (
              <CustomSelect
                value={branchCode}
                onChange={setBranchCode}
                options={branchOptionsList}
                prefixIcon="🏪"
              />
            )}
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Phone (Login Credential) *
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "0 12px",
              }}
            >
              <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 8 }}>📱</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginRight: 6 }}>+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                required
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: "12px 0",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Official Email Address {role === "MANAGER" ? "*" : "(Optional)"}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "0 12px",
              }}
            >
              <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 8 }}>✉️</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@store.com"
                required={role === "MANAGER"}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: "12px 0",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Device Authentication Link Management */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "color-mix(in srgb, var(--border) 20%, transparent)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Phone Device Link
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: (staff.authUid && !resetSuccess)
                      ? "color-mix(in srgb, var(--success) 15%, transparent)"
                      : "color-mix(in srgb, var(--border) 40%, transparent)",
                    color: (staff.authUid && !resetSuccess) ? "var(--success)" : "var(--text-secondary)",
                  }}
                >
                  {(staff.authUid && !resetSuccess) ? "● LINKED" : "○ UNLINKED"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                {(staff.authUid && !resetSuccess)
                  ? "Staff member's phone number is bound to their verified device."
                  : "No device linked yet or device link has been cleared."}
              </p>
            </div>

            {(staff.authUid && !resetSuccess) && (
              <button
                type="button"
                disabled={isResetting || isPending}
                onClick={async () => {
                  if (!confirm(`Are you sure you want to reset the device link for ${staff.name}? They will need to verify their phone number again.`)) {
                    return;
                  }
                  setIsResetting(true);
                  setError("");
                  try {
                    const res = await resetStaffDeviceLink(staff.id);
                    if (!res.ok) {
                      setError(res.error || "Failed to reset device link.");
                    } else {
                      setResetSuccess(true);
                      router.refresh();
                    }
                  } catch (err: any) {
                    setError(err?.message || "Failed to reset device link.");
                  } finally {
                    setIsResetting(false);
                  }
                }}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--danger)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: isResetting ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {isResetting ? "Resetting..." : "🔄 Reset Device"}
              </button>
            )}
          </div>

          {resetSuccess && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                border: "1px solid var(--success)",
                color: "var(--success)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ✅ Device link successfully reset. The staff member can now log in on a new device.
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🚨 {error}
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 12,
              marginTop: 10,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: "10px 18px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                background: "var(--cta-bg-accent)",
                color: "#0A0A0A",
                border: "none",
                borderRadius: 12,
                padding: "12px 24px",
                fontSize: 13,
                fontWeight: 800,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 10px color-mix(in srgb, var(--cta-bg-accent) 30%, transparent)",
                transition: "all 0.15s ease",
              }}
            >
              {isPending ? "Updating..." : "💾 Update Profile"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
