import { adminDb } from "@/lib/firebase-admin";
import {
  AttendanceDocument,
  AttendanceStatus,
  LeaveDocument,
  SalaryStructureDocument,
  RegularizationDocument,
  RegularizationStatus,
  LeaveBalanceDocument,
} from "@/lib/schemas/hr-schema";
import { haversineDistanceMeters } from "@/lib/utils/geo";
import { FieldValue } from "firebase-admin/firestore";

export type AttendanceSummary = {
  staffId: string;
  month: string; // YYYY-MM
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
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
  dateOfBirth?: string;
  dateOfJoining?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  photoUrl?: string;
};

/**
 * Fetches staff document and validates existence
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
    dateOfBirth: data.dateOfBirth ?? "",
    dateOfJoining: data.dateOfJoining ?? "",
    emergencyContact: data.emergencyContact ?? "",
    bloodGroup: data.bloodGroup ?? "",
    photoUrl: data.photoUrl ?? "",
  };
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

  const records: AttendanceDocument[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as AttendanceDocument;
    records.push(data);

    switch (data.status) {
      case "PRESENT":
      case "LATE":
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

  return {
    staffId,
    month,
    present,
    absent,
    halfDay,
    leave,
    totalRecords: records.length,
    records,
  };
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
 * Processes periodic GPS ping for staff geo-attendance.
 * Enforces anti-spoofing velocity validation and re-entrant attendance lifecycle.
 */
export async function recordGeoPing(
  staffId: string,
  latitude: number,
  longitude: number,
  timestampMs: number
): Promise<{
  ok: boolean;
  status?: AttendanceStatus;
  isInside?: boolean;
  distanceMeters?: number;
  checkInMs?: number | null;
  checkOutMs?: number | null;
  error?: string;
}> {
  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
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
  const storeRadius = Number(storeData.geoRadiusMeters ?? storeData.location?.geoRadiusMeters ?? 100);

  if (storeLat === null || storeLat === undefined || storeLng === null || storeLng === undefined) {
    return { ok: false, error: "STORE_GEOFENCE_NOT_CONFIGURED" };
  }

  const distance = haversineDistanceMeters(latitude, longitude, Number(storeLat), Number(storeLng));
  const isInside = distance <= storeRadius;

  const dateStr = new Date(timestampMs).toISOString().split("T")[0];
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

  // Attendance Lifecycle State Engine
  if (!existing) {
    if (isInside) {
      // First detection inside -> Check-in
      const dateObj = new Date(timestampMs);
      const hours = dateObj.getHours();
      const minutes = dateObj.getMinutes();
      const isLate = hours > 9 || (hours === 9 && minutes > 45); // 09:45 AM threshold
      const initialStatus: AttendanceStatus = isLate ? "LATE" : "PRESENT";

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
    };
  }
}

/**
 * Scheduled/cron absentee batch job.
 * Note: Wire to Google Cloud Scheduler or Next.js cron route (e.g. /api/cron/mark-absentees).
 */
export async function markAbsentees(
  tenantId: string,
  date: string
): Promise<{ markedCount: number }> {
  const staffSnap = await adminDb
    .collection("staff")
    .where("tenantId", "==", tenantId)
    .where("isActive", "==", true)
    .where("isDeleted", "==", false)
    .get();

  let markedCount = 0;
  const batch = adminDb.batch();

  for (const doc of staffSnap.docs) {
    const staffId = doc.id;
    const staffData = doc.data();
    const attRef = adminDb.collection("staff").doc(staffId).collection("attendance").doc(date);
    const attSnap = await attRef.get();

    if (!attSnap.exists) {
      batch.set(attRef, {
        date,
        checkInMs: null,
        checkOutMs: null,
        status: "ABSENT",
        source: "GEO_AUTO",
        branchCode: staffData.branchCode || "HQ",
        tenantId,
        markedBy: "CRON_ABSENTEE_SYSTEM",
        createdAt: FieldValue.serverTimestamp(),
      });
      markedCount++;
    }
  }

  if (markedCount > 0) {
    await batch.commit();
  }

  return { markedCount };
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

