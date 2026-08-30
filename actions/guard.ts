"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function authorizeExit(orderId: string) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const guardEmail = session.user?.email ?? "UNKNOWN_EMAIL";
  const cleanId = orderId.trim();

  try {
    const orderRef = adminDb.collection("orders").doc(cleanId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return { ok: false, error: "INVALID QR: ORDER NOT FOUND" };

    const data = orderDoc.data()!;
    if (data.paymentStatus !== "PAID") return { ok: false, error: "STOP! Payment is not completed." };

    const eStatus = (data.exitStatus ?? "").toString().toUpperCase();
    if (["COMPLETED", "APPROVED", "EXITED"].includes(eStatus)) return { ok: false, error: "WARNING: Pass already used!" };

    const expiresAt = (data.qrExpiresAt as Timestamp | undefined)?.toDate();
    if (expiresAt && new Date() > expiresAt) return { ok: false, error: "QR EXPIRED: Pass is no longer valid." };

    const batch = adminDb.batch();
    batch.set(orderRef, { exitStatus: "APPROVED", verifiedByGuardId: guardEmail, verifiedAt: FieldValue.serverTimestamp(), qrConsumed: true }, { merge: true });

    const authorizedRef = adminDb.collection("gate_authorized").doc();
    batch.set(authorizedRef, {
      gatePassSchemaVersion: 1,
      orderId: cleanId,
      guardEmail,
      timestamp: FieldValue.serverTimestamp(),
      status: "APPROVED",
      totalAmount: data.totalAmount ?? 0,
      paymentMode: data.paymentMode ?? "UNKNOWN",
      itemsVerifiedCount: (data.items as any[])?.length ?? 0,
      tenantId,
      branchCode: storeId ?? "UNKNOWN",
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      timestamp: FieldValue.serverTimestamp(),
      actorEmail: guardEmail,
      actionType: "AUTHORIZED_EXIT",
      details: `Guard successfully verified gate pass for Order: ${cleanId}`,
      severity: "INFO",
      tenantId,
      branchCode: storeId ?? "UNKNOWN",
    });

    await batch.commit();
  } catch (e: any) {
    return { ok: false, error: e.message ?? "System Error" };
  }

  revalidatePath("/guard");
  return { ok: true };
}

export async function rejectGatePass(orderId: string) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const guardEmail = session.user?.email ?? "UNKNOWN_EMAIL";
  const cleanId = orderId.trim();
  const orderRef = adminDb.collection("orders").doc(cleanId);

  try {
    const orderDoc = await orderRef.get();
    const data = orderDoc.data() ?? {};

    const batch = adminDb.batch();
    batch.update(orderRef, { exitStatus: "REJECTED", verifiedByGuardId: guardEmail, verifiedAt: FieldValue.serverTimestamp() });

    batch.set(adminDb.collection("gate_authorized").doc(), {
      gatePassSchemaVersion: 1,
      orderId: cleanId,
      guardEmail,
      timestamp: FieldValue.serverTimestamp(),
      status: "REJECTED",
      totalAmount: data.totalAmount ?? 0,
      paymentMode: data.paymentMode ?? "UNKNOWN",
      itemsVerifiedCount: (data.items as any[])?.length ?? 0,
      tenantId,
      branchCode: storeId ?? "UNKNOWN",
    });

    await batch.commit();
  } catch {
    return { ok: false, error: "Failed to reject gate pass" };
  }

  revalidatePath("/guard");
  return { ok: true };
}

export async function forceOverride(reason: string, linkedOrderId: string) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const guardEmail = session.user?.email ?? "UNKNOWN_EMAIL";

  if (!reason.trim()) return { ok: false, error: "Reason is required!" };

  const batch = adminDb.batch();
  const overrideRef = adminDb.collection("gate_overrides").doc();
  batch.set(overrideRef, {
    guardEmail,
    reason: reason.trim(),
    linkedOrderId: linkedOrderId.trim() || "NONE",
    timestamp: FieldValue.serverTimestamp(),
    status: "FORCE_OVERRIDDEN",
    riskLevel: "CRITICAL",
    tenantId,
  });

  batch.set(adminDb.collection("admin_audit_logs").doc(), {
    timestamp: FieldValue.serverTimestamp(),
    actorEmail: guardEmail,
    actionType: "MANUAL_GATE_OVERRIDE",
    details: `Guard forced open the gate. Reason: ${reason.trim()}.`,
    severity: "CRITICAL",
    tenantId,
  });

  if (linkedOrderId.trim()) {
    const orderRef = adminDb.collection("orders").doc(linkedOrderId.trim());
    batch.set(orderRef, {
      exitStatus: "FORCE_OVERRIDDEN",
      overrideReason: reason.trim(),
      verifiedByGuardId: guardEmail,
      verifiedAt: FieldValue.serverTimestamp(),
      riskLevel: "HIGH",
    }, { merge: true });
  }

  await batch.commit();
  revalidatePath("/guard");
  return { ok: true };
}