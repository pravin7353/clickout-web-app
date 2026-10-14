import { redirect } from "next/navigation";
import { auth } from "./auth";
import { adminDb } from "./firebase-admin";
import { isRouteAllowed, isTrialActive } from "./subscription/access-engine";
import { planFromString } from "./subscription/plan";
import { checkAndAutoDowngradeExpiredTrial } from "@/lib/services/trial-service";

type Role = "super_admin" | "tenant_admin" | "manager" | "cashier" | "guard" | "auditor" | "sales_executive";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // OTP staff sessions are scoped strictly to /employee
  if ((session.user as any).authMethod === "otp") {
    redirect("/employee");
  }

  const role = ((session.user as any).role as string)?.toLowerCase() as Role;

  // sales_executive is treated like cashier: no admin portal access -> redirect to /employee
  if (role === "sales_executive") {
    redirect("/employee");
  }

  if (!allowed.includes(role)) {
    try {
      const fs = await import("fs");
      fs.appendFileSync("d:\\clickout-admin-web\\login_debug.log", `[requireRole] REDIRECTING to /login because role ${role} not in allowed: ${JSON.stringify(allowed)}\n`);
    } catch {}
    redirect("/login");
  }

  const tenantId = (session.user as any).tenantId as string | null;
  const storeId = (session.user as any).storeId as string | null;
  const accessibleTenants =
    ((session.user as any).accessibleTenants as {
      tenantId: string;
      companyName: string;
      branchCode: string;
    }[]) || [];

  return {
    session,
    role,
    tenantId,
    storeId,
    canEdit: (session.user as any).canEdit as boolean,
    accessibleTenants,
  };
}

/** Manager aur tenant_admin hi operate kar sakte hain. super_admin sirf dekh sakta hai. */
export async function requireEditAccess(allowed: Role[]) {
  const result = await requireRole(allowed);
  if (!result.canEdit) throw new Error("READ_ONLY_ACCESS");
  return result;
}

export function assertTenantScope(userTenantId: string | null, targetTenantId: string) {
  if (!userTenantId || userTenantId !== targetTenantId) {
    throw new Error("FORBIDDEN_TENANT_SCOPE");
  }
}

export function assertStoreScope(userStoreId: string | null, targetStoreId: string) {
  if (!userStoreId || userStoreId !== targetStoreId) {
    throw new Error("FORBIDDEN_STORE_SCOPE");
  }
}

/**
 * Guard for Employee Self-Service actions:
 * - Reads auth(); requires session.user.authMethod === "otp" and a staffId.
 * - On EVERY call, loads staff/{session.staffId} from Firestore and verifies:
 *   doc exists, isActive !== false, isDeleted !== true, doc.authUid === session.user.authUid,
 *   and staffDoc.boundDeviceId === user.deviceId (if device binding exists).
 * - Browser device binding is a SOFT control (not hardware-level) as storage and headers can be reset.
 *   If any check fails, throws an error "SESSION_REVOKED".
 * - Returns { session, staffId, tenantId, branchCode, role, staffDoc data }.
 * - Never accepts a staffId from the client.
 */
export async function requireStaffSelf() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("SESSION_REVOKED");
  }

  const user = session.user as any;
  if (user.authMethod !== "otp" || !user.staffId) {
    throw new Error("SESSION_REVOKED");
  }

  const staffDoc = await adminDb.collection("staff").doc(user.staffId).get();
  if (!staffDoc.exists) {
    throw new Error("SESSION_REVOKED");
  }

  const staffData = staffDoc.data()!;
  if (
    staffData.isActive === false ||
    staffData.isDeleted === true ||
    !staffData.authUid ||
    staffData.authUid !== user.authUid
  ) {
    throw new Error("SESSION_REVOKED");
  }

  // 🛡️ Soft Device Binding verification:
  // Note: Browser device binding is a SOFT control (not hardware-level).
  // If staff.boundDeviceId is set, user.deviceId MUST be present and equal.
  if (staffData.boundDeviceId) {
    if (!user.deviceId || staffData.boundDeviceId !== user.deviceId) {
      throw new Error("SESSION_REVOKED");
    }
  }

  const role = (staffData.role ?? user.role ?? "").toString().toLowerCase() as Role;
  const tenantId = staffData.tenantId ?? user.tenantId ?? null;
  const branchCode = staffData.branchCode ?? user.storeId ?? "";

  return {
    session,
    staffId: staffDoc.id,
    tenantId,
    branchCode,
    role,
    staffDoc: staffData,
  };
}

/**
 * Validates that the specified tenant's active plan or trial grants access to the specified route.
 * Throws "PLAN_UPGRADE_REQUIRED" if unauthorized.
 */
export async function requireRoutePlan(tenantId: string | null, route: string) {
  if (!tenantId) {
    throw new Error("PLAN_UPGRADE_REQUIRED");
  }
  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  if (!tenantDoc.exists) {
    throw new Error("TENANT_NOT_FOUND");
  }
  let tenantData = tenantDoc.data() || {};
  // Check trial expiry and auto-downgrade to spark_lite if no active paid plan
  tenantData = await checkAndAutoDowngradeExpiredTrial(tenantId, tenantData);

  const plan = planFromString(tenantData.subscriptionPlan ?? tenantData.plan);

  let trialActive = false;
  if (tenantData.trialEndsAt?.toDate) {
    trialActive = isTrialActive(tenantData.trialEndsAt.toDate());
  } else if (tenantData.trialEndsAt) {
    trialActive = isTrialActive(new Date(tenantData.trialEndsAt));
  } else if (tenantData.trialStartAt) {
    const start = tenantData.trialStartAt.toDate ? tenantData.trialStartAt.toDate() : new Date();
    trialActive = isTrialActive(new Date(start.getTime() + 14 * 86400000));
  }

  const allowed = isRouteAllowed({
    route,
    plan,
    isTrialActive: trialActive,
  });

  if (!allowed) {
    throw new Error("PLAN_UPGRADE_REQUIRED");
  }
  return tenantData;
}

/**
 * Manager hamesha apne hi store tak locked hai (query param ignore hota hai).
 * Tenant_admin/super_admin "Enter Store" se koi bhi apni tenant ka store choose kar sakte hain
 * (?store=BRANCHCODE), warna default sab stores combined dikhta hai.
 */
export function resolveStoreScope(role: string, sessionStoreId: string | null, queryStoreParam?: string): string | null {
  if (role === "manager") return sessionStoreId;
  if (role === "auditor") {
    return sessionStoreId && sessionStoreId !== "HQ" ? sessionStoreId : (queryStoreParam?.trim() || null);
  }
  return queryStoreParam?.trim() || null;
}