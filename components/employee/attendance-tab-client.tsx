"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getAttendanceSummary, getEmployeeDashboardDataAction } from "@/actions/hr";
import { BottomSheet } from "@/components/employee/bottom-sheet";

const INDIA_HOLIDAYS_2026: Record<string, string> = {
  "2026-01-26": "Republic Day",
  "2026-02-15": "Maha Shivratri",
  "2026-03-04": "Holi",
  "2026-03-21": "Eid-ul-Fitr",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Ambedkar Jayanti",
  "2026-05-01": "May Day",
  "2026-05-31": "Bakrid / Eid ul-Adha",
  "2026-08-15": "Independence Day",
  "2026-08-27": "Raksha Bandhan",
  "2026-09-04": "Janmashtami",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-10-31": "Sardar Patel Jayanti",
  "2026-11-05": "Diwali",
  "2026-11-15": "Guru Nanak Jayanti",
  "2026-12-25": "Christmas",
  "2027-01-01": "New Year",
  "2027-01-14": "Makar Sankranti",
  "2027-01-26": "Republic Day",
};

const WEEKDAY_NAMES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

interface AttendanceTabClientProps {
  staffId?: string;
  initialMonth?: string;
  settings?: any;
  weeklyOffDays?: number[];
}

export function AttendanceTabClient({ staffId, initialMonth, settings, weeklyOffDays }: AttendanceTabClientProps) {
  const initialParsed = initialMonth ? initialMonth.split("-") : [];
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(
    initialParsed.length === 2 ? parseInt(initialParsed[0], 10) : now.getFullYear()
  );
  const [currentMonth, setCurrentMonth] = useState(
    initialParsed.length === 2 ? parseInt(initialParsed[1], 10) : now.getMonth() + 1
  ); // 1-12
  const [summaryRecords, setSummaryRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<any | null>(null);

  const effectiveWeeklyOffDays = weeklyOffDays || settings?.weeklyOffDays || [0];

  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (staffId) {
        const res = await getAttendanceSummary(staffId, monthStr);
        if (res.ok && res.summary) {
          setSummaryRecords(res.summary.records || []);
        } else {
          setSummaryRecords([]);
        }
      } else {
        const dashRes = await getEmployeeDashboardDataAction();
        if (dashRes.ok && dashRes.data?.staff?.id) {
          const res = await getAttendanceSummary(dashRes.data.staff.id, monthStr);
          if (res.ok && res.summary) {
            setSummaryRecords(res.summary.records || []);
          }
        }
      }
    } catch {
      setSummaryRecords([]);
    } finally {
      setLoading(false);
    }
  }, [staffId, monthStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const todayIso = new Date().toISOString().split("T")[0];

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayObj = new Date(currentYear, currentMonth - 1, 1);
  const firstDayWeekday = (firstDayObj.getDay() + 6) % 7; // 0=Mon, 6=Sun

  // Map of date string -> record
  const recordsMap = new Map<string, any>();
  for (const r of summaryRecords) {
    if (r.date) recordsMap.set(r.date, r);
  }

  // Tally counters
  let prCount = 0;
  let ltCount = 0;
  let abCount = 0;
  let hdCount = 0;
  let lvCount = 0;
  let woCount = 0;
  let hoCount = 0;

  const calendarGrid = [];
  // Empty leading cells
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarGrid.push({ type: "EMPTY", key: `empty-${i}` });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(currentYear, currentMonth - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun

    const isFuture = dateStr > todayIso;
    const isToday = dateStr === todayIso;
    const record = recordsMap.get(dateStr);
    const holidayName = INDIA_HOLIDAYS_2026[dateStr];
    const isWeeklyOff = effectiveWeeklyOffDays.includes(dayOfWeek);

    let status = "FUTURE";
    let bg = "transparent";
    let textColor = "var(--text-primary, #0f172a)";

    if (!isFuture) {
      if (record) {
        if (record.status === "PRESENT") {
          status = "PRESENT";
          bg = "#16a34a";
          textColor = "#ffffff";
          prCount++;
        } else if (record.status === "LATE") {
          status = "LATE";
          bg = "#f59e0b";
          textColor = "#ffffff";
          ltCount++;
        } else if (record.status === "HALF_DAY") {
          status = "HALF_DAY";
          bg = "#eab308";
          textColor = "#ffffff";
          hdCount++;
        } else if (record.status === "ABSENT") {
          status = "ABSENT";
          bg = "#ef4444";
          textColor = "#ffffff";
          abCount++;
        } else if (record.status === "LEAVE") {
          status = "LEAVE";
          bg = "#3b82f6";
          textColor = "#ffffff";
          lvCount++;
        }
      } else if (holidayName) {
        status = "HOLIDAY";
        bg = "#d97706";
        textColor = "#ffffff";
        hoCount++;
      } else if (isWeeklyOff) {
        status = "WEEKLY_OFF";
        bg = "#8b5cf6";
        textColor = "#ffffff";
        woCount++;
      } else {
        status = "UNLOGGED";
        bg = "rgba(239, 68, 68, 0.08)";
        textColor = "var(--text-secondary, #64748b)";
      }
    } else {
      if (holidayName) {
        status = "HOLIDAY";
        bg = "rgba(217, 119, 6, 0.15)";
        textColor = "#d97706";
      } else if (isWeeklyOff) {
        status = "WEEKLY_OFF";
        bg = "rgba(139, 92, 246, 0.15)";
        textColor = "#8b5cf6";
      } else {
        textColor = "var(--text-secondary, #64748b)";
      }
    }

    calendarGrid.push({
      type: "DAY",
      dayNumber: d,
      dateStr,
      isToday,
      isFuture,
      status,
      bg,
      textColor,
      record,
      holidayName,
      isWeeklyOff,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Month Navigator: ← [Month Name] [Year] → */}
      <div
        style={{
          borderRadius: 18,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
        }}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "1px solid var(--border, rgba(0,0,0,0.1))",
            background: "var(--bg, #f8fafc)",
            color: "var(--text-primary, #0f172a)",
            fontWeight: 800,
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ←
        </button>

        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text-primary, #0f172a)" }}>
          {monthName}
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "1px solid var(--border, rgba(0,0,0,0.1))",
            background: "var(--bg, #f8fafc)",
            color: "var(--text-primary, #0f172a)",
            fontWeight: 800,
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          →
        </button>
      </div>

      {/* Calendar Grid Card */}
      <div
        style={{
          borderRadius: 20,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "16px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Weekday Headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          {WEEKDAY_NAMES.map((name, i) => (
            <div
              key={name}
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: i >= 5 ? "#ef4444" : "var(--text-secondary, #64748b)",
                padding: "4px 0",
              }}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 5,
          }}
        >
          {calendarGrid.map((cell: any, idx) => {
            if (cell.type === "EMPTY") {
              return <div key={`empty-${idx}`} style={{ aspectRatio: "1/1" }} />;
            }

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => setSelectedDay(cell)}
                style={{
                  aspectRatio: "1/1",
                  borderRadius: 10,
                  border: cell.isToday
                    ? "2px solid #22c55e"
                    : "1px solid rgba(0,0,0,0.04)",
                  background: cell.bg,
                  color: cell.textColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: cell.isToday ? "0 0 10px rgba(34, 197, 94, 0.35)" : "none",
                }}
              >
                {cell.dayNumber}
              </button>
            );
          })}
        </div>

        {loading && (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary, #64748b)", marginTop: 12 }}>
            ⏳ Loading month data...
          </div>
        )}
      </div>

      {/* Legend Row Below */}
      <div
        style={{
          borderRadius: 18,
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border, rgba(0,0,0,0.08))",
          padding: "14px 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 14px",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a" }} />
          <span>PR {prCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
          <span>LT {ltCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
          <span>AB {abCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308" }} />
          <span>HD {hdCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
          <span>LV {lvCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#8b5cf6" }} />
          <span>WO {woCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#d97706" }} />
          <span>HO {hoCount}</span>
        </div>
      </div>

      {/* Day Details Bottom Sheet */}
      <BottomSheet
        isOpen={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Attendance: ${selectedDay.dateStr}` : "Day Details"}
      >
        {selectedDay && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Status Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary, #64748b)" }}>
                Status
              </div>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 900,
                  background: selectedDay.bg,
                  color: selectedDay.textColor,
                }}
              >
                ● {selectedDay.status?.replace(/_/g, " ")}
              </span>
            </div>

            {/* Holiday Name if any */}
            {selectedDay.holidayName && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "#fef3c7",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#92400e",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                🌴 Holiday: {selectedDay.holidayName}
              </div>
            )}

            {/* Punch Details */}
            {selectedDay.record ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg, #f8fafc)",
                    border: "1px solid var(--border, rgba(0,0,0,0.06))",
                  }}
                >
                  <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800 }}>
                    CHECK IN
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                    {selectedDay.record.checkInMs
                      ? new Date(selectedDay.record.checkInMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg, #f8fafc)",
                    border: "1px solid var(--border, rgba(0,0,0,0.06))",
                  }}
                >
                  <div style={{ fontSize: 10, color: "var(--text-secondary, #64748b)", fontWeight: 800 }}>
                    CHECK OUT
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-primary, #0f172a)", marginTop: 2 }}>
                    {selectedDay.record.checkOutMs
                      ? new Date(selectedDay.record.checkOutMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </div>
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg, #f8fafc)",
                    border: "1px solid var(--border, rgba(0,0,0,0.06))",
                    fontSize: 12,
                    color: "var(--text-secondary, #64748b)",
                  }}
                >
                  Source: <b>{selectedDay.record.source === "GEO_AUTO" ? "Auto (GPS)" : "Manual Override"}</b>
                </div>
              </div>
            ) : selectedDay.isWeeklyOff ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary, #64748b)" }}>
                Scheduled weekly off day.
              </div>
            ) : selectedDay.isFuture ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary, #64748b)" }}>
                Upcoming calendar date.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-secondary, #64748b)" }}>
                No attendance punches logged for this date.
              </div>
            )}

            {/* If LATE or ABSENT: Apply Regularization Button */}
            {!selectedDay.isFuture && (selectedDay.status === "LATE" || selectedDay.status === "ABSENT" || selectedDay.status === "UNLOGGED") && (
              <Link
                href={`/employee/requests?date=${selectedDay.dateStr}&tab=REGULARIZATIONS`}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#22c55e",
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 13,
                  textAlign: "center",
                  textDecoration: "none",
                  display: "block",
                  boxShadow: "0 2px 10px rgba(34, 197, 94, 0.3)",
                }}
              >
                ⏱️ Apply Regularization for {selectedDay.dateStr} →
              </Link>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
