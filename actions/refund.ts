"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, resolveStoreScope } from "@/lib/rbac";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export type RefundPayoutMethod =
  | "CASH_COUNTER"
  | "ORIGINAL_PAYMENT"
  | "MANUAL_BANK_UPI"
  | "GATEWAY_REFUND"
  | "STORE_CREDIT";

export interface RefundOrderItem {
  id?: string;
  barcode?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface ExistingRefundData {
  id: string;
  amount: number;
  method: string;
  status: string;
  reason: string;
  reference?: string;
  processedBy: string;
  createdAtMs?: number;
  staffConfirmedCashHandover?: boolean;
}

export interface ReturnPolicyInfo {
  policyType: "NON_REFUNDABLE" | "REFUNDABLE_WINDOW";
  returnWindowDays: number;
  orderAgeDays: number;
  eligibilityStatus: "ELIGIBLE" | "EXPIRED" | "POLICY_BLOCKED" | "ALREADY_REFUNDED";
  policyMessage: string;
}

export interface RefundOrderDetails {
  id: string;
  status: string;
  exitStatus: string;
  totalAmount: number;
  trustScore: number;
  customerName: string;
  customerPhone?: string | null;
  paymentMethod: string;
  gatewayTxnId: string;
  branchCode: string;
  itemCount: number;
  items: RefundOrderItem[];
  createdAtMs?: number;
  existingRefund?: ExistingRefundData | null;
  returnPolicy: ReturnPolicyInfo;
}

export async function searchOrderForRefund(orderId: string, storeParam?: string) {
  const { role, tenantId, storeId: sessionStoreId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);
  const effectiveStore = resolveStoreScope(role, sessionStoreId, storeParam);

  const cleanId = orderId.trim();
  if (!cleanId) return { ok: false, error: "Please enter an Order ID." };

  const doc = await adminDb.collection("orders").doc(cleanId).get();
  if (!doc.exists) return { ok: false, error: `Order "${cleanId}" not found!` };

  const data = doc.data()!;
  const isSuperAdmin = role === "super_admin";

  if (!isSuperAdmin) {
    if (tenantId && data.tenantId !== tenantId) {
      return { ok: false, error: "ACCESS DENIED: Order cannot be accessed from your account." };
    }
    if (effectiveStore && data.branchCode !== effectiveStore) {
      return {
        ok: false,
        error: "ACCESS DENIED: This order does not belong to your store / branch.",
      };
    }
  }

  // Check if an existing refund record exists
  let existingRefund: ExistingRefundData | null = null;
  const refundDoc = await adminDb.collection("refunds").doc(`ref_${cleanId}`).get();
  if (refundDoc.exists) {
    const rData = refundDoc.data()!;
    existingRefund = {
      id: refundDoc.id,
      amount: parseFloat(rData.amount ?? "0") || 0,
      method: rData.method ?? rData.tier ?? "CASH_COUNTER",
      status: rData.status ?? "COMPLETED",
      reason: rData.reason ?? "",
      reference: rData.reference ?? rData.refundReference ?? refundDoc.id,
      processedBy: rData.processedBy ?? "System",
      createdAtMs: (rData.timestamp as Timestamp | undefined)?.toMillis(),
      staffConfirmedCashHandover: Boolean(rData.staffConfirmedCashHandover),
    };
  }

  // Fetch store or tenant invoice policy
  let policyType: "NON_REFUNDABLE" | "REFUNDABLE_WINDOW" = "REFUNDABLE_WINDOW";
  let returnWindowDays = 7;

  if (data.branchCode) {
    const storeSnap = await adminDb
      .collection("stores")
      .where("branchCode", "==", data.branchCode)
      .limit(1)
      .get();
    if (!storeSnap.empty) {
      const sData = storeSnap.docs[0].data();
      if (sData.invoiceConfig?.refundPolicyType) {
        policyType = sData.invoiceConfig.refundPolicyType;
      }
      if (typeof sData.invoiceConfig?.returnWindowDays === "number") {
        returnWindowDays = sData.invoiceConfig.returnWindowDays;
      }
    }
  }

  if (data.tenantId && policyType === "REFUNDABLE_WINDOW" && returnWindowDays === 7) {
    const tenantDoc = await adminDb.collection("tenants").doc(data.tenantId).get();
    if (tenantDoc.exists) {
      const tData = tenantDoc.data();
      if (tData?.invoiceConfig?.refundPolicyType) {
        policyType = tData.invoiceConfig.refundPolicyType;
      }
      if (typeof tData?.invoiceConfig?.returnWindowDays === "number") {
        returnWindowDays = tData.invoiceConfig.returnWindowDays;
      }
    }
  }

  const orderTimestampMs = (data.timestamp as Timestamp | undefined)?.toMillis() || Date.now();
  const orderAgeDays = Math.max(0, Math.floor((Date.now() - orderTimestampMs) / (86400 * 1000)));

  let eligibilityStatus: "ELIGIBLE" | "EXPIRED" | "POLICY_BLOCKED" | "ALREADY_REFUNDED" = "ELIGIBLE";
  let policyMessage = "";

  const isAlreadyRefunded =
    data.status === "REFUNDED" ||
    data.exitStatus === "CANCELLED_AND_REFUNDED" ||
    Boolean(existingRefund);

  if (isAlreadyRefunded) {
    eligibilityStatus = "ALREADY_REFUNDED";
    policyMessage = "Already Refunded: Idempotency protection active. Duplicate refunds blocked.";
  } else if (policyType === "NON_REFUNDABLE") {
    eligibilityStatus = "POLICY_BLOCKED";
    policyMessage = "Store Return Policy: Goods once sold will not be refunded.";
  } else if (orderAgeDays > returnWindowDays) {
    eligibilityStatus = "EXPIRED";
    policyMessage = `Return Window Expired: Purchased ${orderAgeDays} day${orderAgeDays === 1 ? "" : "s"} ago (Store limit is ${returnWindowDays} days).`;
  } else {
    eligibilityStatus = "ELIGIBLE";
    policyMessage = `Eligible for Return: Purchased ${orderAgeDays} day${orderAgeDays === 1 ? "" : "s"} ago (Within ${returnWindowDays}-day store policy window).`;
  }

  const items: RefundOrderItem[] = Array.isArray(data.items)
    ? data.items.map((it: any) => ({
        id: it.id,
        barcode: it.barcode ?? it.id,
        name: it.name ?? "Item",
        price: Number(
          it.price ?? it.unitPrice ?? it.finalUnitPrice ?? it.clearanceValue ?? it.originalPrice ?? 0
        ),
        quantity: Number(it.quantity ?? it.qty ?? 1),
      }))
    : [];

  const orderDetails: RefundOrderDetails = {
    id: doc.id,
    status: (data.status ?? "").toString().toUpperCase(),
    exitStatus: (data.exitStatus ?? "").toString().toUpperCase(),
    totalAmount: parseFloat(data.totalAmount ?? "0") || 0,
    trustScore: data.trustScore ?? 85,
    customerName: data.customerName ?? data.userName ?? "Walk-in Customer",
    customerPhone: data.customerPhone ?? data.phone ?? null,
    paymentMethod: (data.paymentMode ?? data.paymentMethod ?? "UPI").toString().toUpperCase(),
    gatewayTxnId: data.paymentId ?? data.razorpayPaymentId ?? "N/A",
    branchCode: data.branchCode ?? "",
    itemCount: items.length,
    items,
    createdAtMs: orderTimestampMs,
    existingRefund,
    returnPolicy: {
      policyType,
      returnWindowDays,
      orderAgeDays,
      eligibilityStatus,
      policyMessage,
    },
  };

  return { ok: true, order: orderDetails };
}

export async function processRefund(params: {
  orderId: string;
  refundMethod: RefundPayoutMethod | "WALLET" | "SOURCE" | "PARTIAL";
  refundAmount: number;
  reason: string;
  refundReference?: string;
  staffConfirmedCashHandover?: boolean;
  restockInventory?: boolean;
  managerPolicyOverride?: boolean;
}) {
  const { session, role, tenantId, storeId } = await requireRole([
    "super_admin",
    "tenant_admin",
    "manager",
  ]);

  if (!params.reason.trim()) {
    return { ok: false, error: "Refund reason is strictly required for CA Audit Compliance logs." };
  }
  if (params.refundAmount <= 0) {
    return { ok: false, error: "Invalid refund amount. Must be greater than 0." };
  }

  // Map legacy tiers to real retail payout methods if passed
  let canonicalMethod: RefundPayoutMethod = "CASH_COUNTER";
  if (params.refundMethod === "WALLET" || params.refundMethod === "CASH_COUNTER") {
    canonicalMethod = "CASH_COUNTER";
  } else if (params.refundMethod === "SOURCE" || params.refundMethod === "ORIGINAL_PAYMENT" || params.refundMethod === "GATEWAY_REFUND") {
    canonicalMethod = "ORIGINAL_PAYMENT";
  } else if (params.refundMethod === "MANUAL_BANK_UPI") {
    canonicalMethod = "MANUAL_BANK_UPI";
  } else if (params.refundMethod === "STORE_CREDIT") {
    canonicalMethod = "STORE_CREDIT";
  } else {
    canonicalMethod = "ORIGINAL_PAYMENT";
  }

  // For cash refunds, enforce staff physical handover confirmation
  if (canonicalMethod === "CASH_COUNTER" && !params.staffConfirmedCashHandover) {
    return {
      ok: false,
      error: "Cash Handover Confirmation Required: Staff must verify physical cash was handed to the customer.",
    };
  }

  const orderRef = adminDb.collection("orders").doc(params.orderId);
  const refundRef = adminDb.collection("refunds").doc(`ref_${params.orderId}`);

  let branchCode = storeId ?? "";
  let orderTenantId = tenantId;
  let orderItemsToRestock: RefundOrderItem[] = [];
  const referenceId = params.refundReference?.trim() || `REF-${Date.now().toString().slice(-6)}`;

  try {
    await adminDb.runTransaction(async (tx) => {
      const existingRefund = await tx.get(refundRef);
      if (existingRefund.exists) {
        throw new Error("FRAUD SHIELD: A refund for this order has already been processed and locked.");
      }

      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("Target order could not be found in database.");
      const orderData = orderSnap.data()!;

      // Scope checks
      if (role !== "super_admin") {
        if (tenantId && orderData.tenantId !== tenantId) {
          throw new Error("ACCESS DENIED: Order cannot be accessed from your account.");
        }
        if (role === "manager" && storeId && orderData.branchCode !== storeId) {
          throw new Error("ACCESS DENIED: Refunds can only be issued for orders placed at your assigned branch.");
        }
      }

      branchCode = orderData.branchCode || storeId || "";
      orderTenantId = orderData.tenantId || tenantId;

      if (Array.isArray(orderData.items)) {
        orderItemsToRestock = orderData.items;
      }

      // Record in refunds collection
      tx.set(refundRef, {
        orderId: params.orderId,
        amount: params.refundAmount,
        method: canonicalMethod,
        tier: canonicalMethod,
        status: "COMPLETED",
        reference: referenceId,
        reason: params.reason.trim(),
        processedBy: session.user?.email ?? "Admin",
        processedByName: session.user?.name ?? "Admin",
        timestamp: FieldValue.serverTimestamp(),
        tenantId: orderTenantId,
        branchCode,
        restockedInventory: Boolean(params.restockInventory),
        staffConfirmedCashHandover: Boolean(params.staffConfirmedCashHandover),
        managerOverride: Boolean(params.managerPolicyOverride),
      });

      // Update order status
      tx.update(orderRef, {
        status: "REFUNDED",
        exitStatus: "CANCELLED_AND_REFUNDED",
        refundId: `ref_${params.orderId}`,
        refundMethod: canonicalMethod,
        refundPayoutMode: canonicalMethod,
        refundAmount: params.refundAmount,
        refundReason: params.reason.trim(),
        refundReference: referenceId,
        refundedAt: FieldValue.serverTimestamp(),
        refundedBy: session.user?.email,
        refundedByName: session.user?.name || "Admin",
      });

      // Write strictly to admin_audit_logs
      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "REFUND_PROCESSED",
        orderId: params.orderId,
        amount: params.refundAmount,
        method: canonicalMethod,
        reference: referenceId,
        adminId: session.user?.email,
        adminEmail: session.user?.email,
        adminName: session.user?.name || "Admin",
        timestamp: FieldValue.serverTimestamp(),
        tenantId: orderTenantId,
        storeId: branchCode,
        reason: params.reason.trim(),
        restockedInventory: Boolean(params.restockInventory),
        staffConfirmedCashHandover: Boolean(params.staffConfirmedCashHandover),
      });
    });

    // If restock inventory is toggled, increment back physicalStock
    if (params.restockInventory && orderItemsToRestock.length > 0) {
      for (const line of orderItemsToRestock) {
        const barcode = (line.barcode || line.id || "").replace("_FREE", "").trim();
        const qty = Number(line.quantity || 1);
        if (!barcode || qty <= 0) continue;

        let pQuery: FirebaseFirestore.Query = adminDb.collection("products").where("barcode", "==", barcode);
        if (orderTenantId) pQuery = pQuery.where("tenantId", "==", orderTenantId);
        if (branchCode) pQuery = pQuery.where("branchCode", "==", branchCode);

        const pSnap = await pQuery.limit(1).get();
        if (!pSnap.empty) {
          await pSnap.docs[0].ref.update({
            physicalStock: FieldValue.increment(qty),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Refund execution failed" };
  }

  revalidatePath("/refund");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/auditor");
  return { ok: true };
}