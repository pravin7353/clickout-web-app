"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { incrementCampaignUsage, decrementCampaignUsage } from "@/lib/services/usage-service";

export async function createCampaign(params: {
  branchCode: string;
  type: string;
  rewardValue: string;
  sponsorTenantId?: string;
  isActive: boolean;
}) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  if (role === "manager" && storeId && params.branchCode !== storeId) {
    return { ok: false, error: "Managers can only launch campaigns for their assigned branch." };
  }

  const targetTenantId = tenantId;
  if (!targetTenantId && role !== "super_admin") {
    return { ok: false, error: "Error: Target Tenant Identity Missing" };
  }

  const branch = params.branchCode.trim().toUpperCase() || "ALL";

  try {
    // If active, deactivate any conflicting campaigns on the same branch
    if (params.isActive && targetTenantId) {
      const activeSnaps = await adminDb
        .collection("engagement_campaigns")
        .where("tenantId", "==", targetTenantId)
        .where("branchCode", "==", branch)
        .where("isActive", "==", true)
        .get();

      if (!activeSnaps.empty) {
        const batch = adminDb.batch();
        activeSnaps.docs.forEach((doc) => batch.update(doc.ref, { isActive: false }));
        await batch.commit();
      }
    }

    const newDoc = adminDb.collection("engagement_campaigns").doc();
    await newDoc.set({
      campaignId: newDoc.id,
      tenantId: targetTenantId,
      branchCode: branch,
      type: params.type,
      rewardValue: params.rewardValue.trim(),
      sponsorTenantId: params.sponsorTenantId?.trim() || "",
      isActive: params.isActive,
      createdBy: session.user?.email,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Write audit log
    await adminDb.collection("admin_audit_logs").doc().set({
      action: "CAMPAIGN_CREATED",
      campaignId: newDoc.id,
      type: params.type,
      rewardValue: params.rewardValue.trim(),
      storeId: branch,
      tenantId: targetTenantId,
      adminId: session.user?.email,
      adminEmail: session.user?.email,
      adminName: session.user?.name || "Admin",
      timestamp: FieldValue.serverTimestamp(),
    });

    if (params.isActive && targetTenantId) {
      await incrementCampaignUsage(targetTenantId);
    }
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Campaign launch failed" };
  }

  revalidatePath("/campaign-manager");
  return { ok: true };
}

export async function deleteCampaign(campaignId: string) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const doc = await adminDb.collection("engagement_campaigns").doc(campaignId).get();
  if (doc.exists) {
    const data = doc.data()!;
    if (data.isActive && tenantId) {
      await decrementCampaignUsage(tenantId);
    }
    await adminDb.collection("admin_audit_logs").doc().set({
      action: "CAMPAIGN_DELETED",
      campaignId,
      tenantId: data.tenantId || tenantId,
      storeId: data.branchCode || "ALL",
      adminId: session.user?.email,
      adminEmail: session.user?.email,
      adminName: session.user?.name || "Admin",
      timestamp: FieldValue.serverTimestamp(),
    });
  }

  await adminDb.collection("engagement_campaigns").doc(campaignId).delete();
  revalidatePath("/campaign-manager");
  return { ok: true };
}

export async function toggleCampaign(campaignId: string, currentStatus: boolean) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const newStatus = !currentStatus;
  await adminDb.collection("engagement_campaigns").doc(campaignId).update({
    isActive: newStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (tenantId) {
    if (newStatus) await incrementCampaignUsage(tenantId);
    else await decrementCampaignUsage(tenantId);
  }

  await adminDb.collection("admin_audit_logs").doc().set({
    action: "CAMPAIGN_STATUS_TOGGLED",
    campaignId,
    newStatus,
    tenantId,
    adminId: session.user?.email,
    adminEmail: session.user?.email,
    adminName: session.user?.name || "Admin",
    timestamp: FieldValue.serverTimestamp(),
  });

  revalidatePath("/campaign-manager");
  return { ok: true };
}