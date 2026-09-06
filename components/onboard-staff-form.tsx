"use client";

import { useState, useTransition } from "react";
import { onboardStaff } from "@/actions/staff";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { CustomSelect, OptionItem } from "@/components/custom-select";

export type BranchOption = { branchCode: string; storeName: string };

const ROLE_OPTIONS: OptionItem[] = [
  { value: "CASHIER", label: "CASHIER", icon: "🛒" },
  { value: "GUARD", label: "GUARD", icon: "🛡️" },
  { value: "MANAGER", label: "MANAGER", icon: "💼" },
  { value: "AUDITOR", label: "AUDITOR", icon: "📊" },
];

export function OnboardStaffForm({
  defaultBranchCode,
  branches = [],
  isBranchLocked = false,
}: {
  defaultBranchCode?: string;
  branches?: BranchOption[];
  isBranchLocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("CASHIER");
  const [selectedBranch, setSelectedBranch] = useState(defaultBranchCode || (branches[0]?.branchCode ?? "HQ"));
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
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

  const lockedBranchInfo = branches.find((b) => b.branchCode === (defaultBranchCode || selectedBranch)) || branches[0];
  const lockedBranchDisplay = lockedBranchInfo
    ? `${lockedBranchInfo.branchCode} — ${lockedBranchInfo.storeName}`
    : (defaultBranchCode || selectedBranch);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!phone || phone.length !== 10) {
      setError("Strictly 10 digit mobile number required (+91).");
      return;
    }

    if (name.trim().split(" ").length < 2) {
      setError("Please enter full name (First & Last name).");
      return;
    }

    startTransition(async () => {
      const res = await onboardStaff({
        empId,
        role: selectedRole.toLowerCase(),
        name,
        phone,
        email: email || undefined,
        branchCode: selectedBranch,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to onboard staff member.");
      } else {
        setOpen(false);
        setEmpId("");
        setName("");
        setPhone("");
        setEmail("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "var(--cta-bg-accent)",
          color: "#0A0A0A",
          border: "none",
          borderRadius: 12,
          padding: "10px 20px",
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 2px 10px color-mix(in srgb, var(--cta-bg-accent) 25%, transparent)",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: 16 }}>👤+</span>
        <span>Add Personnel</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            style={{
              width: 550,
              maxWidth: "94vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "22px 26px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--cta-bg-accent) 15%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: "var(--cta-bg-accent)",
                    flexShrink: 0,
                  }}
                >
                  👤+
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Onboard Personnel
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Grant access and assign branch roles
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "6px 10px",
                  borderRadius: 8,
                }}
              >
                ✕
              </button>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmit} style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
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
                    <span style={{ fontSize: 14, opacity: 0.7 }} title="Personnel will be assigned exclusively to your branch">🔒</span>
                  </div>
                ) : (
                  <CustomSelect
                    value={selectedBranch}
                    onChange={setSelectedBranch}
                    options={branchOptionsList}
                    prefixIcon="🏪"
                  />
                )}
              </div>

              {/* System Designation */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  System Designation *
                </label>
                <CustomSelect
                  value={selectedRole}
                  onChange={setSelectedRole}
                  options={ROLE_OPTIONS}
                  prefixIcon="🛡️"
                />
                {selectedRole === "AUDITOR" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "color-mix(in srgb, #2563eb 12%, transparent)", border: "1px solid color-mix(in srgb, #2563eb 35%, transparent)", borderRadius: 8, fontSize: 12, color: "#60a5fa" }}>
                    📊 <strong>Universal Auditor:</strong> This auditor email can be assigned across multiple client companies without uniqueness conflicts.
                  </div>
                )}
              </div>

              {/* Employee ID */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Employee ID *
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "0 14px",
                  }}
                >
                  <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>🪪</span>
                  <input
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP-001"
                    required
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      padding: "13px 0",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      letterSpacing: "0.05em",
                    }}
                  />
                </div>
                {empId.toUpperCase().startsWith("AUD") && selectedRole !== "AUDITOR" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "color-mix(in srgb, #eab308 12%, transparent)", border: "1px solid color-mix(in srgb, #eab308 35%, transparent)", borderRadius: 8, fontSize: 12, color: "#facc15", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⚠️ Employee ID has &quot;AUD&quot;, but Designation is <strong>{selectedRole}</strong>.</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRole("AUDITOR")}
                      style={{ background: "#facc15", color: "#000", border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      Set to AUDITOR
                    </button>
                  </div>
                )}
              </div>

              {/* Full Name */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Full Name *
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "0 14px",
                  }}
                >
                  <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>👤</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      padding: "13px 0",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {selectedRole === "AUDITOR" ? "Contact Phone (Optional for Auditor)" : "Phone (Login Credential) *"}
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "0 14px",
                  }}
                >
                  <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>📱</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginRight: 6 }}>+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile number"
                    required={selectedRole !== "AUDITOR"}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      padding: "13px 0",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Official Email */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {selectedRole === "AUDITOR"
                    ? "Official Email Address * (Auditor Login Credential)"
                    : selectedRole === "MANAGER"
                    ? "Official Email Address *"
                    : "Official Email Address (Optional)"}
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "0 14px",
                  }}
                >
                  <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>✉️</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={selectedRole === "AUDITOR" ? "ca@auditfirm.com" : "staff@store.com"}
                    required={selectedRole === "MANAGER" || selectedRole === "AUDITOR"}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      padding: "13px 0",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

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
                  gap: 14,
                  marginTop: 6,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
                    color: "#000000",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px 32px",
                    fontSize: 14,
                    fontWeight: 900,
                    cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 3px 12px color-mix(in srgb, var(--cta-bg-accent) 35%, transparent)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🚀</span>
                  <span>{isPending ? "Creating..." : "Create Access"}</span>
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}