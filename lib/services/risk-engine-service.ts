import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type RejectedOrder = {
  id: string;
  amount: number;
  paymentMode: string;
  branchCode: string;
  timestampMs: number;
};

export async function getRejectedOrders(role: string, tenantId: string | null, storeId: string | null): Promise<RejectedOrder[]> {
  const isSuperAdmin = role === "super_admin";

  let query: FirebaseFirestore.Query = adminDb.collection("orders").where("exitStatus", "==", "REJECTED");

  if (!isSuperAdmin && tenantId) query = query.where("tenantId", "==", tenantId);
  if (!isSuperAdmin && storeId) query = query.where("branchCode", "==", storeId);

  query = query.orderBy("timestamp", "desc").limit(50);

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      amount: parseFloat(data.totalAmount ?? "0") || 0,
      paymentMode: (data.paymentMode ?? "UPI").toString().toUpperCase(),
      branchCode: data.branchCode ?? "",
      timestampMs: (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
    };
  });
}