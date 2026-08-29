import { adminDb } from "@/lib/firebase-admin";

export type OrgRole = { id: string; roleName: string; reportsTo: string | null; level: number; tagPrefix: string };

export async function getOrgStructure(tenantId: string | null): Promise<OrgRole[]> {
  if (!tenantId) return [];
  const snap = await adminDb.collection("org_structure").where("tenantId", "==", tenantId).orderBy("level", "asc").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, roleName: d.roleName ?? "Unknown Role", reportsTo: d.reportsTo ?? null, level: d.level ?? 99, tagPrefix: d.tagPrefix ?? "TAG" };
  });
}