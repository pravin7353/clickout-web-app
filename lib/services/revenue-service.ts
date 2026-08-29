import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

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

function deriveOrderStatus(order: FirebaseFirestore.DocumentData): string {
  const pStatus = (order.paymentStatus ?? order.status ?? "").toString().toUpperCase();
  const eStatus = (order.exitStatus ?? "").toString().toUpperCase();
  const wasRejected = order.wasEverRejected === true;

  let isExpired = order.systemRemark === "AUTO_MIDNIGHT_EXPIRE";
  if (order.qrExpiresAt instanceof Timestamp) {
    isExpired = isExpired || order.qrExpiresAt.toDate() < new Date();
  }

  if (pStatus === "REFUNDED" || order.refund === true) return "Refund";

  if (pStatus === "PAID" || pStatus === "SUCCESS") {
    if (eStatus === "REJECTED") return "Reject";
    if (eStatus === "EXITED" || eStatus === "COMPLETED" || eStatus === "APPROVED") {
      return wasRejected ? "Fix & Exit" : "Clear Exit";
    }
    if (isExpired) return "QR Expire";
    return "Gate Pass Pending";
  }
  return "Pending";
}

export async function calculateRevenueMetrics(
  role: string,
  tenantId: string | null,
  storeId: string | null
): Promise<RevenueMetrics> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (role === "manager" && storeId) {
    query = query.where("branchCode", "==", storeId);
  }

  const snap = await query.get();

  let grossRevenue = 0, totalRevenue = 0, pendingRevenue = 0, rejectedRevenue = 0;
  let refundAmount = 0, expireAmount = 0;
  let totalOrders = 0, successfulExited = 0, pendingAtVerifier = 0, rejectedAtVerifier = 0;
  let refundCount = 0, expireCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const pStatus = (data.paymentStatus ?? data.status ?? "").toString().toUpperCase();

    if (pStatus !== "PAID" && pStatus !== "SUCCESS" && pStatus !== "REFUNDED" && data.refund !== true) {
      continue;
    }

    const amount = parseFloat(data.totalAmount ?? "0") || 0;
    const status = deriveOrderStatus(data);

    if (status === "Refund") {
      refundAmount += amount;
      refundCount++;
    }

    if (pStatus === "PAID" || pStatus === "SUCCESS") {
      grossRevenue += amount;
      totalOrders++;

      switch (status) {
        case "Clear Exit":
        case "Fix & Exit":
          totalRevenue += amount;
          successfulExited++;
          break;
        case "Gate Pass Pending":
          pendingRevenue += amount;
          pendingAtVerifier++;
          break;
        case "QR Expire":
          pendingRevenue += amount;
          expireAmount += amount;
          expireCount++;
          break;
        case "Reject":
          rejectedRevenue += amount;
          rejectedAtVerifier++;
          break;
      }
    }
  }

  return {
    grossRevenue, totalRevenue, pendingRevenue, rejectedRevenue,
    totalOrders, successfulExited, pendingAtVerifier, rejectedAtVerifier,
    refundCount, refundAmount, expireCount, expireAmount,
  };
}