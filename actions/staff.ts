"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { onboardStaffSchema, updateStaffSchema } from "@/lib/schemas/staff-schema";
import { incrementStaffUsage, decrementStaffUsage } from "@/lib/services/usage-service";
import { isStaffLimitReached, isTrialActive } from "@/lib/subscription/access-engine";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { detectDelimiter } from "@/lib/csv-utils";

export async function onboardStaff(raw: unknown) {
  const { session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const parsed = onboardStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const isManager = role === "manager";
  const managerStoreId = ((session.user as any)?.storeId || storeId || "").toUpperCase().trim();

  if (isManager && !managerStoreId) {
    return { ok: false, error: "Manager account is not assigned to any store branch." };
  }

  // STRICT ENFORCEMENT: Managers can ONLY onboard staff to their own branch
  const cleanBranch = (isManager ? managerStoreId : data.branchCode).toUpperCase().trim();
  const effectiveTenantId = role === "super_admin" ? (raw as any).tenantId ?? tenantId : tenantId;
  const cleanEmpId = data.empId.trim().toUpperCase();
  const email = data.email?.trim().toLowerCase() ?? "";

  // Role check: Managers cannot create tenant_admin or super_admin
  const requestedRole = data.role.toUpperCase();
  if (isManager && (requestedRole === "TENANT_ADMIN" || requestedRole === "SUPER_ADMIN")) {
    return { ok: false, error: "Managers do not have permission to create administrative accounts." };
  }

  // Check Staff Quota Hard Block
  if (effectiveTenantId) {
    const [tDoc, staffSnap] = await Promise.all([
      adminDb.collection("tenants").doc(effectiveTenantId).get(),
      adminDb
        .collection("staff")
        .where("tenantId", "==", effectiveTenantId)
        .where("isDeleted", "==", false)
        .get(),
    ]);

    const tData = tDoc.data() || {};
    const rawPlan = tData.subscriptionPlan ?? "mini";
    const staffCount = staffSnap.size;

    let trialActive = false;
    if (tData.trialEndsAt?.toDate) {
      trialActive = isTrialActive(tData.trialEndsAt.toDate());
    } else if (tData.trialEndsAt) {
      trialActive = isTrialActive(new Date(tData.trialEndsAt));
    } else if (tData.trialStartAt) {
      const start = tData.trialStartAt.toDate ? tData.trialStartAt.toDate() : new Date();
      trialActive = isTrialActive(new Date(start.getTime() + 14 * 86400000));
    }

    if (!trialActive && isStaffLimitReached(rawPlan, staffCount)) {
      return {
        ok: false,
        success: false,
        reason: "staff_limit_reached",
        error: "Staff account limit reached for your plan. Upgrade to add more staff.",
        message: "Staff account limit reached for your plan. Upgrade to add more staff.",
      };
    }
  }

  try {
    const cleanPhone = (data.phone ?? "").trim();
    if (cleanPhone) {
      const existingPhoneSnap = await adminDb
        .collection("staff")
        .where("phone", "==", cleanPhone)
        .where("isActive", "==", true)
        .where("isDeleted", "==", false)
        .get();

      if (!existingPhoneSnap.empty) {
        const anyForeignTenant = existingPhoneSnap.docs.some(
          (d) => d.data().tenantId !== effectiveTenantId
        );
        if (anyForeignTenant) {
          return {
            ok: false,
            error: "This number is already registered as staff under another business account.",
          };
        }

        const sameRoleDoc = existingPhoneSnap.docs.find(
          (d) => (d.data().role || "").toUpperCase() === requestedRole
        );
        if (sameRoleDoc) {
          return {
            ok: false,
            error: `Staff with this phone and role (${requestedRole}) is already registered. Please edit or reactivate the existing account.`,
            existingDocId: sameRoleDoc.id,
            isExisting: true,
          };
        }
        // Different role, same tenant -> allow create (multi-role staff)
      }
    }

    if (email) {
      const existingEmail = await adminDb.collection("staff").where("email", "==", email).get();
      if (!existingEmail.empty) {
        if (requestedRole === "AUDITOR") {
          // Universal Auditor: CA firm can be assigned to multiple tenant clients!
          const sameTenantEmail = existingEmail.docs.find(
            (d) => d.data().tenantId === effectiveTenantId && d.data().isDeleted !== true
          );
          if (sameTenantEmail) {
            return { ok: false, error: "This email is already an auditor for this company." };
          }
          const nonAuditorEmail = existingEmail.docs.find(
            (d) => (d.data().role || "").toUpperCase() !== "AUDITOR" && d.data().isDeleted !== true
          );
          if (nonAuditorEmail) {
            return { ok: false, error: `Email '${email}' is already in use by an operational staff member.` };
          }
        } else {
          return { ok: false, error: `Email '${email}' is already registered.` };
        }
      }
    }

    const existingEmpId = await adminDb
      .collection("staff")
      .where("tenantId", "==", effectiveTenantId)
      .where("empId", "==", cleanEmpId)
      .get();
    if (!existingEmpId.empty) return { ok: false, error: `Employee ID '${cleanEmpId}' is already in use within this company.` };

    let storeIdFound = "DEFAULT_STORE";
    if (effectiveTenantId) {
      const storeQuery = await adminDb
        .collection("stores")
        .where("tenantId", "==", effectiveTenantId)
        .where("branchCode", "==", cleanBranch)
        .limit(1)
        .get();
      if (!storeQuery.empty) storeIdFound = storeQuery.docs[0].id;
    }

    const staffRef = adminDb.collection("staff").doc();
    await staffRef.set({
      staffId: staffRef.id,
      docId: staffRef.id,
      storeId: storeIdFound,
      addedBy: session.user?.name ?? session.user?.email,
      addedByEmail: session.user?.email,
      empId: cleanEmpId,
      role: data.role.toUpperCase(),
      tagPrefix: data.role.toUpperCase(),
      accessTags: [data.role.toUpperCase(), cleanBranch],
      name: data.name.trim(),
      phone: cleanPhone,
      email,
      branchCode: cleanBranch,
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
      trustScore: 100,
      createdAt: FieldValue.serverTimestamp(),
      tenantId: effectiveTenantId,
    });

    if (email) {
      await adminDb.collection("mail").add({
        to: email,
        message: {
          subject: "Welcome to ClickOut! Your Access Details",
          text: `Hello ${data.name},\n\nYou have been assigned the role of ${data.role} at branch ${cleanBranch}.\n\nYour Employee ID is: ${cleanEmpId}\nLogin using your registered phone number: +91 ${data.phone}.\n\nRegards,\nClickOut Admin Team`,
        },
      });
    }

    await adminDb.collection("admin_audit_logs").add({
      tenantId: effectiveTenantId ?? "SYSTEM",
      timestamp: FieldValue.serverTimestamp(),
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      action: "STAFF_ONBOARDED",
      actionType: "STAFF_ONBOARDED",
      targetCollection: "staff",
      targetId: staffRef.id,
      details: `Created ${data.role} access for ${data.name} (${cleanEmpId}) at ${cleanBranch}.`,
      severity: "INFO",
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Onboarding failed" };
  }

  if (effectiveTenantId) await incrementStaffUsage(effectiveTenantId);

  revalidatePath("/manager");
  revalidatePath("/usage");
  return { ok: true };
}

export async function updateStaff(raw: unknown) {
  const { session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const parsed = updateStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const { id, role: newRole, phone, email, branchCode } = parsed.data;
  const isManager = role === "manager";
  const managerStoreId = ((session.user as any)?.storeId || storeId || "").toUpperCase().trim();

  try {
    const staffDoc = await adminDb.collection("staff").doc(id).get();
    if (!staffDoc.exists) return { ok: false, error: "Staff member not found" };

    const staffData = staffDoc.data()!;

    // MULTI-TENANT ISOLATION CHECK
    if (role !== "super_admin") {
      if (tenantId && staffData.tenantId && staffData.tenantId !== tenantId) {
        return { ok: false, error: "ACCESS DENIED: Staff member belongs to a different organization." };
      }
    }

    // MANAGER STORE ISOLATION CHECK
    if (isManager) {
      const targetBranch = (staffData.branchCode || "").toUpperCase().trim();
      if (managerStoreId && targetBranch && targetBranch !== managerStoreId) {
        return { ok: false, error: "ACCESS DENIED: You can only manage personnel assigned to your branch." };
      }
    }

    const effectiveTenantId = role === "super_admin" ? (staffData.tenantId ?? tenantId) : tenantId;
    const cleanRole = newRole.toUpperCase().trim();

    if (isManager && (cleanRole === "TENANT_ADMIN" || cleanRole === "SUPER_ADMIN")) {
      return { ok: false, error: "Managers do not have permission to elevate accounts to administrative roles." };
    }

    // STRICT ENFORCEMENT: Managers cannot reassign staff to other branches
    const cleanBranch = isManager
      ? (managerStoreId || staffData.branchCode || "HQ").toUpperCase().trim()
      : branchCode.toUpperCase().trim();
    const cleanEmail = email?.trim().toLowerCase() ?? "";

    // Check phone uniqueness if phone changed
    const cleanPhone = (phone ?? "").trim();
    if (cleanPhone && cleanPhone !== (staffData.phone ?? "").trim()) {
      const existingPhone = await adminDb.collection("staff").where("phone", "==", cleanPhone).get();
      if (!existingPhone.empty) {
        if (cleanRole === "AUDITOR" || (staffData.role || "").toUpperCase() === "AUDITOR") {
          const sameTenantPhone = existingPhone.docs.find(
            (d) => d.id !== id && d.data().tenantId === effectiveTenantId && d.data().isDeleted !== true
          );
          if (sameTenantPhone) {
            return { ok: false, error: `An auditor with phone +91 ${cleanPhone} is already registered in your company.` };
          }
        } else if (existingPhone.docs.some((d) => d.id !== id && d.data().isDeleted !== true)) {
          return { ok: false, error: `Phone number +91 ${cleanPhone} is already registered to another staff member.` };
        }
      }
    }

    // Check email uniqueness if email changed
    if (cleanEmail && cleanEmail !== (staffData.email ?? "").trim().toLowerCase()) {
      const existingEmail = await adminDb.collection("staff").where("email", "==", cleanEmail).get();
      if (!existingEmail.empty) {
        if (cleanRole === "AUDITOR" || (staffData.role || "").toUpperCase() === "AUDITOR") {
          const sameTenantEmail = existingEmail.docs.find(
            (d) => d.id !== id && d.data().tenantId === effectiveTenantId && d.data().isDeleted !== true
          );
          if (sameTenantEmail) {
            return { ok: false, error: `An auditor with email '${cleanEmail}' is already assigned to your company.` };
          }
        } else if (existingEmail.docs.some((d) => d.id !== id && d.data().isDeleted !== true)) {
          return { ok: false, error: `Email '${cleanEmail}' is already registered to another staff member.` };
        }
      }
    }

    // Find storeId for branchCode
    let storeIdFound = staffData.storeId;
    if (effectiveTenantId && cleanBranch) {
      const storeQuery = await adminDb
        .collection("stores")
        .where("tenantId", "==", effectiveTenantId)
        .where("branchCode", "==", cleanBranch)
        .limit(1)
        .get();
      if (!storeQuery.empty) storeIdFound = storeQuery.docs[0].id;
    }

    await adminDb.collection("staff").doc(id).update({
      role: cleanRole,
      tagPrefix: cleanRole,
      accessTags: [cleanRole, cleanBranch],
      phone: cleanPhone,
      email: cleanEmail,
      branchCode: cleanBranch,
      storeId: storeIdFound,
      lastEditedBy: session.user?.name ?? session.user?.email,
      lastEditedByEmail: session.user?.email,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      tenantId: effectiveTenantId ?? "SYSTEM",
      timestamp: FieldValue.serverTimestamp(),
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      action: "UPDATE_STAFF",
      actionType: "UPDATE_STAFF",
      targetCollection: "staff",
      targetId: id,
      details: `Updated profile for ${staffData.name} (${staffData.empId}). Role: ${cleanRole}, Branch: ${cleanBranch}.`,
      severity: "WARNING",
    });

    revalidatePath("/manager");
    revalidatePath("/usage");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Update failed" };
  }
}

export type ValidatedBulkStaffRow = {
  lineNumber: number;
  empId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  branchCode: string;
  status: "valid" | "error";
  errors: string[];
};

export type ValidateBulkStaffReport = {
  ok: boolean;
  error?: string;
  delimiter?: string;
  rows: ValidatedBulkStaffRow[];
  validCount: number;
  errorCount: number;
};

export async function validateBulkStaffImport(
  csvContent: string,
  defaultBranchCode?: string
): Promise<ValidateBulkStaffReport> {
  const { session, role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { ok: false, error: "CSV content is empty.", rows: [], validCount: 0, errorCount: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);

  let startIndex = 0;
  const firstLineLower = lines[0].toLowerCase();
  if (
    firstLineLower.includes("empid") ||
    firstLineLower.includes("emp_id") ||
    firstLineLower.includes("emp id") ||
    firstLineLower.includes("role")
  ) {
    startIndex = 1;
  }

  const isManager = role === "manager";
  const managerStoreId = ((session.user as any)?.storeId || storeId || "").toUpperCase().trim();
  if (isManager && !managerStoreId) {
    return {
      ok: false,
      error: "Manager account is not assigned to any store branch.",
      rows: [],
      validCount: 0,
      errorCount: 0,
    };
  }

  const effectiveTenantId = tenantId;
  const existingEmpIds = new Set<string>();
  const existingPhones = new Set<string>();

  if (effectiveTenantId) {
    const existingStaffSnap = await adminDb
      .collection("staff")
      .where("tenantId", "==", effectiveTenantId)
      .select("empId", "phone", "isDeleted")
      .get();

    existingStaffSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.empId) existingEmpIds.add(String(d.empId).trim().toUpperCase());
      if (d.phone && !d.isDeleted) {
        const cleanP = String(d.phone).trim().replace(/\D/g, "");
        if (cleanP) existingPhones.add(cleanP);
      }
    });
  }

  const batchEmpIds = new Set<string>();
  const batchPhones = new Set<string>();
  const CANONICAL_ROLES = ["cashier", "guard", "manager", "auditor", "tenant_admin"];

  const rows: ValidatedBulkStaffRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rowErrors: string[] = [];
    const parts = lines[i].split(delimiter).map((p) => p.replace(/^["']|["']$/g, "").trim());

    if (parts.length < 5) {
      rows.push({
        lineNumber: i + 1,
        empId: parts[0] || `ROW-${i + 1}`,
        name: parts[1] || "—",
        email: parts[2] || undefined,
        phone: parts[3] || undefined,
        role: parts[4] || "—",
        branchCode: parts[5] || defaultBranchCode || "HQ",
        status: "error",
        errors: ["Insufficient columns. Expected: empId, name, email, phone, role, [branchCode]"],
      });
      continue;
    }

    const rawEmpId = parts[0] || "";
    const rawName = parts[1] || "";
    const rawEmail = parts[2] || "";
    const rawPhone = parts[3] || "";
    const rawRole = parts[4] || "";
    const rawBranch = parts[5] || "";

    const empId = rawEmpId.trim().toUpperCase();
    const name = rawName.trim();
    const email = rawEmail.trim().toLowerCase();
    const phone = rawPhone.trim().replace(/\D/g, "");
    const normalizedRole = rawRole.trim().toLowerCase();
    const branchCode = isManager
      ? managerStoreId
      : (rawBranch || defaultBranchCode || "HQ").trim().toUpperCase();

    // d. Role value check
    if (!CANONICAL_ROLES.includes(normalizedRole)) {
      rowErrors.push(
        `Role '${rawRole}' is not valid. Use one of: ${CANONICAL_ROLES.join(", ")}`
      );
    } else if (isManager && (normalizedRole === "tenant_admin" || normalizedRole === "super_admin")) {
      rowErrors.push("Managers do not have permission to create administrative accounts.");
    }

    // Schema validation
    const schemaResult = onboardStaffSchema.safeParse({
      empId,
      name,
      email: email || undefined,
      phone: phone || undefined,
      role: normalizedRole,
      branchCode,
    });

    if (!schemaResult.success) {
      for (const issue of schemaResult.error.issues) {
        rowErrors.push(issue.message);
      }
    }

    // a. Duplicate empId within THIS batch
    if (empId) {
      if (batchEmpIds.has(empId)) {
        rowErrors.push(`Duplicate Employee ID '${empId}' within this batch.`);
      } else {
        batchEmpIds.add(empId);
      }
    }

    // b. Duplicate phone within THIS batch
    if (phone && phone.length === 10) {
      if (batchPhones.has(phone)) {
        rowErrors.push(`Duplicate phone number '${phone}' within this batch.`);
      } else {
        batchPhones.add(phone);
      }
    }

    // c. Duplicate empId/phone already existing in Firestore
    if (empId && existingEmpIds.has(empId)) {
      rowErrors.push(`Employee ID '${empId}' is already registered in your organization.`);
    }

    if (phone && phone.length === 10 && existingPhones.has(phone)) {
      rowErrors.push(`Phone number '+91 ${phone}' is already registered in your organization.`);
    }

    const status = rowErrors.length === 0 ? "valid" : "error";
    rows.push({
      lineNumber: i + 1,
      empId: empId || `ROW-${i + 1}`,
      name: name || "—",
      email: email || undefined,
      phone: phone || undefined,
      role: normalizedRole || rawRole || "—",
      branchCode,
      status,
      errors: rowErrors,
    });
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return {
    ok: true,
    delimiter,
    rows,
    validCount,
    errorCount,
  };
}

export async function commitBulkStaffImport(
  validatedRows: Array<{
    empId: string;
    name: string;
    email?: string;
    phone?: string;
    role: string;
    branchCode?: string;
  }>,
  defaultBranchCode?: string
) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);

  if (!validatedRows || validatedRows.length === 0) {
    return { ok: false, error: "No valid rows provided to commit.", successCount: 0, failCount: 0, errors: [] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const row of validatedRows) {
    const res = await onboardStaff({
      empId: row.empId,
      name: row.name,
      email: row.email || undefined,
      phone: row.phone,
      role: row.role.toLowerCase(),
      branchCode: row.branchCode || defaultBranchCode || "HQ",
    });

    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`${row.empId}: ${res.error}`);
    }
  }

  revalidatePath("/manager");
  revalidatePath("/usage");
  return { ok: true, successCount, failCount, errors };
}

export async function bulkImportStaff(csvContent: string, defaultBranchCode?: string) {
  const report = await validateBulkStaffImport(csvContent, defaultBranchCode);
  if (!report.ok) {
    return { ok: false, error: report.error ?? "Validation failed", successCount: 0, failCount: 0, errors: [] };
  }
  const validRows = report.rows.filter((r) => r.status === "valid");
  if (validRows.length === 0) {
    return {
      ok: false,
      error: "No valid rows found to import.",
      successCount: 0,
      failCount: report.errorCount,
      errors: report.rows.flatMap((r) => r.errors),
    };
  }
  return await commitBulkStaffImport(validRows, defaultBranchCode);
}

export async function toggleStaffStatus(staffId: string, currentStatus: boolean) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const doc = await adminDb.collection("staff").doc(staffId).get();
  if (!doc.exists) throw new Error("Staff member not found");
  const staffData = doc.data()!;

  // MULTI-TENANT ISOLATION CHECK
  if (role !== "super_admin" && tenantId && staffData.tenantId && staffData.tenantId !== tenantId) {
    throw new Error("ACCESS DENIED: Staff member belongs to a different organization.");
  }

  // MANAGER STORE ISOLATION CHECK
  if (role === "manager") {
    const targetBranch = (staffData.branchCode || "").toUpperCase().trim();
    const managerStoreId = (storeId || "").toUpperCase().trim();
    if (managerStoreId && targetBranch && targetBranch !== managerStoreId) {
      throw new Error("ACCESS DENIED: You can only modify personnel in your assigned branch.");
    }
  }

  if (currentStatus) {
    if (staffData.role === "tenant_admin" || staffData.role === "TENANT_ADMIN") {
      const snap = await adminDb.collection("staff").where("tenantId", "==", staffData.tenantId).where("role", "==", "tenant_admin").where("isDeleted", "==", false).where("isActive", "==", true).get();
      if (snap.size <= 1) throw new Error("Cannot deactivate the sole tenant admin.");
    }
  }
  await adminDb.collection("staff").doc(staffId).update({
    isActive: !currentStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/manager");
  revalidatePath("/usage");
}

export async function softDeleteStaff(staffId: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const doc = await adminDb.collection("staff").doc(staffId).get();
  if (!doc.exists) throw new Error("Staff member not found");
  const staffData = doc.data()!;

  // MULTI-TENANT ISOLATION CHECK
  if (role !== "super_admin" && tenantId && staffData.tenantId && staffData.tenantId !== tenantId) {
    throw new Error("ACCESS DENIED: Staff member belongs to a different organization.");
  }

  // MANAGER STORE ISOLATION CHECK
  if (role === "manager") {
    const targetBranch = (staffData.branchCode || "").toUpperCase().trim();
    const managerStoreId = (storeId || "").toUpperCase().trim();
    if (managerStoreId && targetBranch && targetBranch !== managerStoreId) {
      throw new Error("ACCESS DENIED: You can only delete personnel in your assigned branch.");
    }
  }

  if (staffData.role === "tenant_admin" || staffData.role === "TENANT_ADMIN") {
    const snap = await adminDb.collection("staff").where("tenantId", "==", staffData.tenantId).where("role", "==", "tenant_admin").where("isDeleted", "==", false).get();
    if (snap.size <= 1) throw new Error("Cannot delete the sole tenant admin.");
  }
  await adminDb.collection("staff").doc(staffId).update({
    isDeleted: true,
    isActive: false,
    deletedAt: FieldValue.serverTimestamp(),
  });
  if (doc.data()?.tenantId) await decrementStaffUsage(doc.data()?.tenantId);
  revalidatePath("/manager");
  revalidatePath("/usage");
}

export async function bulkToggleStaffStatus(staffIds: string[], newStatus: boolean) {
  if (!staffIds || staffIds.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No staff members selected."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const id of staffIds) {
    try {
      await toggleStaffStatus(id, !newStatus);
      successCount++;
    } catch (e: any) {
      failCount++;
      errors.push(`${id}: ${e.message ?? "Failed to toggle status"}`);
    }
  }

  revalidatePath("/manager");
  revalidatePath("/usage");
  return { ok: failCount === 0, successCount, failCount, errors };
}

export async function bulkSoftDeleteStaff(staffIds: string[]) {
  if (!staffIds || staffIds.length === 0) {
    return { ok: false, successCount: 0, failCount: 0, errors: ["No staff members selected."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const id of staffIds) {
    try {
      await softDeleteStaff(id);
      successCount++;
    } catch (e: any) {
      failCount++;
      errors.push(`${id}: ${e.message ?? "Failed to delete"}`);
    }
  }

  revalidatePath("/manager");
  revalidatePath("/usage");
  return { ok: failCount === 0, successCount, failCount, errors };
}