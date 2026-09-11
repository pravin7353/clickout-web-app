import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type Campaign = {
  id: string;
  type: string;
  rewardValue: string;
  branchCode: string;
  sponsorTenantId?: string;
  isActive: boolean;
  createdAtMs?: number;
};

export async function getCampaigns(
  role: string,
  tenantId: string | null,
  storeId?: string | null
): Promise<Campaign[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("engagement_campaigns");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "in", [storeId, "ALL"]);
  }

  const snap = await query.orderBy("createdAt", "desc").limit(40).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: d.type ?? "DISCOUNT",
      rewardValue: d.rewardValue ?? "",
      branchCode: d.branchCode ?? "ALL",
      sponsorTenantId: d.sponsorTenantId ?? "",
      isActive: d.isActive === true,
      createdAtMs: d.createdAt?.toMillis?.(),
    };
  });
}

export async function createSystemWinbackCampaign(
  tenantId: string,
  branchCode: string,
  rewardValue: string
): Promise<string> {
  const branch = branchCode?.trim().toUpperCase() || "ALL";

  const existingSnap = await adminDb
    .collection("engagement_campaigns")
    .where("tenantId", "==", tenantId)
    .where("branchCode", "==", branch)
    .where("type", "==", "WINBACK")
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  const newDoc = adminDb.collection("engagement_campaigns").doc();
  await newDoc.set({
    campaignId: newDoc.id,
    type: "WINBACK",
    rewardValue: rewardValue.trim(),
    branchCode: branch,
    tenantId,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  return newDoc.id;
}