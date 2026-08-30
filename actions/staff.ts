"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { onboardStaffSchema } from "@/lib/schemas/staff-schema";
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
  const cleanBranch = data.branchCode.toUpperCase().trim();
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

    await adminDb.collection("audit_logs").add({
      tenantId: effectiveTenantId ?? "SYSTEM",
      timestamp: FieldValue.serverTimestamp(),
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      actionType: "STAFF_ONBOARDED",
      targetCollection: "staff",
      targetId: staffRef.id,
      details: `Created ${data.role} access for ${data.name} (${cleanEmpId}).`,
      severity: "INFO",
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Onboarding failed" };
  }

  if (effectiveTenantId) await incrementStaffUsage(effectiveTenantId);

  revalidatePath("/manager");
  return { ok: true };
}

export async function toggleStaffStatus(staffId: string, currentStatus: boolean) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("staff").doc(staffId).update({
    isActive: !currentStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/manager");
}

export async function softDeleteStaff(staffId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("staff").doc(staffId).update({
    isDeleted: true,
    isActive: false,
    deletedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/manager");
}