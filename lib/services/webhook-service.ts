import { adminDb } from "@/lib/firebase-admin";

export type FailedDelivery = { id: string; eventType: string; error: string; httpStatus: number | null };

export async function getFailedDeliveries(tenantId: string): Promise<FailedDelivery[]> {
  const snap = await adminDb.collection("webhook_deliveries")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "FAILED")
    .orderBy("failedAt", "desc")
    .limit(20)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, eventType: d.eventType ?? "UNKNOWN_EVENT", error: d.error ?? `HTTP ${d.httpStatus}`, httpStatus: d.httpStatus ?? null };
  });
}