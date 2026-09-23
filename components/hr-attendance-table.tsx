"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Button, Badge, Input, Select, ErrorBanner } from "@/components/ui";
import { markAttendance, getAttendanceSummary } from "@/actions/hr";
import { AttendanceDocument, AttendanceStatus } from "@/lib/schemas/hr-schema";
import { useRouter } from "next/navigation";

export type SimpleStaff = {
  id: string;
  empId: string;
  name: string;
  role: string;
  branchCode: string;
  isActive: boolean;
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
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>BRANCH</th>
                <th style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>MARKED BY</th>
              </tr>
            </thead>
            <tbody>
              {summary.records.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
                    No attendance records found for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                summary.records.map((r) => (
                  <tr
                    key={r.date}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
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
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>
                      {r.branchCode || "-"}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                      {r.markedBy || "-"}
                    </td>
                  </tr>
                ))
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
    </div>
  );
}
