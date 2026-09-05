import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  normalizeCanonicalOrder,
  computeCanonicalFinancials,
  deriveCanonicalExitStatus,
} from "@/lib/services/canonical-accounting";

export type RevenueMetrics = {
  grossRevenue: number;
  totalRevenue: number;
  pendingRevenue: number;
  rejectedRevenue: number;
  totalOrders: number;
  successfulExited: number;
  pendingAtVerifier: number;
  rejectedAtVerifier: number;
  refundCount: number;
  refundAmount: number;
  expireCount: number;
  expireAmount: number;
};

export async function calculateRevenueMetrics(
  role: string,
  tenantId: string | null,
  storeId: string | null
): Promise<RevenueMetrics> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  // 1. Query today's orders
  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snap = await query.get();
  const todayOrders = snap.docs.map((doc) => normalizeCanonicalOrder(doc.id, doc.data()));

  let grossRevenue = 0;
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let rejectedRevenue = 0;
  let totalOrders = todayOrders.length;
  let successfulExited = 0;
  let pendingAtVerifier = 0;
  let rejectedAtVerifier = 0;
  let expireCount = 0;
  let expireAmount = 0;

  for (const o of todayOrders) {
    grossRevenue += o.grossAmount;

    if (o.exitStatus === "APPROVED") {
      totalRevenue += o.netRealizedAmount;
      successfulExited++;
    } else if (o.exitStatus === "REJECTED_EXIT") {
      rejectedRevenue += o.grossAmount;
      rejectedAtVerifier++;
    } else if (o.exitStatus === "PENDING_EXIT") {
      pendingRevenue += o.grossAmount;
      pendingAtVerifier++;
    }
  }

  // 2. Query refunds from refunds collection (authoritative source of refund actions)
  let refundCount = 0;
  let refundAmount = 0;

  try {
    let refundsQuery: FirebaseFirestore.Query = adminDb.collection("refunds");
    if (storeId) {
      refundsQuery = refundsQuery.where("branchCode", "==", storeId);
    } else if (role !== "super_admin" && tenantId) {
      refundsQuery = refundsQuery.where("tenantId", "==", tenantId);
    }

    const rSnap = await refundsQuery.get();
    const todayRefundDocs = rSnap.docs.filter((rd) => {
      const data = rd.data();
      const ts = data.timestamp;
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d >= startOfDay;
    });

    refundCount = todayRefundDocs.length;
    todayRefundDocs.forEach((rd) => {
      refundAmount += Number(rd.data().amount ?? 0);
    });
  } catch (err) {
    console.error("Failed to query refunds collection in calculateRevenueMetrics:", err);
  }

  // Fallback: If no records in refunds collection, tally refunded todayOrders
  if (refundCount === 0) {
    for (const o of todayOrders) {
      if (o.isRefunded) {
        refundCount++;
        refundAmount += o.refundAmount;
      }
    }
  }

  return {
    grossRevenue,
    totalRevenue,
    pendingRevenue,
    rejectedRevenue,
    totalOrders,
    successfulExited,
    pendingAtVerifier,
    rejectedAtVerifier,
    refundCount,
    refundAmount,
    expireCount,
    expireAmount,
  };
}

export async function getRefundSummary(
  tenantId: string | null,
  storeId: string | null
): Promise<{ refundCount: number; refundAmount: number }> {
  const metrics = await calculateRevenueMetrics("manager", tenantId, storeId);
  return {
    refundCount: metrics.refundCount,
    refundAmount: metrics.refundAmount,
  };
}

export async function getQrExpiredSummary(
  tenantId: string | null,
  storeId: string | null
): Promise<{ expireCount: number; expireAmount: number }> {
  const metrics = await calculateRevenueMetrics("manager", tenantId, storeId);
  return {
    expireCount: metrics.expireCount,
    expireAmount: metrics.expireAmount,
  };
}

export async function getIndustryBenchmark(): Promise<number> {
  try {
    const snap = await adminDb
      .collection("platform_fraud_patterns")
      .doc("industry_benchmark")
      .get();
    if (!snap.exists) return 2.0;
    const data = snap.data();
    return typeof data?.avgLeakagePct === "number" ? data.avgLeakagePct : 2.0;
  } catch (error) {
    console.error("Failed to read industry benchmark, falling back to static estimate:", error);
    return 2.0;
  }
}