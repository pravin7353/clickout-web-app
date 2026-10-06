"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getAttendanceSettingsAction,
  updateAttendanceSettingsAction,
  triggerMarkAbsentees,
  bulkRegularizeDateAction,
  updateStaffShiftProfileAction,
} from "@/actions/hr";
import { AttendanceSettingsDocument, DEFAULT_ATTENDANCE_SETTINGS } from "@/lib/schemas/hr-schema";
import { SimpleStaff } from "@/components/hr-attendance-table";
import { QRCodeSVG } from "qrcode.react";

interface HrAttendanceSettingsProps {
  tenantId?: string | null;
  canEdit: boolean;
  userRole: string;
  staffList?: SimpleStaff[];
}

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function HrAttendanceSettings({
  tenantId,
  canEdit,
  userRole,
  staffList = [],
}: HrAttendanceSettingsProps) {
  const [settings, setSettings] = useState<AttendanceSettingsDocument>(DEFAULT_ATTENDANCE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [employeePortalUrl, setEmployeePortalUrl] = useState("/employee/login");
  const [copied, setCopied] = useState(false);

  // New Holiday Input State (Informational Calendar)
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  // Manual Absent Marking (Admin Only / Testing)
  const [absentDate, setAbsentDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRunningAbsent, setIsRunningAbsent] = useState(false);
  const [absentResult, setAbsentResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Bulk Regularization State (Repair Tool for 2026-10-02 or Past Holidays)
  const [bulkRegDate, setBulkRegDate] = useState("2026-10-02");
  const [bulkRegReason, setBulkRegReason] = useState("Gandhi Jayanti National Holiday");
  const [isBulkRegularizing, setIsBulkRegularizing] = useState(false);
  const [bulkRegResult, setBulkRegResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleRunBulkRegularize = async () => {
    if (!canEdit) return;
    setIsBulkRegularizing(true);
    setBulkRegResult(null);

    try {
      const res = await bulkRegularizeDateAction(bulkRegDate, bulkRegReason, "PRESENT");
      if (res && res.ok) {
        setBulkRegResult({
          ok: true,
          message: res.message || `Successfully regularized ${res.regularizedCount} staff members.`,
        });
      } else {
        setBulkRegResult({
          ok: false,
          message: res?.error || "Failed to bulk regularize.",
        });
      }
    } catch (err: any) {
      setBulkRegResult({
        ok: false,
        message: err?.message || "An unexpected error occurred.",
      });
    } finally {
      setIsBulkRegularizing(false);
    }
  };

  const handleRunAbsentMarking = async () => {
    if (!canEdit) return;
    setIsRunningAbsent(true);
    setAbsentResult(null);

    try {
      const res = await triggerMarkAbsentees(tenantId || undefined, absentDate);
      if (res && res.ok) {
        setAbsentResult({
          ok: true,
          message: `Absent marking completed for ${res.date}. Marked ${res.markedCount} staff as ABSENT.`,
        });
      } else {
        setAbsentResult({
          ok: false,
          message: res?.error || "Failed to trigger absent marking.",
        });
      }
    } catch (err: any) {
      setAbsentResult({
        ok: false,
        message: err?.message || "An unexpected error occurred while running absent marking.",
      });
    } finally {
      setIsRunningAbsent(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEmployeePortalUrl(`${window.location.origin}/employee/login`);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getAttendanceSettingsAction(tenantId || undefined).then((res) => {
      if (isMounted) {
        if (res && res.ok && res.settings) {
          setSettings(res.settings);
        }
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newHolidayDate || !newHolidayName.trim()) return;

    const existingHolidays = Array.isArray(settings.holidays) ? settings.holidays : [];
    if (existingHolidays.some((h) => h.date === newHolidayDate)) {
      setSaveError(`Holiday for ${newHolidayDate} already exists.`);
      return;
    }

    const updated = [...existingHolidays, { date: newHolidayDate, name: newHolidayName.trim() }].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    setSettings({ ...settings, holidays: updated });
    setNewHolidayDate("");
    setNewHolidayName("");
  };

  const handleDeleteHoliday = (dateToDelete: string) => {
    if (!canEdit) return;
    const existingHolidays = Array.isArray(settings.holidays) ? settings.holidays : [];
    const updated = existingHolidays.filter((h) => h.date !== dateToDelete);
    setSettings({ ...settings, holidays: updated });
  };

  const handleSave = () => {
    if (!canEdit) return;
    setSaveError(null);
    setSaveSuccess(null);

    startTransition(async () => {
      try {
        const res = await updateAttendanceSettingsAction(tenantId || undefined, settings);
        if (res && res.ok) {
          setSaveSuccess("Attendance configuration saved successfully!");
          setTimeout(() => setSaveSuccess(null), 4000);
        } else {
          setSaveError(res?.error || "Failed to save attendance settings.");
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
  const holidaysList = Array.isArray(settings.holidays) ? settings.holidays : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 950 }}>
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
            Tenant Attendance &amp; Shift Policies
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Configure default shift timings, store weekly-off baseline, geo-fencing radius, and automated absent rules.
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

      {/* 1. Default Shift & Weekly Off */}
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
          <span>⏰</span> Default Shift &amp; Weekly Off
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {/* Shift Start */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              DEFAULT SHIFT START (HH:mm)
            </label>
            <input
              type="time"
              disabled={!canEdit}
              value={settings.shiftStartTime || "09:00"}
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
              Baseline shift start (e.g. 09:00 AM)
            </span>
          </div>

          {/* Shift End */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              DEFAULT SHIFT END (HH:mm)
            </label>
            <input
              type="time"
              disabled={!canEdit}
              value={settings.shiftEndTime || "18:00"}
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
              Baseline shift end (e.g. 18:00 PM)
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
              value={settings.gracePeriodMinutes ?? 15}
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
              Check-in within {settings.gracePeriodMinutes ?? 15}m of shift start is not marked late
            </span>
          </div>

          {/* Default Weekly Off */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
              DEFAULT WEEKLY OFF DAY
            </label>
            <select
              disabled={!canEdit}
              value={settings.defaultWeeklyOffDay || "Sunday"}
              onChange={(e) => setSettings({ ...settings, defaultWeeklyOffDay: e.target.value })}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Pre-fills new employee profiles (can be customized per staff below)
            </span>
          </div>
        </div>
      </div>

      {/* 2. Public Holiday Calendar (Optional Reference) */}
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
            <span>🌴</span> Public Holiday Calendar (Optional Reference)
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Informational reference list for store managers during leave approvals. Retail stores operate on public holidays, so this list does not automate or block attendance.
          </p>
        </div>

        {canEdit && (
          <form onSubmit={handleAddHoliday} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>DATE</label>
              <input
                type="date"
                required
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>HOLIDAY NAME / LABEL</label>
              <input
                type="text"
                required
                placeholder="e.g. Maharashtra Day, Pongal, Diwali"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                background: "rgba(59, 130, 246, 0.15)",
                color: "#3b82f6",
                fontWeight: 800,
                fontSize: 13,
                border: "1px solid rgba(59, 130, 246, 0.3)",
                cursor: "pointer",
              }}
            >
              + Add Holiday
            </button>
          </form>
        )}

        {holidaysList.length === 0 ? (
          <div style={{ padding: "14px 18px", borderRadius: 10, background: "rgba(0,0,0,0.15)", color: "var(--text-secondary)", fontSize: 12 }}>
            No custom public holidays listed yet. Standard national holidays will be referenced automatically.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {holidaysList.map((h) => (
              <div
                key={h.date}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{h.date}:</span>
                <span style={{ color: "var(--text-secondary)" }}>{h.name}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(h.date)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 0,
                    }}
                    title="Remove holiday"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
          <span>📍</span> Geo-Fencing &amp; Shift Duration Thresholds
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {/* Geo Radius */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                GEO-FENCE RADIUS
              </label>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                {settings.geoRadiusMeters ?? 100} meters
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              disabled={!canEdit}
              value={settings.geoRadiusMeters ?? 100}
              onChange={(e) =>
                setSettings({ ...settings, geoRadiusMeters: Number(e.target.value) })
              }
              style={{ accentColor: "var(--cta-bg)", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Detection boundary radius from store coordinates (10m – 500m)
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
              value={settings.halfDayThresholdMinutes ?? 240}
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
              Working less than {settings.halfDayThresholdMinutes ?? 240}m ({Math.round((settings.halfDayThresholdMinutes ?? 240) / 60)} hrs) is counted as Half-Day
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
              value={settings.lateCountForAbsent ?? 3}
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
              Every {settings.lateCountForAbsent ?? 3} late check-ins converts to 1 day absent deduction
            </span>
          </div>
        </div>
      </div>

      {/* 4. Automated Policies */}
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
          <span>⚙️</span> Automation Policies
        </div>

        <div>
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
                Automatically mark active staff ABSENT via Cloud Scheduler (23:59 IST) if no check-in is recorded
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.autoMarkAbsentEnabled !== false}
              onChange={(e) =>
                setSettings({ ...settings, autoMarkAbsentEnabled: e.target.checked })
              }
              style={{ width: 18, height: 18, accentColor: "#22c55e", cursor: canEdit ? "pointer" : "not-allowed" }}
            />
          </div>
        </div>
      </div>

      {/* 5. Manual Absent Marking (Admin Only / Testing) */}
      {isTenantAdminOrSuper && (
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: 18,
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                Run Absent Marking (Manual Trigger)
              </span>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  textTransform: "uppercase",
                }}
              >
                ADMIN ONLY
              </span>
            </div>

            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>
              In production, this runs via Cloud Scheduler at 23:59 IST.
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Manually trigger the absentee batch evaluation for all active staff. Staff who have not recorded attendance or checked in for the selected date will be marked as ABSENT according to tenant auto-mark rules and weekly off policies.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                TARGET DATE
              </label>
              <input
                type="date"
                value={absentDate}
                onChange={(e) => setAbsentDate(e.target.value)}
                disabled={isRunningAbsent || !canEdit}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end", flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "transparent" }}>ACTION</label>
              <button
                type="button"
                onClick={handleRunAbsentMarking}
                disabled={isRunningAbsent || !canEdit}
                style={{
                  padding: "9px 18px",
                  borderRadius: 10,
                  background: "#f59e0b",
                  color: "#000000",
                  fontWeight: 800,
                  fontSize: 13,
                  border: "none",
                  cursor: isRunningAbsent ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
                  opacity: isRunningAbsent ? 0.7 : 1,
                  alignSelf: "flex-start",
                }}
              >
                {isRunningAbsent ? "⏳ Running Absent Marking..." : "⚡ Run Absent Marking"}
              </button>
            </div>
          </div>

          {absentResult && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                background: absentResult.ok ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: absentResult.ok ? "#22c55e" : "#ef4444",
                border: absentResult.ok ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {absentResult.ok ? `✅ ${absentResult.message}` : `⚠️ ${absentResult.message}`}
            </div>
          )}
        </div>
      )}

      {/* 6. Bulk Regularize Past Date / Holiday Bug Fix (Section 8) */}
      {isTenantAdminOrSuper && (
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            borderRadius: 18,
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🛠️</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                Bulk Regularize Past Date (Fix Holiday False-Absents)
              </span>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 900,
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#3b82f6",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  textTransform: "uppercase",
                }}
              >
                REPAIR TOOL
              </span>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Did staff get falsely marked ABSENT on a past holiday (e.g. <b>2026-10-02 Gandhi Jayanti</b>)? Use this tool to regularize all staff attendance for that day in a single click.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                DATE TO REGULARIZE
              </label>
              <input
                type="date"
                value={bulkRegDate}
                onChange={(e) => setBulkRegDate(e.target.value)}
                disabled={isBulkRegularizing || !canEdit}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                REASON NOTE
              </label>
              <input
                type="text"
                value={bulkRegReason}
                onChange={(e) => setBulkRegReason(e.target.value)}
                placeholder="e.g. Gandhi Jayanti National Holiday"
                disabled={isBulkRegularizing || !canEdit}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "transparent" }}>ACTION</label>
              <button
                type="button"
                onClick={handleRunBulkRegularize}
                disabled={isBulkRegularizing || !canEdit}
                style={{
                  padding: "9px 18px",
                  borderRadius: 10,
                  background: "#3b82f6",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: 13,
                  border: "none",
                  cursor: isBulkRegularizing ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
                  opacity: isBulkRegularizing ? 0.7 : 1,
                }}
              >
                {isBulkRegularizing ? "⏳ Regularizing..." : "✨ Bulk Regularize Date"}
              </button>
            </div>
          </div>

          {bulkRegResult && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                background: bulkRegResult.ok ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: bulkRegResult.ok ? "#22c55e" : "#ef4444",
                border: bulkRegResult.ok ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {bulkRegResult.ok ? `✅ ${bulkRegResult.message}` : `⚠️ ${bulkRegResult.message}`}
            </div>
          )}
        </div>
      )}

      {/* 7. Flexible Weekly-Off & Shift Time Assignment per Employee (Redesigned Table) */}
      {staffList && staffList.length > 0 && (
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>👥</span> Staff Shift Policy &amp; Flexible Weekly-Off Assignment
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                Configure individual shift timings, weekly off days, and attendance modes per employee.
              </p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", background: "rgba(0,0,0,0.15)" }}>
                  <th style={{ padding: "10px 14px" }}>Staff Member</th>
                  <th style={{ padding: "10px 14px" }}>Role / Branch</th>
                  <th style={{ padding: "10px 14px" }}>Shift Time</th>
                  <th style={{ padding: "10px 14px" }}>Weekly Off Day</th>
                  <th style={{ padding: "10px 14px" }}>Attendance Mode</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((st) => (
                  <StaffShiftRow
                    key={st.id}
                    staff={st}
                    canEdit={canEdit}
                    defaultStartTime={settings.shiftStartTime || "09:00"}
                    defaultEndTime={settings.shiftEndTime || "18:00"}
                    defaultWeeklyOff={settings.defaultWeeklyOffDay || "Sunday"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Employee Mobile App (PWA) QR Code Card */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <span>📱</span> Get Employee App (Mobile PWA &amp; Quick Access)
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Show this QR code to staff (Cashiers, Guards, Sales Staff) to open the mobile portal on their phone.
            </p>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              background: "rgba(34, 197, 94, 0.12)",
              color: "#22c55e",
              border: "1px solid rgba(34, 197, 94, 0.3)",
            }}
          >
            OTP Phone Login
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
            padding: 20,
            borderRadius: 14,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: 12,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              flexShrink: 0,
            }}
          >
            <QRCodeSVG
              value={employeePortalUrl}
              size={140}
              level="H"
              includeMargin={false}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              Onboarding Steps for Staff:
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <li>Scan this QR code using a smartphone camera to open <b>/employee/login</b></li>
              <li>Log in with the registered staff phone number via OTP verification</li>
              <li>Tap <b>"Add to Home Screen"</b> in browser to install the mobile PWA</li>
              <li>Enable GPS location permissions for store geo-attendance &amp; check-in</li>
            </ol>

            <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(employeePortalUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: copied ? "rgba(34, 197, 94, 0.15)" : "var(--card-bg)",
                  color: copied ? "#22c55e" : "var(--text-primary)",
                  border: "1px solid var(--border)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{copied ? "✅" : "📋"}</span>
                {copied ? "Link Copied!" : "Copy Portal Link"}
              </button>

              <a
                href="/employee/login"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "var(--card-bg)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>↗️</span> Preview Portal
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StaffShiftRowProps {
  staff: SimpleStaff;
  canEdit: boolean;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultWeeklyOff: string;
}

function StaffShiftRow({
  staff,
  canEdit,
  defaultStartTime,
  defaultEndTime,
  defaultWeeklyOff,
}: StaffShiftRowProps) {
  const staffData = staff as any;
  const [shiftStart, setShiftStart] = useState<string>(
    staffData.shiftStartOverride || staffData.customShiftStartTime || defaultStartTime
  );
  const [shiftEnd, setShiftEnd] = useState<string>(
    staffData.shiftEndOverride || staffData.customShiftEndTime || defaultEndTime
  );
  const [weeklyOff, setWeeklyOff] = useState<string>(
    staffData.weeklyOffDay || staffData.weeklyOff || defaultWeeklyOff
  );
  const [mode, setMode] = useState<"GEO_AUTO" | "MANUAL">(
    staffData.attendanceMode === "MANUAL" ? "MANUAL" : "GEO_AUTO"
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    setRowError(null);

    try {
      const res = await updateStaffShiftProfileAction(staff.id, {
        weeklyOffDay: weeklyOff,
        attendanceMode: mode,
        shiftStartOverride: shiftStart,
        shiftEndOverride: shiftEnd,
        shiftStartTime: shiftStart,
        shiftEndTime: shiftEnd,
      });

      if (res && res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setRowError((res as any)?.error || "Failed to save");
      }
    } catch (err: any) {
      console.error("Staff Shift Save Error:", err);
      setRowError(err?.message || "Error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {/* 1. Staff Member */}
      <td style={{ padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{staff.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>ID: {staff.empId || staff.id}</div>
      </td>

      {/* 2. Role / Branch */}
      <td style={{ padding: "12px 14px" }}>
        <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", fontSize: 11, fontWeight: 700 }}>
          {staff.role} • {staff.branchCode || "HQ"}
        </span>
      </td>

      {/* 3. Shift Time (From / To) */}
      <td style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="time"
            value={shiftStart}
            onChange={(e) => setShiftStart(e.target.value)}
            disabled={!canEdit || isSaving}
            title="Shift Start Time"
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 700,
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>→</span>
          <input
            type="time"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
            disabled={!canEdit || isSaving}
            title="Shift End Time"
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 700,
            }}
          />
        </div>
      </td>

      {/* 4. Weekly Off Day */}
      <td style={{ padding: "12px 14px" }}>
        <select
          value={weeklyOff}
          onChange={(e) => setWeeklyOff(e.target.value)}
          disabled={!canEdit || isSaving}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text-primary)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </td>

      {/* 5. Attendance Mode */}
      <td style={{ padding: "12px 14px" }}>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          disabled={!canEdit || isSaving}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text-primary)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <option value="GEO_AUTO">Geo-Fence Auto</option>
          <option value="MANUAL">Manual</option>
        </select>
      </td>

      {/* 6. Action */}
      <td style={{ padding: "12px 14px", textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          {rowError && <span style={{ fontSize: 11, color: "#ef4444" }}>{rowError}</span>}
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!canEdit || isSaving}
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
              background: saved ? "rgba(34, 197, 94, 0.15)" : "var(--cta-bg)",
              color: saved ? "#22c55e" : "var(--cta-text)",
              border: saved ? "1px solid #22c55e" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {isSaving ? "Saving..." : saved ? "✅ Saved" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}
