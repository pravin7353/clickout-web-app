import { adminDb } from "@/lib/firebase-admin";

export type Campaign = { id: string; type: string; rewardValue: string; branchCode: string; isActive: boolean };

export async function getCampaigns(role: string, tenantId: string | null): Promise<Campaign[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("engagement_campaigns");
  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.orderBy("createdAt", "desc").limit(30).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, type: d.type ?? "", rewardValue: d.rewardValue ?? "", branchCode: d.branchCode ?? "", isActive: d.isActive === true };
  });
}