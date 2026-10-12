"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getMaxPosCounters } from "@/lib/plan-limits";

/**
 * Open a POS Counter terminal with a 4-digit PIN
 * Cashiers do not need full manager login to unlock their tablet counter.
 */
export async function openPosCounter(params: {
  counterId: string;
  enteredPin: string;
  storeId?: string;
  tenantId?: string;
  openingCash?: number;
}) {
  const { counterId, enteredPin } = params;

  if (!counterId || !enteredPin) {
    return { ok: false, error: "COUNTER_ID_OR_PIN_MISSING", message: "Counter ID aur PIN zaroori hain." };
  }

  // 1. Resolve Tenant ID: from parameter, store query, or active session
  let effectiveTenantId = params.tenantId;

  if (!effectiveTenantId && params.storeId) {
    const storeSnap = await adminDb
      .collection("stores")
      .where("branchCode", "==", params.storeId)
      .limit(1)
      .get();
    if (!storeSnap.empty) {
      effectiveTenantId = storeSnap.docs[0].data().tenantId;
    }
  }

  if (!effectiveTenantId) {
    try {
      const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager", "cashier"]);
      effectiveTenantId = tenantId || undefined;
    } catch {
      // No active session and cannot resolve from store
    }
  }

  if (!effectiveTenantId) {
    return {
      ok: false,
      error: "TENANT_NOT_RESOLVED",
      message: "Store identification failed. Please select your store again.",
    };
  }

  try {
    const tenantDoc = await adminDb.collection("tenants").doc(effectiveTenantId).get();
    const tenantData = tenantDoc.data() || {};
    const plan = (tenantData.subscriptionPlan || "mini").toLowerCase();
    const extraCounters = Number(tenantData.extraPosCountersPurchased || 0);
    const maxAllowedCounters = getMaxPosCounters(plan, extraCounters);

    const countersRef = adminDb.collection("tenants").doc(effectiveTenantId).collection("posCounters");
    const shiftsRef = adminDb.collection("tenants").doc(effectiveTenantId).collection("posShifts");

    // 2. Plan Limit Check on Open Shifts
    const openShiftsSnap = await shiftsRef.where("status", "==", "OPEN").get();
    const openShifts = openShiftsSnap.docs.map((d) => d.data());

    // Check if THIS counter is already in use with an OPEN shift
    const existingOpenShift = openShifts.find((s) => s.counterId === counterId);
    if (existingOpenShift) {
      return {
        ok: false,
        error: "COUNTER_IN_USE",
        message: `Yeh counter abhi '${existingOpenShift.openedByName || "Cashier"}' ke paas open hai.`,
      };
    }

    if (openShifts.length >= maxAllowedCounters) {
      return {
        ok: false,
        error: "COUNTER_LIMIT_REACHED",
        limit: maxAllowedCounters,
        message: `Aapke plan mein sirf ${maxAllowedCounters} POS counter${maxAllowedCounters > 1 ? "s" : ""} allowed hain. Growth plan pe upgrade karo — ₹1,499/month`,
      };
    }

    // 3. Counter Lockout & PIN Verification
    const counterDoc = await countersRef.doc(counterId).get();
    if (!counterDoc.exists) {
      return { ok: false, error: "COUNTER_NOT_FOUND", message: "Counter nahi mila." };
    }

    const counterData = counterDoc.data()!;
    if (counterData.isActive === false) {
      return { ok: false, error: "COUNTER_DISABLED", message: "Yeh counter manager dwara disable kiya gaya hai." };
    }

    // Lockout check (5 wrong attempts -> 10 minutes lock)
    const lockedUntilDate = counterData.lockedUntil?.toDate
      ? counterData.lockedUntil.toDate()
      : counterData.lockedUntil
      ? new Date(counterData.lockedUntil)
      : null;

    if (lockedUntilDate && lockedUntilDate.getTime() > Date.now()) {
      const minutesRemaining = Math.max(1, Math.ceil((lockedUntilDate.getTime() - Date.now()) / 60000));
      return {
        ok: false,
        error: "COUNTER_LOCKED",
        message: `Counter locked hai. Galat PIN ke baad ${minutesRemaining} minute baad try karo.`,
      };
    }

    const isPinValid = await bcrypt.compare(enteredPin.trim(), counterData.pin);
    if (!isPinValid) {
      const failed = (counterData.failedAttempts || 0) + 1;
      const updates: Record<string, any> = { failedAttempts: failed };

      if (failed >= 5) {
        updates.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      }
      await countersRef.doc(counterId).update(updates);

      return {
        ok: false,
        error: "INVALID_PIN",
        attemptsLeft: Math.max(0, 5 - failed),
        message: failed >= 5
          ? "5 galat attempts. Yeh counter 10 minute ke liye lock ho gaya hai."
          : `Galat PIN. Dobara try karo. (${5 - failed} attempts bache hain)`,
      };
    }

    // Reset failed attempts on success
    await countersRef.doc(counterId).update({
      failedAttempts: 0,
      lockedUntil: null,
      lastUnlockedAt: FieldValue.serverTimestamp(),
    });

    // 4. Create new posShift document
    const shiftRef = shiftsRef.doc();
    const newShift = {
      id: shiftRef.id,
      counterId,
      counterName: counterData.name || "Counter",
      openedBy: counterData.assignedStaffId || "STAFF",
      openedByName: counterData.assignedStaffName || counterData.name || "Cashier",
      openedAt: FieldValue.serverTimestamp(),
      closedAt: null,
      closedBy: null,
      status: "OPEN",
      shiftTotalAmount: 0,
      transactionCount: 0,
      openingCash: Number(params.openingCash || 0),
      closingCash: null,
      branchCode: counterData.branchCode || params.storeId || "HQ",
      tenantId: effectiveTenantId,
    };

    await shiftRef.set(newShift);

    revalidatePath("/pos");
    revalidatePath("/cashier");
    revalidatePath("/guard");

    return {
      ok: true,
      success: true,
      shiftId: shiftRef.id,
      counterName: counterData.name,
      openedByName: counterData.assignedStaffName || counterData.name,
      tenantId: effectiveTenantId,
    };
  } catch (err: any) {
    console.error("openPosCounter error:", err);
    return { ok: false, error: "SERVER_ERROR", message: err?.message || "Failed to unlock counter." };
  }
}

/**
 * Close an active POS counter shift (Manager or assigned Cashier)
 */
export async function closePosShift(params: {
  shiftId: string;
  closingCash: number;
  notes?: string;
  targetBranchCode?: string;
}) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
    "cashier",
  ]);

  if (!tenantId) {
    return { ok: false, error: "Tenant not found" };
  }

  try {
    const shiftRef = adminDb.collection("tenants").doc(tenantId).collection("posShifts").doc(params.shiftId);
    const snap = await shiftRef.get();

    if (!snap.exists) {
      return { ok: false, error: "Shift not found" };
    }

    const shiftData = snap.data()!;
    if (shiftData.status === "CLOSED") {
      return { ok: false, error: "Shift is already closed" };
    }

    const openingCash = Number(shiftData.openingCash || 0);
    const shiftSales = Number(shiftData.shiftTotalAmount || 0);
    const actualClosingCash = Number(params.closingCash || 0);
    const expectedCash = openingCash + shiftSales;
    const difference = actualClosingCash - expectedCash;

    await shiftRef.update({
      status: "CLOSED",
      closedAt: FieldValue.serverTimestamp(),
      closedBy: session.user?.name || session.user?.email || "Manager",
      closingCash: actualClosingCash,
      expectedCash,
      cashDifference: difference,
      closingNotes: params.notes || "",
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "POS_SHIFT_CLOSED",
      actionType: "POS_SHIFT_CLOSED",
      actorId: session.user?.email,
      tenantId,
      branchCode: shiftData.branchCode || "HQ",
      details: `Closed shift for ${shiftData.counterName}. Shift Total: ₹${shiftSales}, Cash Counted: ₹${actualClosingCash} (Diff: ₹${difference})`,
      severity: difference !== 0 ? "WARNING" : "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/pos");
    revalidatePath("/cashier");
    revalidatePath("/guard");

    return {
      ok: true,
      expectedCash,
      actualClosingCash,
      difference,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to close shift." };
  }
}

/**
 * Add a new POS Counter (Manager / Admin only)
 */
export async function createPosCounter(params: {
  name: string;
  pin: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  branchCode?: string;
}) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  if (!tenantId) {
    return { ok: false, error: "Tenant not found." };
  }

  const cleanPin = (params.pin || "").trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN must be exactly 4 numeric digits." };
  }

  try {
    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    const tenantData = tenantDoc.data() || {};
    const plan = (tenantData.subscriptionPlan || "mini").toLowerCase();
    const extraCounters = Number(tenantData.extraPosCountersPurchased || 0);
    const maxCounters = getMaxPosCounters(plan, extraCounters);

    const countersRef = adminDb.collection("tenants").doc(tenantId).collection("posCounters");
    const countSnap = await countersRef.get();

    if (countSnap.size >= maxCounters) {
      return {
        ok: false,
        error: `Counter limit reached for your plan (${countSnap.size}/${maxCounters}). Please upgrade your plan to add more POS counters.`,
      };
    }

    const hashedPin = await bcrypt.hash(cleanPin, 10);
    const counterDocRef = countersRef.doc();

    await counterDocRef.set({
      id: counterDocRef.id,
      name: params.name.trim(),
      pin: hashedPin,
      assignedStaffId: params.assignedStaffId || "",
      assignedStaffName: params.assignedStaffName || "",
      branchCode: resolveStoreScope(role, storeId, params.branchCode) || "HQ",
      isActive: true,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.user?.email || "Manager",
      tenantId,
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "POS_COUNTER_CREATED",
      actionType: "POS_COUNTER_CREATED",
      actorId: session.user?.email,
      tenantId,
      details: `Created new POS terminal: "${params.name}" (Assigned: ${params.assignedStaffName || "None"})`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/pos");
    revalidatePath("/cashier");
    return { ok: true, counterId: counterDocRef.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to create counter." };
  }
}

/**
 * Reset Counter PIN (Manager Override)
 */
export async function resetPosCounterPin(params: {
  counterId: string;
  newPin: string;
}) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  if (!tenantId) {
    return { ok: false, error: "Tenant not found." };
  }

  const cleanPin = (params.newPin || "").trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN must be exactly 4 numeric digits." };
  }

  try {
    const hashedPin = await bcrypt.hash(cleanPin, 10);
    const counterRef = adminDb.collection("tenants").doc(tenantId).collection("posCounters").doc(params.counterId);

    await counterRef.update({
      pin: hashedPin,
      failedAttempts: 0,
      lockedUntil: null,
      pinUpdatedAt: FieldValue.serverTimestamp(),
      pinUpdatedBy: session.user?.email || "Manager",
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "POS_COUNTER_PIN_RESET",
      actionType: "POS_COUNTER_PIN_RESET",
      actorId: session.user?.email,
      tenantId,
      details: `Reset PIN for counter ${params.counterId}`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/pos");
    revalidatePath("/cashier");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to reset PIN." };
  }
}

/**
 * Enable or disable a counter (Manager only)
 */
export async function togglePosCounterActive(params: {
  counterId: string;
  isActive: boolean;
}) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) return { ok: false, error: "Tenant not found." };

  try {
    const counterRef = adminDb.collection("tenants").doc(tenantId).collection("posCounters").doc(params.counterId);
    await counterRef.update({
      isActive: params.isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath("/pos");
    revalidatePath("/cashier");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update counter state." };
  }
}
