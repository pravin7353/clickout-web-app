"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Button, Badge, Input, Select, ErrorBanner } from "@/components/ui";
import { markAttendance, getAttendanceSummary, verifySuspiciousAttendanceAction } from "@/actions/hr";
import { AttendanceDocument, AttendanceStatus } from "@/lib/schemas/hr-schema";
import { useRouter } from "next/navigation";

export type SimpleStaff = {
  id: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  isActive: boolean;
  weeklyOffDay?: string;
  weeklyOff?: string;
  weeklyOffDays?: (number | string)[];
  shiftStartOverride?: string;
  shiftEndOverride?: string;
  customShiftStartTime?: string;
  customShiftEndTime?: string;
  attendanceMode?: "GEO_AUTO" | "MANUAL";
};

interface HrAttendanceTableProps {
  staffList: SimpleStaff[];
  canEdit: boolean;
  userRole: string;
}

export function HrAttendanceTable({ staffList, canEdit }: HrAttendanceTableProps) {
  const router = useRouter();
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [selectedStaffId, setSelectedStaffId] = useState<string>(staffList[0]?.id || "");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    totalRecords: number;
    records: AttendanceDocument[];
  }>({
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    totalRecords: 0,
    records: [],
  });

  // Modal / Form state for marking attendance
  const [showMarkModal, setShowMarkModal] = useState<boolean>(false);
  const [markDate, setMarkDate] = useState<string>(todayStr);
  const [markStatus, setMarkStatus] = useState<AttendanceStatus>("PRESENT");
  const [markCheckInTime, setMarkCheckInTime] = useState<string>("09:00");
  const [markCheckOutTime, setMarkCheckOutTime] = useState<string>("18:00");
  const [isPending, startTransition] = useTransition();

  // Trust breakdown modal
  const [selectedTrustRecord, setSelectedTrustRecord] = useState<AttendanceDocument | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const activeStaff = staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  const fetchAttendance = async (staffId: string, month: string) => {
    if (!staffId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getAttendanceSummary(staffId, month);
      if (res.ok && res.summary) {
        setSummary(res.summary);
      } else {
        setErrorMsg(res.error || "Failed to load attendance summary.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load attendance data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      fetchAttendance(selectedStaffId, selectedMonth);
    }
  }, [selectedStaffId, selectedMonth]);

  const handleMarkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) return;

    setErrorMsg(null);

    // Convert HH:mm to milliseconds timestamp for that date
    let checkInMs: number | null = null;
    let checkOutMs: number | null = null;

    if (markStatus === "PRESENT" || markStatus === "HALF_DAY") {
      if (markCheckInTime) {
        const inDate = new Date(`${markDate}T${markCheckInTime}:00`);
        checkInMs = inDate.getTime();
      }
      if (markCheckOutTime) {
        const outDate = new Date(`${markDate}T${markCheckOutTime}:00`);
        checkOutMs = outDate.getTime();
      }
    }

    startTransition(async () => {
      try {
        const res = await markAttendance(selectedStaffId, markDate, markStatus, checkInMs, checkOutMs);
        if (res.ok) {
          setShowMarkModal(false);
          await fetchAttendance(selectedStaffId, selectedMonth);
          router.refresh();
        } else {
          alert(`Could not mark attendance: ${res.error}`);
        }
      } catch (err: any) {
        alert(`Error marking attendance: ${err.message || "Unauthorized"}`);
      }
    });
  };

  const getStatusColor = (st: AttendanceStatus) => {
    switch (st) {
      case "PRESENT":
        return "#22c55e"; // green
      case "ABSENT":
        return "#ef4444"; // red
      case "HALF_DAY":
        return "#f59e0b"; // amber
      case "LEAVE":
        return "#3b82f6"; // blue
      case "SUSPICIOUS_CHECKIN":
        return "#ef4444"; // red
      default:
        return "var(--text-secondary)";
    }
  };

  const formatTime = (ms: number | null | undefined) => {
    if (!ms) return "-";
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Filter & Staff Selection Bar */}
      <Card style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                SELECT EMPLOYEE
              </label>
              <Select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{ minWidth: 260 }}
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.empId} - {s.name} ({s.role.toUpperCase()}) [{s.branchCode}]
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                MONTH
              </label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ minWidth: 150 }}
              />
            </div>
          </div>

          {canEdit && (
            <Button
              variant="primary"
              onClick={() => {
                setMarkDate(todayStr);
                setShowMarkModal(true);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <span>📅</span> Mark Attendance
            </Button>
          )}
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Monthly Summary Statistics Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Present Days</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#22c55e" }}>
            {summary.present}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Absent Days</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444" }}>
            {summary.absent}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Half Days</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b" }}>
            {summary.halfDay}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Approved Leaves</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6" }}>
            {summary.leave}
          </div>
        </Card>
        {/* Anti-Spoof Suspicious Check-in Count (Last 30 Days) */}
        {(() => {
          const suspiciousCount = summary.records.filter(
            (r) =>
              (typeof r.locationTrustScore === "number" && r.locationTrustScore < 50) ||
              r.status === "SUSPICIOUS_CHECKIN" ||
              r.mockLocationSuspected
          ).length;
          return (
            <Card
              style={{
                padding: 16,
                border: suspiciousCount > 3 ? "1px solid #ef4444" : undefined,
                background:
                  suspiciousCount > 3
                    ? "color-mix(in srgb, #ef4444 8%, var(--card-bg))"
                    : "var(--card-bg)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                Suspicious Check-ins (30d)
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: suspiciousCount > 0 ? "#ef4444" : "var(--text-primary)",
                  }}
                >
                  {suspiciousCount}
                </div>
                {suspiciousCount > 3 && (
                  <Badge color="#ef4444">
                    🚨 HIGH RISK (&gt;3)
                  </Badge>
                )}
              </div>
            </Card>
          );
        })()}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Total Recorded</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>
            {summary.totalRecords}
          </div>
        </Card>
      </div>

      {/* Attendance Grid Table */}
      <Card style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
              {activeStaff ? `${activeStaff.name} (${activeStaff.empId})` : "Employee"} - Attendance Log
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Monthly overview for {selectedMonth}
            </span>
          </div>
          {loading && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Loading logs...</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
                }}
              >
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DATE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>STATUS</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>CHECK IN</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>CHECK OUT</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>LOCATION TRUST</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BRANCH</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>MARKED BY</th>
              </tr>
            </thead>
            <tbody>
              {summary.records.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    No attendance records found for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                summary.records.map((r) => {
                  const score = typeof r.locationTrustScore === "number" ? r.locationTrustScore : 100;
                  const isSuspicious = score < 50 || r.status === "SUSPICIOUS_CHECKIN" || Boolean(r.mockLocationSuspected);
                  const isReview = !isSuspicious && (score < 80 || Boolean(r.reviewRequired));

                  return (
                    <tr
                      key={r.date}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13,
                        background: isSuspicious ? "color-mix(in srgb, #ef4444 4%, transparent)" : undefined,
                      }}
                    >
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {r.date}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <Badge color={getStatusColor(r.status)}>
                          {r.status}
                        </Badge>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                        {formatTime(r.checkInMs)}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-primary)" }}>
                        {formatTime(r.checkOutMs)}
                      </td>
                      {/* Location Trust Status Column */}
                      <td style={{ padding: "14px 16px" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedTrustRecord(r)}
                          style={{
                            background: isSuspicious
                              ? "rgba(239, 68, 68, 0.15)"
                              : isReview
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(34, 197, 94, 0.15)",
                            color: isSuspicious ? "#ef4444" : isReview ? "#f59e0b" : "#22c55e",
                            border: `1px solid ${
                              isSuspicious
                                ? "rgba(239, 68, 68, 0.35)"
                                : isReview
                                ? "rgba(245, 158, 11, 0.35)"
                                : "rgba(34, 197, 94, 0.35)"
                            }`,
                            padding: "4px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 0.12s ease",
                          }}
                          title="Click to view Anti-Mock Location Trust Breakdown"
                        >
                          {isSuspicious ? (
                            <>
                              <span>🚨</span>
                              <span>Suspicious ({score}%)</span>
                            </>
                          ) : isReview ? (
                            <>
                              <span>⚠️</span>
                              <span>Review ({score}%)</span>
                            </>
                          ) : (
                            <>
                              <span>✅</span>
                              <span>Trusted ({score}%)</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                        {r.branchCode || "-"}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                        {r.markedBy || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mark Attendance Modal */}
      {showMarkModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <Card style={{ width: "100%", maxWidth: 460, padding: 24, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Mark Daily Attendance</h3>
              <button
                type="button"
                onClick={() => setShowMarkModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMarkSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Staff Member
                </label>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", padding: "8px 0" }}>
                  {activeStaff?.name} ({activeStaff?.empId})
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Date
                </label>
                <Input
                  type="date"
                  required
                  value={markDate}
                  onChange={(e) => setMarkDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Attendance Status
                </label>
                <Select
                  value={markStatus}
                  onChange={(e) => setMarkStatus(e.target.value as AttendanceStatus)}
                >
                  <option value="PRESENT">PRESENT (Full Day)</option>
                  <option value="HALF_DAY">HALF_DAY</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="LEAVE">LEAVE</option>
                </Select>
              </div>

              {(markStatus === "PRESENT" || markStatus === "HALF_DAY") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                      Check-In Time
                    </label>
                    <Input
                      type="time"
                      value={markCheckInTime}
                      onChange={(e) => setMarkCheckInTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                      Check-Out Time
                    </label>
                    <Input
                      type="time"
                      value={markCheckOutTime}
                      onChange={(e) => setMarkCheckOutTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button variant="ghost" onClick={() => setShowMarkModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Record"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {/* Anti-Mock Location Trust Breakdown Modal */}
      {selectedTrustRecord && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 110,
            backdropFilter: "blur(6px)",
            padding: 16,
          }}
        >
          <Card
            style={{
              width: "100%",
              maxWidth: 580,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
              borderRadius: 20,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>🛡️</span>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                    Anti-Mock Location Verification
                  </h3>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {activeStaff?.name} ({activeStaff?.empId}) • Date: {selectedTrustRecord.date}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrustRecord(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 22,
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Score Banner */}
            {(() => {
              const score = typeof selectedTrustRecord.locationTrustScore === "number" ? selectedTrustRecord.locationTrustScore : 100;
              const isSuspicious = score < 50 || selectedTrustRecord.status === "SUSPICIOUS_CHECKIN" || Boolean(selectedTrustRecord.mockLocationSuspected);
              const isReview = !isSuspicious && (score < 80 || Boolean(selectedTrustRecord.reviewRequired));

              const bannerColor = isSuspicious ? "#ef4444" : isReview ? "#f59e0b" : "#22c55e";
              const bannerBg = isSuspicious
                ? "rgba(239, 68, 68, 0.12)"
                : isReview
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(34, 197, 94, 0.12)";
              const bannerBorder = isSuspicious
                ? "rgba(239, 68, 68, 0.3)"
                : isReview
                ? "rgba(245, 158, 11, 0.3)"
                : "rgba(34, 197, 94, 0.3)";

              return (
                <div
                  style={{
                    padding: "16px 20px",
                    borderRadius: 14,
                    background: bannerBg,
                    border: `1px solid ${bannerBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: bannerColor, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {isSuspicious ? "🚨 HIGH RISK SUSPICIOUS CHECK-IN" : isReview ? "⚠️ REVIEW REQUIRED" : "✅ LOCATION VERIFIED & TRUSTED"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 700, marginTop: 4 }}>
                      {isSuspicious
                        ? "Check-in flagged due to mock location or teleportation anomalies."
                        : isReview
                        ? "Check-in allowed with moderate variance. Manager review suggested."
                        : "All 5 anti-spoofing verification checks passed cleanly."}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: bannerColor, lineHeight: 1 }}>
                      {score}%
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700, marginTop: 2 }}>
                      TRUST SCORE
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 5 Detection Layers Breakdown */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 10, letterSpacing: "0.03em" }}>
                DETECTION LAYERS AUDIT
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Layer 1: GPS vs Network Cross-Check */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      1. GPS vs Network Cross-Check
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedTrustRecord.locationMismatchFlag
                        ? `GPS and Network readings differ by ${selectedTrustRecord.mismatchDistanceMeters ?? ">500"}m (Limit: 500m)`
                        : selectedTrustRecord.checkInNetwork
                        ? `Readings aligned (Variance: ${selectedTrustRecord.mismatchDistanceMeters ?? 0}m)`
                        : "Single provider reading collected (network secondary unavailable)"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: selectedTrustRecord.locationMismatchFlag ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      color: selectedTrustRecord.locationMismatchFlag ? "#ef4444" : "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    {selectedTrustRecord.locationMismatchFlag ? "MISMATCH (-40)" : "MATCH (0)"}
                  </span>
                </div>

                {/* Layer 2: Accuracy Anomaly */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      2. GPS Accuracy Anomaly
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedTrustRecord.mockLocationSuspected
                        ? `Suspicious accuracy: ${selectedTrustRecord.checkInAccuracyMeters ?? selectedTrustRecord.checkInGPS?.accuracy ?? "0"}m (<3m is typically mocked)`
                        : `Realistic accuracy reported: ${selectedTrustRecord.checkInAccuracyMeters ?? selectedTrustRecord.checkInGPS?.accuracy ?? "15"}m`}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: selectedTrustRecord.mockLocationSuspected ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      color: selectedTrustRecord.mockLocationSuspected ? "#ef4444" : "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    {selectedTrustRecord.mockLocationSuspected ? "MOCK DETECTED (-30)" : "NORMAL (0)"}
                  </span>
                </div>

                {/* Layer 3: Clock Drift */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      3. Device vs Server Time Drift
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedTrustRecord.clockDriftMs && selectedTrustRecord.clockDriftMs > 300000
                        ? `Time difference: ${Math.round(selectedTrustRecord.clockDriftMs / 60000)} minutes (>5m)`
                        : `Device clock in sync with server (${selectedTrustRecord.clockDriftMs ? Math.round(selectedTrustRecord.clockDriftMs / 1000) + "s" : "<1s"})`}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background:
                        selectedTrustRecord.clockDriftMs && selectedTrustRecord.clockDriftMs > 300000
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(34, 197, 94, 0.15)",
                      color:
                        selectedTrustRecord.clockDriftMs && selectedTrustRecord.clockDriftMs > 300000
                          ? "#ef4444"
                          : "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    {selectedTrustRecord.clockDriftMs && selectedTrustRecord.clockDriftMs > 300000
                      ? "DRIFT DETECTED (-20)"
                      : "IN SYNC (0)"}
                  </span>
                </div>

                {/* Layer 4: Teleportation / Velocity Check */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      4. Velocity &amp; Teleportation Check
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedTrustRecord.teleportationFlag
                        ? `Implied travel velocity: ${selectedTrustRecord.impliedSpeedKmph} km/h (Limit: 150 km/h)`
                        : selectedTrustRecord.impliedSpeedKmph
                        ? `Implied travel velocity: ${selectedTrustRecord.impliedSpeedKmph} km/h (Normal)`
                        : "Velocity sanity check verified within realistic threshold"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: selectedTrustRecord.teleportationFlag ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      color: selectedTrustRecord.teleportationFlag ? "#ef4444" : "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    {selectedTrustRecord.teleportationFlag ? "TELEPORTATION (-50)" : "REALISTIC (0)"}
                  </span>
                </div>

                {/* Layer 5: Device Fingerprint Binding */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                      5. Device Fingerprint Binding
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {selectedTrustRecord.deviceFingerprintMismatch
                        ? "Check-in attempted from an unapproved / changed hardware device"
                        : "Device signature matches staff's registered mobile device"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: selectedTrustRecord.deviceFingerprintMismatch ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      color: selectedTrustRecord.deviceFingerprintMismatch ? "#ef4444" : "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    {selectedTrustRecord.deviceFingerprintMismatch ? "MISMATCH (-25)" : "VERIFIED (0)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw Telemetry Box */}
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--border)",
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div>
                <strong style={{ color: "var(--text-primary)" }}>GPS:</strong>{" "}
                {selectedTrustRecord.checkInGPS
                  ? `${selectedTrustRecord.checkInGPS.lat.toFixed(5)}, ${selectedTrustRecord.checkInGPS.lng.toFixed(5)} (±${selectedTrustRecord.checkInGPS.accuracy.toFixed(1)}m)`
                  : selectedTrustRecord.detectedLatitude
                  ? `${selectedTrustRecord.detectedLatitude.toFixed(5)}, ${selectedTrustRecord.detectedLongitude?.toFixed(5)}`
                  : "N/A"}
              </div>
              {selectedTrustRecord.checkInNetwork && (
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>Network:</strong>{" "}
                  {`${selectedTrustRecord.checkInNetwork.lat.toFixed(5)}, ${selectedTrustRecord.checkInNetwork.lng.toFixed(5)} (±${selectedTrustRecord.checkInNetwork.accuracy.toFixed(1)}m)`}
                </div>
              )}
              {selectedTrustRecord.deviceFingerprint && (
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>Fingerprint:</strong>{" "}
                  {selectedTrustRecord.deviceFingerprint.slice(0, 20)}...
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              {canEdit && (selectedTrustRecord.status === "SUSPICIOUS_CHECKIN" || selectedTrustRecord.reviewRequired || (selectedTrustRecord.locationTrustScore ?? 100) < 80) ? (
                <Button
                  variant="primary"
                  disabled={isVerifying}
                  onClick={async () => {
                    setIsVerifying(true);
                    try {
                      const res = await verifySuspiciousAttendanceAction(
                        selectedStaffId,
                        selectedTrustRecord.date,
                        "PRESENT"
                      );
                      if (res && res.ok) {
                        setSelectedTrustRecord(null);
                        await fetchAttendance(selectedStaffId, selectedMonth);
                        router.refresh();
                      } else {
                        alert(res?.error || "Failed to verify attendance.");
                      }
                    } catch (err: any) {
                      alert(err?.message || "An error occurred.");
                    } finally {
                      setIsVerifying(false);
                    }
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span>✅</span>
                  <span>{isVerifying ? "Verifying..." : "Approve Attendance (Clear Flags)"}</span>
                </Button>
              ) : (
                <div />
              )}

              <Button variant="ghost" onClick={() => setSelectedTrustRecord(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
