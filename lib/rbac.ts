import { auth } from "./auth";

type Role = "super_admin" | "tenant_admin" | "manager" | "cashier" | "guard" | "auditor";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const role = (session.user as any).role as Role;
  if (!allowed.includes(role)) throw new Error("FORBIDDEN");

  const tenantId = (session.user as any).tenantId as string | null;
  const storeId = (session.user as any).storeId as string | null;

  return { session, role, tenantId, storeId };
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