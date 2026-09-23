"use server";

import { adminDb } from "@/lib/firebase-admin";
import {
  requireRole,
  requireEditAccess,
  assertTenantScope,
  assertStoreScope,
  requireAddon,
} from "@/lib/rbac";
import {
  incentiveRuleSchema,
  IncentiveRuleInput,
} from "@/lib/schemas/incentive-schema";
import {
  calculateCashierIncentive,
  calculateGuardIncentive,
  getMonthlyIncentiveReport as getMonthlyIncentiveReportService,
  getTenantIncentiveRules,
  saveIncentiveRule,
  deleteIncentiveRule,
} from "@/lib/services/incentive-service";
import { getStaffDoc } from "@/lib/services/hr-service";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

// =========================================================================
// 1. GET MONTHLY INCENTIVE REPORT (Managers / Admins only)
// =========================================================================
export async function getMonthlyIncentiveReport(
  branchCode: string,
  month?: string
) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const effectiveMonth = month || new Date().toISOString().slice(0, 7);
  const effectiveTenantId = tenantId || (role === "super_admin" ? "DEFAULT" : "");

  if (effectiveTenantId && effectiveTenantId !== "DEFAULT") {
    await requireAddon(effectiveTenantId, "hr");
  }

  // 🛡️ SECURITY: Managers can ONLY access their assigned branch
  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const targetBranch = (branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, targetBranch);
  }

  const report = await getMonthlyIncentiveReportService(
    effectiveTenantId,
    branchCode,
    effectiveMonth
  );

  return { ok: true, report };
}

// =========================================================================
// 2. GET MY INCENTIVE (Staff member's own incentive or scoped manager view)
// =========================================================================
export async function getMyIncentive(staffId: string, month?: string) {
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
    return { ok: false, error: "Staff member not found.", incentive: null };
  }

  if (staff.tenantId) {
    await requireAddon(staff.tenantId, "hr");
  }

  // Multi-tenant check
  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, staff.tenantId);
  }

  const callerUid = (session.user as any)?.id || (session.user as any)?.uid || session.user?.email;

  // 🛡️ SECURITY: Staff member can ONLY fetch their OWN incentive
  if (role === "cashier" || role === "guard" || role === "auditor") {
    const isSelf =
      callerUid === staffId ||
      (session.user?.email && session.user.email.toLowerCase() === staff.email.toLowerCase()) ||
      ((session.user as any)?.empId && (session.user as any).empId === staff.empId);

    if (!isSelf) {
      throw new Error("ACCESS_DENIED: Staff members can only view their own incentive metrics.");
    }
  }

  // Store check for manager
  if (role === "manager") {
    const managerStore = (storeId || (session.user as any)?.storeId || "").toUpperCase().trim();
    const staffBranch = (staff.branchCode || "").toUpperCase().trim();
    assertStoreScope(managerStore, staffBranch);
  }

  const effectiveMonth = month || new Date().toISOString().slice(0, 7);

  if (staff.role.toLowerCase() === "cashier") {
    const result = await calculateCashierIncentive(staffId, effectiveMonth);
    return { ok: true, incentive: result };
  } else if (staff.role.toLowerCase() === "guard") {
    const result = await calculateGuardIncentive(staffId, effectiveMonth);
    return { ok: true, incentive: result };
  } else {
    return {
      ok: true,
      incentive: {
        staffId,
        empId: staff.empId,
        name: staff.name,
        role: staff.role,
        branchCode: staff.branchCode,
        month: effectiveMonth,
        incentiveAmount: 0,
        appliedRules: ["No incentive formula defined for this role."],
      },
    };
  }
}

// =========================================================================
// 3. INCENTIVE RULES MANAGEMENT (tenant_admin / super_admin ONLY)
// =========================================================================
export async function setIncentiveRule(raw: unknown) {
  const { session, role, tenantId } = await requireEditAccess(["super_admin", "tenant_admin"]);

  const parsed = incentiveRuleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid incentive rule configuration.",
    };
  }

  const data = parsed.data;

  if (data.tenantId) {
    await requireAddon(data.tenantId, "hr");
  }

  // Multi-tenant check
  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, data.tenantId);
  }

  const actorEmail = session.user?.email || "Admin";

  const ruleId = await saveIncentiveRule(
    {
      tenantId: data.tenantId,
      role: data.role,
      metric: data.metric,
      threshold: data.threshold,
      rewardAmount: data.rewardAmount,
      rewardType: data.rewardType,
      description: data.description,
      createdBy: actorEmail,
      createdAtMs: Date.now(),
    },
    data.id
  );

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "INCENTIVE_RULE_CONFIGURED",
    actionType: "INCENTIVE_RULE_CONFIGURED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: data.tenantId,
    target: `incentive_rules/${ruleId}`,
    details: `Configured ${data.role.toUpperCase()} incentive rule for metric ${data.metric} (Threshold: ${data.threshold}, Reward: ₹${data.rewardAmount} ${data.rewardType}).`,
    severity: "INFO",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/manager");

  return { ok: true, ruleId, message: "Incentive rule saved successfully." };
}

export async function deleteIncentiveRuleAction(ruleId: string, targetTenantId: string) {
  const { session, role, tenantId } = await requireEditAccess(["super_admin", "tenant_admin"]);

  if (targetTenantId) {
    await requireAddon(targetTenantId, "hr");
  }

  if (role !== "super_admin" && tenantId) {
    assertTenantScope(tenantId, targetTenantId);
  }

  const actorEmail = session.user?.email || "Admin";

  await deleteIncentiveRule(ruleId, targetTenantId);

  // Audit Log
  await adminDb.collection("admin_audit_logs").add({
    action: "INCENTIVE_RULE_DELETED",
    actionType: "INCENTIVE_RULE_DELETED",
    actor: actorEmail,
    actorId: actorEmail,
    tenantId: targetTenantId,
    target: `incentive_rules/${ruleId}`,
    details: `Deleted incentive rule ${ruleId}.`,
    severity: "WARNING",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/hr");
  revalidatePath("/manager");

  return { ok: true, message: "Incentive rule deleted successfully." };
}

export async function getIncentiveRulesAction(roleFilter?: "cashier" | "guard") {
  const { role, tenantId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  const effectiveTenantId = role === "super_admin" ? (tenantId || "DEFAULT") : tenantId!;
  if (effectiveTenantId && effectiveTenantId !== "DEFAULT") {
    await requireAddon(effectiveTenantId, "hr");
  }
  const rules = await getTenantIncentiveRules(effectiveTenantId, roleFilter);

  return { ok: true, rules };
}
