import { adminDb } from "@/lib/firebase-admin";
import {
  AttendanceDocument,
  AttendanceStatus,
  LeaveDocument,
  SalaryStructureDocument,
  RegularizationDocument,
  RegularizationStatus,
  LeaveBalanceDocument,
  AttendanceSettingsDocument,
  DEFAULT_ATTENDANCE_SETTINGS,
  HrQueryDocument,
} from "@/lib/schemas/hr-schema";

import { haversineDistanceMeters } from "@/lib/utils/geo";
import { FieldValue } from "firebase-admin/firestore";
import { serializeFirestoreDoc } from "@/lib/utils/serialize-firestore";
import { getHolidayForDate } from "@/lib/utils/holidays";

export type AttendanceSummary = {
  staffId: string;
  month: string; // YYYY-MM
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  late?: number;
  penaltyAbsentDays?: number;
  effectiveAbsentDays?: number;
  totalRecords: number;
  records: AttendanceDocument[];
};

export type StaffMemberRecord = {
  id: string;
  empId: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  branchCode: string;
  reportsToStaffId?: string | null;
  isActive: boolean;
  tenantId: string;
  authUid?: string | null;
  dateOfBirth?: string;
  dateOfJoining?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  photoUrl?: string;
};

/**
 * Fetches staff document and validates existence by staffId (document ID)
 */
export async function getStaffDoc(staffId: string): Promise<StaffMemberRecord | null> {
  const doc = await adminDb.collection("staff").doc(staffId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    empId: data.empId ?? "",
    name: data.name ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    role: data.role ?? "",
    branchCode: data.branchCode ?? "",
    reportsToStaffId: data.reportsToStaffId ?? null,
    isActive: data.isActive !== false,
    tenantId: data.tenantId ?? "",
    authUid: data.authUid ?? null,
    dateOfBirth: data.dateOfBirth ?? "",
    dateOfJoining: data.dateOfJoining ?? "",
    emergencyContact: data.emergencyContact ?? "",
    bloodGroup: data.bloodGroup ?? "",
    photoUrl: data.photoUrl ?? "",
  };
}

/**
 * Fetches staff document by Firebase Auth UID (authUid or doc ID)
 */
export async function getStaffByAuthUid(
  authUid: string,
  tenantId?: string
): Promise<StaffMemberRecord | null> {
  if (!authUid) return null;

  // 1. Direct doc lookup (when staff docId == authUid, e.g. for self-signup tenant admins)
  const direct = await getStaffDoc(authUid);
  if (direct && (!tenantId || direct.tenantId === tenantId)) {
    return direct;
  }

  // 2. Query by authUid field
  let query: FirebaseFirestore.Query = adminDb
    .collection("staff")
    .where("authUid", "==", authUid)
    .where("isActive", "==", true);

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snap = await query.limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      empId: data.empId ?? "",
      name: data.name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      role: data.role ?? "",
      branchCode: data.branchCode ?? "",
      reportsToStaffId: data.reportsToStaffId ?? null,
      isActive: data.isActive !== false,
      tenantId: data.tenantId ?? "",
      authUid: data.authUid ?? null,
      dateOfBirth: data.dateOfBirth ?? "",
      dateOfJoining: data.dateOfJoining ?? "",
      emergencyContact: data.emergencyContact ?? "",
      bloodGroup: data.bloodGroup ?? "",
      photoUrl: data.photoUrl ?? "",
    };
  }

  return null;
}

/**
 * Fetches staff document by email
 */
export async function getStaffByEmail(
  email: string,
  tenantId?: string
): Promise<StaffMemberRecord | null> {
  if (!email) return null;

  let query: FirebaseFirestore.Query = adminDb
    .collection("staff")
    .where("email", "==", email.trim().toLowerCase())
    .where("isActive", "==", true);

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snap = await query.limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      empId: data.empId ?? "",
      name: data.name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      role: data.role ?? "",
      branchCode: data.branchCode ?? "",
      reportsToStaffId: data.reportsToStaffId ?? null,
      isActive: data.isActive !== false,
      tenantId: data.tenantId ?? "",
      authUid: data.authUid ?? null,
      dateOfBirth: data.dateOfBirth ?? "",
      dateOfJoining: data.dateOfJoining ?? "",
      emergencyContact: data.emergencyContact ?? "",
      bloodGroup: data.bloodGroup ?? "",
      photoUrl: data.photoUrl ?? "",
    };
  }

  return null;
}

/**
 * Marks or updates attendance for a staff member on a specific date (YYYY-MM-DD)
 */
export async function saveAttendanceRecord(
  staffId: string,
  record: AttendanceDocument
): Promise<void> {
  await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("attendance")
    .doc(record.date)
    .set(
      {
        ...record,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * Fetches attendance summary for a staff member for a given month (YYYY-MM)
 */
export async function getStaffAttendanceSummary(
  staffId: string,
  month: string
): Promise<AttendanceSummary> {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const snapshot = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("attendance")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .orderBy("date", "asc")
    .get();

  let present = 0;
  let absent = 0;
  let halfDay = 0;
  let leave = 0;
  let late = 0;

  const records: AttendanceDocument[] = [];

  snapshot.forEach((doc) => {
    const rawData = doc.data();
    const data = serializeFirestoreDoc<AttendanceDocument>(rawData);
    records.push(data);

    switch (data.status) {
      case "PRESENT":
        present++;
        break;
      case "LATE":
        late++;
        present++;
        break;
      case "ABSENT":
        absent++;
        break;
      case "HALF_DAY":
        halfDay++;
        break;
      case "LEAVE":
        leave++;
        break;
    }
  });

  const { penaltyAbsentDays, effectiveAbsentDays } = await applyLateAbsentPenalty(
    staffId,
    month
  );

  return {
    staffId,
    month,
    present,
    absent,
    halfDay,
    leave,
    late,
    penaltyAbsentDays,
    effectiveAbsentDays,
    totalRecords: records.length,
    records,
  };
}

export const getAttendanceSummary = getStaffAttendanceSummary;

/**
 * Reads the month's attendance docs, counts LATE-status days, and for every multiple
 * of lateCountForAbsent reached, adds one to effectiveAbsentDays.
 * Does NOT modify any individual attendance document's stored status.
 */
export async function applyLateAbsentPenalty(
  staffId: string,
  month: string
): Promise<{ penaltyAbsentDays: number; effectiveAbsentDays: number; lateCount: number; baseAbsentCount: number }> {
  const staff = await getStaffDoc(staffId);
  const settings = staff?.tenantId ? await getAttendanceSettings(staff.tenantId) : DEFAULT_ATTENDANCE_SETTINGS;
  const lateThreshold = settings.lateCountForAbsent || 3;

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const snapshot = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("attendance")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  let lateCount = 0;
  let baseAbsentCount = 0;

  snapshot.forEach((doc) => {
    const data = doc.data() as AttendanceDocument;
    if (data.status === "LATE") {
      lateCount++;
    } else if (data.status === "ABSENT") {
      baseAbsentCount++;
    }
  });

  const penaltyAbsentDays = Math.floor(lateCount / lateThreshold);
  const effectiveAbsentDays = baseAbsentCount + penaltyAbsentDays;
  return { penaltyAbsentDays, effectiveAbsentDays, lateCount, baseAbsentCount };
}

/**
 * Creates a new leave application under staff/{staffId}/leaves/{leaveId}
 */
export async function createLeaveRecord(
  staffId: string,
  leave: Omit<LeaveDocument, "id">
): Promise<string> {
  const docRef = adminDb.collection("staff").doc(staffId).collection("leaves").doc();
  await docRef.set({
    ...leave,
    id: docRef.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Updates status of a leave application (APPROVED / REJECTED)
 */
export async function updateLeaveStatus(
  staffId: string,
  leaveId: string,
  status: "APPROVED" | "REJECTED",
  approvedBy: string
): Promise<void> {
  await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("leaves")
    .doc(leaveId)
    .update({
      status,
      approvedBy,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Fetches all leaves for a staff member
 */
export async function getStaffLeaves(
  staffId: string,
  limitCount = 50
): Promise<LeaveDocument[]> {
  const snapshot = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("leaves")
    .orderBy("appliedAtMs", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      fromDate: data.fromDate,
      toDate: data.toDate,
      type: data.type,
      status: data.status,
      reason: data.reason,
      appliedAtMs: data.appliedAtMs,
      approvedBy: data.approvedBy ?? null,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
    } as LeaveDocument;
  });
}

/**
 * Appends a new salary structure document (History is always preserved, never overwritten)
 */
export async function appendSalaryStructure(
  salaryStructure: Omit<SalaryStructureDocument, "id">
): Promise<string> {
  const docRef = adminDb.collection("salary_structures").doc();
  await docRef.set({
    ...salaryStructure,
    id: docRef.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Fetches salary structure history for a staff member
 */
export async function getStaffSalaryHistory(
  staffId: string,
  tenantId?: string | null
): Promise<SalaryStructureDocument[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collection("salary_structures")
    .where("staffId", "==", staffId);

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.orderBy("effectiveFromMs", "desc").get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      staffId: data.staffId,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
      baseSalary: data.baseSalary,
      effectiveFromMs: data.effectiveFromMs,
      createdBy: data.createdBy,
      createdAtMs: data.createdAtMs,
    } as SalaryStructureDocument;
  });
}

/**
 * Fetches current active salary structure for a staff member
 */
export async function getCurrentSalaryStructure(
  staffId: string,
  tenantId?: string | null
): Promise<SalaryStructureDocument | null> {
  const history = await getStaffSalaryHistory(staffId, tenantId);
  const nowMs = Date.now();
  const active = history.find((s) => s.effectiveFromMs <= nowMs);
  return active || history[0] || null;
}

/**
 * Fetches pending leave applications across staff members for review
 */
export async function getPendingLeavesAcrossStaff(
  tenantId?: string | null,
  storeId?: string | null
): Promise<(LeaveDocument & { staffId: string; staffName?: string; staffEmpId?: string })[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collectionGroup("leaves")
    .where("status", "==", "PENDING");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snapshot = await query.orderBy("appliedAtMs", "desc").limit(50).get();

  const results: (LeaveDocument & { staffId: string; staffName?: string; staffEmpId?: string })[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const staffId = doc.ref.parent.parent?.id || "";
    let staffName = "";
    let staffEmpId = "";

    if (staffId) {
      const sDoc = await adminDb.collection("staff").doc(staffId).get();
      if (sDoc.exists) {
        staffName = sDoc.data()?.name || "";
        staffEmpId = sDoc.data()?.empId || "";
      }
    }

    results.push({
      id: doc.id,
      staffId,
      staffName,
      staffEmpId,
      fromDate: data.fromDate,
      toDate: data.toDate,
      type: data.type,
      status: data.status,
      reason: data.reason,
      appliedAtMs: data.appliedAtMs,
      approvedBy: data.approvedBy ?? null,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
    });
  }

  return results;
}

/**
 * Fetches historical leave applications across staff members with month and status filter
 */
export async function getLeavesHistoryAcrossStaff(
  tenantId?: string | null,
  month?: string | null,
  statusFilter?: string | null,
  storeId?: string | null
): Promise<(LeaveDocument & { staffId: string; staffName?: string; staffEmpId?: string })[]> {
  let query: FirebaseFirestore.Query = adminDb.collectionGroup("leaves");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (statusFilter && statusFilter !== "ALL") {
    query = query.where("status", "==", statusFilter);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snapshot = await query.orderBy("appliedAtMs", "desc").limit(100).get();
  const results: (LeaveDocument & { staffId: string; staffName?: string; staffEmpId?: string })[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const staffId = doc.ref.parent.parent?.id || "";

    // If month is specified (YYYY-MM), filter by fromDate or appliedAtMs
    if (month) {
      const fromDate = data.fromDate || "";
      const appliedDate = data.appliedAtMs ? new Date(data.appliedAtMs).toISOString().slice(0, 7) : "";
      if (!fromDate.startsWith(month) && !appliedDate.startsWith(month)) {
        continue;
      }
    }

    let staffName = "";
    let staffEmpId = "";

    if (staffId) {
      const sDoc = await adminDb.collection("staff").doc(staffId).get();
      if (sDoc.exists) {
        staffName = sDoc.data()?.name || "";
        staffEmpId = sDoc.data()?.empId || "";
      }
    }

    results.push({
      id: doc.id,
      staffId,
      staffName,
      staffEmpId,
      fromDate: data.fromDate,
      toDate: data.toDate,
      type: data.type,
      status: data.status,
      reason: data.reason,
      appliedAtMs: data.appliedAtMs,
      approvedBy: data.approvedBy ?? null,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
    });
  }

  return results;
}

/**
 * Processes periodic GPS ping for staff geo-attendance.
 * Enforces tenant attendance settings, anti-spoofing velocity validation, and re-entrant attendance lifecycle.
 */
export async function recordGeoPing(
  staffId: string,
  latitude: number,
  longitude: number,
  timestampMs: number,
  selfieUrl?: string | null
): Promise<{
  ok: boolean;
  status?: AttendanceStatus;
  isInside?: boolean;
  distanceMeters?: number | null;
  checkInMs?: number | null;
  checkOutMs?: number | null;
  selfieUrl?: string | null;
  error?: string;
}> {
  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  // 1. Fetch tenant attendance settings
  const settings = await getAttendanceSettings(staff.tenantId);

  // 2. Skip processing entirely if today's day-of-week is in weeklyOffDays
  const pingDate = new Date(timestampMs);
  const dayOfWeek = pingDate.getDay(); // 0=Sunday...6=Saturday
  const weeklyOffDays = settings.weeklyOffDays ?? [0];
  if (weeklyOffDays.includes(dayOfWeek)) {
    return {
      ok: true,
      isInside: false,
      distanceMeters: null,
      checkInMs: null,
      checkOutMs: null,
    };
  }

  // Resolve assigned store geofence
  let storeDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (staff.branchCode) {
    const q = await adminDb
      .collection("stores")
      .where("tenantId", "==", staff.tenantId)
      .where("branchCode", "==", staff.branchCode)
      .limit(1)
      .get();
    if (!q.empty) storeDoc = q.docs[0];
  }

  if (!storeDoc) {
    return { ok: false, error: "Staff store branch not found." };
  }

  const storeData = storeDoc.data() || {};
  const storeLat = storeData.geoLatitude ?? storeData.location?.geoLatitude;
  const storeLng = storeData.geoLongitude ?? storeData.location?.geoLongitude;
  const storeRadius = Number(
    storeData.geoRadiusMeters ?? storeData.location?.geoRadiusMeters ?? settings.geoRadiusMeters ?? 100
  );

  if (storeLat === null || storeLat === undefined || storeLng === null || storeLng === undefined) {
    return { ok: false, error: "STORE_GEOFENCE_NOT_CONFIGURED" };
  }

  const distance = haversineDistanceMeters(latitude, longitude, Number(storeLat), Number(storeLng));
  const isInside = distance <= storeRadius;

  const dateStr = pingDate.toISOString().split("T")[0];
  const attRef = adminDb.collection("staff").doc(staffId).collection("attendance").doc(dateStr);
  const attSnap = await attRef.get();
  const existing = attSnap.exists ? (attSnap.data() as AttendanceDocument) : null;

  // Anti-Spoofing Velocity Sanity Check (> 150 km/h)
  if (
    existing?.lastPingMs &&
    existing.lastPingLat !== undefined &&
    existing.lastPingLat !== null &&
    existing.lastPingLng !== undefined &&
    existing.lastPingLng !== null
  ) {
    const timeDeltaSec = (timestampMs - existing.lastPingMs) / 1000;
    if (timeDeltaSec > 0 && timeDeltaSec < 3600) {
      const distDeltaMeters = haversineDistanceMeters(
        existing.lastPingLat,
        existing.lastPingLng,
        latitude,
        longitude
      );
      const speedKmH = (distDeltaMeters / timeDeltaSec) * 3.6;
      if (speedKmH > 150) {
        return {
          ok: false,
          error: "ERR_SPOOFED_VELOCITY",
          isInside,
          distanceMeters: Math.round(distance),
        };
      }
    }
  }

  // Server-side throttle: Skip Firestore write if pinged within last 90 seconds with unchanged state
  const isStateUnchanged =
    (isInside && existing?.lastLocationState === "INSIDE") ||
    (!isInside && existing?.lastLocationState === "OUTSIDE");

  if (
    existing?.lastPingMs &&
    timestampMs - existing.lastPingMs < 90 * 1000 &&
    isStateUnchanged
  ) {
    return {
      ok: true,
      status: existing.status,
      isInside,
      distanceMeters: Math.round(distance),
      checkInMs: existing.checkInMs,
      checkOutMs: existing.checkOutMs,
      selfieUrl: existing.selfieUrl || null,
    };
  }

  // Attendance Lifecycle State Engine

  if (!existing) {
    if (isInside) {
      // First detection inside -> Check-in with configurable shift timings
      const [shiftH, shiftM] = (settings.shiftStartTime || "09:00").split(":").map(Number);
      const shiftStartObj = new Date(pingDate);
      shiftStartObj.setHours(shiftH, shiftM, 0, 0);
      const shiftStartMs = shiftStartObj.getTime();

      const gracePeriodMs = (settings.gracePeriodMinutes ?? 15) * 60 * 1000;
      const halfDayThresholdMs = (settings.halfDayThresholdMinutes ?? 240) * 60 * 1000;

      let initialStatus: AttendanceStatus;
      if (timestampMs <= shiftStartMs + gracePeriodMs) {
        initialStatus = "PRESENT";
      } else if (timestampMs < shiftStartMs + halfDayThresholdMs) {
        initialStatus = "LATE";
      } else {
        initialStatus = "HALF_DAY";
      }

      const newDoc: AttendanceDocument = {
        date: dateStr,
        checkInMs: timestampMs,
        checkOutMs: null,
        status: initialStatus,
        source: "GEO_AUTO",
        detectedLatitude: latitude,
        detectedLongitude: longitude,
        lastLocationState: "INSIDE",
        lastPingMs: timestampMs,
        lastPingLat: latitude,
        lastPingLng: longitude,
        selfieUrl: selfieUrl || null,
        branchCode: staff.branchCode,
        tenantId: staff.tenantId,
        markedBy: "GEO_AUTO_SYSTEM",
      };

      await attRef.set(newDoc);
      return {
        ok: true,
        status: initialStatus,
        isInside: true,
        distanceMeters: Math.round(distance),
        checkInMs: timestampMs,
        checkOutMs: null,
        selfieUrl: selfieUrl || null,
      };
    } else {
      // Outside and no check-in yet today
      return {
        ok: true,
        isInside: false,
        distanceMeters: Math.round(distance),
        checkInMs: null,
        checkOutMs: null,
      };
    }
  } else {
    // Existing attendance record today
    const updates: Partial<AttendanceDocument> = {
      lastPingMs: timestampMs,
      lastPingLat: latitude,
      lastPingLng: longitude,
    };

    if (selfieUrl && !existing.selfieUrl) {
      updates.selfieUrl = selfieUrl;
    }

    let updatedCheckOutMs = existing.checkOutMs;

    if (!isInside) {
      // Outside -> Overwrite checkOutMs with latest ping ("last exit wins")
      if (existing.checkInMs) {
        updates.checkOutMs = timestampMs;
        updatedCheckOutMs = timestampMs;
        updates.lastLocationState = "OUTSIDE";
      }
    } else {
      // Inside -> If employee returned (e.g. from lunch), reset checkOutMs to null
      if (existing.checkOutMs !== null) {
        updates.checkOutMs = null;
        updatedCheckOutMs = null;
      }
      updates.lastLocationState = "INSIDE";
    }

    await attRef.update(updates);

    return {
      ok: true,
      status: existing.status,
      isInside,
      distanceMeters: Math.round(distance),
      checkInMs: existing.checkInMs,
      checkOutMs: updatedCheckOutMs,
      selfieUrl: existing.selfieUrl || selfieUrl || null,
    };
  }
}

/**
 * Processes remote / WFH check-in without store geo-fence check.
 * Only allowed when tenant has allowRemoteCheckIn enabled, otherwise throws an error.
 */
export async function remoteCheckIn(
  staffId: string,
  timestampMs?: number,
  reason?: string,
  selfieUrl?: string | null
): Promise<{
  ok: boolean;
  status: AttendanceStatus;
  checkInMs: number;
  selfieUrl?: string | null;
}> {
  const staff = await getStaffDoc(staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const settings = await getAttendanceSettings(staff.tenantId);
  if (!settings.allowRemoteCheckIn) {
    throw new Error("Remote check-in is not permitted for your organization. Please check in at your store location.");
  }

  const effectiveMs = timestampMs || Date.now();
  const pingDate = new Date(effectiveMs);
  const dayOfWeek = pingDate.getDay();
  if ((settings.weeklyOffDays ?? [0]).includes(dayOfWeek)) {
    throw new Error("Today is a scheduled weekly off day. Check-in is not required.");
  }

  const dateStr = pingDate.toISOString().split("T")[0];
  const attRef = adminDb.collection("staff").doc(staffId).collection("attendance").doc(dateStr);
  const attSnap = await attRef.get();

  if (attSnap.exists && attSnap.data()?.checkInMs) {
    return {
      ok: true,
      status: attSnap.data()?.status || "PRESENT",
      checkInMs: attSnap.data()?.checkInMs,
      selfieUrl: attSnap.data()?.selfieUrl || null,
    };
  }

  const record: AttendanceDocument = {
    date: dateStr,
    checkInMs: effectiveMs,
    checkOutMs: null,
    status: "PRESENT",
    source: "MANUAL",
    lastLocationState: "INSIDE",
    lastPingMs: effectiveMs,
    selfieUrl: selfieUrl || null,
    branchCode: staff.branchCode || "REMOTE",
    tenantId: staff.tenantId,
    markedBy: staff.email || staffId,
  };

  await attRef.set(record, { merge: true });

  return {
    ok: true,
    status: "PRESENT",
    checkInMs: effectiveMs,
    selfieUrl: selfieUrl || null,
  };
}

/**
 * Scheduled/cron absentee batch job.
 * Evaluates tenant attendance settings, weekly offs, festival holidays, and employee personal weekly offs.
 */
export async function markAbsentees(
  tenantId: string,
  date: string
): Promise<{ markedCount: number; skippedCount?: number; totalStaff?: number; skippedReason?: string }> {
  const settings = await getAttendanceSettings(tenantId);
  const autoMarkEnabled =
    settings.autoMarkAbsentEnabled !== false &&
    (settings as any).autoMarkAbsent !== false;

  if (!autoMarkEnabled) {
    return { markedCount: 0, skippedCount: 0, totalStaff: 0, skippedReason: "AUTO_MARK_ABSENT_DISABLED" };
  }

  // Parse IST day info
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(dateObj);

  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const dayIndex = dayMap[dayName.toLowerCase()] ?? dateObj.getDay();

  const isWeeklyOffMatch = (config: any) => {
    if (config === undefined || config === null) return false;
    const list = Array.isArray(config) ? config : [config];
    for (const item of list) {
      if (typeof item === "number" && item === dayIndex) return true;
      if (typeof item === "string") {
        const norm = item.trim().toLowerCase();
        if (norm === dayName.toLowerCase()) return true;
        if (dayMap[norm] !== undefined && dayMap[norm] === dayIndex) return true;
      }
    }
    return false;
  };

  // 1. Skip tenant weekly off days
  if (isWeeklyOffMatch(settings.weeklyOffDays)) {
    return { markedCount: 0, skippedCount: 0, totalStaff: 0, skippedReason: `WEEKLY_OFF (${dayName})` };
  }

  // 2. Skip festival holidays
  const standardHoliday = getHolidayForDate(date);
  if (standardHoliday) {
    return { markedCount: 0, skippedCount: 0, totalStaff: 0, skippedReason: `FESTIVAL_HOLIDAY (${standardHoliday.name})` };
  }

  try {
    const tenantHolidayDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("holidays")
      .doc(date)
      .get();
    if (tenantHolidayDoc.exists) {
      return { markedCount: 0, skippedCount: 0, totalStaff: 0, skippedReason: `FESTIVAL_HOLIDAY (${tenantHolidayDoc.data()?.name || "Holiday"})` };
    }
  } catch {}

  const staffSnap = await adminDb
    .collection("staff")
    .where("tenantId", "==", tenantId)
    .where("isActive", "==", true)
    .get();

  const activeStaffDocs = staffSnap.docs.filter((d) => d.data().isDeleted !== true);
  const totalStaff = activeStaffDocs.length;

  let markedCount = 0;
  let skippedCount = 0;
  let batch = adminDb.batch();
  let opsCount = 0;

  for (const doc of activeStaffDocs) {
    const staffId = doc.id;
    const staffData = doc.data();

    const tenantAttRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("attendance")
      .doc(`${staffId}_${date}`);

    const staffAttRef = adminDb
      .collection("staff")
      .doc(staffId)
      .collection("attendance")
      .doc(date);

    const [tenantSnap, staffSnapDoc] = await Promise.all([
      tenantAttRef.get(),
      staffAttRef.get(),
    ]);

    if (tenantSnap.exists || staffSnapDoc.exists) {
      skippedCount++;
      continue;
    }

    // Check staff personal weekly off override
    const staffWeeklyOff =
      staffData.weeklyOffDays ??
      staffData.weeklyOff ??
      staffData.personalWeeklyOff ??
      staffData.weeklyOffDay;

    if (staffWeeklyOff !== undefined && isWeeklyOffMatch(staffWeeklyOff)) {
      skippedCount++;
      continue;
    }

    const attendancePayload = {
      staffId,
      tenantId,
      branchCode: staffData.branchCode || "HQ",
      date,
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

    batch.set(tenantAttRef, attendancePayload);
    batch.set(staffAttRef, attendancePayload);
    opsCount += 2;
    markedCount++;

    if (opsCount >= 300) {
      await batch.commit();
      batch = adminDb.batch();
      opsCount = 0;
    }
  }

  if (opsCount > 0) {
    await batch.commit();
  }

  return { markedCount, skippedCount, totalStaff };
}

// ==========================================
// REGULARIZATION SERVICE METHODS
// ==========================================

export async function createRegularizationRecord(
  staffId: string,
  reg: Omit<RegularizationDocument, "id">
): Promise<string> {
  const docRef = adminDb.collection("staff").doc(staffId).collection("regularizations").doc();
  await docRef.set({
    ...reg,
    id: docRef.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function getStaffRegularizations(
  staffId: string,
  limitCount = 50
): Promise<RegularizationDocument[]> {
  const snapshot = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("regularizations")
    .orderBy("appliedAtMs", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      staffId: d.staffId || staffId,
      date: d.date,
      requestType: d.requestType,
      reason: d.reason,
      originalStatus: d.originalStatus,
      requestedStatus: d.requestedStatus,
      status: d.status,
      approvedBy: d.approvedBy ?? null,
      tenantId: d.tenantId,
      branchCode: d.branchCode,
      appliedAtMs: d.appliedAtMs,
      resolvedAtMs: d.resolvedAtMs ?? null,
      rejectionReason: d.rejectionReason,
    } as RegularizationDocument;
  });
}

export async function getPendingRegularizationsAcrossStaff(
  tenantId?: string | null,
  managerStaffId?: string | null,
  storeId?: string | null
): Promise<(RegularizationDocument & { staffName?: string; staffEmpId?: string })[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collectionGroup("regularizations")
    .where("status", "==", "PENDING");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snapshot = await query.orderBy("appliedAtMs", "desc").limit(50).get();
  const results: (RegularizationDocument & { staffName?: string; staffEmpId?: string })[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const staffId = doc.ref.parent.parent?.id || data.staffId || "";
    let staffName = "";
    let staffEmpId = "";
    let staffReportsTo: string | null = null;

    if (staffId) {
      const sDoc = await adminDb.collection("staff").doc(staffId).get();
      if (sDoc.exists) {
        const sData = sDoc.data();
        staffName = sData?.name || "";
        staffEmpId = sData?.empId || "";
        staffReportsTo = sData?.reportsToStaffId || null;
      }
    }

    // Hierarchy filter for managers (only direct reports)
    if (managerStaffId && staffReportsTo !== managerStaffId) {
      continue;
    }

    results.push({
      id: doc.id,
      staffId,
      staffName,
      staffEmpId,
      date: data.date,
      requestType: data.requestType,
      reason: data.reason,
      originalStatus: data.originalStatus,
      requestedStatus: data.requestedStatus,
      status: data.status,
      approvedBy: data.approvedBy ?? null,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
      appliedAtMs: data.appliedAtMs,
      resolvedAtMs: data.resolvedAtMs ?? null,
      rejectionReason: data.rejectionReason,
    });
  }

  return results;
}

/**
 * Fetches historical regularization requests across staff members with month and status filter
 */
export async function getRegularizationsHistoryAcrossStaff(
  tenantId?: string | null,
  month?: string | null,
  statusFilter?: string | null,
  managerStaffId?: string | null,
  storeId?: string | null
): Promise<(RegularizationDocument & { staffName?: string; staffEmpId?: string })[]> {
  let query: FirebaseFirestore.Query = adminDb.collectionGroup("regularizations");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (statusFilter && statusFilter !== "ALL") {
    query = query.where("status", "==", statusFilter);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snapshot = await query.orderBy("appliedAtMs", "desc").limit(100).get();
  const results: (RegularizationDocument & { staffName?: string; staffEmpId?: string })[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const staffId = doc.ref.parent.parent?.id || data.staffId || "";

    // Month filter check (YYYY-MM)
    if (month) {
      const regDate = data.date || "";
      const appliedDate = data.appliedAtMs ? new Date(data.appliedAtMs).toISOString().slice(0, 7) : "";
      if (!regDate.startsWith(month) && !appliedDate.startsWith(month)) {
        continue;
      }
    }

    let staffName = "";
    let staffEmpId = "";
    let staffReportsTo: string | null = null;

    if (staffId) {
      const sDoc = await adminDb.collection("staff").doc(staffId).get();
      if (sDoc.exists) {
        const sData = sDoc.data();
        staffName = sData?.name || "";
        staffEmpId = sData?.empId || "";
        staffReportsTo = sData?.reportsToStaffId || null;
      }
    }

    if (managerStaffId && staffReportsTo !== managerStaffId) {
      continue;
    }

    results.push({
      id: doc.id,
      staffId,
      staffName,
      staffEmpId,
      date: data.date,
      requestType: data.requestType,
      reason: data.reason,
      originalStatus: data.originalStatus,
      requestedStatus: data.requestedStatus,
      status: data.status,
      approvedBy: data.approvedBy ?? null,
      tenantId: data.tenantId,
      branchCode: data.branchCode,
      appliedAtMs: data.appliedAtMs,
      resolvedAtMs: data.resolvedAtMs ?? null,
      rejectionReason: data.rejectionReason,
    });
  }

  return results;
}

export async function updateRegularizationStatus(
  staffId: string,
  reqId: string,
  status: RegularizationStatus,
  approvedBy: string,
  rejectionReason?: string
): Promise<RegularizationDocument | null> {
  const docRef = adminDb.collection("staff").doc(staffId).collection("regularizations").doc(reqId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const data = snap.data() as RegularizationDocument;

  await docRef.update({
    status,
    approvedBy,
    resolvedAtMs: Date.now(),
    rejectionReason: rejectionReason || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ...data,
    status,
    approvedBy,
    resolvedAtMs: Date.now(),
    rejectionReason,
  };
}

// ==========================================
// LEAVE BALANCES SERVICE METHODS
// ==========================================

export async function getOrCreateStaffLeaveBalance(
  staffId: string,
  tenantId: string,
  year = new Date().getFullYear()
): Promise<LeaveBalanceDocument> {
  const docRef = adminDb.collection("leave_balances").doc(staffId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const d = docSnap.data()!;
    return {
      staffId,
      tenantId: d.tenantId || tenantId,
      year: d.year || year,
      PL: d.PL ?? 12,
      SL: d.SL ?? 6,
      CL: d.CL ?? 6,
      usedPL: d.usedPL ?? 0,
      usedSL: d.usedSL ?? 0,
      usedCL: d.usedCL ?? 0,
    };
  }

  const defaultBalance: LeaveBalanceDocument = {
    staffId,
    tenantId,
    year,
    PL: 12,
    SL: 6,
    CL: 6,
    usedPL: 0,
    usedSL: 0,
    usedCL: 0,
  };

  await docRef.set({
    ...defaultBalance,
    createdAt: FieldValue.serverTimestamp(),
  });

  return defaultBalance;
}

export async function deductStaffLeaveBalance(
  staffId: string,
  type: string,
  days: number
): Promise<void> {
  const docRef = adminDb.collection("leave_balances").doc(staffId);
  const fieldKey =
    type === "PL" ? "usedPL" : type === "SL" ? "usedSL" : type === "CL" ? "usedCL" : null;

  if (fieldKey) {
    await docRef.update({
      [fieldKey]: FieldValue.increment(days),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Fetches configured attendance settings for a tenant, or returns defaults.
 * Path: tenants/{tenantId}/settings/attendance
 */
export async function getAttendanceSettings(tenantId: string): Promise<AttendanceSettingsDocument> {
  const docSnap = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("settings")
    .doc("attendance")
    .get();

  if (!docSnap.exists) {
    return { ...DEFAULT_ATTENDANCE_SETTINGS };
  }

  const data = docSnap.data() || {};
  return {
    shiftStartTime: data.shiftStartTime ?? DEFAULT_ATTENDANCE_SETTINGS.shiftStartTime,
    shiftEndTime: data.shiftEndTime ?? DEFAULT_ATTENDANCE_SETTINGS.shiftEndTime,
    gracePeriodMinutes: Number(data.gracePeriodMinutes ?? DEFAULT_ATTENDANCE_SETTINGS.gracePeriodMinutes),
    defaultWeeklyOffDay: data.defaultWeeklyOffDay ?? DEFAULT_ATTENDANCE_SETTINGS.defaultWeeklyOffDay,
    weeklyOffDays: Array.isArray(data.weeklyOffDays) ? data.weeklyOffDays : DEFAULT_ATTENDANCE_SETTINGS.weeklyOffDays,
    holidays: Array.isArray(data.holidays) ? data.holidays : DEFAULT_ATTENDANCE_SETTINGS.holidays,
    geoRadiusMeters: Number(data.geoRadiusMeters ?? DEFAULT_ATTENDANCE_SETTINGS.geoRadiusMeters),
    halfDayThresholdMinutes: Number(data.halfDayThresholdMinutes ?? DEFAULT_ATTENDANCE_SETTINGS.halfDayThresholdMinutes),
    lateCountForAbsent: Number(data.lateCountForAbsent ?? DEFAULT_ATTENDANCE_SETTINGS.lateCountForAbsent),
    autoMarkAbsentEnabled: data.autoMarkAbsentEnabled !== false,
    allowRemoteCheckIn: data.allowRemoteCheckIn === true,
    requireSelfieOnCheckIn: data.requireSelfieOnCheckIn === true,
    updatedBy: data.updatedBy ?? null,
    updatedAtMs: data.updatedAtMs ?? null,
  };
}

/**
 * Updates attendance settings for a tenant.
 */
export async function saveAttendanceSettings(
  tenantId: string,
  settings: Partial<AttendanceSettingsDocument>,
  updatedBy: string
): Promise<void> {
  const docRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("settings")
    .doc("attendance");

  await docRef.set(
    {
      ...settings,
      updatedBy,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// =========================================================================
// 13. TODAY'S CELEBRATIONS (Birthdays & Work Anniversaries)
// =========================================================================

export type CelebrationItem = {
  id: string;
  name: string;
  occasion: "BIRTHDAY" | "WORK_ANNIVERSARY";
  occasionText: string;
};

/**
 * Returns today's birthdays and work anniversaries for active staff in the same tenant/branch.
 * Privacy safe: Only returns first name and occasion text, omitting full dates or personal data.
 */
export async function getTodaysCelebrations(
  tenantId?: string | null,
  branchCode?: string | null
): Promise<CelebrationItem[]> {
  if (!tenantId) return [];

  let query: FirebaseFirestore.Query = adminDb
    .collection("staff")
    .where("tenantId", "==", tenantId)
    .where("isActive", "==", true);

  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snapshot = await query.get();
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const currentDay = String(now.getDate()).padStart(2, "0");
  const todayMMDD = `${currentMonth}-${currentDay}`;

  const celebrations: CelebrationItem[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.isDeleted) continue;
    const rawName = data.name || "Colleague";
    const firstName = rawName.split(" ")[0] || rawName;

    // Birthday check
    if (data.dateOfBirth && typeof data.dateOfBirth === "string") {
      const parts = data.dateOfBirth.split("-");
      if (parts.length === 3) {
        const dobMMDD = `${parts[1]}-${parts[2]}`;
        if (dobMMDD === todayMMDD) {
          celebrations.push({
            id: `${doc.id}_dob`,
            name: firstName,
            occasion: "BIRTHDAY",
            occasionText: `🎂 ${firstName}'s Birthday!`,
          });
        }
      }
    }

    // Work Anniversary check
    if (data.dateOfJoining && typeof data.dateOfJoining === "string") {
      const parts = data.dateOfJoining.split("-");
      if (parts.length === 3) {
        const dojMMDD = `${parts[1]}-${parts[2]}`;
        const joinYear = parseInt(parts[0], 10);
        const thisYear = now.getFullYear();
        const yearsCompleted = thisYear - joinYear;
        if (dojMMDD === todayMMDD && yearsCompleted > 0) {
          celebrations.push({
            id: `${doc.id}_doj`,
            name: firstName,
            occasion: "WORK_ANNIVERSARY",
            occasionText: `🎉 ${firstName}'s Work Anniversary (${yearsCompleted} yr${yearsCompleted > 1 ? "s" : ""})!`,
          });
        }
      }
    }
  }

  return celebrations;
}

// =========================================================================
// 14. HR QUERIES ("Contact HR" System)
// =========================================================================

/**
 * Creates a new HR query under staff/{staffId}/hr_queries/{queryId}
 */
export async function createHrQueryRecord(
  staffId: string,
  queryData: Omit<HrQueryDocument, "id">
): Promise<string> {
  const docRef = adminDb.collection("staff").doc(staffId).collection("hr_queries").doc();
  const docToSave: HrQueryDocument = {
    ...queryData,
    id: docRef.id,
  };
  await docRef.set({
    ...docToSave,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Fetches HR queries submitted by a specific staff member
 */
export async function getStaffHrQueries(
  staffId: string,
  limitCount = 50
): Promise<HrQueryDocument[]> {
  const snapshot = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("hr_queries")
    .orderBy("raisedAtMs", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      staffId: data.staffId,
      staffName: data.staffName || "",
      subject: data.subject || "",
      message: data.message || "",
      status: data.status || "OPEN",
      raisedAtMs: data.raisedAtMs || 0,
      resolvedAtMs: data.resolvedAtMs ?? null,
      resolvedBy: data.resolvedBy ?? null,
      resolutionNote: data.resolutionNote ?? null,
      tenantId: data.tenantId || "",
      branchCode: data.branchCode || "",
    } as HrQueryDocument;
  });
}

/**
 * Fetches OPEN HR queries across staff members for Manager / Tenant Admin inbox
 */
export async function getPendingHrQueriesAcrossStaff(
  tenantId?: string | null,
  storeId?: string | null
): Promise<HrQueryDocument[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collectionGroup("hr_queries")
    .where("status", "==", "OPEN");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snapshot = await query.get();

  let results: HrQueryDocument[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      staffId: data.staffId,
      staffName: data.staffName || "",
      subject: data.subject || "",
      message: data.message || "",
      status: data.status || "OPEN",
      raisedAtMs: data.raisedAtMs || 0,
      resolvedAtMs: data.resolvedAtMs ?? null,
      resolvedBy: data.resolvedBy ?? null,
      resolutionNote: data.resolutionNote ?? null,
      tenantId: data.tenantId || "",
      branchCode: data.branchCode || "",
    } as HrQueryDocument;
  });

  if (storeId) {
    const cleanStore = storeId.toUpperCase().trim();
    results = results.filter((q) => (q.branchCode || "").toUpperCase().trim() === cleanStore);
  }

  // Sort descending by raised time
  results.sort((a, b) => b.raisedAtMs - a.raisedAtMs);
  return results;
}

/**
 * Fetches historical HR queries across staff members with month and status filter
 */
export async function getHrQueriesHistoryAcrossStaff(
  tenantId?: string | null,
  month?: string | null,
  statusFilter?: string | null,
  storeId?: string | null
): Promise<HrQueryDocument[]> {
  let query: FirebaseFirestore.Query = adminDb.collectionGroup("hr_queries");

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (statusFilter && statusFilter !== "ALL") {
    query = query.where("status", "==", statusFilter);
  }

  const snapshot = await query.get();

  let results: HrQueryDocument[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      staffId: data.staffId,
      staffName: data.staffName || "",
      subject: data.subject || "",
      message: data.message || "",
      status: data.status || "OPEN",
      raisedAtMs: data.raisedAtMs || 0,
      resolvedAtMs: data.resolvedAtMs ?? null,
      resolvedBy: data.resolvedBy ?? null,
      resolutionNote: data.resolutionNote ?? null,
      tenantId: data.tenantId || "",
      branchCode: data.branchCode || "",
    } as HrQueryDocument;
  });

  if (month) {
    results = results.filter((q) => {
      const raisedDate = q.raisedAtMs ? new Date(q.raisedAtMs).toISOString().slice(0, 7) : "";
      return raisedDate.startsWith(month);
    });
  }

  if (storeId) {
    const cleanStore = storeId.toUpperCase().trim();
    results = results.filter((q) => (q.branchCode || "").toUpperCase().trim() === cleanStore);
  }

  results.sort((a, b) => b.raisedAtMs - a.raisedAtMs);
  return results;
}

/**
 * Bulk regularizes all false-absents for a specific date across active staff (e.g. 2026-10-02 Gandhi Jayanti)
 */
export async function bulkRegularizeDate(
  tenantId: string,
  date: string,
  reason: string,
  updatedStatus: AttendanceStatus = "PRESENT",
  actor: string = "Admin"
): Promise<{ regularizedCount: number; staffNames: string[] }> {
  const staffSnap = await adminDb
    .collection("staff")
    .where("tenantId", "==", tenantId)
    .where("isActive", "==", true)
    .get();

  let regularizedCount = 0;
  const staffNames: string[] = [];
  let batch = adminDb.batch();
  let opsCount = 0;

  for (const staffDoc of staffSnap.docs) {
    const staffId = staffDoc.id;
    const staffData = staffDoc.data();

    const tenantAttRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("attendance")
      .doc(`${staffId}_${date}`);

    const staffAttRef = adminDb
      .collection("staff")
      .doc(staffId)
      .collection("attendance")
      .doc(date);

    const [tSnap, sSnap] = await Promise.all([tenantAttRef.get(), staffAttRef.get()]);

    const existingStatus = tSnap.data()?.status || sSnap.data()?.status;
    // Regularize if absent or unlogged
    if (existingStatus === "ABSENT" || !tSnap.exists || !sSnap.exists) {
      const payload = {
        staffId,
        tenantId,
        branchCode: staffData.branchCode || "HQ",
        date,
        status: updatedStatus,
        checkInMs: tSnap.data()?.checkInMs || Date.now(),
        checkOutMs: tSnap.data()?.checkOutMs || null,
        source: "MANUAL",
        markedBy: actor,
        regularizationReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      };

      batch.set(tenantAttRef, payload, { merge: true });
      batch.set(staffAttRef, payload, { merge: true });
      opsCount += 2;
      regularizedCount++;
      staffNames.push(staffData.name || staffId);

      if (opsCount >= 300) {
        await batch.commit();
        batch = adminDb.batch();
        opsCount = 0;
      }
    }
  }

  if (opsCount > 0) {
    await batch.commit();
  }

  return { regularizedCount, staffNames };
}

/**
 * Updates staff attendance policy (Weekly-off day, attendance mode, field meetings min threshold)
 */
export async function updateStaffShiftProfile(
  staffId: string,
  data: {
    weeklyOffDay?: string;
    attendanceMode?: "GEO_AUTO" | "MANUAL";
    shiftStartOverride?: string;
    shiftEndOverride?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
  }
): Promise<{ ok: boolean; success: boolean; error?: string }> {
  const staffRef = adminDb.collection("staff").doc(staffId);
  const snap = await staffRef.get();
  if (!snap.exists) {
    return { ok: false, success: false, error: "Staff not found" };
  }

  const updates: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.weeklyOffDay !== undefined) {
    updates.weeklyOffDay = data.weeklyOffDay;
    updates.weeklyOffDays = [data.weeklyOffDay];
  }
  if (data.attendanceMode !== undefined) {
    updates.attendanceMode = data.attendanceMode;
  }
  const start = data.shiftStartOverride ?? data.shiftStartTime;
  if (start !== undefined) {
    updates.shiftStartOverride = start;
    updates.customShiftStartTime = start;
  }
  const end = data.shiftEndOverride ?? data.shiftEndTime;
  if (end !== undefined) {
    updates.shiftEndOverride = end;
    updates.customShiftEndTime = end;
  }

  await staffRef.update(updates);
  return { ok: true, success: true };
}


/**
 * Resolves an HR query with an optional resolution note
 */
export async function resolveHrQueryRecord(
  staffId: string,
  queryId: string,
  resolvedBy: string,
  resolutionNote?: string
): Promise<void> {
  const docRef = adminDb.collection("staff").doc(staffId).collection("hr_queries").doc(queryId);
  await docRef.update({
    status: "RESOLVED",
    resolvedAtMs: Date.now(),
    resolvedBy,
    resolutionNote: resolutionNote ? resolutionNote.trim() : null,
    resolvedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Updates self-service editable profile fields for a staff member.
 * Supports emergencyContact, dateOfBirth, bloodGroup, and photoUrl.
 */
export async function updateOwnProfile(
  staffId: string,
  data: { emergencyContact?: string; photoUrl?: string; dateOfBirth?: string; bloodGroup?: string }
): Promise<{ ok: boolean; error?: string }> {
  const staffRef = adminDb.collection("staff").doc(staffId);
  const snap = await staffRef.get();
  if (!snap.exists) {
    return { ok: false, error: "Staff member not found." };
  }

  const payload: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.emergencyContact !== undefined) {
    payload.emergencyContact = data.emergencyContact.trim();
  }

  if (data.dateOfBirth !== undefined) {
    payload.dateOfBirth = data.dateOfBirth.trim();
  }

  if (data.bloodGroup !== undefined) {
    payload.bloodGroup = data.bloodGroup.trim();
  }

  if (data.photoUrl !== undefined) {
    payload.photoUrl = data.photoUrl.trim();
  }

  await staffRef.update(payload);
  return { ok: true };
}


