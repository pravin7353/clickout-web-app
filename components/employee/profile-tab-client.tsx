"use client";

import { useState } from "react";
import { updateOwnProfile, getEmployeeDashboardDataAction } from "@/actions/hr";
import { SignOutButton } from "@/components/sign-out-button";
import { handleEmployeeSessionRevocation } from "@/lib/utils/device";

async function handleRevocationCheck(resOrErr: any): Promise<boolean> {
  const errMsg = typeof resOrErr === "string" ? resOrErr : resOrErr?.error || resOrErr?.message;
  if (errMsg === "SESSION_REVOKED" || errMsg?.includes("SESSION_REVOKED")) {
    await handleEmployeeSessionRevocation();
    return true;
  }
  return false;
}

interface ProfileTabClientProps {
  initialData: any;
}

export function ProfileTabClient({ initialData }: ProfileTabClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [isEditingEmergency, setIsEditingEmergency] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState(data?.staff?.emergencyContact || "");
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const staff = data?.staff;
  const displayName = staff?.name || "Employee";
  const initials = displayName.charAt(0).toUpperCase();

  // Date of Joining display rule: if staff.dateOfJoining is empty, show staff.createdAt formatted as DD/MM/YYYY
  let dojDisplay = "—";
  let dojIsApprox = false;

  if (staff?.dateOfJoining) {
    try {
      const d = new Date(staff.dateOfJoining);
      dojDisplay = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      dojDisplay = staff.dateOfJoining;
    }
  } else if (staff?.createdAt) {
    try {
      const createdDate = staff.createdAt?.toDate ? staff.createdAt.toDate() : new Date(staff.createdAt);
      dojDisplay = createdDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      dojIsApprox = true;
    } catch {
      dojDisplay = "—";
    }
  }

  // Bound at date formatting
  let boundAtDisplay = "—";
  if (staff?.boundAtMs) {
    try {
      boundAtDisplay = new Date(staff.boundAtMs).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      boundAtDisplay = "—";
    }
  }

  const handleSaveEmergency = async () => {
    if (!staff?.id) return;
    setIsSaving(true);
    setMsg(null);

    try {
      const res = await updateOwnProfile(staff.id, {
        emergencyContact: emergencyContact.trim(),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Emergency contact updated!" });
        const fresh = await getEmployeeDashboardDataAction();
        if (fresh.ok && fresh.data) {
          setData(fresh.data);
        }
        setTimeout(() => {
          setIsEditingEmergency(false);
          setMsg(null);
        }, 1200);
      } else {
        if (await handleRevocationCheck(res)) return;
        setMsg({ type: "error", text: res.error || "Failed to update emergency contact." });
      }
    } catch (err: any) {
      if (await handleRevocationCheck(err)) return;
      setMsg({ type: "error", text: err?.message || "An error occurred." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Top Header Card */}
      <div
        style={{
          borderRadius: 24,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Avatar circle (80px, initials fallback, centered) */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 32,
            overflow: "hidden",
            boxShadow: "0 6px 18px rgba(34, 197, 94, 0.25)",
          }}
        >
          {staff?.photoUrl ? (
            <img
              src={staff.photoUrl}
              alt={displayName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div>
          {/* Name — large, centered */}
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text-primary, #0f172a)" }}>
            {displayName}
          </h2>
          {/* Designation • Branch • EmpID — small grey, centered */}
          <div style={{ fontSize: 13, color: "var(--text-secondary, #64748b)", fontWeight: 600, marginTop: 4 }}>
            {staff?.role ? staff.role.toUpperCase() : "STAFF"} • {staff?.branchCode || "HQ"} • {staff?.empId || "—"}
          </div>
        </div>
      </div>

      {msg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            background: msg.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
            color: msg.type === "success" ? "#22c55e" : "#ef4444",
            border: msg.type === "success" ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          {msg.type === "success" ? `✅ ${msg.text}` : `⚠️ ${msg.text}`}
        </div>
      )}

      {/* Info Grid (2 Columns) */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
          Employment Information
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Date of Birth 🔒 */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--bg, #f8fafc)", border: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>🔒</span> DATE OF BIRTH
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
              {staff?.dateOfBirth || "—"}
            </div>
          </div>

          {/* Date of Joining 🔒 */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--bg, #f8fafc)", border: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>🔒</span> {dojIsApprox ? "JOINED (APPROX)" : "DATE OF JOINING"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
              {dojDisplay}
            </div>
          </div>

          {/* Blood Group 🔒 */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--bg, #f8fafc)", border: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>🔒</span> BLOOD GROUP
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
              {staff?.bloodGroup || "—"}
            </div>
          </div>

          {/* Emergency Contact ✏️ */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--bg, #f8fafc)", border: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800 }}>
                EMERGENCY CONTACT
              </div>
              {!isEditingEmergency && (
                <button
                  type="button"
                  onClick={() => setIsEditingEmergency(true)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: 0,
                  }}
                  title="Edit Emergency Contact"
                >
                  ✏️
                </button>
              )}
            </div>

            {!isEditingEmergency ? (
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
                {staff?.emergencyContact || "—"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <input
                  type="tel"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Phone number"
                  disabled={isSaving}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #22c55e",
                    background: "var(--card-bg, #ffffff)",
                    color: "var(--text-primary, #0f172a)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleSaveEmergency}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "#22c55e",
                      color: "#ffffff",
                      border: "none",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingEmergency(false)}
                    disabled={isSaving}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--text-secondary, #64748b)",
                      border: "1px solid var(--border, #cbd5e1)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Device Info Card */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary, #0f172a)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>📱</span> Linked Device Information
        </div>

        <div style={{ fontSize: 13, color: "var(--text-primary, #0f172a)", fontWeight: 700 }}>
          Linked Device: <span style={{ color: "var(--text-secondary, #64748b)" }}>{staff?.boundDeviceLabel || "Primary Mobile Device"}</span>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>
          Since: {boundAtDisplay}
        </div>
      </div>

      {/* Logout button at bottom (red outline / styled SignOutButton) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <SignOutButton label="⏻ Sign Out of Portal" />
      </div>
    </div>
  );
}
