import { adminDb } from "@/lib/firebase-admin";

export type StaffRow = {
  id: string;
  empId: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  branchCode: string;
  isActive: boolean;
  status: string;
  suspendedReason?: string;
  trustScore: number;
  tenantId?: string;
  authUid?: string | null;
  boundDeviceId?: string | null;
  boundDeviceLabel?: string | null;
  boundAtMs?: number | null;
  dateOfBirth?: string;
  dateOfJoining?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  photoUrl?: string;
  registeredDeviceFingerprint?: string | null;
  suspiciousCheckInCount?: number;
  reportsToStaffId?: string | null;
  weeklyOffDay?: string;
  weeklyOffDays?: (number | string)[];
  shiftStartOverride?: string;
  shiftEndOverride?: string;
  customShiftStartTime?: string;
  customShiftEndTime?: string;
  attendanceMode?: "GEO_AUTO" | "MANUAL";
};

export async function getStaffList(role: string, tenantId: string | null, storeId: string | null, roleFilter: string): Promise<StaffRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("staff").where("isDeleted", "==", false);

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (storeId) query = query.where("branchCode", "==", storeId);
  if (roleFilter !== "ALL") {
    query = query.where("role", "in", [roleFilter.toUpperCase(), roleFilter.toLowerCase()]);
  }

  const snap = await query.orderBy("createdAt", "desc").limit(50).get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    const isActive = data.isActive !== false;
    const rawStatus = (data.status || (isActive ? "ACTIVE" : "SUSPENDED")).toUpperCase();
    return {
      id: doc.id,
      empId: data.empId ?? "",
      name: data.name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      role: data.role ?? "",
      branchCode: data.branchCode ?? "",
      isActive: isActive && rawStatus === "ACTIVE",
      status: rawStatus,
      suspendedReason: data.suspendedReason ?? undefined,
      trustScore: typeof data.trustScore === "number" ? data.trustScore : 100,
      tenantId: data.tenantId ?? "",
      authUid: data.authUid ?? null,
      boundDeviceId: data.boundDeviceId ?? null,
      boundDeviceLabel: data.boundDeviceLabel ?? null,
      boundAtMs: data.boundAtMs ?? null,
      dateOfBirth: data.dateOfBirth ?? "",
      dateOfJoining: data.dateOfJoining ?? "",
      emergencyContact: data.emergencyContact ?? "",
      bloodGroup: data.bloodGroup ?? "",
      photoUrl: data.photoUrl ?? "",
      registeredDeviceFingerprint: data.registeredDeviceFingerprint ?? null,
      suspiciousCheckInCount: typeof data.suspiciousCheckInCount === "number" ? data.suspiciousCheckInCount : (data.suspiciousCheckinCount30d || 0),
      reportsToStaffId: data.reportsToStaffId ?? null,
      weeklyOffDay: data.weeklyOffDay ?? data.weeklyOff ?? undefined,
      weeklyOffDays: Array.isArray(data.weeklyOffDays) ? data.weeklyOffDays : undefined,
      shiftStartOverride: data.shiftStartOverride ?? data.customShiftStartTime ?? undefined,
      shiftEndOverride: data.shiftEndOverride ?? data.customShiftEndTime ?? undefined,
      customShiftStartTime: data.customShiftStartTime ?? data.shiftStartOverride ?? undefined,
      customShiftEndTime: data.customShiftEndTime ?? data.shiftEndOverride ?? undefined,
      attendanceMode: data.attendanceMode === "MANUAL" ? "MANUAL" : "GEO_AUTO",
    };
  });
}