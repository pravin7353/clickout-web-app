import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getAllTenants } from "@/lib/services/tenant-service";
import { getAttendanceSettings } from "@/lib/services/hr-service";
import { getHolidayForDate } from "@/lib/utils/holidays";

export const dynamic = "force-dynamic";

/**
 * Returns current date string formatted as YYYY-MM-DD in IST (Asia/Kolkata) timezone.
 */
export function getTodayIST(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Returns day of week index (0=Sunday ... 6=Saturday) and full day name in IST.
 */
export function getDayInfoIST(dateStr: string): { dayIndex: number; dayName: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(date); // e.g. "Sunday", "Monday"

  const dayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const dayIndex = dayMap[dayName.toLowerCase()] ?? 0;
  return { dayIndex, dayName };
}

/**
 * Checks if a given day matches weekly off configurations.
 * Handles number arrays ([0]), string arrays (["Sunday", "sunday"]), or single values.
 */
export function isWeeklyOffDay(
  weeklyOffConfig: any,
  dayIndex: number,
  dayName: string
): boolean {
  if (weeklyOffConfig === undefined || weeklyOffConfig === null) return false;

  const dayMap: Record<string, number> = {
    sunday: 0, sun: 0, "0": 0,
    monday: 1, mon: 1, "1": 1,
    tuesday: 2, tue: 2, "2": 2,
    wednesday: 3, wed: 3, "3": 3,
    thursday: 4, thu: 4, "4": 4,
    friday: 5, fri: 5, "5": 5,
    saturday: 6, sat: 6, "6": 6,
  };

  const list = Array.isArray(weeklyOffConfig) ? weeklyOffConfig : [weeklyOffConfig];

  for (const item of list) {
    if (typeof item === "number" && item === dayIndex) {
      return true;
    }
    if (typeof item === "string") {
      const normalized = item.trim().toLowerCase();
      if (normalized === dayName.toLowerCase()) return true;
      if (dayMap[normalized] !== undefined && dayMap[normalized] === dayIndex) return true;
    }
  }

  return false;
}

/**
 * Checks if targetDate is a Festival Holiday for the given tenant or globally.
 */
export async function isFestivalHoliday(
  tenantId: string,
  dateStr: string
): Promise<{ isHoliday: boolean; holidayName?: string }> {
  // 1. Standard National / Festival Holidays (India Calendar)
  const standardHoliday = getHolidayForDate(dateStr);
  if (standardHoliday) {
    return { isHoliday: true, holidayName: standardHoliday.name };
  }

  // 2. Tenant-specific custom holidays: tenants/{tenantId}/holidays
  try {
    const directDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("holidays")
      .doc(dateStr)
      .get();

    if (directDoc.exists) {
      return { isHoliday: true, holidayName: directDoc.data()?.name || "Tenant Holiday" };
    }

    const queryDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("holidays")
      .where("date", "==", dateStr)
      .limit(1)
      .get();

    if (!queryDoc.empty) {
      return { isHoliday: true, holidayName: queryDoc.docs[0].data()?.name || "Tenant Holiday" };
    }
  } catch {}

  // 3. Global holidays collection
  try {
    const globalDoc = await adminDb.collection("holidays").doc(dateStr).get();
    if (globalDoc.exists) {
      return { isHoliday: true, holidayName: globalDoc.data()?.name || "Holiday" };
    }
  } catch {}

  return { isHoliday: false };
}

export type TenantAbsenteeLog = {
  tenantId: string;
  companyName?: string;
  date: string;
  totalStaff: number;
  absentMarked: number;
  skipped: number;
  skippedReason?: string;
  details?: {
    alreadyRecordedCount?: number;
    personalOffCount?: number;
    approvedLeaveCount?: number;
  };
};

/**
 * Core absentee evaluation process
 */
export async function processAbsenteeMarking(
  customDate?: string,
  filterTenantId?: string
): Promise<{
  ok: boolean;
  success: boolean;
  targetDate: string;
  timezone: string;
  dayOfWeek: string;
  tenantsScanned: number;
  totalStaffScanned: number;
  totalAbsentMarked: number;
  totalSkipped: number;
  logs: TenantAbsenteeLog[];
}> {
  const targetDate = customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate) ? customDate : getTodayIST();
  const { dayIndex, dayName } = getDayInfoIST(targetDate);

  const allTenants = await getAllTenants();
  const targetTenants = filterTenantId
    ? allTenants.filter((t) => t.id === filterTenantId)
    : allTenants;

  let totalStaffScanned = 0;
  let totalAbsentMarked = 0;
  let totalSkipped = 0;
  let tenantsScanned = 0;
  const logs: TenantAbsenteeLog[] = [];

  for (const tenant of targetTenants) {
    if (!tenant.isActive) continue;
    tenantsScanned++;

    // 3. Fetch tenant attendance settings
    const settings = await getAttendanceSettings(tenant.id);
    const autoMarkEnabled =
      settings.autoMarkAbsentEnabled !== false &&
      (settings as any).autoMarkAbsent !== false;

    if (!autoMarkEnabled) {
      const logEntry: TenantAbsenteeLog = {
        tenantId: tenant.id,
        companyName: tenant.companyName,
        date: targetDate,
        totalStaff: 0,
        absentMarked: 0,
        skipped: 0,
        skippedReason: "AUTO_MARK_ABSENT_DISABLED",
      };
      logs.push(logEntry);
      console.log(`[mark-absentees] Log:`, JSON.stringify(logEntry));
      continue;
    }

    // 4. Check: Is targetDate a weeklyOffDay? -> SKIP tenant
    const isTenantWeeklyOff = isWeeklyOffDay(settings.weeklyOffDays, dayIndex, dayName);
    if (isTenantWeeklyOff) {
      const logEntry: TenantAbsenteeLog = {
        tenantId: tenant.id,
        companyName: tenant.companyName,
        date: targetDate,
        totalStaff: 0,
        absentMarked: 0,
        skipped: 0,
        skippedReason: `WEEKLY_OFF (${dayName})`,
      };
      logs.push(logEntry);
      console.log(`[mark-absentees] Log:`, JSON.stringify(logEntry));
      continue;
    }

    // 5. Check: Is targetDate a Festival Holiday? -> SKIP tenant
    const holidayCheck = await isFestivalHoliday(tenant.id, targetDate);
    if (holidayCheck.isHoliday) {
      const logEntry: TenantAbsenteeLog = {
        tenantId: tenant.id,
        companyName: tenant.companyName,
        date: targetDate,
        totalStaff: 0,
        absentMarked: 0,
        skipped: 0,
        skippedReason: `FESTIVAL_HOLIDAY (${holidayCheck.holidayName || "Holiday"})`,
      };
      logs.push(logEntry);
      console.log(`[mark-absentees] Log:`, JSON.stringify(logEntry));
      continue;
    }

    // 6. Fetch all ACTIVE staff for this tenant
    const staffSnap = await adminDb
      .collection("staff")
      .where("tenantId", "==", tenant.id)
      .where("isActive", "==", true)
      .get();

    const activeStaffDocs = staffSnap.docs.filter((d) => d.data().isDeleted !== true);
    const totalStaff = activeStaffDocs.length;
    totalStaffScanned += totalStaff;

    let absentMarked = 0;
    let skipped = 0;
    let alreadyRecordedCount = 0;
    let personalOffCount = 0;
    let approvedLeaveCount = 0;

    let batch = adminDb.batch();
    let batchOpsCount = 0;

    for (const staffDoc of activeStaffDocs) {
      const staffId = staffDoc.id;
      const staffData = staffDoc.data();

      // 7. Check attendance docs:
      // Check 1: tenants/{tenantId}/attendance/{staffId}_{targetDate}
      // Check 2: staff/{staffId}/attendance/{targetDate}
      const tenantAttRef = adminDb
        .collection("tenants")
        .doc(tenant.id)
        .collection("attendance")
        .doc(`${staffId}_${targetDate}`);

      const staffAttRef = adminDb
        .collection("staff")
        .doc(staffId)
        .collection("attendance")
        .doc(targetDate);

      const [tenantAttSnap, staffAttSnap] = await Promise.all([
        tenantAttRef.get(),
        staffAttRef.get(),
      ]);

      // 8. IF doc EXISTS (any status: PRESENT, HALF_DAY, LEAVE_APPROVED, LEAVE, LATE, ABSENT) -> SKIP
      if (tenantAttSnap.exists || staffAttSnap.exists) {
        skipped++;
        alreadyRecordedCount++;
        continue;
      }

      // Check if staff has approved leave for today
      try {
        const approvedLeavesSnap = await adminDb
          .collection("staff")
          .doc(staffId)
          .collection("leaves")
          .where("status", "==", "APPROVED")
          .where("fromDate", "<=", targetDate)
          .get();

        const activeLeave = approvedLeavesSnap.docs.find(
          (lDoc) => (lDoc.data().toDate || lDoc.data().fromDate) >= targetDate
        );

        if (activeLeave) {
          skipped++;
          approvedLeaveCount++;
          continue;
        }
      } catch {}

      // 9. IF doc NOT FOUND ->
      // a. Check staff's personal weeklyOff (employee-level override)
      const staffWeeklyOff =
        staffData.weeklyOffDays ??
        staffData.weeklyOff ??
        staffData.personalWeeklyOff ??
        staffData.weeklyOffDay;

      // b. If today is their personal off -> SKIP
      if (staffWeeklyOff !== undefined && isWeeklyOffDay(staffWeeklyOff, dayIndex, dayName)) {
        skipped++;
        personalOffCount++;
        continue;
      }

      // c. Optional Field Sales Meeting Check:
      // If staff has logged required minimum client meetings for the day, auto-mark PRESENT instead of ABSENT
      try {
        const minMeetingsRequired = (settings as any).fieldAttendanceMinMeetings ?? 3;
        const meetingsSnap = await adminDb
          .collection("staff")
          .doc(staffId)
          .collection("meetings")
          .where("date", "==", targetDate)
          .get();

        if (meetingsSnap.size >= minMeetingsRequired && minMeetingsRequired > 0) {
          const presentPayload = {
            staffId,
            tenantId: tenant.id,
            branchCode: staffData.branchCode || "FIELD",
            date: targetDate,
            status: "PRESENT",
            checkIn: null,
            checkOut: null,
            checkInMs: Date.now(),
            checkOutMs: null,
            source: "FIELD_MEETINGS",
            markedBy: "FIELD_MEETINGS_AUTO",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };
          batch.set(tenantAttRef, presentPayload);
          batch.set(staffAttRef, presentPayload);
          batchOpsCount += 2;
          skipped++;
          continue;
        }
      } catch {}

      // d. Else -> CREATE absentee record
      const attendancePayload = {
        staffId,
        tenantId: tenant.id,
        branchCode: staffData.branchCode || "HQ",
        date: targetDate,
        status: "ABSENT",
        checkIn: null,
        checkOut: null,
        checkInMs: null,
        checkOutMs: null,
        source: "CRON",
        markedBy: "CRON_ABSENTEE_SYSTEM",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Dual-write to both tenant attendance collection and staff attendance subcollection for full compatibility
      batch.set(tenantAttRef, attendancePayload);
      batch.set(staffAttRef, attendancePayload);
      batchOpsCount += 2;

      absentMarked++;

      if (batchOpsCount >= 300) {
        await batch.commit();
        batch = adminDb.batch();
        batchOpsCount = 0;
      }
    }

    if (batchOpsCount > 0) {
      await batch.commit();
    }

    totalAbsentMarked += absentMarked;
    totalSkipped += skipped;

    // 10. Log: { tenantId, date, totalStaff, absentMarked, skipped }
    const logEntry: TenantAbsenteeLog = {
      tenantId: tenant.id,
      companyName: tenant.companyName,
      date: targetDate,
      totalStaff,
      absentMarked,
      skipped,
      details: {
        alreadyRecordedCount,
        personalOffCount,
        approvedLeaveCount,
      },
    };

    logs.push(logEntry);
    console.log(`[mark-absentees] Log:`, JSON.stringify(logEntry));
  }

  return {
    ok: true,
    success: true,
    targetDate,
    timezone: "Asia/Kolkata (IST)",
    dayOfWeek: dayName,
    tenantsScanned,
    totalStaffScanned,
    totalAbsentMarked,
    totalSkipped,
    logs,
  };
}

async function handleCron(request: NextRequest) {
  // Authorization check: Supports both standard Bearer token and 'x-cron-secret' header
  const authHeader = request.headers.get("authorization");
  const xCronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret) {
    const isBearerValid = authHeader === `Bearer ${expectedSecret}`;
    const isHeaderValid = xCronSecret === expectedSecret;
    if (!isBearerValid && !isHeaderValid) {
      return NextResponse.json({ error: "UNAUTHORIZED", success: false }, { status: 401 });
    }
  }

  let customDate: string | undefined;
  let filterTenantId: string | undefined;

  const { searchParams } = new URL(request.url);
  customDate = searchParams.get("date") || undefined;
  filterTenantId = searchParams.get("tenantId") || undefined;

  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body?.date) customDate = String(body.date).trim();
      if (body?.tenantId) filterTenantId = String(body.tenantId).trim();
    } catch {}
  }

  try {
    const result = await processAbsenteeMarking(customDate, filterTenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[mark-absentees] Cron error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to mark absentees." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
