import { redirect } from "next/navigation";
import { auth } from "./auth";
import { adminDb } from "./firebase-admin";
import { hasTenantAddon } from "./subscription/access-engine";

type Role = "super_admin" | "tenant_admin" | "manager" | "cashier" | "guard" | "auditor";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = ((session.user as any).role as string)?.toLowerCase() as Role;
  if (!allowed.includes(role)) {
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
 * Validates that the specified tenant has the required paid addon enabled (or active trial for the addon).
 * Throws "ADDON_NOT_ENABLED" if missing.
 */
export async function requireAddon(tenantId: string | null, addonKey: string) {
  if (!tenantId) {
    throw new Error("ADDON_NOT_ENABLED");
  }
  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  if (!tenantDoc.exists) {
    throw new Error("TENANT_NOT_FOUND");
  }
  const tenantData = tenantDoc.data() || {};
  const isEnabled = hasTenantAddon(tenantData, addonKey);
  if (!isEnabled) {
    throw new Error("ADDON_NOT_ENABLED");
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