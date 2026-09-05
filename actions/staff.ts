"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { onboardStaffSchema, updateStaffSchema } from "@/lib/schemas/staff-schema";
import { incrementStaffUsage, decrementStaffUsage } from "@/lib/services/usage-service";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function onboardStaff(raw: unknown) {
  const { session, role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const parsed = onboardStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  // manager can only onboard within their own scope; tenant_admin/super_admin can pick tenant
  const effectiveTenantId = role === "super_admin" ? (raw as any).tenantId ?? tenantId : tenantId;
  const managerStoreId = (session.user as any)?.storeId as string | undefined;
  const cleanBranch = (role === "manager" && managerStoreId ? managerStoreId : data.branchCode).toUpperCase().trim();
  const cleanEmpId = data.empId.trim().toUpperCase();
  const email = data.email?.trim().toLowerCase() ?? "";

  try {
    const existingPhone = await adminDb.collection("staff").where("phone", "==", data.phone.trim()).get();
    if (!existingPhone.empty) return { ok: false, error: `Phone number +91 ${data.phone} is already registered.` };

    if (email) {
      const existingEmail = await adminDb.collection("staff").where("email", "==", email).get();
      if (!existingEmail.empty) return { ok: false, error: `Email '${email}' is already registered.` };
    }

    const existingEmpId = await adminDb
      .collection("staff")
      .where("tenantId", "==", effectiveTenantId)
      .where("empId", "==", cleanEmpId)
      .get();
    if (!existingEmpId.empty) return { ok: false, error: `Employee ID '${cleanEmpId}' is already in use within this company.` };

    let storeId = "DEFAULT_STORE";
    if (effectiveTenantId) {
      const storeQuery = await adminDb
        .collection("stores")
        .where("tenantId", "==", effectiveTenantId)
        .where("branchCode", "==", cleanBranch)
        .limit(1)
        .get();
      if (!storeQuery.empty) storeId = storeQuery.docs[0].id;
    }

    const staffRef = adminDb.collection("staff").doc();
    await staffRef.set({
      staffId: staffRef.id,
      docId: staffRef.id,
      storeId,
      addedBy: session.user?.name ?? session.user?.email,
      addedByEmail: session.user?.email,
      empId: cleanEmpId,
      role: data.role.toUpperCase(),
      tagPrefix: data.role.toUpperCase(),
      accessTags: [data.role.toUpperCase(), cleanBranch],
      name: data.name.trim(),
      phone: data.phone.trim(),
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
  return { ok: true };
}

export async function updateStaff(raw: unknown) {
  const { session, role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const parsed = updateStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const { id, role: newRole, phone, email, branchCode } = parsed.data;

  try {
    const staffDoc = await adminDb.collection("staff").doc(id).get();
    if (!staffDoc.exists) return { ok: false, error: "Staff member not found" };

    const staffData = staffDoc.data()!;
    const effectiveTenantId = role === "super_admin" ? (staffData.tenantId ?? tenantId) : tenantId;
    const cleanRole = newRole.toUpperCase().trim();
    const cleanBranch = branchCode.toUpperCase().trim();
    const cleanEmail = email?.trim().toLowerCase() ?? "";

    // Check phone uniqueness if phone changed
    if (phone.trim() !== (staffData.phone ?? "").trim()) {
      const existingPhone = await adminDb.collection("staff").where("phone", "==", phone.trim()).get();
      if (!existingPhone.empty && existingPhone.docs.some((d) => d.id !== id)) {
        return { ok: false, error: `Phone number +91 ${phone} is already registered to another staff member.` };
      }
    }

    // Find storeId for branchCode
    let storeId = staffData.storeId;
    if (effectiveTenantId && cleanBranch) {
      const storeQuery = await adminDb
        .collection("stores")
        .where("tenantId", "==", effectiveTenantId)
        .where("branchCode", "==", cleanBranch)
        .limit(1)
        .get();
      if (!storeQuery.empty) storeId = storeQuery.docs[0].id;
    }

    await adminDb.collection("staff").doc(id).update({
      role: cleanRole,
      tagPrefix: cleanRole,
      accessTags: [cleanRole, cleanBranch],
      phone: phone.trim(),
      email: cleanEmail,
      branchCode: cleanBranch,
      storeId,
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
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Update failed" };
  }
}

export async function bulkImportStaff(csvContent: string, defaultBranchCode?: string) {
  const { session, role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { ok: false, error: "CSV content is empty." };

  let startIndex = 0;
  if (lines[0].toLowerCase().includes("empid") || lines[0].toLowerCase().includes("role")) {
    startIndex = 1;
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    if (parts.length < 5) {
      failCount++;
      errors.push(`Row ${i + 1}: Insufficient columns. Expected: empId, name, email, phone, role, [branchCode]`);
      continue;
    }

    const [empId, name, email, phone, staffRole, branchCodeCol] = parts;
    const branchCode = branchCodeCol || defaultBranchCode || "HQ";

    const res = await onboardStaff({
      empId,
      name,
      email: email || undefined,
      phone,
      role: staffRole.toLowerCase(),
      branchCode,
    });

    if (res.ok) {
      successCount++;
    } else {
      failCount++;
      errors.push(`Row ${i + 1} (${empId}): ${res.error}`);
    }
  }

  revalidatePath("/manager");
  return { ok: true, successCount, failCount, errors };
}

export async function toggleStaffStatus(staffId: string, currentStatus: boolean) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (currentStatus) {
    const doc = await adminDb.collection("staff").doc(staffId).get();
    if (doc.data()?.role === "tenant_admin") {
      const snap = await adminDb.collection("staff").where("tenantId", "==", doc.data()?.tenantId).where("role", "==", "tenant_admin").where("isDeleted", "==", false).where("isActive", "==", true).get();
      if (snap.size <= 1) throw new Error("Cannot deactivate the sole tenant admin.");
    }
  }
  await adminDb.collection("staff").doc(staffId).update({
    isActive: !currentStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/manager");
}

export async function softDeleteStaff(staffId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  const doc = await adminDb.collection("staff").doc(staffId).get();
  if (doc.data()?.role === "tenant_admin") {
    const snap = await adminDb.collection("staff").where("tenantId", "==", doc.data()?.tenantId).where("role", "==", "tenant_admin").where("isDeleted", "==", false).get();
    if (snap.size <= 1) throw new Error("Cannot delete the sole tenant admin.");
  }
  await adminDb.collection("staff").doc(staffId).update({
    isDeleted: true,
    isActive: false,
    deletedAt: FieldValue.serverTimestamp(),
  });
  if (doc.data()?.tenantId) await decrementStaffUsage(doc.data()?.tenantId);
  revalidatePath("/manager");
}