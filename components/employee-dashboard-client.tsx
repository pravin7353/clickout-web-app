"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  recordGeoPingAction,
  submitRegularization,
  applyLeave,
  getEmployeeDashboardDataAction,
} from "@/actions/hr";
import { RegularizationType, LeaveType } from "@/lib/schemas/hr-schema";

interface EmployeeDashboardClientProps {
  initialData: any;
}

export function EmployeeDashboardClient({ initialData }: EmployeeDashboardClientProps) {
  const [data, setData] = useState<any>(initialData);
  const [isPending, startTransition] = useTransition();

  // Geo status state
  const [geoTrackingActive, setGeoTrackingActive] = useState(false);
  const [currentDistanceMeters, setCurrentDistanceMeters] = useState<number | null>(null);
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  // Modals state
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);

  // Leave Form
  const [leaveType, setLeaveType] = useState<LeaveType>("PL");
  const [leaveFrom, setLeaveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [leaveTo, setLeaveTo] = useState(new Date().toISOString().split("T")[0]);
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveMsg, setLeaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Regularization Form
  const [regDate, setRegDate] = useState(new Date().toISOString().split("T")[0]);
  const [regType, setRegType] = useState<RegularizationType>("FORGOT_CHECKIN");
  const [regReason, setRegReason] = useState("");
  const [regMsg, setRegMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active requests tab
  const [requestsTab, setRequestsTab] = useState<"LEAVES" | "REGULARIZATIONS">("LEAVES");

  const refreshData = async () => {
    const res = await getEmployeeDashboardDataAction();
    if (res.ok && res.data) {
      setData(res.data);
    }
  };

  // Perform single Geo Ping
  const executePing = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser or device.");
      return;
    }

    setIsPinging(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await recordGeoPingAction(latitude, longitude);
          if (res.ok) {
            setCurrentDistanceMeters(res.distanceMeters ?? null);
            setIsInsideGeofence(res.isInside ?? null);
            setLastPingTime(new Date().toLocaleTimeString());
            await refreshData();
          } else {
            setGeoError(res.error || "Failed to record location ping.");
          }
        } catch (err: any) {
          setGeoError(err?.message || "Error submitting location ping.");
        } finally {
          setIsPinging(false);
        }
      },
      (error) => {
        setIsPinging(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError("Location permission denied. Please allow location access in your browser.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGeoError("Location position is unavailable.");
        } else {
          setGeoError("Location request timed out.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // Periodic ping if tracking is active
  useEffect(() => {
    if (!geoTrackingActive) return;

    // Ping immediately
    executePing();

    const interval = setInterval(() => {
      executePing();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [geoTrackingActive, executePing]);

  const handleApplyLeave = () => {
    setLeaveMsg(null);
    if (!leaveReason.trim()) {
      setLeaveMsg({ type: "error", text: "Please provide a reason for the leave." });
      return;
    }

    startTransition(async () => {
      const res = await applyLeave(
        data?.staff?.id,
        leaveFrom,
        leaveTo,
        leaveType,
        leaveReason
      );

      if (res.ok) {
        setLeaveMsg({ type: "success", text: "Leave application submitted!" });
        setLeaveReason("");
        await refreshData();
        setTimeout(() => setShowLeaveModal(false), 1200);
      } else {
        setLeaveMsg({ type: "error", text: res.error || "Failed to submit leave application." });
      }
    });
  };

  const handleApplyRegularization = () => {
    setRegMsg(null);
    if (!regReason.trim()) {
      setRegMsg({ type: "error", text: "Please provide a justification for regularization." });
      return;
    }

    startTransition(async () => {
      const res = await submitRegularization(regDate, regType, regReason);

      if (res.ok) {
        setRegMsg({ type: "success", text: "Regularization request submitted!" });
        setRegReason("");
        await refreshData();
        setTimeout(() => setShowRegModal(false), 1200);
      } else {
        setRegMsg({ type: "error", text: res.error || "Failed to submit regularization." });
      }
    });
  };

  const staff = data?.staff;
  const store = data?.store;
  const todayAtt = data?.todayAttendance;
  const balance = data?.leaveBalance;
  const leaves = data?.leaves || [];
  const regularizations = data?.regularizations || [];

  // Birthday / Anniversary Check
  const checkMilestone = (dateStr?: string) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const [, m, d] = dateStr.split("-").map(Number);
    const today = new Date();
    const targetThisYear = new Date(today.getFullYear(), m - 1, d);
    const diffMs = targetThisYear.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 30) {
      return diffDays === 0 ? "Today! 🎉" : `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
    }
    return null;
  };

  const birthdayMilestone = checkMilestone(staff?.dateOfBirth);
  const anniversaryMilestone = checkMilestone(staff?.dateOfJoining);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Milestone Banners */}
      {(birthdayMilestone || anniversaryMilestone) && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(168, 85, 247, 0.15))",
            border: "1px solid rgba(236, 72, 153, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 28 }}>🎂</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text-primary)" }}>
              {birthdayMilestone ? "Upcoming Birthday Celebration!" : "Work Anniversary Celebration!"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {birthdayMilestone && `Your birthday is ${birthdayMilestone}. `}
              {anniversaryMilestone && `Your ClickOut work anniversary is ${anniversaryMilestone}. `}
              We are proud to have you on the team!
            </div>
          </div>
        </div>
      )}

      {/* 1. Live Attendance Geo Card */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
              TODAY'S ATTENDANCE • {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              {todayAtt?.status ? (
                <span
                  style={{
                    color:
                      todayAtt.status === "PRESENT"
                        ? "#22c55e"
                        : todayAtt.status === "ABSENT"
                        ? "#ef4444"
                        : "#f59e0b",
                  }}
                >
                  ● {todayAtt.status}
                </span>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>⚪ NOT LOGGED YET</span>
              )}
            </div>
          </div>

          <div
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              background:
                todayAtt?.lastLocationState === "INSIDE"
                  ? "rgba(34, 197, 94, 0.15)"
                  : todayAtt?.lastLocationState === "OUTSIDE"
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(255, 255, 255, 0.06)",
              color:
                todayAtt?.lastLocationState === "INSIDE"
                  ? "#22c55e"
                  : todayAtt?.lastLocationState === "OUTSIDE"
                  ? "#ef4444"
                  : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {todayAtt?.lastLocationState ? `Location: ${todayAtt.lastLocationState}` : "Geo Status: Idle"}
          </div>
        </div>

        {/* Check-in & Check-out Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>FIRST CHECK-IN</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
              {todayAtt?.checkInMs
                ? new Date(todayAtt.checkInMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>LAST CHECK-OUT</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
              {todayAtt?.checkOutMs
                ? new Date(todayAtt.checkOutMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </div>
          </div>
        </div>

        {/* Store Geofence Info */}
        {store && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span>
              📍 Assigned: <strong>{store.name}</strong> ({store.code})
            </span>
            <span>Radius: {store.geoRadiusMeters || 100}m</span>
          </div>
        )}

        {/* Live Distance Feedback */}
        {currentDistanceMeters !== null && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              background: isInsideGeofence ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
              border: isInsideGeofence ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
              color: isInsideGeofence ? "#22c55e" : "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              {isInsideGeofence ? "🎯 You are INSIDE the store geofence" : "⚠️ You are OUTSIDE the store geofence"}
            </span>
            <span>~{Math.round(currentDistanceMeters)}m away</span>
          </div>
        )}

        {geoError && (
          <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 12, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
            ⚠️ {geoError}
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={executePing}
            disabled={isPinging}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              background: "var(--cta-bg)",
              color: "var(--cta-text)",
              fontWeight: 800,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 2px 10px rgba(59, 130, 246, 0.3)",
            }}
          >
            {isPinging ? "📡 Verifying GPS..." : "📍 Mark Attendance / Ping Location"}
          </button>

          <button
            type="button"
            onClick={() => setGeoTrackingActive((prev) => !prev)}
            title="Toggle background auto-pinging every 60s"
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: geoTrackingActive ? "#22c55e" : "var(--bg)",
              color: geoTrackingActive ? "#ffffff" : "var(--text-secondary)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {geoTrackingActive ? "🟢 Auto: ON" : "⚪ Auto: OFF"}
          </button>
        </div>

        {lastPingTime && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
            Last verified at {lastPingTime}
          </div>
        )}
      </div>

      {/* 2. Leave Quotas & Quick Actions */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
            Leave Quotas & Balances
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Year {balance?.year || new Date().getFullYear()}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {/* PL */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6" }}>PAID LEAVE (PL)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              {balance ? balance.PL - balance.usedPL : 0}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              of {balance?.PL || 0} remaining
            </div>
          </div>

          {/* SL */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444" }}>SICK LEAVE (SL)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              {balance ? balance.SL - balance.usedSL : 0}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              of {balance?.SL || 0} remaining
            </div>
          </div>

          {/* CL */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(168, 85, 247, 0.08)",
              border: "1px solid rgba(168, 85, 247, 0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#a855f7" }}>CASUAL (CL)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              {balance ? balance.CL - balance.usedCL : 0}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              of {balance?.CL || 0} remaining
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              setLeaveMsg(null);
              setShowLeaveModal(true);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>🌴</span> Apply Leave
          </button>

          <button
            type="button"
            onClick={() => {
              setRegMsg(null);
              setShowRegModal(true);
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>⏱️</span> Regularize
          </button>
        </div>
      </div>

      {/* 3. My Profile Details */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
          My Employment Profile
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>FULL NAME</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.name || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>EMPLOYEE ID</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.empId || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DESIGNATION</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.role?.toUpperCase() || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BRANCH CODE</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.branchCode || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DATE OF BIRTH</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.dateOfBirth || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DATE OF JOINING</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.dateOfJoining || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BLOOD GROUP</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.bloodGroup || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>EMERGENCY CONTACT</div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{staff?.emergencyContact || "—"}</div>
          </div>
        </div>
      </div>

      {/* 4. Requests & History */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
            Recent Requests History
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setRequestsTab("LEAVES")}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid var(--border)",
                background: requestsTab === "LEAVES" ? "var(--cta-bg)" : "transparent",
                color: requestsTab === "LEAVES" ? "var(--cta-text)" : "var(--text-secondary)",
              }}
            >
              Leaves ({leaves.length})
            </button>
            <button
              type="button"
              onClick={() => setRequestsTab("REGULARIZATIONS")}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid var(--border)",
                background: requestsTab === "REGULARIZATIONS" ? "var(--cta-bg)" : "transparent",
                color: requestsTab === "REGULARIZATIONS" ? "var(--cta-text)" : "var(--text-secondary)",
              }}
            >
              Regularizations ({regularizations.length})
            </button>
          </div>
        </div>

        {requestsTab === "LEAVES" ? (
          leaves.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-secondary)", fontSize: 13 }}>
              No recent leave requests.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {leaves.map((l: any) => (
                <div
                  key={l.id}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                      {l.type} Leave • {l.fromDate} → {l.toDate}
                    </div>
                    {l.reason && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        "{l.reason}"
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      background:
                        l.status === "APPROVED"
                          ? "rgba(34, 197, 94, 0.15)"
                          : l.status === "REJECTED"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        l.status === "APPROVED"
                          ? "#22c55e"
                          : l.status === "REJECTED"
                          ? "#ef4444"
                          : "#f59e0b",
                    }}
                  >
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : regularizations.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-secondary)", fontSize: 13 }}>
            No recent attendance regularizations.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regularizations.map((r: any) => (
              <div
                key={r.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                    {r.requestType?.replace("_", " ")} • {r.date}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      "{r.reason}"
                    </div>
                  )}
                </div>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    background:
                      r.status === "APPROVED"
                        ? "rgba(34, 197, 94, 0.15)"
                        : r.status === "REJECTED"
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(245, 158, 11, 0.15)",
                    color:
                      r.status === "APPROVED"
                        ? "#22c55e"
                        : r.status === "REJECTED"
                        ? "#ef4444"
                        : "#f59e0b",
                  }}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* APPLY LEAVE MODAL */}
      {showLeaveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 440,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>
              Apply for Leave
            </div>

            {leaveMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: leaveMsg.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  color: leaveMsg.type === "success" ? "#22c55e" : "#ef4444",
                  border: `1px solid ${leaveMsg.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                {leaveMsg.text}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                LEAVE TYPE
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                <option value="PL">Paid Leave (PL) — Available: {balance ? balance.PL - balance.usedPL : 0}</option>
                <option value="SL">Sick Leave (SL) — Available: {balance ? balance.SL - balance.usedSL : 0}</option>
                <option value="CL">Casual Leave (CL) — Available: {balance ? balance.CL - balance.usedCL : 0}</option>
                <option value="UNPAID">Unpaid Leave</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  FROM DATE
                </label>
                <input
                  type="date"
                  value={leaveFrom}
                  onChange={(e) => setLeaveFrom(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  TO DATE
                </label>
                <input
                  type="date"
                  value={leaveTo}
                  onChange={(e) => setLeaveTo(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                REASON / PURPOSE
              </label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="e.g. Family function / Medical consultation"
                rows={3}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                disabled={isPending}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyLeave}
                disabled={isPending}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {isPending ? "Submitting..." : "Submit Leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGULARIZE MODAL */}
      {showRegModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 440,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>
              Request Attendance Regularization
            </div>

            {regMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: regMsg.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  color: regMsg.type === "success" ? "#22c55e" : "#ef4444",
                  border: `1px solid ${regMsg.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                {regMsg.text}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                REGULARIZATION TYPE
              </label>
              <select
                value={regType}
                onChange={(e) => setRegType(e.target.value as RegularizationType)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                <option value="FORGOT_CHECKIN">Forgot Check-in (Worked full shift)</option>
                <option value="FORGOT_CHECKOUT">Forgot Check-out</option>
                <option value="MISSED_BOTH">Missed Both Check-in and Check-out</option>
                <option value="WRONG_TIMING">Incorrect GPS / Wrong Timing</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                DATE TO REGULARIZE
              </label>
              <input
                type="date"
                value={regDate}
                onChange={(e) => setRegDate(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                JUSTIFICATION / REASON
              </label>
              <textarea
                value={regReason}
                onChange={(e) => setRegReason(e.target.value)}
                placeholder="e.g. Mobile battery died during shift / GPS glitch at counter"
                rows={3}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowRegModal(false)}
                disabled={isPending}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyRegularization}
                disabled={isPending}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {isPending ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
