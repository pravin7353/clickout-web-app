import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type RejectedOrder = {
  id: string;
  invoiceNo: string;
  amount: number;
  paymentMode: string;
  branchCode: string;
  timestampMs: number;
  reason: string;
  verifiedByGuardId: string;
  customerPhone: string;
  itemsCount: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
};

export async function getRejectedOrders(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<RejectedOrder[]> {
  if (!tenantId && role !== "super_admin") return [];

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("exitStatus", "==", "REJECTED");

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  query = query.orderBy("timestamp", "desc").limit(50);

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const amount = parseFloat(data.totalAmount ?? data.amount ?? "0") || 0;
    const items = Array.isArray(data.items) ? data.items : [];
    const itemsCount = items.reduce((s: number, i: any) => s + (Number(i.quantity ?? i.qty ?? 1)), 0);

    let severity: RejectedOrder["severity"] = "HIGH";
    if (amount > 2000 || itemsCount > 8) severity = "CRITICAL";
    else if (amount < 200) severity = "MEDIUM";

    return {
      id: doc.id,
      invoiceNo: data.invoiceNo ?? doc.id.slice(0, 8).toUpperCase(),
      amount,
      paymentMode: (data.paymentMode ?? "UPI").toString().toUpperCase(),
      branchCode: data.branchCode ?? "HQ",
      timestampMs: (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
      reason: data.rejectionReason ?? data.reason ?? "Discrepancy at exit verification",
      verifiedByGuardId: data.verifiedByGuardId ?? data.exitVerifiedBy ?? "Unknown Guard",
      customerPhone: data.customerPhone ?? "—",
      itemsCount: itemsCount || 1,
      severity,
    };
  });
}