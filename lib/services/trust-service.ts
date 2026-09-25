import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export interface DeviceLockRecord {
  fingerprintHash: string;
  deactivatedFromTenantId: string;
  deactivatedStaffId?: string;
  deactivatedAt: any;
  expiresAtMs: number;
  expiresAt: any;
  reason: string;
}

export interface ResellerFlagRecord {
  id: string;
  ipAddress: string;
  distinctTenantIds: string[];
  tenantCount: number;
  windowDays: number;
  detectedAt: any;
  status: "PENDING_REVIEW" | "REVIEWED" | "DISMISSED";
  riskScore: number;
  reason: string;
  actionTaken: string;
}

/**
 * 1. Checks and updates device fingerprints for staff logins.
 * For tenant_admin: If the fingerprint does not match their last 3 known fingerprints,
 * log a WARNING audit event (without blocking access).
 */
export async function handleLoginFingerprint(params: {
  staffRef: FirebaseFirestore.DocumentReference;
  staffData: FirebaseFirestore.DocumentData;
  role: string;
  email: string;
  tenantId: string | null;
  deviceFingerprint?: string;
  ipAddress?: string;
}): Promise<{ suspiciousLogin: boolean }> {
  const { staffRef, staffData, role, email, tenantId, deviceFingerprint, ipAddress } = params;
  const normalizedRole = role.toLowerCase().trim();
  const cleanFp = (deviceFingerprint || "").trim();

  let suspiciousLogin = false;

  if (cleanFp && cleanFp !== "server_env" && cleanFp !== "unknown_fp") {
    const existingFps: string[] = Array.isArray(staffData.knownFingerprints)
      ? staffData.knownFingerprints
      : staffData.deviceFingerprint
      ? [staffData.deviceFingerprint]
      : [];

    // Tenant Admin Anomaly Detection: Check last 3 known fingerprints
    if (normalizedRole === "tenant_admin" && existingFps.length > 0) {
      const last3 = existingFps.slice(-3);
      if (!last3.includes(cleanFp)) {
        suspiciousLogin = true;

        // Log Warning to admin_audit_logs (Detection / Flagging only - Never block)
        await adminDb.collection("admin_audit_logs").add({
          tenantId: tenantId ?? "UNKNOWN",
          timestamp: FieldValue.serverTimestamp(),
          actorId: email,
          actorEmail: email,
          action: "SUSPICIOUS_DEVICE_LOGIN",
          actionType: "SUSPICIOUS_DEVICE_LOGIN",
          targetCollection: "staff",
          targetId: staffRef.id,
          details: `Tenant admin logged in from an unrecognized device fingerprint (${cleanFp.slice(0, 16)}...). Did not match last 3 known fingerprints.`,
          severity: "WARNING",
          fingerprint: cleanFp,
          ipAddress: ipAddress || "unknown",
        });
      }
    }

    // Keep up to 10 recent fingerprints
    const updatedFps = existingFps.filter((fp) => fp !== cleanFp);
    updatedFps.push(cleanFp);
    if (updatedFps.length > 10) {
      updatedFps.splice(0, updatedFps.length - 10);
    }

    const updatePayload: Record<string, any> = {
      knownFingerprints: updatedFps,
      lastFingerprint: cleanFp,
      lastLoginAt: FieldValue.serverTimestamp(),
    };
    if (ipAddress) updatePayload.lastLoginIp = ipAddress;

    await staffRef.update(updatePayload);
  }

  // Record login event for rolling 7-day IP pattern analysis
  if (tenantId && ipAddress && ipAddress !== "127.0.0.1" && ipAddress !== "::1" && ipAddress !== "unknown") {
    await recordTenantLoginIp(tenantId, ipAddress, staffRef.id);
  }

  return { suspiciousLogin };
}

/**
 * 2. 30-Day Terminal Lock:
 * When a device or staff member is deactivated from a tenant, prevent that same device fingerprint
 * from being activated under a different tenantId for 30 days.
 */
export async function lockDeviceTerminal(
  fingerprint: string,
  tenantId: string,
  staffId?: string,
  reason: string = "TERMINAL_DEACTIVATED_30_DAY_LOCK"
) {
  const cleanFp = fingerprint.trim();
  if (!cleanFp || cleanFp === "server_env" || cleanFp === "unknown_fp") return;

  const lockDurationMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const expiresAtMs = Date.now() + lockDurationMs;
  const expiresAt = Timestamp.fromDate(new Date(expiresAtMs));
  const docId = `lock_${cleanFp}`;

  await adminDb.collection("device_denylist").doc(docId).set({
    fingerprintHash: cleanFp,
    deactivatedFromTenantId: tenantId,
    deactivatedStaffId: staffId || null,
    deactivatedAt: FieldValue.serverTimestamp(),
    expiresAtMs,
    expiresAt,
    reason,
  });
}

/**
 * Check if a device fingerprint is locked from cross-tenant activation.
 */
export async function checkDeviceLock(
  fingerprint: string,
  targetTenantId: string
): Promise<{ isLocked: boolean; reason?: string; deactivatedFromTenantId?: string; expiresAtMs?: number }> {
  const cleanFp = fingerprint.trim();
  if (!cleanFp || cleanFp === "server_env" || cleanFp === "unknown_fp") {
    return { isLocked: false };
  }

  const docId = `lock_${cleanFp}`;
  const docSnap = await adminDb.collection("device_denylist").doc(docId).get();
  if (!docSnap.exists) {
    return { isLocked: false };
  }

  const data = docSnap.data() as DeviceLockRecord;
  const now = Date.now();

  if (data.expiresAtMs && data.expiresAtMs > now) {
    // If the device is trying to register/activate under a DIFFERENT tenant
    if (data.deactivatedFromTenantId && data.deactivatedFromTenantId !== targetTenantId) {
      return {
        isLocked: true,
        reason: `Device fingerprint was deactivated from another tenant (${data.deactivatedFromTenantId}) and is in a 30-day cross-tenant quarantine lock.`,
        deactivatedFromTenantId: data.deactivatedFromTenantId,
        expiresAtMs: data.expiresAtMs,
      };
    }
  }

  return { isLocked: false };
}

/**
 * 3. IP Pattern Tracking & Reseller Scan:
 * Record tenant login IP with timestampMs for 7-day rolling queries.
 */
export async function recordTenantLoginIp(tenantId: string, ipAddress: string, staffId: string) {
  try {
    await adminDb.collection("tenant_login_events").add({
      tenantId,
      ipAddress,
      staffId,
      timestampMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Defensive non-blocking log
  }
}

/**
 * Scheduled scan: groups tenant login events by IP over a rolling 7-day window.
 * If > 10 distinct tenantIds share the same IP, creates an entry in `reseller_flags`
 * (super_admin-only visibility). NEVER auto-suspends an account.
 */
export async function scanResellerIpPatterns(): Promise<{
  scannedEvents: number;
  flaggedIpsCount: number;
  flags: ResellerFlagRecord[];
}> {
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const snap = await adminDb
    .collection("tenant_login_events")
    .where("timestampMs", ">=", sevenDaysAgoMs)
    .limit(2000)
    .get();

  // Group tenantIds by IP
  const ipTenantMap = new Map<string, Set<string>>();

  snap.docs.forEach((doc) => {
    const d = doc.data();
    const ip = (d.ipAddress || "").trim();
    const tId = (d.tenantId || "").trim();

    if (ip && tId && ip !== "127.0.0.1" && ip !== "::1" && ip !== "unknown" && !ip.startsWith("192.168.")) {
      if (!ipTenantMap.has(ip)) {
        ipTenantMap.set(ip, new Set<string>());
      }
      ipTenantMap.get(ip)!.add(tId);
    }
  });

  const flags: ResellerFlagRecord[] = [];

  for (const [ip, tenantSet] of ipTenantMap.entries()) {
    if (tenantSet.size > 10) {
      const distinctTenantIds = Array.from(tenantSet);
      const flagId = `flag_${ip.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const riskScore = Math.min(100, 50 + (tenantSet.size - 10) * 5);

      const flagData: ResellerFlagRecord = {
        id: flagId,
        ipAddress: ip,
        distinctTenantIds,
        tenantCount: tenantSet.size,
        windowDays: 7,
        detectedAt: FieldValue.serverTimestamp(),
        status: "PENDING_REVIEW",
        riskScore,
        reason: `IP address shared across ${tenantSet.size} distinct tenant accounts within 7 days. Possible unauthorized reseller or shared infrastructure.`,
        actionTaken: "FLAGGED_FOR_MANUAL_REVIEW", // NEVER auto-suspend
      };

      await adminDb.collection("reseller_flags").doc(flagId).set(flagData, { merge: true });

      // Write CRITICAL audit log for super_admin visibility
      await adminDb.collection("admin_audit_logs").add({
        action: "RESELLER_PATTERN_DETECTED",
        actionType: "RESELLER_PATTERN_DETECTED",
        targetCollection: "reseller_flags",
        targetId: flagId,
        ipAddress: ip,
        tenantCount: tenantSet.size,
        distinctTenantIds,
        details: `IP ${ip} is shared by ${tenantSet.size} distinct tenants. Flagged for super_admin manual review.`,
        severity: "CRITICAL",
        timestamp: FieldValue.serverTimestamp(),
      });

      flags.push(flagData);
    }
  }

  return {
    scannedEvents: snap.size,
    flaggedIpsCount: flags.length,
    flags,
  };
}

/**
 * Fetch all reseller flags (for super_admin console).
 */
export async function getResellerFlags(): Promise<ResellerFlagRecord[]> {
  const snap = await adminDb
    .collection("reseller_flags")
    .orderBy("detectedAt", "desc")
    .limit(100)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      ipAddress: d.ipAddress || "",
      distinctTenantIds: Array.isArray(d.distinctTenantIds) ? d.distinctTenantIds : [],
      tenantCount: Number(d.tenantCount || 0),
      windowDays: Number(d.windowDays || 7),
      detectedAt: d.detectedAt?.toDate ? d.detectedAt.toDate().toISOString() : null,
      status: d.status || "PENDING_REVIEW",
      riskScore: Number(d.riskScore || 0),
      reason: d.reason || "",
      actionTaken: d.actionTaken || "FLAGGED_FOR_MANUAL_REVIEW",
    };
  });
}
