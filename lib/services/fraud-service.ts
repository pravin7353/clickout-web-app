import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type SuspectStaff = {
  id: string;
  displayTitle: string;
  trustScore: number;
  status: string;
};

export type HighRiskOrder = {
  id: string;
  exitStatus: string;
  amount: number;
};

export async function getSuspectStaff(role: string, tenantId: string | null, storeId: string | null): Promise<SuspectStaff[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("employees").where("trustScore", "<", 80);

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (role === "manager" && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.orderBy("trustScore", "asc").limit(20).get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    const phone = data.phone ?? data.mobile ?? data.phoneNo ?? "";
    const email = data.email ?? "";
    const name = data.name ?? "";
    let displayTitle = `Guard ID: ${doc.id.slice(0, 6).toUpperCase()}`;
    if (phone) displayTitle = phone;
    if (email) displayTitle = email.split("@")[0];
    if (name) displayTitle = name;

    return {
      id: doc.id,
      displayTitle,
      trustScore: parseInt(data.trustScore?.toString() ?? "100", 10) || 100,
      status: (data.status ?? "ACTIVE").toString().toUpperCase(),
    };
  });
}

export async function getHighRiskOrders(role: string, tenantId: string | null): Promise<HighRiskOrder[]> {
  const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("riskLevel", "==", "HIGH")
    .where("timestamp", ">=", Timestamp.fromDate(last7Days));

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);

  const snap = await query.orderBy("timestamp", "desc").limit(30).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    exitStatus: (doc.data().exitStatus ?? "UNKNOWN").toString(),
    amount: parseFloat(doc.data().totalAmount ?? "0") || 0,
  }));
}

export type LeakageBuckets = { normal: number; warning: number; critical: number; escalated: number };

export async function getLeakageBuckets(role: string, tenantId: string | null, storeId: string | null): Promise<LeakageBuckets> {
  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("paymentStatus", "==", "PAID")
    .where("exitStatus", "in", ["PENDING", "READY_FOR_EXIT"])
    .limit(500);

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (role === "manager" && storeId) query = query.where("branchCode", "==", storeId);

  const snap = await query.get();
  const now = Date.now();
  const buckets: LeakageBuckets = { normal: 0, warning: 0, critical: 0, escalated: 0 };

  for (const doc of snap.docs) {
    const data = doc.data();
    const expiresAt = (data.qrExpiresAt as Timestamp | undefined)?.toDate();
    if (expiresAt && expiresAt.getTime() < now) continue;

    const paidAt = (data.timestamp as Timestamp | undefined)?.toDate() ?? new Date();
    const elapsedMin = (now - paidAt.getTime()) / 60000;

    if (elapsedMin < 5) buckets.normal++;
    else if (elapsedMin < 30) buckets.warning++;
    else if (elapsedMin < 120) buckets.critical++;
    else buckets.escalated++;
  }

  return buckets;
}