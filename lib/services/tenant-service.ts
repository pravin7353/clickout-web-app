import { adminDb } from "@/lib/firebase-admin";

export type TenantRow = {
  id: string;
  companyName: string;
  subscriptionPlan: string;
  billingStatus: string;
  isActive: boolean;
};

export async function getTenants(): Promise<TenantRow[]> {
  const snap = await adminDb.collection("tenants").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyName: data.companyName ?? "",
      subscriptionPlan: data.subscriptionPlan ?? "",
      billingStatus: data.billingStatus ?? "",
      isActive: data.isActive !== false,
    };
  });
}