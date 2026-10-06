"use server";

import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { randomUUID } from "crypto";
import {
  requireRole,
  requireEditAccess,
  requireStaffSelf,
  assertTenantScope,
  assertStoreScope,
  requireRoutePlan,
} from "@/lib/rbac";
import {
  markAttendanceSchema,
  applyLeaveSchema,
  createSalaryStructureSchema,
  createRegularizationSchema,
  attendanceSettingsSchema,
  createHrQuerySchema,
  resolveHrQuerySchema,
  AttendanceStatus,
  LeaveType,
  RegularizationType,
} from "@/lib/schemas/hr-schema";
import { auth } from "@/lib/auth";
import {
  getStaffDoc,
  getStaffByAuthUid,
  getStaffByEmail,
  saveAttendanceRecord,
  getStaffAttendanceSummary,
  createLeaveRecord,
  updateLeaveStatus,
  appendSalaryStructure,
  getStaffLeaves,
  getStaffSalaryHistory,
  getPendingLeavesAcrossStaff,
  recordGeoPing,
  remoteCheckIn,
  applyLateAbsentPenalty,
  createRegularizationRecord,
  getStaffRegularizations,
  getPendingRegularizationsAcrossStaff,
  updateRegularizationStatus,
  getOrCreateStaffLeaveBalance,
  deductStaffLeaveBalance,
  getAttendanceSettings,
  saveAttendanceSettings,
  getTodaysCelebrations,
  createHrQueryRecord,
  getStaffHrQueries,
  getPendingHrQueriesAcrossStaff,
  getHrQueriesHistoryAcrossStaff,
  getLeavesHistoryAcrossStaff,
  getRegularizationsHistoryAcrossStaff,
  bulkRegularizeDate,
  updateStaffShiftProfile,
  resolveHrQueryRecord,
  markAbsentees,
  updateOwnProfile as updateOwnProfileService,
} from "@/lib/services/hr-service";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { serializeFirestoreDoc } from "@/lib/utils/serialize-firestore";



// =========================================================================
// 1. MARK ATTENDANCE
// =========================================================================
export async function markAttendance(
  staffId: string,
  date: string,
  status: AttendanceStatus,
  checkInMs?: number | null,
  checkOutMs?: number | null
) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  // Multi-tenant scope check
  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  // Store scope check: Managers can only mark attendance for staff in their own store/branch
  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const actorEmail = session.user?.email || (session.user as any)?.id || "System";

  const validation = markAttendanceSchema.safeParse({
    staffId,
    date,
    status,
    checkInMs: checkInMs ?? null,
    checkOutMs: checkOutMs ?? null,
    branchCode: staff.branchCode || storeId || "HQ",
    tenantId: staff.tenantId || tenantId || "",
    markedBy: actorEmail,
  });

  if (!validation.success) {
    return {
      ok: false,
      error: validation.error.issues[0]?.message || "Invalid attendance data.",
    };
  }

  await saveAttendanceRecord(staffId, {
    date,
    checkInMs: checkInMs ?? null,
    checkOutMs: checkOutMs ?? null,
    status,
    branchCode: staff.branchCode,
    tenantId: staff.tenantId,
    markedBy: actorEmail,
  });

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_ATTENDANCE_MARKED",
    actionType: "HR_ATTENDANCE_MARKED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}`,
    targetId: staffId,
    details: `Marked attendance for staff ${staff.name || staffId} (${staff.empId}) as ${status} for date ${date}.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, message: `Attendance marked as ${status} for ${date}.` };
}

// =========================================================================
// 2. APPLY LEAVE
// =========================================================================
export async function applyLeave(
  staffIdParam: string,
  fromDate: string,
  toDate: string,
  type: LeaveType,
  reason: string
) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  let staffId: string;
  let staff: any;
  let actorEmail: string;

  if ((session.user as any).authMethod === "otp") {
    // OTP session: strictly use requireStaffSelf() and IGNORE staffIdParam
    const staffSelf = await requireStaffSelf();
    staffId = staffSelf.staffId;
    staff = { id: staffSelf.staffId, ...staffSelf.staffDoc };
    actorEmail = session.user?.email || staffSelf.staffDoc?.phone || staffId;
  } else {
    // Admin / Manager email session: apply on behalf of staff
    const { session: adminSession, role, tenantId, storeId } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
      "auditor",
    ]);
    staffId = staffIdParam;
    staff = await getStaffDoc(staffId);
    if (!staff) {
      return { ok: false, error: "Staff member not found." };
    }
    if (role !== "super_admin" && tenantId) {
      assertTenantScope(tenantId, staff.tenantId);
    }
    if (role === "manager") {
      const managerStore = (storeId || (adminSession.user as any)?.storeId || "").toUpperCase().trim();
      const staffBranch = (staff.branchCode || "").toUpperCase().trim();
      assertStoreScope(managerStore, staffBranch);
    }
    actorEmail = adminSession.user?.email || "Admin";
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  // Calculate requested leave days
  const startObj = new Date(fromDate);
  const endObj = new Date(toDate);
  const leaveDays = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // Validate leave balance quota if PL, SL, or CL
  if (type === "PL" || type === "SL" || type === "CL") {
    const balance = await getOrCreateStaffLeaveBalance(staffId, staff.tenantId);
    const totalAllocated = type === "PL" ? balance.PL : type === "SL" ? balance.SL : balance.CL;
    const usedAllocated = type === "PL" ? balance.usedPL : type === "SL" ? balance.usedSL : balance.usedCL;
    const availableQuota = totalAllocated - usedAllocated;

    if (availableQuota < leaveDays) {
      return {
        ok: false,
        error: `Insufficient ${type} balance. Requested ${leaveDays} day(s), but only ${availableQuota} day(s) remain in your quota.`,
      };
    }
  }

  const validation = applyLeaveSchema.safeParse({
    staffId,
    fromDate,
    toDate,
    type,
    status: "PENDING",
    reason,
    appliedAtMs: Date.now(),
    approvedBy: null,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
  });

  if (!validation.success) {
    return {
      ok: false,
      error: validation.error.issues[0]?.message || "Invalid leave application data.",
    };
  }

  const leaveId = await createLeaveRecord(staffId, {
    fromDate,
    toDate,
    type,
    status: "PENDING",
    reason: reason.trim(),
    appliedAtMs: Date.now(),
    approvedBy: null,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
  });

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_LEAVE_APPLIED",
    actionType: "HR_LEAVE_APPLIED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}`,
    targetId: staffId,
    leaveId,
    details: `Applied ${type} leave for staff ${staff.name || staffId} (${staff.empId}) from ${fromDate} to ${toDate} (${leaveDays} days): "${reason}".`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, leaveId, message: "Leave application submitted successfully." };
}

// =========================================================================
// 3. APPROVE LEAVE
// =========================================================================
export async function approveLeave(staffId: string, leaveId: string) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const actorEmail = session.user?.email || "Manager";

  // Fetch leave doc to calculate duration and deduct balance
  const leaveSnap = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("leaves")
    .doc(leaveId)
    .get();

  if (!leaveSnap.exists) {
    return { ok: false, error: "Leave application not found." };
  }

  const leaveData = leaveSnap.data()!;
  const startObj = new Date(leaveData.fromDate);
  const endObj = new Date(leaveData.toDate);
  const leaveDays = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // Deduct from quota on approval
  if (leaveData.type === "PL" || leaveData.type === "SL" || leaveData.type === "CL") {
    await deductStaffLeaveBalance(staffId, leaveData.type, leaveDays);
  }

  await updateLeaveStatus(staffId, leaveId, "APPROVED", actorEmail);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_LEAVE_APPROVED",
    actionType: "HR_LEAVE_APPROVED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}/leaves/${leaveId}`,
    targetId: leaveId,
    details: `Approved ${leaveData.type} leave (${leaveId}) for staff ${staff.name || staffId} (${staff.empId}) for ${leaveDays} day(s).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, message: "Leave approved successfully." };
}

// =========================================================================
// 3b. REJECT LEAVE
// =========================================================================
export async function rejectLeave(staffId: string, leaveId: string, rejectionReason?: string) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const actorEmail = session.user?.email || "Manager";

  await updateLeaveStatus(staffId, leaveId, "REJECTED", actorEmail);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_LEAVE_REJECTED",
    actionType: "HR_LEAVE_REJECTED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}/leaves/${leaveId}`,
    targetId: leaveId,
    details: `Rejected leave application (${leaveId}) for staff ${staff.name || staffId} (${staff.empId})${rejectionReason ? `: ${rejectionReason}` : ""}.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, message: "Leave rejected." };
}

// =========================================================================
// 4. GET ATTENDANCE SUMMARY
// =========================================================================
export async function getAttendanceSummary(staffId: string, month: string) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Unauthorized: Please log in.", summary: null };
  }

  // If called by staff member via OTP session or employee portal
  if ((session.user as any).authMethod === "otp" || (session.user as any).staffId) {
    const staffSelf = await requireStaffSelf();
    const effectiveStaffId = staffSelf.staffId;
    if (staffId && staffId !== effectiveStaffId) {
      return { ok: false, error: "Access denied.", summary: null };
    }
    if (staffSelf.tenantId) {
      await requireRoutePlan(staffSelf.tenantId, "hr");
    }
    const summary = await getStaffAttendanceSummary(effectiveStaffId, month);
    return { ok: true, summary: serializeFirestoreDoc(summary) };
  }

  const { session: adminSession, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
    "cashier",
    "guard",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found.", summary: null };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  // Tenant Check
  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  // Store Check
  if (role === "manager") {
    const managerStore = (storeId || (adminSession.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  // Staff own view check
  if (role === "cashier" || role === "guard") {
    const callerUid = (adminSession.user as any)?.id || (adminSession.user as any)?.uid || adminSession.user?.email;
    const isSelf =
      callerUid === staffId ||
      (adminSession.user?.email && adminSession.user.email.toLowerCase() === staff.email?.toLowerCase());
    if (!isSelf) {
      return { ok: false, error: "Access denied.", summary: null };
    }
  }

  const summary = await getStaffAttendanceSummary(staffId, month);
  return { ok: true, summary: serializeFirestoreDoc(summary) };
}

// =========================================================================
// 5. SET SALARY STRUCTURE (tenant_admin / super_admin ONLY - never manager)
// =========================================================================
export async function setSalaryStructure(
  staffId: string,
  baseSalary: number,
  effectiveFrom: string | number | Date
) {
  // STRICT: tenant_admin / super_admin ONLY (Manager is explicitly prohibited)
  const { session, role, tenantId } = await requireEditAccess(["super_admin", "tenant_admin"]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  const effectiveFromMs =
    typeof effectiveFrom === "number"
      ? effectiveFrom
      : effectiveFrom instanceof Date
      ? effectiveFrom.getTime()
      : new Date(effectiveFrom).getTime();

  if (isNaN(effectiveFromMs)) {
    return { ok: false, error: "Invalid effectiveFrom date format." };
  }

  const actorEmail = session.user?.email || "Admin";

  const validation = createSalaryStructureSchema.safeParse({
    staffId,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode || "HQ",
    baseSalary: Number(baseSalary),
    effectiveFromMs,
    createdBy: actorEmail,
    createdAtMs: Date.now(),
  });

  if (!validation.success) {
    return {
      ok: false,
      error: validation.error.issues[0]?.message || "Invalid salary structure data.",
    };
  }

  // Always append new doc - history preserved
  const structureId = await appendSalaryStructure({
    staffId,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode || "HQ",
    baseSalary: Number(baseSalary),
    effectiveFromMs,
    createdBy: actorEmail,
    createdAtMs: Date.now(),
  });

  // Audit Log with WARNING severity for sensitive salary modifications
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_SALARY_UPDATED",
    actionType: "HR_SALARY_UPDATED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}`,
    targetId: staffId,
    salaryStructureId: structureId,
    details: `Updated salary structure for staff ${staff.name || staffId} (${staff.empId}) to ₹${baseSalary.toLocaleString("en-IN")} effective from ${new Date(effectiveFromMs).toISOString().split("T")[0]}.`,
    severity: "WARNING", // Sensitive action!
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return {
    ok: true,
    structureId,
    message: "Salary structure updated successfully.",
  };
}

// =========================================================================
// HELPER ACTIONS FOR RETRIEVAL
// =========================================================================
export async function getStaffLeavesAction(staffId: string) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
    "cashier",
    "guard",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) return { ok: false, error: "Staff member not found.", leaves: [] };

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const leaves = await getStaffLeaves(staffId);
  return { ok: true, leaves };
}

export async function getStaffSalaryHistoryAction(staffId: string) {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "auditor"]);

  const staff = await getStaffDoc(staffId);
  if (!staff) return { ok: false, error: "Staff member not found.", history: [] };

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  const history = await getStaffSalaryHistory(staffId, tenantId);
  return { ok: true, history };
}

export async function getPendingLeavesAction() {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const pendingLeaves = await getPendingLeavesAcrossStaff(effectiveTenantId, effectiveStoreId);
  return { ok: true, pendingLeaves };
}

// =========================================================================
// 6. RECORD GEO PING (Employee Self-Attendance Action)
// =========================================================================
export async function recordGeoPingAction(
  latitude: number,
  longitude: number,
  timestampMs?: number,
  selfieUrl?: string | null
) {
  const staff = await requireStaffSelf();

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const effectiveTimestamp = timestampMs || Date.now();
  const res = await recordGeoPing(staff.staffId, latitude, longitude, effectiveTimestamp, selfieUrl);
  return res;
}

// =========================================================================
// 6B. REMOTE CHECK-IN (Employee Self-Attendance Action - Policy Gated)
// =========================================================================
export async function remoteCheckInAction(
  reason?: string,
  timestampMs?: number,
  selfieUrl?: string | null
) {
  const staff = await requireStaffSelf();

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  try {
    const res = await remoteCheckIn(staff.staffId, timestampMs, reason, selfieUrl);

    // Audit log
    await adminDb.collection("admin_audit_logs").add({
      actorId: (staff.session.user as any)?.id || (staff.session.user as any)?.uid || staff.session.user?.email || staff.staffId,
      actorEmail: staff.session.user?.email || staff.staffDoc?.phone || "unknown",
      action: "HR_REMOTE_CHECKIN",
      tenantId: staff.tenantId,
      branchCode: staff.branchCode || null,
      details: {
        staffId: staff.staffId,
        staffName: staff.staffDoc?.name,
        timestampMs: res.checkInMs,
        reason: reason || null,
        selfieUrl: res.selfieUrl || null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    revalidatePath("/employee");
    revalidatePath("/hr");
    revalidatePath("/manager");

    return { ok: true, status: res.status, checkInMs: res.checkInMs, selfieUrl: res.selfieUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to complete remote check-in." };
  }
}

// =========================================================================
// 6C. UPLOAD ATTENDANCE SELFIE (Employee Self-Attendance Action)
// =========================================================================
export async function uploadAttendanceSelfieAction(base64Image: string, date?: string) {
  const staff = await requireStaffSelf();
  const staffId = staff.staffId;

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  try {
    const effectiveDate = date || new Date().toISOString().split("T")[0];
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    if (buffer.length > 5 * 1024 * 1024) {
      return { ok: false, error: "Selfie image file too large. Max 5MB allowed." };
    }

    const token = randomUUID();
    const storagePath = `attendance_selfies/${staff.tenantId}/${staffId}/${effectiveDate}.jpg`;
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: token,
          staffId,
          tenantId: staff.tenantId,
          date: effectiveDate,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${token}`;

    return { ok: true, selfieUrl: downloadUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to upload attendance selfie photo." };
  }
}

// =========================================================================
// 7. SUBMIT REGULARIZATION (Employee Self-Service Action)
// =========================================================================
export async function submitRegularization(
  date: string,
  requestType: RegularizationType,
  reason: string
) {
  const staff = await requireStaffSelf();
  const staffId = staff.staffId;

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const actorEmail = staff.session.user?.email || staff.staffDoc?.phone || staffId;

  const validation = createRegularizationSchema.safeParse({
    staffId,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    date,
    requestType,
    reason,
    status: "PENDING",
    appliedAtMs: Date.now(),
    approvedBy: null,
  });

  if (!validation.success) {
    return {
      ok: false,
      error: validation.error.issues[0]?.message || "Invalid regularization data.",
    };
  }

  const reqId = await createRegularizationRecord(staffId, {
    staffId,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    date,
    requestType,
    reason: reason.trim(),
    originalStatus: "ABSENT",
    requestedStatus: "PRESENT",
    status: "PENDING",
    appliedAtMs: Date.now(),
    resolvedAtMs: null,
    approvedBy: null,
  });

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_REGULARIZATION_APPLIED",
    actionType: "HR_REGULARIZATION_APPLIED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}`,
    targetId: staffId,
    regularizationId: reqId,
    details: `Applied regularization (${requestType}) for staff ${staff.staffDoc?.name || staffId} (${staff.staffDoc?.empId || ""}) on date ${date}: "${reason}".`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, reqId, message: "Attendance regularization submitted successfully." };
}

// =========================================================================
// 8. APPROVE REGULARIZATION
// =========================================================================
export async function approveRegularization(staffId: string, reqId: string) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    const callerUid = (session.user as any)?.id || (session.user as any)?.uid;
    const isDirectReport = staff.reportsToStaffId && staff.reportsToStaffId === callerUid;
    if (!isDirectReport && managerStore !== staffBranch) {
      assertStoreScope(managerStore, staffBranch);
    }
  }

  const actorEmail = session.user?.email || "Manager";

  const reqSnap = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("regularizations")
    .doc(reqId)
    .get();

  if (!reqSnap.exists) {
    return { ok: false, error: "Regularization request not found." };
  }

  const reqData = reqSnap.data()!;

  // Update regularization status
  await updateRegularizationStatus(staffId, reqId, "APPROVED", actorEmail);

  // Update attendance to PRESENT
  await saveAttendanceRecord(staffId, {
    date: reqData.date,
    status: "PRESENT",
    checkInMs: reqData.checkInMs || null,
    checkOutMs: reqData.checkOutMs || null,
    branchCode: staff.branchCode,
    tenantId: staff.tenantId,
    markedBy: actorEmail,
  });

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_REGULARIZATION_APPROVED",
    actionType: "HR_REGULARIZATION_APPROVED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}/regularizations/${reqId}`,
    targetId: reqId,
    details: `Approved regularization (${reqData.requestType}) for staff ${staff.name || staffId} (${staff.empId}) for date ${reqData.date}. Attendance marked PRESENT.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, message: "Regularization approved and attendance updated." };
}

// =========================================================================
// 9. REJECT REGULARIZATION
// =========================================================================
export async function rejectRegularization(
  staffId: string,
  reqId: string,
  rejectionReason?: string
) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    const callerUid = (session.user as any)?.id || (session.user as any)?.uid;
    const isDirectReport = staff.reportsToStaffId && staff.reportsToStaffId === callerUid;
    if (!isDirectReport && managerStore !== staffBranch) {
      assertStoreScope(managerStore, staffBranch);
    }
  }

  const actorEmail = session.user?.email || "Manager";

  await updateRegularizationStatus(staffId, reqId, "REJECTED", actorEmail);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_REGULARIZATION_REJECTED",
    actionType: "HR_REGULARIZATION_REJECTED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}/regularizations/${reqId}`,
    targetId: reqId,
    details: `Rejected regularization request (${reqId}) for staff ${staff.name || staffId} (${staff.empId})${rejectionReason ? `: ${rejectionReason}` : ""}.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
  revalidatePath("/staff");
  revalidatePath("/hr");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, message: "Regularization request rejected." };
}

// =========================================================================
// 10. GET REGULARIZATIONS & LEAVE BALANCES
// =========================================================================
export async function getStaffRegularizationsAction() {
  const staff = await requireStaffSelf();

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const regularizations = await getStaffRegularizations(staff.staffId);
  return { ok: true, regularizations };
}

export async function getPendingRegularizationsAction() {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const pendingRegularizations = await getPendingRegularizationsAcrossStaff(
    effectiveTenantId,
    effectiveStoreId
  );
  return { ok: true, pendingRegularizations };
}

export async function getStaffLeaveBalanceAction() {
  const staff = await requireStaffSelf();

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const balance = await getOrCreateStaffLeaveBalance(staff.staffId, staff.tenantId);
  return { ok: true, balance: serializeFirestoreDoc(balance) };
}

// =========================================================================
// 11. GET EMPLOYEE DASHBOARD DATA (Combined Full Load for Employee App)
// =========================================================================
export async function getEmployeeDashboardDataAction() {
  const staffSelf = await requireStaffSelf();
  const staffId = staffSelf.staffId;
  const staff: any = { id: staffId, ...(staffSelf.staffDoc || {}) };
  if (!staff.dateOfJoining && staff.createdAt) {
    try {
      const createdDate = (staff.createdAt as any)?.toDate ? (staff.createdAt as any).toDate() : new Date(staff.createdAt as any);
      staff.dateOfJoining = createdDate.toISOString().split("T")[0];
    } catch {
      // fallback
    }
  }

  if (staffSelf.tenantId) {
    await requireRoutePlan(staffSelf.tenantId, "hr");
  }

  // Get store details for geofence
  let store: any = null;
  if (staffSelf.branchCode) {
    const storeDoc = await adminDb.collection("stores").doc(staffSelf.branchCode).get();
    if (storeDoc.exists) {
      store = { id: storeDoc.id, ...storeDoc.data() };
    } else {
      // Query by code
      const storeSnap = await adminDb
        .collection("stores")
        .where("code", "==", staffSelf.branchCode)
        .limit(1)
        .get();
      if (!storeSnap.empty) {
        store = { id: storeSnap.docs[0].id, ...storeSnap.docs[0].data() };
      }
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const attendanceDoc = await adminDb
    .collection("staff")
    .doc(staffId)
    .collection("attendance")
    .doc(today)
    .get();

  const todayAttendance = attendanceDoc.exists ? (attendanceDoc.data() as any) : null;
  const leaveBalance = await getOrCreateStaffLeaveBalance(staffId, staffSelf.tenantId);
  const leaves = await getStaffLeaves(staffId);
  const regularizations = await getStaffRegularizations(staffId);
  const settings = await getAttendanceSettings(staffSelf.tenantId);
  const todayCelebrations = await getTodaysCelebrations(staffSelf.tenantId, staffSelf.branchCode);
  const hrQueries = await getStaffHrQueries(staffId);

  return {
    ok: true,
    data: {
      staff: serializeFirestoreDoc(staff),
      store: store
        ? serializeFirestoreDoc({
            id: store.id,
            name: store.name,
            code: store.code,
            address: store.address,
            city: store.city,
            geoLatitude: store.geoLatitude ?? null,
            geoLongitude: store.geoLongitude ?? null,
            geoRadiusMeters: store.geoRadiusMeters ?? settings.geoRadiusMeters ?? 100,
          })
        : null,
      todayAttendance: serializeFirestoreDoc(todayAttendance),
      leaveBalance: serializeFirestoreDoc(leaveBalance),
      leaves: serializeFirestoreDoc(leaves.slice(0, 10)),
      regularizations: serializeFirestoreDoc(regularizations.slice(0, 10)),
      todayCelebrations: serializeFirestoreDoc(todayCelebrations),
      hrQueries: serializeFirestoreDoc(hrQueries.slice(0, 10)),
      settings: serializeFirestoreDoc({
        allowRemoteCheckIn: settings.allowRemoteCheckIn,
        requireSelfieOnCheckIn: settings.requireSelfieOnCheckIn,
        shiftStartTime: settings.shiftStartTime,
        shiftEndTime: settings.shiftEndTime,
        weeklyOffDays: settings.weeklyOffDays,
        gracePeriodMinutes: settings.gracePeriodMinutes,
      }),
    },
  };
}

// =========================================================================
// 12. ATTENDANCE SETTINGS (Configurable per Tenant)
// =========================================================================
export async function getAttendanceSettingsAction(tenantId?: string) {
  const { role, tenantId: sessionTenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantId || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID required.", settings: null };
  }

  if (role !== "super_admin" && tenantId && tenantId !== sessionTenantId) {
    return { ok: false, error: "Unauthorized tenant access.", settings: null };
  }

  await requireRoutePlan(effectiveTenantId, "hr");

  const settings = await getAttendanceSettings(effectiveTenantId);
  return { ok: true, settings: serializeFirestoreDoc(settings) };
}

export async function updateAttendanceSettingsAction(tenantId: string | undefined, rawSettings: unknown) {
  const { session, role, tenantId: sessionTenantId } = await requireEditAccess([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantId || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID required." };
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(sessionTenantId, tenantId);
  }

  await requireRoutePlan(effectiveTenantId, "hr");

  const parsed = attendanceSettingsSchema.safeParse(rawSettings);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid attendance settings.",
    };
  }

  const actorEmail = session.user?.email || (session.user as any)?.uid || "Admin";

  await saveAttendanceSettings(effectiveTenantId, parsed.data, actorEmail);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_ATTENDANCE_SETTINGS_UPDATED",
    actionType: "HR_ATTENDANCE_SETTINGS_UPDATED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: effectiveTenantId,
    target: `tenants/${effectiveTenantId}/settings/attendance`,
    details: `Updated attendance configuration: Shift (${parsed.data.shiftStartTime}-${parsed.data.shiftEndTime}), Grace (${parsed.data.gracePeriodMinutes}m), Radius (${parsed.data.geoRadiusMeters}m), Weekly Offs (${parsed.data.weeklyOffDays.join(",")}).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/manager");

  return { ok: true, message: "Attendance settings saved successfully." };
}

// =========================================================================
// 13. HR QUERY (Contact HR) SERVER ACTIONS
// =========================================================================

export async function submitHrQueryAction(subject: string, message: string) {
  const staff = await requireStaffSelf();

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const parsed = createHrQuerySchema.safeParse({ subject, message });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid HR query data.",
    };
  }

  const staffName = staff.staffDoc?.name || "Staff Member";
  const queryId = await createHrQueryRecord(staff.staffId, {
    staffId: staff.staffId,
    staffName,
    subject: parsed.data.subject,
    message: parsed.data.message,
    status: "OPEN",
    raisedAtMs: Date.now(),
    resolvedAtMs: null,
    resolvedBy: null,
    resolutionNote: null,
    tenantId: staff.tenantId || "",
    branchCode: staff.branchCode || "HQ",
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
  revalidatePath("/hr");

  return { ok: true, queryId, message: "Your query has been sent to HR / Management." };
}

export async function getPendingHrQueriesAction() {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const pendingQueries = await getPendingHrQueriesAcrossStaff(
    effectiveTenantId,
    effectiveStoreId
  );
  return { ok: true, pendingQueries: serializeFirestoreDoc(pendingQueries) };
}

export async function resolveHrQueryAction(
  staffId: string,
  queryId: string,
  resolutionNote?: string
) {
  const { session, role, tenantId, storeId } = await requireEditAccess([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const parsed = resolveHrQuerySchema.safeParse({ staffId, queryId, resolutionNote });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid query resolution data.",
    };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const actorEmail = session.user?.email || (session.user as any)?.uid || "Manager";
  await resolveHrQueryRecord(staffId, queryId, actorEmail, parsed.data.resolutionNote);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_QUERY_RESOLVED",
    actionType: "HR_QUERY_RESOLVED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}/hr_queries/${queryId}`,
    targetId: queryId,
    details: `Resolved HR query for staff ${staff.name} (${staff.empId}). Note: ${parsed.data.resolutionNote || "No note"}`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/manager");

  return { ok: true, message: "Query marked as resolved." };
}

// =========================================================================
// 15. MANUAL ABSENT MARKING TRIGGER (Tenant Admin / Super Admin)
// =========================================================================
export async function triggerMarkAbsentees(tenantId?: string, date?: string) {
  const { session, role, tenantId: sessionTenantId } = await requireEditAccess([
    "super_admin",
    "tenant_admin",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantId || sessionTenantId) : sessionTenantId;
  if (!effectiveTenantId) {
    return { ok: false, error: "Tenant ID required." };
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(sessionTenantId, tenantId);
  }

  await requireRoutePlan(effectiveTenantId, "hr");

  const targetDate = date || new Date().toISOString().split("T")[0];
  const { markedCount } = await markAbsentees(effectiveTenantId, targetDate);

  const actorEmail = session.user?.email || (session.user as any)?.uid || "Admin";

  await adminDb.collection("admin_audit_logs").add({
    action: "HR_ABSENT_MARKING_TRIGGERED",
    actionType: "HR_ABSENT_MARKING_TRIGGERED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: effectiveTenantId,
    target: `tenants/${effectiveTenantId}/attendance/${targetDate}`,
    details: `Triggered manual absent marking for date ${targetDate}. Result: ${markedCount} staff marked ABSENT.`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");

  return { ok: true, markedCount, date: targetDate };
}

export async function triggerMarkAbsenteesAction(tenantId?: string, date?: string) {
  return triggerMarkAbsentees(tenantId, date);
}

// =========================================================================
// 16. UPDATE OWN PROFILE (Employee Self-Service Action)
// =========================================================================
export async function updateOwnProfile(
  staffId: string,
  payload: {
    emergencyContact?: string;
    photoBase64?: string;
    photoUrl?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
  }
) {
  const staffSelf = await requireStaffSelf();

  if (staffSelf.staffId !== staffId) {
    return { ok: false, error: "Unauthorized: You can only edit your own profile." };
  }

  if (staffSelf.tenantId) {
    await requireRoutePlan(staffSelf.tenantId, "hr");
  }

  let finalPhotoUrl = payload.photoUrl;

  if (payload.photoBase64) {
    try {
      const cleanBase64 = payload.photoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      if (buffer.length > 5 * 1024 * 1024) {
        return { ok: false, error: "Photo file too large. Max 5MB allowed." };
      }

      const token = randomUUID();
      const storagePath = `staff_photos/${staffSelf.tenantId}/${staffId}/profile.jpg`;
      const bucket = adminStorage.bucket();
      const fileRef = bucket.file(storagePath);

      await fileRef.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            firebaseStorageDownloadTokens: token,
            staffId,
            tenantId: staffSelf.tenantId,
          },
        },
      });

      finalPhotoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        storagePath
      )}?alt=media&token=${token}`;
    } catch (err: any) {
      return { ok: false, error: err?.message || "Failed to upload profile photo." };
    }
  }

  const updateData: {
    emergencyContact?: string;
    photoUrl?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
  } = {};

  if (payload.emergencyContact !== undefined) {
    updateData.emergencyContact = payload.emergencyContact;
  }
  if (payload.dateOfBirth !== undefined) {
    updateData.dateOfBirth = payload.dateOfBirth;
  }
  if (payload.bloodGroup !== undefined) {
    updateData.bloodGroup = payload.bloodGroup;
  }
  if (finalPhotoUrl !== undefined) {
    updateData.photoUrl = finalPhotoUrl;
  }

  const res = await updateOwnProfileService(staffId, updateData);
  if (!res.ok) {
    return res;
  }

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "STAFF_OWN_PROFILE_UPDATED",
    actionType: "STAFF_OWN_PROFILE_UPDATED",
    actor: staffSelf.session.user?.email || staffId,
    actorId: staffId,
    tenantId: staffSelf.tenantId,
    target: `staff/${staffId}`,
    details: `Staff member updated own profile (Emergency contact / Photo).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/employee");
  return { ok: true, photoUrl: finalPhotoUrl };
}

export const updateOwnProfileAction = updateOwnProfile;

// =========================================================================
// 17. APPROVALS HISTORY & ARCHIVE (Monthly Maintained)
// =========================================================================

export async function getLeavesHistoryAction(month?: string, status?: string) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const leaves = await getLeavesHistoryAcrossStaff(
    effectiveTenantId,
    month || null,
    status || null,
    effectiveStoreId
  );

  return { ok: true, leaves: serializeFirestoreDoc(leaves) };
}

export async function getRegularizationsHistoryAction(month?: string, status?: string) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;
  const managerStaffId = role === "manager" ? ((session.user as any)?.id || (session.user as any)?.uid || null) : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const regularizations = await getRegularizationsHistoryAcrossStaff(
    effectiveTenantId,
    month || null,
    status || null,
    managerStaffId,
    effectiveStoreId
  );

  return { ok: true, regularizations: serializeFirestoreDoc(regularizations) };
}

export async function getHrQueriesHistoryAction(month?: string, status?: string) {
  const { role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "auditor",
  ]);

  const effectiveTenantId = role === "super_admin" ? null : tenantId;
  const effectiveStoreId = role === "manager" ? storeId : null;

  if (effectiveTenantId) {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const queries = await getHrQueriesHistoryAcrossStaff(
    effectiveTenantId,
    month || null,
    status || null,
    effectiveStoreId
  );

  return { ok: true, queries: serializeFirestoreDoc(queries) };
}

// =========================================================================
// 18. BULK REGULARIZE FALSE-ABSENTS FOR A SPECIFIC DATE (e.g. 2026-10-02)
// =========================================================================

export async function bulkRegularizeDateAction(
  date: string,
  reason: string,
  updatedStatus: AttendanceStatus = "PRESENT"
) {
  const { session, role, tenantId } = await requireEditAccess([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  if (!tenantId && role !== "super_admin") {
    return { ok: false, error: "Tenant ID required." };
  }

  const effectiveTenantId = tenantId || "DEFAULT";
  if (effectiveTenantId && effectiveTenantId !== "DEFAULT") {
    await requireRoutePlan(effectiveTenantId, "hr");
  }

  const actorEmail = session.user?.email || "Admin";

  const result = await bulkRegularizeDate(
    effectiveTenantId,
    date,
    reason || "Bulk Regularized by Admin",
    updatedStatus,
    actorEmail
  );

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "HR_BULK_ATTENDANCE_REGULARIZED",
    actionType: "HR_BULK_ATTENDANCE_REGULARIZED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: effectiveTenantId,
    target: `tenants/${effectiveTenantId}/attendance/${date}`,
    details: `Bulk regularized ${result.regularizedCount} staff for date ${date} as ${updatedStatus} (${reason}).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/manager");
  revalidatePath("/staff");

  return {
    ok: true,
    regularizedCount: result.regularizedCount,
    staffNames: result.staffNames,
    message: `Successfully regularized ${result.regularizedCount} staff members for ${date}.`,
  };
}

// =========================================================================
// 19. UPDATE STAFF SHIFT & WEEKLY-OFF PROFILE
// =========================================================================

export async function updateStaffShiftProfileAction(
  staffId: string,
  payload: {
    weeklyOffDay?: string;
    attendanceMode?: "GEO_AUTO" | "MANUAL";
    shiftStartOverride?: string;
    shiftEndOverride?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
  }
): Promise<{ ok: boolean; success: boolean; message?: string; error?: string }> {
  const { session, role, tenantId, storeId } = await requireEditAccess([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, success: false, error: "Staff not found" };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const res = await updateStaffShiftProfile(staffId, payload);
  if (!res.ok) {
    return res;
  }

  const actorEmail = session.user?.email || "Manager";

  await adminDb.collection("admin_audit_logs").add({
    action: "HR_STAFF_SHIFT_PROFILE_UPDATED",
    actionType: "HR_STAFF_SHIFT_PROFILE_UPDATED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: staff.tenantId,
    branchCode: staff.branchCode,
    target: `staff/${staffId}`,
    details: `Updated shift profile for staff ${staff.name || staffId} (Shift: ${payload.shiftStartOverride || payload.shiftStartTime || "Default"} to ${payload.shiftEndOverride || payload.shiftEndTime || "Default"}, Weekly-off: ${payload.weeklyOffDay || "Default"}, Mode: ${payload.attendanceMode || "GEO_AUTO"}).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/staff");
  revalidatePath(`/staff/${staffId}`);

  return { ok: true, success: true, message: "Staff shift profile updated successfully." };
}




