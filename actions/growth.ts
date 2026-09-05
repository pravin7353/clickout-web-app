"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function sendWinbackOffer(params: {
  targetUserId: string;
  branchCode?: string;
  discountPercent: number;
  expiryDays: number;
  title?: string;
  message?: string;
}) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot send promotional offers." };
  }

  const branch = resolveStoreScope(role, storeId, params.branchCode) ?? "HQ";
  const couponCode = `WIN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const discount = Math.min(50, Math.max(5, params.discountPercent || 15));
  const title = params.title || "Special VIP Offer for You! 🎁";
  const body = params.message || `Get ${discount}% off on your next visit at our store with code ${couponCode}.`;

  try {
    await adminDb.collection("notifications").add({
      targetUserId: params.targetUserId,
      tenantId,
      branchCode: branch,
      offerType: "growthRadar",
      notificationTitle: title,
      notificationBody: body,
      couponCode,
      discountPercent: discount,
      expiryDays: params.expiryDays || 3,
      status: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
      sentBy: session.user?.email,
    });

    await adminDb.collection("users").doc(params.targetUserId).update({
      winbackActive: true,
      lastWinbackOfferAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "GROWTH_OFFER_SENT",
      actionType: "GROWTH_OFFER_SENT",
      actorId: session.user?.email,
      tenantId,
      branchCode: branch,
      targetUserId: params.targetUserId,
      details: `Sent ${discount}% winback offer (${couponCode}) to user ${params.targetUserId}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/growth");
    return { ok: true, couponCode };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to send winback offer." };
  }
}

export async function bulkSendWinbackOffers(params: {
  targetUserIds: string[];
  branchCode?: string;
  discountPercent: number;
  expiryDays: number;
  title?: string;
  message?: string;
}) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, count: 0, error: "You have view-only access and cannot send promotional offers." };
  }

  if (!params.targetUserIds || params.targetUserIds.length === 0) {
    return { ok: false, count: 0, error: "No users selected." };
  }

  const branch = resolveStoreScope(role, storeId, params.branchCode) ?? "HQ";
  const discount = Math.min(50, Math.max(5, params.discountPercent || 15));

  try {
    const batch = adminDb.batch();
    let sentCount = 0;

    for (const uid of params.targetUserIds) {
      const couponCode = `WIN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const title = params.title || "Special VIP Offer for You! 🎁";
      const body = params.message || `Get ${discount}% off with code ${couponCode}.`;

      const notifRef = adminDb.collection("notifications").doc();
      batch.set(notifRef, {
        targetUserId: uid,
        tenantId,
        branchCode: branch,
        offerType: "growthRadar",
        notificationTitle: title,
        notificationBody: body,
        couponCode,
        discountPercent: discount,
        expiryDays: params.expiryDays || 3,
        status: "PENDING",
        createdAt: FieldValue.serverTimestamp(),
        sentBy: session.user?.email,
      });

      const userRef = adminDb.collection("users").doc(uid);
      batch.update(userRef, {
        winbackActive: true,
        lastWinbackOfferAt: FieldValue.serverTimestamp(),
      });
      sentCount++;
    }

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "GROWTH_BULK_OFFERS_SENT",
      actionType: "GROWTH_BULK_OFFERS_SENT",
      actorId: session.user?.email,
      tenantId,
      branchCode: branch,
      details: `Dispatched ${sentCount} promotional winback offers (${discount}% off)`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/growth");
    return { ok: true, count: sentCount };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message ?? "Bulk dispatch failed." };
  }
}

export async function saveGrowthConfig(params: {
  branchCode?: string;
  vipThreshold: number;
  expectedCycleDays: number;
  churnMultiplierMedium: number;
  churnMultiplierHigh: number;
  businessType?: string;
}) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot update AI growth configurations." };
  }

  const branch = resolveStoreScope(role, storeId, params.branchCode);
  const docId = branch && tenantId ? `${tenantId}_${branch}` : (tenantId ?? "GLOBAL");

  try {
    await adminDb.collection("growth_configs").doc(docId).set(
      {
        tenantId,
        branchCode: branch ?? "ALL",
        businessType: params.businessType ?? "General Retail",
        vipThreshold: Number(params.vipThreshold),
        expectedCycleDays: Number(params.expectedCycleDays),
        churnMultiplierMedium: Number(params.churnMultiplierMedium),
        churnMultiplierHigh: Number(params.churnMultiplierHigh),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.user?.email,
      },
      { merge: true }
    );

    await adminDb.collection("admin_audit_logs").add({
      action: "GROWTH_CONFIG_UPDATED",
      actionType: "GROWTH_CONFIG_UPDATED",
      actorId: session.user?.email,
      tenantId,
      branchCode: branch,
      details: `Updated AI growth config for ${branch ?? "ALL"}: Category ${params.businessType ?? "General Retail"}, VIP Spend ₹${params.vipThreshold}, cycle ${params.expectedCycleDays}d`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/growth");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to save growth configuration." };
  }
}