"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

const MAX_REGEN_LIMIT = 2;
const EXITED_STATUSES = ["COMPLETED", "APPROVED", "EXITED", "FORCE_OVERRIDDEN"];

export type ExpiredOrder = {
  id: string;
  amount: number;
  branchCode: string;
  qrExpiresAtMs: number;
  qrRegenCount: number;
};

export async function fetchExpiredOrders(searchQuery: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const isSuperAdmin = role === "super_admin";

  if (searchQuery.trim()) {
    const doc = await adminDb.collection("orders").doc(searchQuery.trim()).get();
    if (!doc.exists) return { orders: [] };
    const data = doc.data()!;
    if (!isSuperAdmin && data.tenantId !== tenantId) return { orders: [] };
    if (!isSuperAdmin && data.branchCode !== storeId) return { orders: [] };
    return { orders: [mapOrder(doc.id, data)].filter((o) => matchesEligibility(o.raw)) };
  }

  const startOfSearch = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let query: FirebaseFirestore.Query = adminDb.collection("orders").where("timestamp", ">=", Timestamp.fromDate(startOfSearch)).limit(2000);
  if (!isSuperAdmin && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.get();
  const now = Date.now();

  const orders = snap.docs
    .filter((doc) => {
      const data = doc.data();
      if (!isSuperAdmin && data.branchCode !== storeId) return false;
      return matchesEligibility(data, now);
    })
    .map((doc) => mapOrder(doc.id, doc.data()))
    .sort((a, b) => a.qrExpiresAtMs - b.qrExpiresAtMs);

  return { orders };
}

function matchesEligibility(data: FirebaseFirestore.DocumentData, now = Date.now()) {
  const pStatus = (data.paymentStatus ?? data.status ?? "").toString().toUpperCase();
  if (pStatus !== "PAID" && pStatus !== "SUCCESS") return false;

  const eStatus = (data.exitStatus ?? "").toString().toUpperCase();
  if (EXITED_STATUSES.includes(eStatus)) return false;

  const expiresAt = data.qrExpiresAt as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() > now) return false;

  return true;
}

function mapOrder(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    amount: parseFloat(data.totalAmount ?? "0") || 0,
    branchCode: data.branchCode ?? "",
    qrExpiresAtMs: (data.qrExpiresAt as Timestamp | undefined)?.toMillis() ?? 0,
    qrRegenCount: data.qrRegenCount ?? 0,
    raw: data,
  };
}

export async function reactivateQR(orderId: string, currentStoreId: string) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const orderRef = adminDb.collection("orders").doc(orderId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const doc = await tx.get(orderRef);
      if (!doc.exists) throw new Error("Order vanished from database!");
      const data = doc.data()!;

      const exitStatus = (data.exitStatus ?? "").toString().toUpperCase();
      if (EXITED_STATUSES.includes(exitStatus)) {
        throw new Error("FRAUD ALERT: Order has already exited safely! Cannot reactivate.");
      }

      const pStatus = (data.paymentStatus ?? data.status ?? "").toString().toUpperCase();
      if (pStatus !== "PAID" && pStatus !== "SUCCESS") {
        throw new Error(`FRAUD ALERT: Payment not verified! Current Status: ${pStatus}`);
      }

      const currentRegenCount = data.qrRegenCount ?? 0;
      if (currentRegenCount >= MAX_REGEN_LIMIT) {
        throw new Error(`SYSTEM BLOCK: Max regeneration limit (${MAX_REGEN_LIMIT}) reached! Refund required.`);
      }

      const newExpiry = new Date(Date.now() + 60 * 60 * 1000);

      tx.update(orderRef, {
        exitStatus: "READY_FOR_EXIT",
        wasEverRejected: true,
        reactivatedAt: FieldValue.serverTimestamp(),
        qrExpiresAt: Timestamp.fromDate(newExpiry),
        qrRegenCount: FieldValue.increment(1),
        reactivatedBy: session.user?.email,
      });

      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "QR_REACTIVATION",
        orderId,
        storeId: currentStoreId,
        adminId: session.user?.email,
        adminEmail: session.user?.email,
        timestamp: FieldValue.serverTimestamp(),
        previousExitStatus: exitStatus,
        regenCount: currentRegenCount + 1,
        tenantId,
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Reactivation failed" };
  }

  revalidatePath("/risk");
  return { ok: true };
}