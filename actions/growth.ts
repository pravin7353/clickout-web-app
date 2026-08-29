"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function sendWinbackOffer(params: {
  targetUserId: string;
  branchCode: string;
  discountPercent: number;
  expiryDays: number;
}) {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const couponCode = `WIN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await adminDb.collection("notifications").add({
    targetUserId: params.targetUserId,
    tenantId,
    branchCode: params.branchCode,
    offerType: "growthRadar",
    notificationTitle: "We miss you! 🎁",
    notificationBody: `Here's ${params.discountPercent}% off your next visit — just for you.`,
    couponCode,
    discountPercent: params.discountPercent,
    expiryDays: params.expiryDays,
    status: "PENDING",
    fcmToken: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection("users").doc(params.targetUserId).update({ winbackActive: true });

  revalidatePath("/growth");
  return { ok: true, couponCode };
}