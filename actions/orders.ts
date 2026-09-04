"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { Timestamp } from "firebase-admin/firestore";
import { resolveStoreScope } from "@/lib/rbac";

export async function flagOrderAsFraud(orderId: string, reason: string) {
  const { session } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  await adminDb.collection("orders").doc(orderId).update({
    fraudFlagged: true,
    fraudReason: reason,
    flaggedBy: session.user?.email,
    flaggedAt: new Date().toISOString(),
  });

  revalidatePath("/dashboard/compliance");
}

export async function exportOrdersCsv(storeId: string, from: string, to: string) {
  const { session } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const snap = await adminDb
    .collection("orders")
    .where("storeId", "==", storeId)
    .where("createdAt", ">=", from)
    .where("createdAt", "<=", to)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const ROWS_PER_PAGE = 10;

export type OrderRow = {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  paymentMode: string;
  timestampMs: number;
};

function deriveStatus(o: FirebaseFirestore.DocumentData): string {
  const p = (o.paymentStatus ?? "").toString().toUpperCase();
  const e = (o.exitStatus ?? "").toString().toUpperCase();
  const wasEverRejected = o.wasEverRejected === true;
  const qrConsumed = o.qrConsumed === true;

  const isCleanExit =
    e === "COMPLETED" || e === "EXITED" || e === "APPROVED" || (qrConsumed && e !== "REJECTED");

  if (isCleanExit) return wasEverRejected ? "Fix & Exit" : "Clear Exit";
  if (e === "REJECTED") return "Reject";
  if (e === "EXPIRED" || e === "EXPIRED_BY_SYSTEM") return "QR Expire";
  if (p === "REFUNDED") return "Refund";
  if (p === "PAID" && (e === "PENDING" || e === "READY_FOR_EXIT")) return "Gate Pass Pending";
  return "Pending";
}

export async function fetchOrdersPage(params: {
  statusFilter: string;
  searchQuery: string;
  sortDesc: boolean;
  cursorTimestampMs: number | null;
  storeParam?: string;
}) {
  const { role, tenantId, storeId: sessionStoreId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const storeId = resolveStoreScope(role, sessionStoreId, params.storeParam);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let query: FirebaseFirestore.Query = adminDb.collection("orders");

  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (storeId) {
  query = query.where("branchCode", "==", storeId);
  }

  query = query.where("timestamp", ">=", Timestamp.fromDate(startOfDay));

  if (params.searchQuery.trim()) {
    query = query.where("orderId", "==", params.searchQuery.trim());
  } else {
    if (params.statusFilter !== "ALL") {
      if (params.statusFilter === "Clear Exit" || params.statusFilter === "Fix & Exit") {
        query = query.where("exitStatus", "in", ["COMPLETED", "EXITED", "APPROVED"]);
      } else if (params.statusFilter === "Gate Pass Pending") {
        query = query.where("exitStatus", "in", ["PENDING", "READY_FOR_EXIT"]);
      } else if (params.statusFilter === "Reject") {
        query = query.where("exitStatus", "==", "REJECTED");
      } else if (params.statusFilter === "Refund") {
        query = query.where("paymentStatus", "==", "REFUNDED");
      } else if (params.statusFilter === "QR Expire") {
        query = query.where("exitStatus", "in", ["EXPIRED_BY_SYSTEM", "EXPIRED"]);
      }
    }

    query = query.orderBy("timestamp", params.sortDesc ? "desc" : "asc");

    if (params.cursorTimestampMs) {
      query = query.startAfter(Timestamp.fromMillis(params.cursorTimestampMs));
    }

    query = query.limit(ROWS_PER_PAGE);
  }

  const snap = await query.get();

  let docs = snap.docs;
  if (params.statusFilter === "Fix & Exit") {
    docs = docs.filter((d) => d.data().wasEverRejected === true);
  }

  const orders: OrderRow[] = docs.map((d) => {
    const data = d.data();
    const ts = (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now();
    return {
      id: d.id,
      orderId: (data.orderId ?? d.id).toString(),
      amount: parseFloat(data.totalAmount ?? data.amount ?? "0") || 0,
      status: deriveStatus(data),
      paymentMode: (data.paymentMode ?? "UPI").toString().toUpperCase(),
      timestampMs: ts,
    };
  });

  return { orders, hasMore: snap.docs.length === ROWS_PER_PAGE };
}