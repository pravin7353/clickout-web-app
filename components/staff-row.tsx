"use client";

import { useState, useTransition } from "react";
import { toggleStaffStatus, softDeleteStaff } from "@/actions/staff";
import { StaffRow as StaffRowType } from "@/lib/services/staff-service";
import { useRouter } from "next/navigation";
import { EditStaffModal } from "@/components/edit-staff-modal";

type BranchOption = { branchCode: string; storeName: string };

export function StaffRow({
  staff,
  canEdit,
  branches = [],
  isBranchLocked = false,
  isSelected = false,
  onToggleSelect,
}: {
  staff: StaffRowType;
  canEdit: boolean;
  branches?: BranchOption[];
  isBranchLocked?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();

  const isOwner = staff.role.toUpperCase() === "TENANT_ADMIN" || staff.role.toUpperCase() === "SUPER_ADMIN" || staff.empId === "OWNER";
  const isGlobalHq = !staff.branchCode || staff.branchCode.toUpperCase() === "HQ" || staff.branchCode.toUpperCase() === "ALL" || staff.branchCode.toUpperCase() === "GLOBAL HQ";

  const handleToggle = (targetActiveState: boolean) => {
    setShowMenu(false);
    startTransition(async () => {
      try {
        const res = await toggleStaffStatus(staff.id, targetActiveState);
        if (res && res.ok === false) {
          alert(res.error || "Failed to update staff status");
        } else {
          router.refresh();
        }
      } catch (err: any) {
        alert(err.message || "Failed to update staff status");
      }
    });
  };

  return (
    <tr
        style={{
          borderBottom: "1px solid var(--border)",
          background: isSelected
            ? "color-mix(in srgb, var(--cta-bg-accent, #F9A826) 8%, transparent)"
            : "transparent",
          transition: "background 0.12s ease",
        }}
      >
        {/* CHECKBOX COLUMN */}
        {canEdit && (
          <td style={{ padding: "14px 16px", width: 40, textAlign: "center" }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              aria-label={`Select ${staff.name}`}
              style={{
                cursor: "pointer",
                width: 16,
                height: 16,
                accentColor: "var(--cta-bg-accent, #F9A826)",
              }}
            />
          </td>
        )}

        {/* TENANT ID */}
        <td
          style={{
            padding: "14px 16px",
            fontFamily: "monospace",
            fontSize: 12,
            color: "var(--text-secondary)",
            letterSpacing: "0.02em",
          }}
        >
          {staff.tenantId || "TENANT_HQ"}
        </td>

        {/* EMP ID */}
        <td style={{ padding: "14px 16px" }}>
          {isOwner ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 8,
                background: "color-mix(in srgb, #f59e0b 14%, transparent)",
                color: "#f59e0b",
                border: "1px solid color-mix(in srgb, #f59e0b 35%, transparent)",
                letterSpacing: "0.05em",
              }}
            >
              <span>👑</span>
              <span>OWNER</span>
            </span>
          ) : (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {staff.empId || staff.id.slice(0, 8).toUpperCase()}
            </span>
          )}
        </td>

        {/* NAME */}
        <td style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{staff.name}</div>
          {staff.email && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{staff.email}</div>
          )}
        </td>

        {/* DESIGNATION */}
        <td style={{ padding: "14px 16px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              background: "color-mix(in srgb, var(--card-bg) 80%, var(--scaffold-bg))",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {staff.role.toUpperCase()}
          </span>
        </td>

        {/* BRANCH */}
        <td style={{ padding: "14px 16px" }}>
          {isGlobalHq ? (
            <span
              style={{
                display: "inline-block",
                padding: "3px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 800,
                background: "color-mix(in srgb, #a855f7 16%, transparent)",
                color: "#c084fc",
                border: "1px solid color-mix(in srgb, #a855f7 35%, transparent)",
              }}
            >
              GLOBAL HQ
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
              {staff.branchCode}
            </span>
          )}
        </td>

        {/* CONTACT */}
        <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
          {staff.phone ? `+91 ${staff.phone}` : "N/A"}
        </td>

        {/* SECURITY STATUS & FRAUD MONITORING */}
        <td style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: staff.status === "SUSPENDED" ? "#ef4444" : staff.isActive ? "var(--success)" : "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: staff.status === "SUSPENDED" ? "#ef4444" : staff.isActive ? "var(--success)" : "var(--text-secondary)",
                  boxShadow: staff.status === "SUSPENDED" ? "0 0 6px #ef4444" : staff.isActive ? "0 0 6px var(--success)" : "none",
                }}
              />
              {staff.status === "SUSPENDED"
                ? (staff.suspendedReason === "PLAN_LIMIT_EXCEEDED" ? "Suspended (Plan Limit)" : "Suspended")
                : staff.isActive
                ? "Active"
                : "Inactive"}
            </span>

            {/* Suspicious Check-in Count Badge (Last 30 Days) */}
            {typeof staff.suspiciousCheckInCount === "number" && staff.suspiciousCheckInCount > 0 ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background:
                    staff.suspiciousCheckInCount > 3
                      ? "rgba(239, 68, 68, 0.18)"
                      : "rgba(245, 158, 11, 0.15)",
                  color: staff.suspiciousCheckInCount > 3 ? "#ef4444" : "#f59e0b",
                  border: `1px solid ${
                    staff.suspiciousCheckInCount > 3
                      ? "rgba(239, 68, 68, 0.4)"
                      : "rgba(245, 158, 11, 0.3)"
                  }`,
                  fontSize: 10,
                  fontWeight: 800,
                }}
                title={`${staff.suspiciousCheckInCount} suspicious check-ins detected in the last 30 days`}
              >
                <span>{staff.suspiciousCheckInCount > 3 ? "🚨" : "⚠️"}</span>
                <span>
                  {staff.suspiciousCheckInCount > 3
                    ? `${staff.suspiciousCheckInCount} Suspicious (High Risk)`
                    : `${staff.suspiciousCheckInCount} Suspicious`}
                </span>
              </span>
            ) : null}
          </div>
        </td>

        {/* ACTIONS */}
        <td style={{ padding: "14px 16px", position: "relative" }}>
          {canEdit ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Prominent Edit Button */}
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                disabled={isPending}
                style={{
                  background: "color-mix(in srgb, #3b82f6 14%, transparent)",
                  color: "#60a5fa",
                  border: "1px solid color-mix(in srgb, #3b82f6 35%, transparent)",
                  padding: "5px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s ease",
                }}
                title="Edit staff permissions and branch"
              >
                <span>✏️</span>
                <span>Edit</span>
              </button>

              {/* Direct Quick Activate Button when Suspended */}
              {!staff.isActive && (
                <button
                  type="button"
                  onClick={() => handleToggle(true)}
                  disabled={isPending}
                  style={{
                    background: "color-mix(in srgb, var(--success) 14%, transparent)",
                    color: "var(--success)",
                    border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)",
                    padding: "5px 12px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isPending ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "all 0.15s ease",
                  }}
                  title="Activate staff account"
                >
                  <span>{isPending ? "⏳" : "🔓"}</span>
                  <span>{isPending ? "Activating..." : "Activate"}</span>
                </button>
              )}

              {/* Three dots menu for Deactivate / Remove */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowMenu((prev) => !prev)}
                  disabled={isPending}
                  style={{
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    padding: "5px 9px",
                    borderRadius: 10,
                    fontSize: 14,
                    cursor: isPending ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="More actions"
                >
                  •••
                </button>

                {showMenu && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 80 }}
                      onClick={() => setShowMenu(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        marginTop: 6,
                        background: "#18181b",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        boxShadow: "0 14px 36px rgba(0,0,0,0.75)",
                        zIndex: 90,
                        minWidth: 165,
                        overflow: "hidden",
                        padding: 4,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setShowEditModal(true);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          color: "var(--text-primary)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ color: "#3b82f6" }}>✏️</span>
                        <span>Edit Profile</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggle(!staff.isActive)}
                        disabled={isPending}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          color: staff.isActive ? "var(--warning)" : "var(--success)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isPending ? "not-allowed" : "pointer",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>{staff.isActive ? "🔒" : "🔓"}</span>
                        <span>{staff.isActive ? "Deactivate Access" : "Activate Access"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          if (confirm(`Are you sure you want to permanently remove ${staff.name}?`)) {
                            startTransition(async () => {
                              try {
                                await softDeleteStaff(staff.id);
                                router.refresh();
                              } catch (err: any) {
                                alert(err.message || "Failed to remove staff");
                              }
                            });
                          }
                        }}
                        disabled={isPending}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          color: "var(--danger)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>🗑️</span>
                        <span>Remove Personnel</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>View-only</span>
          )}

          {/* Edit Staff Modal */}
          {showEditModal && (
            <EditStaffModal
              staff={staff}
              branches={branches}
              isBranchLocked={isBranchLocked}
              onClose={() => setShowEditModal(false)}
            />
          )}
        </td>
      </tr>
  );
}