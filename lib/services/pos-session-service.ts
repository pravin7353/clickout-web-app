import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getMaxPosCounters } from "@/lib/plan-limits";

export const POS_SESSION_TIMEOUT_MS = 60 * 1000; // 60 seconds of no heartbeat = session expired

export interface ActivePosTerminalSession {
  sessionId: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string;
  branchCode?: string;
  startedAt?: any;
  lastHeartbeatMs: number;
}

export interface PosSessionCheckResult {
  allowed: boolean;
  sessionId: string;
  activeCount: number;
  maxAllowed: number;
  planName: string;
  extraCounters: number;
  activeStaffList: { name: string; email: string }[];
  error?: string;
  message?: string;
}

/**
 * Fetch all active sessions for a tenant that sent heartbeat within POS_SESSION_TIMEOUT_MS
 */
export async function getActivePosTerminalSessions(
  tenantId: string
): Promise<ActivePosTerminalSession[]> {
  try {
    const cutoffMs = Date.now() - POS_SESSION_TIMEOUT_MS;
    const sessionsRef = adminDb.collection("tenants").doc(tenantId).collection("activePosSessions");
    const snap = await sessionsRef.get();

    const active: ActivePosTerminalSession[] = [];
    const expiredDocIds: string[] = [];

    snap.docs.forEach((doc) => {
      const data = doc.data();
      const lastMs = Number(data.lastHeartbeatMs || 0);
      if (lastMs >= cutoffMs) {
        active.push({
          sessionId: doc.id,
          staffId: data.staffId || "",
          staffName: data.staffName || "Cashier Staff",
          staffEmail: data.staffEmail || "",
          role: data.role || "cashier",
          branchCode: data.branchCode || "",
          lastHeartbeatMs: lastMs,
        });
      } else {
        expiredDocIds.push(doc.id);
      }
    });

    // Asynchronously prune expired sessions to keep the collection clean
    if (expiredDocIds.length > 0) {
      const batch = adminDb.batch();
      expiredDocIds.slice(0, 50).forEach((id) => {
        batch.delete(sessionsRef.doc(id));
      });
      batch.commit().catch(() => {});
    }

    return active;
  } catch (err) {
    console.error("getActivePosTerminalSessions error:", err);
    return [];
  }
}

/**
 * Acquire or refresh an active POS terminal session for a cashier
 */
export async function acquirePosTerminalSession(params: {
  tenantId: string;
  sessionId: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string;
  branchCode?: string;
}): Promise<PosSessionCheckResult> {
  const { tenantId, sessionId, staffId, staffName, staffEmail, role, branchCode } = params;

  // 1. Resolve tenant plan & allowed terminal limits
  const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
  const tData = tenantDoc.data() || {};
  const planName = (tData.subscriptionPlan || "spark").toLowerCase();
  const extraCounters = Number(tData.extraPosCountersPurchased || 0);
  const maxAllowed = getMaxPosCounters(planName, extraCounters);

  const activeSessions = await getActivePosTerminalSessions(tenantId);
  const sessionsRef = adminDb.collection("tenants").doc(tenantId).collection("activePosSessions");

  // Check if current device session or staff member already has an active slot
  const existingIndex = activeSessions.findIndex(
    (s) => s.sessionId === sessionId || (staffId && s.staffId === staffId)
  );

  const nowMs = Date.now();

  if (existingIndex !== -1) {
    // Refresh existing session
    const docId = activeSessions[existingIndex].sessionId;
    await sessionsRef.doc(docId).set(
      {
        sessionId: docId,
        staffId,
        staffName,
        staffEmail,
        role,
        branchCode: branchCode || "HQ",
        lastHeartbeatMs: nowMs,
        lastHeartbeatAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      allowed: true,
      sessionId: docId,
      activeCount: activeSessions.length,
      maxAllowed,
      planName: planName.toUpperCase(),
      extraCounters,
      activeStaffList: activeSessions.map((s) => ({ name: s.staffName, email: s.staffEmail })),
    };
  }

  // New session request: Check if plan limit is reached
  if (activeSessions.length >= maxAllowed) {
    return {
      allowed: false,
      error: "LIMIT_REACHED",
      sessionId,
      activeCount: activeSessions.length,
      maxAllowed,
      planName: planName.toUpperCase(),
      extraCounters,
      activeStaffList: activeSessions.map((s) => ({ name: s.staffName, email: s.staffEmail })),
      message: `Active POS Terminal limit reached (${activeSessions.length}/${maxAllowed}). Your ${planName.toUpperCase()} plan allows maximum ${maxAllowed} concurrent terminal(s). Additional counters are ₹199/counter/month.`,
    };
  }

  // Register new terminal session
  await sessionsRef.doc(sessionId).set({
    sessionId,
    staffId,
    staffName,
    staffEmail,
    role,
    branchCode: branchCode || "HQ",
    startedAt: FieldValue.serverTimestamp(),
    lastHeartbeatMs: nowMs,
    lastHeartbeatAt: FieldValue.serverTimestamp(),
  });

  const updatedStaffList = [
    ...activeSessions.map((s) => ({ name: s.staffName, email: s.staffEmail })),
    { name: staffName, email: staffEmail },
  ];

  return {
    allowed: true,
    sessionId,
    activeCount: activeSessions.length + 1,
    maxAllowed,
    planName: planName.toUpperCase(),
    extraCounters,
    activeStaffList: updatedStaffList,
  };
}

/**
 * Heartbeat to keep active session alive while cashier is working
 */
export async function heartbeatPosTerminalSession(params: {
  tenantId: string;
  sessionId: string;
}): Promise<boolean> {
  try {
    const { tenantId, sessionId } = params;
    const sessionRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("activePosSessions")
      .doc(sessionId);

    const doc = await sessionRef.get();
    if (!doc.exists) return false;

    await sessionRef.update({
      lastHeartbeatMs: Date.now(),
      lastHeartbeatAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Release / close active session on logout or tab exit
 */
export async function releasePosTerminalSession(params: {
  tenantId: string;
  sessionId: string;
}): Promise<void> {
  try {
    const { tenantId, sessionId } = params;
    await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("activePosSessions")
      .doc(sessionId)
      .delete();
  } catch (err) {
    console.error("releasePosTerminalSession error:", err);
  }
}
