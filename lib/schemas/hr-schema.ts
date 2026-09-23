import { z } from "zod";

// ==========================================
// 1. ATTENDANCE DATA MODEL & VALIDATION
// ==========================================

export const AttendanceStatusEnum = z.enum(["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "LATE"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusEnum>;

export const AttendanceSourceEnum = z.enum(["GEO_AUTO", "MANUAL"]);
export type AttendanceSource = z.infer<typeof AttendanceSourceEnum>;

export const markAttendanceSchema = z
  .object({
    staffId: z.string().trim().min(1, "Staff ID is required"),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    checkInMs: z.number().int().positive("Check-in timestamp must be positive").nullable().optional(),
    checkOutMs: z.number().int().positive("Check-out timestamp must be positive").nullable().optional(),
    status: AttendanceStatusEnum,
    source: AttendanceSourceEnum.default("MANUAL"),
    detectedLatitude: z.number().optional().nullable(),
    detectedLongitude: z.number().optional().nullable(),
    lastLocationState: z.enum(["INSIDE", "OUTSIDE"]).optional().nullable(),
    lastPingMs: z.number().optional().nullable(),
    lastPingLat: z.number().optional().nullable(),
    lastPingLng: z.number().optional().nullable(),
    branchCode: z.string().trim().min(1, "Branch code is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    markedBy: z.string().trim().min(1, "Marked by is required"),
  })
  .superRefine((data, ctx) => {
    // If status is PRESENT, LATE, or HALF_DAY, checkInMs should ideally be provided
    if ((data.status === "PRESENT" || data.status === "LATE" || data.status === "HALF_DAY") && !data.checkInMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-in time is required when marked PRESENT, LATE, or HALF_DAY",
        path: ["checkInMs"],
      });
    }

    // If both check-in and check-out exist, checkout must be after checkin
    if (data.checkInMs && data.checkOutMs && data.checkOutMs < data.checkInMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out time cannot be before check-in time",
        path: ["checkOutMs"],
      });
    }
  });

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export interface AttendanceDocument {
  date: string; // YYYY-MM-DD
  checkInMs: number | null;
  checkOutMs: number | null;
  status: AttendanceStatus;
  source?: AttendanceSource;
  detectedLatitude?: number | null;
  detectedLongitude?: number | null;
  lastLocationState?: "INSIDE" | "OUTSIDE" | null;
  lastPingMs?: number | null;
  lastPingLat?: number | null;
  lastPingLng?: number | null;
  branchCode: string;
  tenantId: string;
  markedBy: string;
}

// ==========================================
// 2. LEAVE DATA MODEL & VALIDATION
// ==========================================

export const LeaveTypeEnum = z.enum([
  "PL", // Privilege Leave
  "SL", // Sick Leave
  "CL", // Casual Leave
  "MANDATORY", // Mandatory Leave
  "SICK",
  "CASUAL",
  "UNPAID",
]);
export type LeaveType = z.infer<typeof LeaveTypeEnum>;

export const LeaveStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type LeaveStatus = z.infer<typeof LeaveStatusEnum>;

export const applyLeaveSchema = z
  .object({
    staffId: z.string().trim().min(1, "Staff ID is required"),
    fromDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "From Date must be in YYYY-MM-DD format"),
    toDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "To Date must be in YYYY-MM-DD format"),
    type: LeaveTypeEnum,
    status: LeaveStatusEnum.default("PENDING"),
    reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
    appliedAtMs: z.number().int().positive().optional(),
    approvedBy: z.string().trim().nullable().optional(),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    branchCode: z.string().trim().min(1, "Branch code is required"),
  })
  .superRefine((data, ctx) => {
    if (data.fromDate > data.toDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "To Date must be on or after From Date",
        path: ["toDate"],
      });
    }
  });

export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

export const updateLeaveStatusSchema = z.object({
  staffId: z.string().trim().min(1, "Staff ID is required"),
  leaveId: z.string().trim().min(1, "Leave ID is required"),
  status: z.enum(["APPROVED", "REJECTED"]),
  approvedBy: z.string().trim().min(1, "Approved by identifier is required"),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
});

export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>;

export interface LeaveDocument {
  id?: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  type: LeaveType;
  status: LeaveStatus;
  reason: string;
  appliedAtMs: number;
  approvedBy: string | null;
  tenantId: string;
  branchCode: string;
}

// ==========================================
// 3. REGULARIZATION DATA MODEL & VALIDATION
// ==========================================

export const RegularizationTypeEnum = z.enum([
  "LATE_JUSTIFY",
  "WFH",
  "OUTSIDE_OFFICE",
  "MEETING",
  "ABSENT_TO_LEAVE",
  "FORGOT_CHECKIN",
  "FORGOT_CHECKOUT",
  "MISSED_BOTH",
  "WRONG_TIMING",
]);
export type RegularizationType = z.infer<typeof RegularizationTypeEnum>;

export const RegularizationStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type RegularizationStatus = z.infer<typeof RegularizationStatusEnum>;

export const createRegularizationSchema = z.object({
  staffId: z.string().trim().min(1, "Staff ID is required"),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  requestType: RegularizationTypeEnum,
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
  originalStatus: AttendanceStatusEnum.optional().default("ABSENT"),
  requestedStatus: AttendanceStatusEnum.default("PRESENT"),
  status: RegularizationStatusEnum.default("PENDING"),
  approvedBy: z.string().trim().nullable().optional(),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  branchCode: z.string().trim().min(1, "Branch code is required"),
  appliedAtMs: z.number().int().positive().optional(),
  resolvedAtMs: z.number().int().positive().nullable().optional(),
});

export type CreateRegularizationInput = z.infer<typeof createRegularizationSchema>;

export interface RegularizationDocument {
  id?: string;
  staffId: string;
  date: string;
  requestType: RegularizationType;
  reason: string;
  originalStatus: AttendanceStatus;
  requestedStatus: AttendanceStatus;
  status: RegularizationStatus;
  approvedBy: string | null;
  tenantId: string;
  branchCode: string;
  appliedAtMs: number;
  resolvedAtMs: number | null;
  rejectionReason?: string;
}

// ==========================================
// 4. LEAVE BALANCES DATA MODEL & VALIDATION
// ==========================================

export const leaveBalanceSchema = z.object({
  staffId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  year: z.number().int(),
  PL: z.number().min(0).default(12),
  SL: z.number().min(0).default(6),
  CL: z.number().min(0).default(6),
  usedPL: z.number().min(0).default(0),
  usedSL: z.number().min(0).default(0),
  usedCL: z.number().min(0).default(0),
});

export type LeaveBalanceDocument = z.infer<typeof leaveBalanceSchema>;

// ==========================================
// 5. SALARY STRUCTURE DATA MODEL & VALIDATION
// ==========================================

export const createSalaryStructureSchema = z.object({
  staffId: z.string().trim().min(1, "Staff ID is required"),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  branchCode: z.string().trim().min(1, "Branch code is required"),
  baseSalary: z.number().min(0, "Base salary must be greater than or equal to 0"),
  effectiveFromMs: z.number().int().positive("Effective date timestamp is required"),
  createdBy: z.string().trim().min(1, "Created by is required"),
  createdAtMs: z.number().int().positive().optional(),
});

export type CreateSalaryStructureInput = z.infer<typeof createSalaryStructureSchema>;

export interface SalaryStructureDocument {
  id?: string;
  staffId: string;
  tenantId: string;
  branchCode: string;
  baseSalary: number;
  effectiveFromMs: number;
  createdBy: string;
  createdAtMs: number;
}
