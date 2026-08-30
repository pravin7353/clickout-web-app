import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type GateOrder = { id: string; amount: number; paymentMode: string; exitStatus: string; timestampMs: number };

export async function getPendingExits(role: string, tenantId: string | null, storeId: string | null): Promise<GateOrder[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isSuperAdmin = role === "super_admin";

  let query: FirebaseFirestore.Query = adminDb.collection("orders")
    .where("paymentStatus", "==", "PAID")
    .where("exitStatus", "==", "PENDING")
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (!isSuperAdmin && tenantId) query = query.where("tenantId", "==", tenantId);
  if (!isSuperAdmin && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.orderBy("timestamp", "desc").limit(30).get();
  return snap.docs.map(mapGateOrder);
}

export async function getGateHistory(role: string, tenantId: string | null, storeId: string | null): Promise<GateOrder[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isSuperAdmin = role === "super_admin";

  let query: FirebaseFirestore.Query = adminDb.collection("orders")
    .where("exitStatus", "in", ["APPROVED", "REJECTED", "COMPLETED", "FORCE_OVERRIDDEN"])
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (!isSuperAdmin && tenantId) query = query.where("tenantId", "==", tenantId);
  if (!isSuperAdmin && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.orderBy("timestamp", "desc").limit(20).get();
  return snap.docs.map(mapGateOrder);
}

function mapGateOrder(doc: FirebaseFirestore.QueryDocumentSnapshot): GateOrder {
  const data = doc.data();
  return {
    id: doc.id,
    amount: parseFloat(data.totalAmount ?? "0") || 0,
    paymentMode: (data.paymentMode ?? "UNKNOWN").toString(),
    exitStatus: (data.exitStatus ?? "").toString(),
    timestampMs: (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
  };
}