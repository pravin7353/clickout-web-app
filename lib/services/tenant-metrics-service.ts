import { adminDb } from "@/lib/firebase-admin";

export type TenantMetrics = {
  totalStores: number;
  totalStaff: number;
  activeToday: number;
  pendingAlerts: number;
};

function startOfTodayIST(): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - istOffsetMs);
}

export async function getTenantMetrics(tenantId: string, storeCount: number): Promise<TenantMetrics> {
  const [staffSnap, alertsSnap] = await Promise.all([
    adminDb.collection("staff").where("tenantId", "==", tenantId).where("isDeleted", "==", false).get(),
    adminDb
      .collection("admin_audit_logs")
      .where("tenantId", "==", tenantId)
      .where("severity", "==", "CRITICAL")
      .where("timestamp", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get(),
  ]);

  const todayStart = startOfTodayIST();
  let activeToday = 0;
  staffSnap.docs.forEach((doc) => {
    const data = doc.data();
    const role = (data.role ?? "").toString().toUpperCase();
    if (role !== "CASHIER" && role !== "GUARD") return;
    const lastLoginAt = data.lastLoginAt?.toDate?.();
    if (lastLoginAt && lastLoginAt >= todayStart) activeToday += 1;
  });

  return {
    totalStores: storeCount,
    totalStaff: staffSnap.size,
    activeToday,
    pendingAlerts: alertsSnap.size,
  };
}