"use client";

import { useState, useEffect, useTransition } from "react";
import { getAttendanceSettingsAction, updateAttendanceSettingsAction } from "@/actions/hr";
import { AttendanceSettingsDocument, DEFAULT_ATTENDANCE_SETTINGS } from "@/lib/schemas/hr-schema";

interface HrAttendanceSettingsProps {
  tenantId?: string | null;
  canEdit: boolean;
  userRole: string;
}

const DAYS_OF_WEEK = [
  { day: 0, label: "Sunday", short: "Sun" },
  { day: 1, label: "Monday", short: "Mon" },
  { day: 2, label: "Tuesday", short: "Tue" },
  { day: 3, label: "Wednesday", short: "Wed" },
  { day: 4, label: "Thursday", short: "Thu" },
  { day: 5, label: "Friday", short: "Fri" },
  { day: 6, label: "Saturday", short: "Sat" },
];

export function HrAttendanceSettings({
  tenantId,
  canEdit,
  userRole,
}: HrAttendanceSettingsProps) {
  const [settings, setSettings] = useState<AttendanceSettingsDocument>(DEFAULT_ATTENDANCE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getAttendanceSettingsAction(tenantId || undefined).then((res) => {
      if (isMounted) {
        if (res.ok && res.settings) {
          setSettings(res.settings);
        }
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  const handleToggleWeeklyOff = (day: number) => {
    if (!canEdit) return;
    setSettings((prev) => {
      const current = prev.weeklyOffDays || [];
      const updated = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { ...prev, weeklyOffDays: updated };
    });
  };

  const handleSave = () => {
    if (!canEdit) return;
    setSaveError(null);
    setSaveSuccess(null);

    startTransition(async () => {
      try {
        const res = await updateAttendanceSettingsAction(tenantId || undefined, settings);
        if (res.ok) {
          setSaveSuccess("Attendance configuration saved successfully!");
          setTimeout(() => setSaveSuccess(null), 4000);
        } else {
          setSaveError(res.error || "Failed to save attendance settings.");
        }
      } catch (err: any) {
        setSaveError(err?.message || "An unexpected error occurred while saving.");
      }
    });
  };

  if (loading) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--text-secondary)",
          background: "var(--card-bg)",
          borderRadius: 16,
          border: "1px solid var(--border)",
        }}
      >
        ⏳ Loading attendance configuration...
      </div>
    );
  }

  const isTenantAdminOrSuper = userRole === "tenant_admin" || userRole === "super_admin";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
      {/* Header Info Card */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Tenant Attendance & Shift Policies
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Configure standard shift timings, geo-fencing radius, grace intervals, and automated absent rules.
          </p>
        </div>

        {isTenantAdminOrSuper && canEdit && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontWeight: 800,
              fontSize: 13,
              border: "none",
              cursor: isPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 2px 10px rgba(59, 130, 246, 0.3)",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "💾 Saving..." : "💾 Save Changes"}
          </button>
        )}
      </div>

      {saveError && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ⚠️ {saveError}
        </div>
      )}

      {saveSuccess && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#22c55e",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ✅ {saveSuccess}
        </div>
      )}

      {/* 1. Shift Timings & Grace Period */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⏰</span> Standard Shift Timing & Grace Period
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {/* Shift Start */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              SHIFT START TIME (24h HH:mm)
            </label>
            <input
              type="time"
              disabled={!canEdit}
              value={settings.shiftStartTime}
              onChange={(e) => setSettings({ ...settings, shiftStartTime: e.target.value })}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Official shift start time (e.g. 09:00 AM)
            </span>
          </div>

          {/* Shift End */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              SHIFT END TIME (24h HH:mm)
            </label>
            <input
              type="time"
              disabled={!canEdit}
              value={settings.shiftEndTime}
              onChange={(e) => setSettings({ ...settings, shiftEndTime: e.target.value })}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Official shift end time (e.g. 18:00 PM)
            </span>
          </div>

          {/* Grace Period */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              GRACE PERIOD (MINUTES)
            </label>
            <input
              type="number"
              min={0}
              max={180}
              disabled={!canEdit}
              value={settings.gracePeriodMinutes}
              onChange={(e) =>
                setSettings({ ...settings, gracePeriodMinutes: Number(e.target.value) })
              }
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Check-in within {settings.gracePeriodMinutes}m of shift start is not marked late
            </span>
          </div>
        </div>
      </div>

      {/* 2. Weekly Off Days */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>📅</span> Weekly Off Days
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Select standard weekly off days. Employees will not be marked absent on these days.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {DAYS_OF_WEEK.map(({ day, label, short }) => {
            const isSelected = (settings.weeklyOffDays || []).includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={!canEdit}
                onClick={() => handleToggleWeeklyOff(day)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: canEdit ? "pointer" : "not-allowed",
                  border: isSelected ? "1px solid var(--cta-bg)" : "1px solid var(--border)",
                  background: isSelected ? "var(--cta-bg)" : "var(--bg)",
                  color: isSelected ? "var(--cta-text)" : "var(--text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{isSelected ? "✓" : "○"}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Geo-Fence Radius & Half-Day Rules */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>📍</span> Geo-Fencing & Shift Duration Thresholds
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {/* Geo Radius */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                GEO-FENCE RADIUS
              </label>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                {settings.geoRadiusMeters} meters
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              disabled={!canEdit}
              value={settings.geoRadiusMeters}
              onChange={(e) =>
                setSettings({ ...settings, geoRadiusMeters: Number(e.target.value) })
              }
              style={{ accentColor: "var(--cta-bg)", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Default detection boundary radius from store coordinates (10m – 500m)
            </span>
          </div>

          {/* Half Day Threshold */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              HALF-DAY THRESHOLD (MINUTES)
            </label>
            <input
              type="number"
              min={60}
              max={720}
              disabled={!canEdit}
              value={settings.halfDayThresholdMinutes}
              onChange={(e) =>
                setSettings({ ...settings, halfDayThresholdMinutes: Number(e.target.value) })
              }
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Working less than {settings.halfDayThresholdMinutes}m ({Math.round(settings.halfDayThresholdMinutes / 60)} hrs) is counted as Half-Day
            </span>
          </div>

          {/* Late Count for Absent */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              LATE ARRIVALS RULE (N LATES = 1 ABSENT)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              disabled={!canEdit}
              value={settings.lateCountForAbsent}
              onChange={(e) =>
                setSettings({ ...settings, lateCountForAbsent: Number(e.target.value) })
              }
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Every {settings.lateCountForAbsent} late check-ins converts to 1 day absent deduction
            </span>
          </div>
        </div>
      </div>

      {/* 4. Automated Policies & Remote Check-In */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚙️</span> Automation & Remote Check-In Toggles
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {/* Auto-Mark Absent */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                Auto-Mark Absent
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                Automatically mark active staff ABSENT if no check-in is recorded by shift end
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.autoMarkAbsentEnabled}
              onChange={(e) =>
                setSettings({ ...settings, autoMarkAbsentEnabled: e.target.checked })
              }
              style={{ width: 18, height: 18, accentColor: "#22c55e", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
          </div>

          {/* Allow Remote Check-In */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                Allow Remote / WFH Check-in
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                Bypasses strict store geofence check for remote meetings / field sales staff
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.allowRemoteCheckIn}
              onChange={(e) =>
                setSettings({ ...settings, allowRemoteCheckIn: e.target.checked })
              }
              style={{ width: 18, height: 18, accentColor: "#3b82f6", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
          </div>

          {/* Require Selfie on Check-In */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                📸 Require Live Selfie on Check-In
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                Mandates taking a live selfie photo on employee check-in for identity verification
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.requireSelfieOnCheckIn}
              onChange={(e) =>
                setSettings({ ...settings, requireSelfieOnCheckIn: e.target.checked })
              }
              style={{ width: 18, height: 18, accentColor: "#ec4899", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
