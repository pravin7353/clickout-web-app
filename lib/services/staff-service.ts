import { adminDb } from "@/lib/firebase-admin";

export type StaffRow = {
  id: string;
  empId: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  branchCode: string;
  isActive: boolean;
};

export async function getStaffList(role: string, tenantId: string | null, storeId: string | null, roleFilter: string): Promise<StaffRow[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("staff").where("isDeleted", "==", false);

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (storeId) query = query.where("branchCode", "==", storeId);
  if (roleFilter !== "ALL") query = query.where("role", "==", roleFilter);

  const snap = await query.orderBy("createdAt", "desc").limit(15).get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      empId: data.empId ?? "",
      name: data.name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      role: data.role ?? "",
      branchCode: data.branchCode ?? "",
      isActive: data.isActive !== false,
    };
  });
}