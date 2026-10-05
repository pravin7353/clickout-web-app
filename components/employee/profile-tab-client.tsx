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

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

interface ProfileTabClientProps {
  initialData: any;
}

export function ProfileTabClient({ initialData }: ProfileTabClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [isEditing, setIsEditing] = useState(false);
  
  // Editable fields
  const [emergencyContact, setEmergencyContact] = useState(data?.staff?.emergencyContact || "");
  const [dateOfBirth, setDateOfBirth] = useState(data?.staff?.dateOfBirth || "");
  const [bloodGroup, setBloodGroup] = useState(data?.staff?.bloodGroup || "");
  
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

  const handleStartEdit = () => {
    setEmergencyContact(staff?.emergencyContact || "");
    setDateOfBirth(staff?.dateOfBirth || "");
    setBloodGroup(staff?.bloodGroup || "");
    setMsg(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEmergencyContact(staff?.emergencyContact || "");
    setDateOfBirth(staff?.dateOfBirth || "");
    setBloodGroup(staff?.bloodGroup || "");
    setIsEditing(false);
    setMsg(null);
  };

  const handleSaveProfile = async () => {
    if (!staff?.id) return;
    setIsSaving(true);
    setMsg(null);

    try {
      const res = await updateOwnProfile(staff.id, {
        emergencyContact: emergencyContact.trim(),
        dateOfBirth: dateOfBirth.trim(),
        bloodGroup: bloodGroup.trim(),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Profile details updated successfully!" });
        const fresh = await getEmployeeDashboardDataAction();
        if (fresh.ok && fresh.data) {
          setData(fresh.data);
        }
        setTimeout(() => {
          setIsEditing(false);
          setMsg(null);
        }, 1200);
      } else {
        if (await handleRevocationCheck(res)) return;
        setMsg({ type: "error", text: res.error || "Failed to update profile details." });
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
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text-primary)" }}>
            {displayName}
          </h2>
          {/* Designation • Branch • EmpID — small grey, centered */}
          <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, marginTop: 4 }}>
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
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
            Employment Information
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={handleStartEdit}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--scaffold-bg)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span>✏️</span> Edit Profile
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSaving}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#22c55e",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Date of Birth ✏️ */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--scaffold-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>{isEditing ? "✏️" : "🎂"}</span> DATE OF BIRTH
            </div>
            {!isEditing ? (
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
                {staff?.dateOfBirth || "—"}
              </div>
            ) : (
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={isSaving}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
            )}
          </div>

          {/* Date of Joining 🔒 */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--scaffold-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>🔒</span> {dojIsApprox ? "JOINED (APPROX)" : "DATE OF JOINING"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
              {dojDisplay}
            </div>
          </div>

          {/* Blood Group ✏️ */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--scaffold-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>{isEditing ? "✏️" : "🩸"}</span> BLOOD GROUP
            </div>
            {!isEditing ? (
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
                {staff?.bloodGroup || "—"}
              </div>
            ) : (
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                disabled={isSaving}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <option value="">Select Blood Group</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Emergency Contact ✏️ */}
          <div style={{ padding: "12px", borderRadius: 14, background: "var(--scaffold-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
              <span>{isEditing ? "✏️" : "📞"}</span> EMERGENCY CONTACT
            </div>
            {!isEditing ? (
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
                {staff?.emergencyContact || "—"}
              </div>
            ) : (
              <input
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="+91 98765 43210"
                disabled={isSaving}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Device Info Card */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>📱</span> Linked Device Information
        </div>

        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 700 }}>
          Linked Device: <span style={{ color: "var(--text-secondary)" }}>{staff?.boundDeviceLabel || "Primary Mobile Device"}</span>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Since: {boundAtDisplay}
        </div>
      </div>

      {/* Logout button at bottom (SignOutButton) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <SignOutButton label="⏻ Sign Out of Portal" />
      </div>
    </div>
  );
}
