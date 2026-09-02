import { auth } from "./auth";

type Role = "super_admin" | "tenant_admin" | "manager" | "cashier" | "guard" | "auditor";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const role = (session.user as any).role as Role;
  if (!allowed.includes(role)) throw new Error("FORBIDDEN");

  const tenantId = (session.user as any).tenantId as string | null;
  const storeId = (session.user as any).storeId as string | null;

  return { session, role, tenantId, storeId, canEdit: (session.user as any).canEdit as boolean };
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
 * Manager hamesha apne hi store tak locked hai (query param ignore hota hai).
 * Tenant_admin/super_admin "Enter Store" se koi bhi apni tenant ka store choose kar sakte hain
 * (?store=BRANCHCODE), warna default sab stores combined dikhta hai.
 */
export function resolveStoreScope(role: string, sessionStoreId: string | null, queryStoreParam?: string): string | null {
  if (role === "manager") return sessionStoreId;
  return queryStoreParam?.trim() || null;
}