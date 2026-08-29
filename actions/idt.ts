"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { Timestamp } from "firebase-admin/firestore";

const PAGE_SIZE = 20;

export type IdtDeposit = {
  id: string;
  productName: string;
  quantity: number;
  branchCode: string;
  timestampMs: number;
};

export async function fetchIdtDeposits(cursorTimestampMs: number | null) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  let query: FirebaseFirestore.Query = adminDb
    .collection("idt_deposits")
    .where("status", "==", "VERIFIED")
    .orderBy("timestamp", "desc");

  if (role !== "super_admin" && tenantId) query = query.where("tenantId", "==", tenantId);
  if (storeId && storeId !== "HQ") query = query.where("branchCode", "==", storeId);

  if (cursorTimestampMs) query = query.startAfter(Timestamp.fromMillis(cursorTimestampMs));
  query = query.limit(PAGE_SIZE);

  const snap = await query.get();
  const deposits: IdtDeposit[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      productName: data.productName ?? data.name ?? "Unknown Item",
      quantity: data.quantity ?? 0,
      branchCode: data.branchCode ?? "",
      timestampMs: (data.timestamp as Timestamp | undefined)?.toMillis() ?? Date.now(),
    };
  });

  return { deposits, hasMore: snap.docs.length === PAGE_SIZE };
}