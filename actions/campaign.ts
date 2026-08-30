"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { incrementCampaignUsage } from "@/lib/services/usage-service";

export async function createCampaign(params: {
  branchCode: string;
  type: string;
  rewardValue: string;
  sponsorTenantId: string;
  isActive: boolean;
}) {
  const { role, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const targetTenantId = role === "super_admin" ? tenantId : tenantId;
  if (!targetTenantId) return { ok: false, error: "Error: Target Tenant Identity Missing" };

  try {
    if (params.isActive) {
      const activeSnaps = await adminDb
        .collection("engagement_campaigns")
        .where("tenantId", "==", targetTenantId)
        .where("branchCode", "==", params.branchCode)
        .where("isActive", "==", true)
        .get();

      const batch = adminDb.batch();
      activeSnaps.docs.forEach((doc) => batch.update(doc.ref, { isActive: false }));
      await batch.commit();
    }

    const newDoc = adminDb.collection("engagement_campaigns").doc();
    await newDoc.set({
      campaignId: newDoc.id,
      tenantId: targetTenantId,
      branchCode: params.branchCode,
      type: params.type,
      rewardValue: params.rewardValue.trim(),
      sponsorTenantId: params.sponsorTenantId.trim(),
      isActive: params.isActive,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed" };
  }

  if (params.isActive) await incrementCampaignUsage(targetTenantId);

  revalidatePath("/campaign-manager");
  return { ok: true };
}

export async function deleteCampaign(campaignId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("engagement_campaigns").doc(campaignId).delete();
  revalidatePath("/campaign-manager");
}

export async function toggleCampaign(campaignId: string, currentStatus: boolean) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("engagement_campaigns").doc(campaignId).update({ isActive: !currentStatus });
  revalidatePath("/campaign-manager");
}