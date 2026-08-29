"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function searchOrderForRefund(orderId: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  const doc = await adminDb.collection("orders").doc(orderId).get();
  if (!doc.exists) return { ok: false, error: "Order Not Found!" };

  const data = doc.data()!;
  const isSuperAdmin = role === "super_admin";

  if (!isSuperAdmin) {
    if (!tenantId || data.tenantId !== tenantId) {
      return { ok: false, error: "ACCESS DENIED: Tenant Breach Blocked!" };
    }
    if (role === "manager" && (!storeId || data.branchCode !== storeId)) {
      return { ok: false, error: "ACCESS DENIED: Store Breach Blocked!" };
    }
  }

  return {
    ok: true,
    order: {
      id: doc.id,
      status: (data.status ?? "").toString().toUpperCase(),
      exitStatus: (data.exitStatus ?? "").toString().toUpperCase(),
      totalAmount: parseFloat(data.totalAmount ?? "0") || 0,
      trustScore: 85, // mock, same as Flutter placeholder
    },
  };
}

export async function processRefund(params: {
  orderId: string;
  refundTier: "WALLET" | "SOURCE" | "PARTIAL";
  refundAmount: number;
  reason: string;
}) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);

  if (!params.reason.trim()) return { ok: false, error: "Refund reason is required for Audit logs." };
  if (params.refundAmount <= 0) return { ok: false, error: "Invalid refund amount." };

  const orderRef = adminDb.collection("orders").doc(params.orderId);
  const refundRef = adminDb.collection("refunds").doc(`ref_${params.orderId}`); // idempotency key

  try {
    await adminDb.runTransaction(async (tx) => {
      const existingRefund = await tx.get(refundRef);
      if (existingRefund.exists) throw new Error("FRAUD SHIELD: A refund for this order has already been initiated!");

      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("Order vanished!");
      const orderData = orderSnap.data()!;

      const exitStatus = (orderData.exitStatus ?? "").toString().toUpperCase();
      if (exitStatus === "COMPLETED" || exitStatus === "EXITED") {
        throw new Error("Cannot refund! The customer has already exited with the items.");
      }

      tx.set(refundRef, {
        orderId: params.orderId,
        amount: params.refundAmount,
        tier: params.refundTier,
        status: params.refundTier === "WALLET" ? "COMPLETED" : "PROCESSING",
        reason: params.reason.trim(),
        processedBy: session.user?.email ?? "System",
        timestamp: FieldValue.serverTimestamp(),
        tenantId,
      });

      tx.update(orderRef, {
        status: "REFUNDED",
        exitStatus: "CANCELLED_AND_REFUNDED",
        refundId: `ref_${params.orderId}`,
      });

      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "REFUND_INITIATED",
        orderId: params.orderId,
        amount: params.refundAmount,
        tier: params.refundTier,
        adminId: session.user?.email,
        timestamp: FieldValue.serverTimestamp(),
        tenantId,
        branchCode: storeId,
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Refund failed" };
  }

  revalidatePath("/refund");
  return { ok: true };
}