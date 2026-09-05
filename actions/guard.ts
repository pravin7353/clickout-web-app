"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function authorizeExit(orderId: string, targetBranchCode?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager", "guard"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot authorize gate passes." };
  }

  const guardEmail = session.user?.email ?? "UNKNOWN_GUARD";
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";
  let cleanId = orderId.trim();

  // Support JSON formatted QR payloads (e.g. {"orderId": "..."})
  if (cleanId.startsWith("{")) {
    try {
      const decoded = JSON.parse(cleanId);
      cleanId = (decoded.orderId ?? cleanId).trim();
    } catch {}
  }

  if (!cleanId) return { ok: false, error: "Invalid Order ID" };

  try {
    const orderRef = adminDb.collection("orders").doc(cleanId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return { ok: false, error: "INVALID QR: ORDER NOT FOUND" };

    const data = orderDoc.data()!;
    if (tenantId && data.tenantId && data.tenantId !== tenantId) {
      return { ok: false, error: "ACCESS DENIED: Gate pass cannot be accessed from your account." };
    }
    if (branchCode && branchCode !== "HQ" && data.branchCode && data.branchCode !== branchCode) {
      return { ok: false, error: "ACCESS DENIED: Gate pass is not valid for this store branch." };
    }
    if (data.paymentStatus !== "PAID") return { ok: false, error: "STOP! Payment is not completed." };

    const eStatus = (data.exitStatus ?? "").toString().toUpperCase();
    if (["COMPLETED", "APPROVED", "EXITED"].includes(eStatus)) {
      return { ok: false, error: "WARNING: Gate pass has already been used!" };
    }

    const expiresAt = (data.qrExpiresAt as Timestamp | undefined)?.toDate();
    if (expiresAt && new Date() > expiresAt) {
      return { ok: false, error: "QR EXPIRED: Gate pass is no longer valid." };
    }

    const batch = adminDb.batch();
    batch.set(
      orderRef,
      {
        exitStatus: "APPROVED",
        verifiedByGuardId: guardEmail,
        exitVerifiedBy: guardEmail,
        verifiedAt: FieldValue.serverTimestamp(),
        exitTimestamp: FieldValue.serverTimestamp(),
        qrConsumed: true,
      },
      { merge: true }
    );

    const authorizedRef = adminDb.collection("gate_authorized").doc();
    batch.set(authorizedRef, {
      gatePassSchemaVersion: 1,
      orderId: cleanId,
      guardEmail,
      guardId: guardEmail,
      timestamp: FieldValue.serverTimestamp(),
      status: "APPROVED",
      totalAmount: data.totalAmount ?? 0,
      paymentMode: data.paymentMode ?? "UNKNOWN",
      itemsVerifiedCount: (data.items as any[])?.length ?? 0,
      tenantId,
      branchCode: data.branchCode ?? branchCode,
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "AUTHORIZED_EXIT",
      actionType: "AUTHORIZED_EXIT",
      actorId: guardEmail,
      actorEmail: guardEmail,
      details: `Guard authorized gate exit for Order ${cleanId}`,
      severity: "INFO",
      tenantId,
      branchCode: data.branchCode ?? branchCode,
      targetId: cleanId,
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/guard");
    return { ok: true, msg: "CLEAR EXIT: Gate Authorized!" };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "System Error during exit authorization" };
  }
}

export async function rejectGatePass(orderId: string, reason?: string, targetBranchCode?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager", "guard"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot reject gate passes." };
  }

  const guardEmail = session.user?.email ?? "UNKNOWN_GUARD";
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";
  const cleanId = orderId.trim();
  const orderRef = adminDb.collection("orders").doc(cleanId);

  try {
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return { ok: false, error: "Order not found." };
    const data = orderDoc.data() ?? {};
    if (tenantId && data.tenantId && data.tenantId !== tenantId) {
      return { ok: false, error: "ACCESS DENIED: Order cannot be accessed from your account." };
    }
    if (branchCode && branchCode !== "HQ" && data.branchCode && data.branchCode !== branchCode) {
      return { ok: false, error: "ACCESS DENIED: Order does not belong to your store branch." };
    }

    const batch = adminDb.batch();
    batch.update(orderRef, {
      exitStatus: "REJECTED",
      wasEverRejected: true,
      rejectionReason: reason || "Discrepancy detected at exit gate",
      verifiedByGuardId: guardEmail,
      verifiedAt: FieldValue.serverTimestamp(),
    });

    const authorizedRef = adminDb.collection("gate_authorized").doc();
    batch.set(authorizedRef, {
      gatePassSchemaVersion: 1,
      orderId: cleanId,
      guardEmail,
      guardId: guardEmail,
      timestamp: FieldValue.serverTimestamp(),
      status: "REJECTED",
      reason: reason || "Gate Discrepancy",
      totalAmount: data.totalAmount ?? 0,
      paymentMode: data.paymentMode ?? "UNKNOWN",
      itemsVerifiedCount: (data.items as any[])?.length ?? 0,
      tenantId,
      branchCode: data.branchCode ?? branchCode,
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "GATE_PASS_REJECTED",
      actionType: "GATE_PASS_REJECTED",
      actorId: guardEmail,
      actorEmail: guardEmail,
      details: `Gate pass rejected for Order ${cleanId}. Reason: ${reason || "Discrepancy"}`,
      severity: "WARNING",
      tenantId,
      branchCode: data.branchCode ?? branchCode,
      targetId: cleanId,
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    revalidatePath("/guard");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to reject gate pass." };
  }
}

export async function forceOverride(reason: string, linkedOrderId?: string, targetBranchCode?: string) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager", "guard"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot force manual gate override." };
  }

  const guardEmail = session.user?.email ?? "UNKNOWN_GUARD";
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";

  if (!reason || !reason.trim()) return { ok: false, error: "Override reason is strictly required." };

  try {
    const batch = adminDb.batch();
    const overrideRef = adminDb.collection("gate_overrides").doc();
    batch.set(overrideRef, {
      id: overrideRef.id,
      guardEmail,
      reason: reason.trim(),
      linkedOrderId: linkedOrderId?.trim() || "NONE",
      timestamp: FieldValue.serverTimestamp(),
      status: "FORCE_OVERRIDDEN",
      riskLevel: "CRITICAL",
      tenantId,
      branchCode,
    });

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "MANUAL_GATE_OVERRIDE",
      actionType: "MANUAL_GATE_OVERRIDE",
      actorId: guardEmail,
      actorEmail: guardEmail,
      details: `Guard forced open the gate. Reason: ${reason.trim()}`,
      severity: "CRITICAL",
      tenantId,
      branchCode,
      targetCollection: "gate_overrides",
      targetId: overrideRef.id,
      timestamp: FieldValue.serverTimestamp(),
    });

    if (linkedOrderId && linkedOrderId.trim()) {
      const orderRef = adminDb.collection("orders").doc(linkedOrderId.trim());
      batch.set(
        orderRef,
        {
          exitStatus: "FORCE_OVERRIDDEN",
          overrideReason: reason.trim(),
          verifiedByGuardId: guardEmail,
          verifiedAt: FieldValue.serverTimestamp(),
          riskLevel: "HIGH",
        },
        { merge: true }
      );
    }

    await batch.commit();
    revalidatePath("/guard");
    return { ok: true, msg: "Manual Gate Override logged and executed." };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Manual override execution failed." };
  }
}