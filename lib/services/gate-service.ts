import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type GateItem = {
  name: string;
  quantity: number;
  price: number;
};

export type GateOrder = {
  id: string;
  invoiceNo: string;
  amount: number;
  paymentMode: string;
  exitStatus: string;
  timestampMs: number;
  customerName?: string;
  customerPhone?: string;
  itemsCount: number;
  items: GateItem[];
  branchCode: string;
};

export async function getPendingExits(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<GateOrder[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("paymentStatus", "==", "PAID")
    .where("exitStatus", "in", ["PENDING", "READY_FOR_EXIT"])
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.orderBy("timestamp", "desc").limit(40).get();
  return snap.docs.map(mapGateOrder);
}

export async function getGateHistory(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<GateOrder[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let query: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("exitStatus", "in", ["APPROVED", "REJECTED", "COMPLETED", "FORCE_OVERRIDDEN"])
    .where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.orderBy("timestamp", "desc").limit(30).get();
  return snap.docs.map(mapGateOrder);
}

function mapGateOrder(doc: FirebaseFirestore.QueryDocumentSnapshot): GateOrder {
  const data = doc.data();
  const itemsList = Array.isArray(data.items)
    ? data.items.map((i: any) => ({
        name: i.name ?? "Product",
        quantity: Number(i.quantity ?? i.qty ?? 1),
        price: Number(i.price ?? i.finalUnitPrice ?? 0),
      }))
    : [];

  return {
    id: doc.id,
    invoiceNo: data.invoiceNo ?? doc.id.slice(0, 8).toUpperCase(),
    amount: parseFloat(data.totalAmount ?? data.amount ?? "0") || 0,
    paymentMode: (data.paymentMode ?? "UPI").toString().toUpperCase(),
    exitStatus: (data.exitStatus ?? "PENDING").toString().toUpperCase(),
    timestampMs: (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
    customerName: data.customerName ?? data.userName,
    customerPhone: data.customerPhone,
    itemsCount: itemsList.reduce((sum, i) => sum + i.quantity, 0),
    items: itemsList,
    branchCode: data.branchCode ?? "HQ",
  };
}