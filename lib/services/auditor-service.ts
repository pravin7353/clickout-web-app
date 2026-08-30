import { adminDb } from "@/lib/firebase-admin";

export type DailyFinancials = {
  totalRevenue: number;
  cashExpected: number;
  digitalExpected: number;
  totalLeakage: number;
  cashLeakage: number;
  digitalLeakage: number;
  totalOrders: number;
  rejectedCount: number;
  pendingCount: number;
  refundCount: number;
  refundAmount: number;
  activeAlerts: string[];
};

const EMPTY: DailyFinancials = {
  totalRevenue: 0, cashExpected: 0, digitalExpected: 0, totalLeakage: 0,
  cashLeakage: 0, digitalLeakage: 0, totalOrders: 0, rejectedCount: 0,
  pendingCount: 0, refundCount: 0, refundAmount: 0, activeAlerts: [],
};

export async function getDailyFinancials(role: string, tenantId: string | null, branchCode: string | null): Promise<DailyFinancials> {
  if (!tenantId || role === "super_admin" || !branchCode) return EMPTY;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const statDocId = `${tenantId}_${branchCode}_${dateStr}`;

  const doc = await adminDb.collection("daily_store_stats").doc(statDocId).get();
  if (!doc.exists) return EMPTY;
  const data = doc.data()!;

  const totalLeakage = data.totalLeakage ?? 0;
  const rejectedCount = data.rejectedCount ?? 0;
  const refundCount = data.refundCount ?? 0;
  const refundAmount = data.refundAmount ?? 0;

  const activeAlerts: string[] = [];
  if (rejectedCount >= 3) activeAlerts.push(`CRITICAL: ${rejectedCount} Guard Rejections detected today!`);
  if (totalLeakage > 0) activeAlerts.push(`LEAKAGE ALERT: ₹${totalLeakage.toFixed(0)} stuck at exit verification.`);
  if (refundCount >= 2) activeAlerts.push(`FRAUD SPIKE: ${refundCount} Refunds (₹${refundAmount.toFixed(0)}) triggered today.`);

  return {
    totalRevenue: data.totalRevenue ?? 0,
    cashExpected: (data.cashRevenue ?? 0) + (data.cashLeakage ?? 0),
    digitalExpected: (data.upiRevenue ?? 0) + (data.upiLeakage ?? 0),
    totalLeakage,
    cashLeakage: data.cashLeakage ?? 0,
    digitalLeakage: data.upiLeakage ?? 0,
    totalOrders: data.totalOrders ?? 0,
    rejectedCount,
    pendingCount: data.pendingCount ?? 0,
    refundCount,
    refundAmount,
    activeAlerts,
  };
}