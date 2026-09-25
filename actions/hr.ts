"use server";

import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { randomUUID } from "crypto";
import {
  requireRole,
  requireEditAccess,
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
  AttendanceStatus,
  LeaveType,
  RegularizationType,
} from "@/lib/schemas/hr-schema";
import { auth } from "@/lib/auth";
import {
  getStaffDoc,
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
} from "@/lib/services/hr-service";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

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
  staffId: string,
  fromDate: string,
  toDate: string,
  type: LeaveType,
  reason: string
) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
    "guard",
    "auditor",
  ]);

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const callerUid = (session.user as any)?.id || (session.user as any)?.uid || session.user?.email;

  // Operational staff can ONLY apply for their own leave
  if (role === "cashier" || role === "guard" || role === "auditor") {
    const isSelf =
      callerUid === staffId ||
      (session.user?.email && session.user.email.toLowerCase() === staff.email.toLowerCase()) ||
      ((session.user as any)?.empId && (session.user as any).empId === staff.empId);

    if (!isSelf) {
      return { ok: false, error: "Staff members can only apply for their own leaves." };
    }
  }

  // Tenant Isolation
  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  // Manager Store Scope
  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const actorEmail = session.user?.email || callerUid || "Self";

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
  const { session, role, tenantId, storeId } = await requireRole([
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
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  // Staff own view check
  if (role === "cashier" || role === "guard") {
    const callerUid = (session.user as any)?.id || (session.user as any)?.uid || session.user?.email;
    const isSelf =
      callerUid === staffId ||
      (session.user?.email && session.user.email.toLowerCase() === staff.email.toLowerCase());
    if (!isSelf) {
      return { ok: false, error: "Access denied.", summary: null };
    }
  }

  const summary = await getStaffAttendanceSummary(staffId, month);
  return { ok: true, summary };
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
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const staffId = (session.user as any)?.id || (session.user as any)?.uid;
  if (!staffId) {
    return { ok: false, error: "STAFF_ID_NOT_RESOLVED" };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "STAFF_NOT_FOUND" };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const effectiveTimestamp = timestampMs || Date.now();
  const res = await recordGeoPing(staffId, latitude, longitude, effectiveTimestamp, selfieUrl);
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
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const staffId = (session.user as any)?.id || (session.user as any)?.uid;
  if (!staffId) {
    return { ok: false, error: "STAFF_ID_NOT_RESOLVED" };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "STAFF_NOT_FOUND" };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  try {
    const res = await remoteCheckIn(staffId, timestampMs, reason, selfieUrl);

    // Audit log
    await adminDb.collection("admin_audit_logs").add({
      actorId: (session.user as any)?.id || (session.user as any)?.uid || session.user?.email || "unknown",
      actorEmail: session.user?.email || "unknown",
      action: "HR_REMOTE_CHECKIN",
      tenantId: staff.tenantId,
      branchCode: staff.branchCode || null,
      details: {
        staffId,
        staffName: staff.name,
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
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const staffId = (session.user as any)?.id || (session.user as any)?.uid;
  if (!staffId) {
    return { ok: false, error: "STAFF_ID_NOT_RESOLVED" };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "STAFF_NOT_FOUND" };
  }

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
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED" };
  }

  const staffId = (session.user as any)?.id || (session.user as any)?.uid;
  if (!staffId) {
    return { ok: false, error: "STAFF_ID_NOT_RESOLVED" };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found." };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const actorEmail = session.user?.email || staffId;

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
    details: `Applied regularization (${requestType}) for staff ${staff.name || staffId} (${staff.empId}) on date ${date}: "${reason}".`,
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
export async function getStaffRegularizationsAction(staffId?: string) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED", regularizations: [] };
  }

  const callerUid = (session.user as any)?.id || (session.user as any)?.uid;
  const targetStaffId = staffId || callerUid;

  if (!targetStaffId) {
    return { ok: false, error: "STAFF_ID_REQUIRED", regularizations: [] };
  }

  const staff = await getStaffDoc(targetStaffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found.", regularizations: [] };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const regularizations = await getStaffRegularizations(targetStaffId);
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

export async function getStaffLeaveBalanceAction(staffId?: string) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED", balance: null };
  }

  const callerUid = (session.user as any)?.id || (session.user as any)?.uid;
  const targetStaffId = staffId || callerUid;

  if (!targetStaffId) {
    return { ok: false, error: "STAFF_ID_REQUIRED", balance: null };
  }

  const staff = await getStaffDoc(targetStaffId);
  if (!staff) {
    return { ok: false, error: "Staff member not found.", balance: null };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  const balance = await getOrCreateStaffLeaveBalance(targetStaffId, staff.tenantId);
  return { ok: true, balance };
}

// =========================================================================
// 11. GET EMPLOYEE DASHBOARD DATA (Combined Full Load for Employee App)
// =========================================================================
export async function getEmployeeDashboardDataAction() {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "UNAUTHORIZED", data: null };
  }

  const staffId = (session.user as any)?.id || (session.user as any)?.uid;
  if (!staffId) {
    return { ok: false, error: "STAFF_ID_NOT_RESOLVED", data: null };
  }

  const staff = await getStaffDoc(staffId);
  if (!staff) {
    return { ok: false, error: "Staff profile not found.", data: null };
  }

  if (staff.tenantId) {
    await requireRoutePlan(staff.tenantId, "hr");
  }

  // Get store details for geofence
  let store: any = null;
  if (staff.branchCode) {
    const storeDoc = await adminDb.collection("stores").doc(staff.branchCode).get();
    if (storeDoc.exists) {
      store = { id: storeDoc.id, ...storeDoc.data() };
    } else {
      // Query by code
      const storeSnap = await adminDb
        .collection("stores")
        .where("code", "==", staff.branchCode)
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
  const leaveBalance = await getOrCreateStaffLeaveBalance(staffId, staff.tenantId);
  const leaves = await getStaffLeaves(staffId);
  const regularizations = await getStaffRegularizations(staffId);
  const settings = await getAttendanceSettings(staff.tenantId);

  return {
    ok: true,
    data: {
      staff,
      store: store
        ? {
            id: store.id,
            name: store.name,
            code: store.code,
            address: store.address,
            city: store.city,
            geoLatitude: store.geoLatitude ?? null,
            geoLongitude: store.geoLongitude ?? null,
            geoRadiusMeters: store.geoRadiusMeters ?? settings.geoRadiusMeters ?? 100,
          }
        : null,
      todayAttendance,
      leaveBalance,
      leaves: leaves.slice(0, 10),
      regularizations: regularizations.slice(0, 10),
      settings: {
        allowRemoteCheckIn: settings.allowRemoteCheckIn,
        requireSelfieOnCheckIn: settings.requireSelfieOnCheckIn,
        shiftStartTime: settings.shiftStartTime,
        shiftEndTime: settings.shiftEndTime,
        weeklyOffDays: settings.weeklyOffDays,
        gracePeriodMinutes: settings.gracePeriodMinutes,
      },
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
  return { ok: true, settings };
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


