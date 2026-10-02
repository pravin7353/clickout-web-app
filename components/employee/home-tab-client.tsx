"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  recordGeoPingAction,
  remoteCheckInAction,
  uploadAttendanceSelfieAction,
  getEmployeeDashboardDataAction,
} from "@/actions/hr";
import { handleEmployeeSessionRevocation } from "@/lib/utils/device";

async function handleRevocationCheck(resOrErr: any): Promise<boolean> {
  const errMsg = typeof resOrErr === "string" ? resOrErr : resOrErr?.error || resOrErr?.message;
  if (errMsg === "SESSION_REVOKED" || errMsg?.includes("SESSION_REVOKED")) {
    await handleEmployeeSessionRevocation();
    return true;
  }
  return false;
}

async function captureSelfieFrame(): Promise<{ ok: boolean; base64?: string; error?: string }> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, error: "Camera is not supported on this device or browser." };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false,
    });

    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject);
      };
      video.onerror = (e) => reject(e);
      setTimeout(() => resolve(), 2500);
    });

    await new Promise((r) => setTimeout(r, 400));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    stream.getTracks().forEach((track) => track.stop());

    const base64 = canvas.toDataURL("image/jpeg", 0.82);
    return { ok: true, base64 };
  } catch (err: any) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return {
        ok: false,
        error: "Camera permission denied. Please allow camera access in your browser to complete check-in.",
      };
    }
    return { ok: false, error: err?.message || "Failed to access camera for check-in selfie." };
  }
}

const INDIA_HOLIDAYS_2026 = [
  { date: "2026-10-02", name: "Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dussehra" },
  { date: "2026-10-31", name: "Halloween / Sardar Patel Jayanti" },
  { date: "2026-11-05", name: "Diwali" },
  { date: "2026-11-15", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas" },
  { date: "2027-01-01", name: "New Year" },
  { date: "2027-01-14", name: "Makar Sankranti" },
  { date: "2027-01-26", name: "Republic Day" },
];

interface HomeTabClientProps {
  initialData: any;
}

export function HomeTabClient({ initialData }: HomeTabClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [currentDistanceMeters, setCurrentDistanceMeters] = useState<number | null>(null);
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [outsideDurationSeconds, setOutsideDurationSeconds] = useState(0);
  const [appOpenSeconds, setAppOpenSeconds] = useState(0);

  const dataRef = useRef<any>(data);
  dataRef.current = data;
  const isPingingRef = useRef(false);
  const lastPingMsRef = useRef(0);

  const refreshData = useCallback(async () => {
    try {
      const res = await getEmployeeDashboardDataAction();
      if (!res.ok) {
        if (await handleRevocationCheck(res)) return;
      } else if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      if (await handleRevocationCheck(err)) return;
    }
  }, []);

  // Track app open duration & outside geofence duration
  useEffect(() => {
    const timer = setInterval(() => {
      setAppOpenSeconds((s) => s + 1);
      if (isInsideGeofence === false) {
        setOutsideDurationSeconds((s) => s + 1);
      } else {
        setOutsideDurationSeconds(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isInsideGeofence]);

  // Execute Ping (Auto-detect / Manual)
  const executePing = useCallback(
    async (isManual = false) => {
      if (isPingingRef.current) return;

      const now = Date.now();
      const minGap = isManual ? 5000 : 30000;
      if (now - lastPingMsRef.current < minGap) {
        return;
      }

      if (!navigator.geolocation) {
        setGeoError("Geolocation is not supported by your browser or device.");
        setGpsPermissionDenied(true);
        return;
      }

      isPingingRef.current = true;
      setIsPinging(true);
      setGeoError(null);

      const currentData = dataRef.current;
      let selfieUrl: string | null = null;
      const requireSelfie = Boolean(
        currentData?.settings?.requireSelfieOnCheckIn && !currentData?.todayAttendance?.checkInMs
      );

      if (requireSelfie && isManual) {
        const selfieResult = await captureSelfieFrame();
        if (!selfieResult.ok || !selfieResult.base64) {
          isPingingRef.current = false;
          setIsPinging(false);
          setGeoError(selfieResult.error || "Camera selfie is required for check-in.");
          return;
        }

        const todayStr = new Date().toISOString().split("T")[0];
        try {
          const uploadRes = await uploadAttendanceSelfieAction(selfieResult.base64, todayStr);
          if (!uploadRes.ok) {
            if (await handleRevocationCheck(uploadRes)) return;
            isPingingRef.current = false;
            setIsPinging(false);
            setGeoError(uploadRes.error || "Failed to upload check-in selfie.");
            return;
          }
          selfieUrl = uploadRes.selfieUrl ?? null;
        } catch (err: any) {
          if (await handleRevocationCheck(err)) return;
          isPingingRef.current = false;
          setIsPinging(false);
          setGeoError(err?.message || "Failed to upload check-in selfie.");
          return;
        }
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          setGpsPermissionDenied(false);
          const { latitude, longitude } = position.coords;
          try {
            const res = await recordGeoPingAction(latitude, longitude, undefined, selfieUrl);
            if (res.ok) {
              lastPingMsRef.current = Date.now();
              setCurrentDistanceMeters(res.distanceMeters ?? null);
              setIsInsideGeofence(res.isInside ?? null);
              setLastPingTime(
                new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
              );

              setData((prev: any) => {
                if (!prev) return prev;
                const prevToday = prev.todayAttendance;
                const isFirstCheckIn = !prevToday?.checkInMs && res.checkInMs;

                const updatedAttendance = {
                  ...(prevToday || {}),
                  status: res.status ?? prevToday?.status ?? (res.isInside ? "PRESENT" : null),
                  checkInMs: res.checkInMs ?? prevToday?.checkInMs ?? null,
                  checkOutMs: res.checkOutMs !== undefined ? res.checkOutMs : prevToday?.checkOutMs,
                  lastLocationState: res.isInside ? "INSIDE" : "OUTSIDE",
                  selfieUrl: res.selfieUrl || prevToday?.selfieUrl,
                };

                if (isFirstCheckIn) {
                  setTimeout(() => {
                    refreshData();
                  }, 1000);
                }

                return {
                  ...prev,
                  todayAttendance: updatedAttendance,
                };
              });
            } else {
              if (await handleRevocationCheck(res)) return;
              if (res.error === "STORE_GEOFENCE_NOT_CONFIGURED") {
                setGeoError(
                  "Your store's location has not been configured yet. Ask your admin to set the store geo-fence in Store Settings."
                );
              } else {
                setGeoError(res.error || "Failed to record location ping.");
              }
            }
          } catch (err: any) {
            if (await handleRevocationCheck(err)) return;
            const msg = err?.message || "Error submitting location ping.";
            if (msg === "STORE_GEOFENCE_NOT_CONFIGURED" || msg.includes("STORE_GEOFENCE_NOT_CONFIGURED")) {
              setGeoError(
                "Your store's location has not been configured yet. Ask your admin to set the store geo-fence in Store Settings."
              );
            } else {
              setGeoError(msg);
            }
          } finally {
            isPingingRef.current = false;
            setIsPinging(false);
          }
        },
        (error) => {
          isPingingRef.current = false;
          setIsPinging(false);
          if (error.code === error.PERMISSION_DENIED) {
            setGpsPermissionDenied(true);
            setGeoError("Location permission denied. Please allow GPS access in your browser settings.");
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setGeoError("Location position is unavailable.");
          } else {
            setGeoError("Location request timed out.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    [refreshData]
  );

  const executePingRef = useRef(executePing);
  executePingRef.current = executePing;

  // Auto-attendance: Immediately starts on app open, runs every 60s
  useEffect(() => {
    // Initial silent ping immediately on load
    executePingRef.current(false);

    const intervalId = setInterval(() => {
      executePingRef.current(false);
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  const staff = data?.staff;
  const store = data?.store;
  const todayAtt = data?.todayAttendance;
  const balance = data?.leaveBalance;
  const todayCelebrations = data?.todayCelebrations || [];

  const firstName = staff?.name ? staff.name.split(" ")[0] : "Employee";
  const designation = staff?.role ? staff.role.toUpperCase() : "STAFF";
  const branch = staff?.branchCode || store?.code || "HQ";

  // Leave calculations
  const plTotal = balance?.PL ?? 18;
  const plUsed = balance?.usedPL ?? 0;
  const plRemaining = Math.max(0, plTotal - plUsed);

  const slTotal = balance?.SL ?? 12;
  const slUsed = balance?.usedSL ?? 0;
  const slRemaining = Math.max(0, slTotal - slUsed);

  const clTotal = (balance as any)?.CL ?? 0;
  const clUsed = (balance as any)?.usedCL ?? 0;
  const clRemaining = Math.max(0, clTotal - clUsed);

  const totalLeaves = plTotal + slTotal + clTotal;
  const totalRemaining = plRemaining + slRemaining + clRemaining;
  const leavePercent = totalLeaves > 0 ? Math.min(100, Math.round((totalRemaining / totalLeaves) * 100)) : 0;

  const circleRadius = 26;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (leavePercent / 100) * circumference;

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const checkInTimeFormatted = todayAtt?.checkInMs
    ? new Date(todayAtt.checkInMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const checkOutTimeFormatted = todayAtt?.checkOutMs
    ? new Date(todayAtt.checkOutMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // Fallback button condition: GPS denied, OR outside for >5 minutes (300s), OR unrecorded after 10 min (600s)
  const isMarked = Boolean(todayAtt?.checkInMs);
  const showManualFallbackButton =
    !isMarked && (gpsPermissionDenied || outsideDurationSeconds > 300 || appOpenSeconds > 600);

  // Filter upcoming holidays: today onward, next 60 days
  const nowMs = new Date().setHours(0, 0, 0, 0);
  const limitMs = nowMs + 60 * 24 * 60 * 60 * 1000;
  const upcomingHolidays = INDIA_HOLIDAYS_2026.filter((h) => {
    const hMs = new Date(h.date).setHours(0, 0, 0, 0);
    return hMs >= nowMs && hMs <= limitMs;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* [A] GREETING BANNER (Gradient card: #7c3aed to #ec4899) */}
      <div
        style={{
          borderRadius: 20,
          background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
          color: "#ffffff",
          padding: "20px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 8px 24px rgba(124, 58, 237, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
              Hello, {firstName}
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600, marginTop: 4 }}>
              {designation} • {branch}
            </div>
          </div>

          {/* Donut Circle SVG */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              position: "relative",
              width: 72,
              height: 72,
              flexShrink: 0,
            }}
          >
            <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
              <circle
                cx="36"
                cy="36"
                r={circleRadius}
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="36"
                cy="36"
                r={circleRadius}
                stroke="#ffffff"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}>{totalRemaining}</span>
              <span style={{ fontSize: 8, fontWeight: 800, opacity: 0.9, marginTop: 1 }}>Leave Balance</span>
            </div>
          </div>
        </div>

        {/* Two White Outline Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Link
            href="/employee/profile"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.6)",
              background: "rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 12,
              textAlign: "center",
              textDecoration: "none",
              backdropFilter: "blur(4px)",
            }}
          >
            View Profile
          </Link>
          <Link
            href="/employee/requests"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.6)",
              background: "rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 12,
              textAlign: "center",
              textDecoration: "none",
              backdropFilter: "blur(4px)",
            }}
          >
            Apply Leave
          </Link>
        </div>
      </div>

      {/* [B] TODAY'S ATTENDANCE CARD */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: 18,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Top Row: Date & Status Badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
            Today • {todayFormatted}
          </div>

          <div>
            {todayAtt?.status === "PRESENT" && (
              <span
                style={{
                  background: "#16a34a",
                  color: "#ffffff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                ● PRESENT
              </span>
            )}
            {todayAtt?.status === "LATE" && (
              <span
                style={{
                  background: "#f59e0b",
                  color: "#ffffff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                ● LATE
              </span>
            )}
            {todayAtt?.status === "ABSENT" && (
              <span
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                ● ABSENT
              </span>
            )}
            {todayAtt?.status === "HALF_DAY" && (
              <span
                style={{
                  background: "#eab308",
                  color: "#ffffff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                ● HALF DAY
              </span>
            )}
            {!todayAtt?.status && (
              <span
                style={{
                  background: "#6b7280",
                  color: "#ffffff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                NOT MARKED
              </span>
            )}
          </div>
        </div>

        {/* Second Row: Two Boxes Side-by-Side (CHECK IN | CHECK OUT) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div
            style={{
              padding: "12px",
              borderRadius: 14,
              background: "var(--bg, #f8fafc)",
              border: "1px solid var(--border, rgba(0,0,0,0.06))",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800, letterSpacing: "0.03em" }}>
              CHECK IN
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
              {checkInTimeFormatted || "—"}
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              borderRadius: 14,
              background: "var(--bg, #f8fafc)",
              border: "1px solid var(--border, rgba(0,0,0,0.06))",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800, letterSpacing: "0.03em" }}>
              CHECK OUT
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-primary, #0f172a)", marginTop: 4 }}>
              {checkOutTimeFormatted || "—"}
            </div>
          </div>
        </div>

        {/* Geo status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            padding: "8px 12px",
            borderRadius: 10,
            background:
              todayAtt?.lastLocationState === "INSIDE" || isInsideGeofence
                ? "rgba(34, 197, 94, 0.1)"
                : todayAtt?.lastLocationState === "OUTSIDE"
                ? "rgba(239, 68, 68, 0.1)"
                : "var(--bg, #f8fafc)",
            border: "1px solid var(--border, rgba(0,0,0,0.06))",
          }}
        >
          <span
            style={{
              fontWeight: 800,
              color:
                todayAtt?.lastLocationState === "INSIDE" || isInsideGeofence
                  ? "#22c55e"
                  : todayAtt?.lastLocationState === "OUTSIDE"
                  ? "#ef4444"
                  : "var(--text-secondary, #64748b)",
            }}
          >
            {todayAtt?.lastLocationState === "INSIDE" || isInsideGeofence
              ? "📍 INSIDE"
              : todayAtt?.lastLocationState === "OUTSIDE"
              ? "📍 OUTSIDE"
              : "📍 STANDBY"}
          </span>

          {currentDistanceMeters !== null && (
            <span style={{ color: "var(--text-secondary, #64748b)", fontWeight: 700, fontSize: 11 }}>
              ~{Math.round(currentDistanceMeters)}m from store
            </span>
          )}
        </div>

        {/* Auto-attendance feedback state */}
        {isMarked ? (
          <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✓</span> Auto-recorded at {checkInTimeFormatted}
          </div>
        ) : isInsideGeofence ? (
          <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                boxShadow: "0 0 8px #22c55e",
              }}
            />
            Detecting location &amp; auto-recording attendance...
          </div>
        ) : null}

        {/* Manual Check-in button shown ONLY when fallback is needed */}
        {showManualFallbackButton && (
          <button
            type="button"
            onClick={() => executePing(true)}
            disabled={isPinging}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              background: "#22c55e",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 14,
              border: "none",
              cursor: isPinging ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 2px 10px rgba(34, 197, 94, 0.35)",
              opacity: isPinging ? 0.7 : 1,
            }}
          >
            {isPinging ? "📡 Verifying GPS..." : "📍 Manual check-in"}
          </button>
        )}

        {/* Error warning if any */}
        {geoError && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 12,
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              lineHeight: 1.4,
              fontWeight: 600,
            }}
          >
            ⚠️ {geoError}
          </div>
        )}

        {/* Single line tiny last verified text */}
        {lastPingTime && (
          <div style={{ fontSize: 11, color: "var(--text-secondary, #64748b)", textAlign: "center" }}>
            Last ping: {lastPingTime}
          </div>
        )}
      </div>

      {/* [C] UPCOMING HOLIDAYS — horizontal scrollable chips */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
          Upcoming Holidays
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
          }}
        >
          {upcomingHolidays.length > 0 ? (
            upcomingHolidays.map((h) => {
              const [, m, d] = h.date.split("-");
              const monthName = new Date(2026, Number(m) - 1, Number(d)).toLocaleDateString(undefined, {
                month: "short",
              });
              const formattedChipDate = `${Number(d)} ${monthName}`;
              return (
                <div
                  key={h.date}
                  style={{
                    flexShrink: 0,
                    padding: "8px 14px",
                    borderRadius: 12,
                    background: "#fef3c7",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#92400e" }}>
                    {formattedChipDate}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#78350f" }}>
                    {h.name}
                  </span>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>
              No upcoming holidays in the next 60 days.
            </div>
          )}
        </div>
      </div>

      {/* [D] ACTION CENTRE — Today's Celebrations */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #0f172a)" }}>
          Today's Celebrations
        </div>

        {todayCelebrations.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayCelebrations.map((c: any) => (
              <div
                key={c.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(168, 85, 247, 0.12))",
                  border: "1px solid rgba(236, 72, 153, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-primary, #0f172a)",
                }}
              >
                {c.occasionText?.toLowerCase().includes("birthday") ? "🎂" : "🎉"} {c.occasionText}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>
            No celebrations today
          </div>
        )}
      </div>
    </div>
  );
}
