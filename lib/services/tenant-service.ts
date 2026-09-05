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

export async function getTenantById(tenantId: string) {
  const doc = await adminDb.collection("tenants").doc(tenantId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    companyName: data.companyName ?? "ClickOut Partner",
    ownerName: data.ownerName ?? "",
    subscriptionPlan: (data.subscriptionPlan ?? "PRO").toString().toUpperCase(),
    billingStatus: data.billingStatus ?? "ACTIVE",
    isActive: data.isActive !== false,
  };
}