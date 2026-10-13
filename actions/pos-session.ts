"use server";

import { requireRole } from "@/lib/rbac";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  acquirePosTerminalSession,
  heartbeatPosTerminalSession,
  releasePosTerminalSession,
  PosSessionCheckResult,
} from "@/lib/services/pos-session-service";
import { EXTRA_POS_COUNTER_MONTHLY_PRICE } from "@/lib/plan-limits";
import { revalidatePath } from "next/cache";

export async function acquirePosSessionAction(params: {
  sessionId: string;
  branchCode?: string;
}): Promise<PosSessionCheckResult> {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
  ]);

  if (!tenantId) {
    return {
      allowed: false,
      sessionId: params.sessionId,
      activeCount: 0,
      maxAllowed: 1,
      planName: "SPARK",
      extraCounters: 0,
      activeStaffList: [],
      error: "NO_TENANT",
      message: "No active tenant found for session.",
    };
  }

  const staffId = (session.user as any)?.staffId || (session.user as any)?.id || session.user?.email || "";
  const staffName = session.user?.name || "Cashier Staff";
  const staffEmail = session.user?.email || "";

  return acquirePosTerminalSession({
    tenantId,
    sessionId: params.sessionId,
    staffId,
    staffName,
    staffEmail,
    role,
    branchCode: params.branchCode || storeId || undefined,
  });
}

export async function heartbeatPosSessionAction(params: {
  sessionId: string;
}): Promise<{ ok: boolean }> {
  try {
    const { tenantId } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
      "cashier",
    ]);

    if (!tenantId || !params.sessionId) return { ok: false };

    const ok = await heartbeatPosTerminalSession({
      tenantId,
      sessionId: params.sessionId,
    });
    return { ok };
  } catch {
    return { ok: false };
  }
}

export async function releasePosSessionAction(params: {
  sessionId: string;
}): Promise<{ ok: boolean }> {
  try {
    const { tenantId } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
      "cashier",
    ]);

    if (!tenantId || !params.sessionId) return { ok: false };

    await releasePosTerminalSession({
      tenantId,
      sessionId: params.sessionId,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Purchase 1 extra POS counter add-on for ₹199/month
 * Available to manager, tenant_admin, and super_admin
 */
export async function purchaseExtraPosCounterAction(): Promise<{
  ok: boolean;
  newTotalCounters?: number;
  message?: string;
  error?: string;
}> {
  try {
    const { session, role, tenantId } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
    ]);

    if (!tenantId) {
      return { ok: false, error: "Tenant ID required." };
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const tDoc = await tenantRef.get();
    if (!tDoc.exists) {
      return { ok: false, error: "Tenant not found." };
    }

    const currentExtra = Number(tDoc.data()?.extraPosCountersPurchased || 0);
    const newExtra = currentExtra + 1;

    await tenantRef.update({
      extraPosCountersPurchased: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Write audit log
    const actorEmail = session.user?.email || "Admin";
    await adminDb.collection("admin_audit_logs").add({
      action: "POS_COUNTER_ADDON_PURCHASED",
      actionType: "POS_COUNTER_ADDON_PURCHASED",
      tenantId,
      actor: actorEmail,
      actorId: actorEmail,
      amountPaid: EXTRA_POS_COUNTER_MONTHLY_PRICE,
      currency: "INR",
      previousExtraCounters: currentExtra,
      newExtraCounters: newExtra,
      details: `Purchased 1 extra POS Billing Counter for ₹${EXTRA_POS_COUNTER_MONTHLY_PRICE}/month. Total extra counters: ${newExtra}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/cashier");
    revalidatePath("/dashboard");
    revalidatePath("/usage");

    return {
      ok: true,
      newTotalCounters: newExtra,
      message: `Successfully added 1 extra POS Billing Counter (₹${EXTRA_POS_COUNTER_MONTHLY_PRICE}/month).`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to purchase extra counter." };
  }
}
