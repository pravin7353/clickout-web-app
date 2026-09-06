import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  normalizeCanonicalOrder,
  computeCanonicalFinancials,
  CanonicalOrderRecord,
  CanonicalFinancialSummary,
} from "@/lib/services/canonical-accounting";

export type DailyFinancials = {
  totalRevenue: number;
  realizedRevenue: number;
  cashExpected: number;
  digitalExpected: number;
  grossCash: number;
  grossDigital: number;
  totalLeakage: number;
  cashLeakage: number;
  digitalLeakage: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalGstLiability: number;
  avgBasketValue: number;
  totalOrders: number;
  rejectedCount: number;
  pendingCount: number;
  refundCount: number;
  refundAmount: number;
  cashRefundAmount: number;
  digitalRefundAmount: number;
  netRealizedRevenue: number;
  isReconciled: boolean;
  reconciliationVariance: number;
  reconciliationStatusText: "CLEAN [OK]" | "⚠ RECONCILIATION REQUIRED";
  activeAlerts: string[];
};

export type AuditOrder = {
  id: string;
  invoiceNo: string;
  timestampMs: number;
  paymentMode: string;
  totalAmount: number;
  netRealizedAmount: number;
  taxableValue: number;
  gstTotal: number;
  cgst: number;
  sgst: number;
  status: string;
  exitStatus: string;
  isRefunded: boolean;
  refundId?: string;
  refundAmount?: number;
  refundPayoutMode?: string;
  refundReason?: string;
  refundTimestampMs?: number;
  fraudScore: number;
  cashierName: string;
  verifiedByGuard: string;
  upiTxnId?: string;
  customerName?: string;
  customerPhone?: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    originalPrice?: number;
    gst?: string | number;
    taxable?: number;
    cgst?: number;
    sgst?: number;
  }[];
};

export type CashReconciliation = {
  posCashCollected: number;
  vaultDepositsHandedOver: number;
  variance: number;
  status: "BALANCED" | "SURPLUS" | "DEFICIT";
};

const EMPTY: DailyFinancials = {
  totalRevenue: 0,
  realizedRevenue: 0,
  cashExpected: 0,
  digitalExpected: 0,
  grossCash: 0,
  grossDigital: 0,
  totalLeakage: 0,
  cashLeakage: 0,
  digitalLeakage: 0,
  totalTaxableValue: 0,
  totalCgst: 0,
  totalSgst: 0,
  totalGstLiability: 0,
  avgBasketValue: 0,
  totalOrders: 0,
  rejectedCount: 0,
  pendingCount: 0,
  refundCount: 0,
  refundAmount: 0,
  cashRefundAmount: 0,
  digitalRefundAmount: 0,
  netRealizedRevenue: 0,
  isReconciled: true,
  reconciliationVariance: 0,
  reconciliationStatusText: "CLEAN [OK]",
  activeAlerts: [],
};

export async function getDailyFinancials(
  role: string,
  tenantId: string | null,
  branchCode: string | null,
  period: "ALL" | "THIS_MONTH" | "TODAY" = "ALL"
): Promise<DailyFinancials> {
  if (!tenantId && role !== "super_admin") return EMPTY;

  const now = new Date();
  let query: FirebaseFirestore.Query = adminDb.collection("orders");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  if (period === "TODAY") {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    query = query.where("timestamp", ">=", Timestamp.fromDate(startOfDay));
  } else if (period === "THIS_MONTH") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    query = query.where("timestamp", ">=", Timestamp.fromDate(startOfMonth));
  }

  query = query.orderBy("timestamp", "desc").limit(1000);

  try {
    const snap = await query.get();
    const canonicalOrders = snap.docs.map((d) => normalizeCanonicalOrder(d.id, d.data()));
    const summary: CanonicalFinancialSummary = computeCanonicalFinancials(canonicalOrders);

    return {
      totalRevenue: summary.grossInvoicedAmount,
      realizedRevenue: summary.approvedRevenue,
      cashExpected: summary.netCashCollected,
      digitalExpected: summary.netDigitalSettled,
      grossCash: summary.grossCash,
      grossDigital: summary.grossDigital,
      totalLeakage: summary.totalAtRiskLeakage,
      cashLeakage: 0,
      digitalLeakage: 0,
      totalTaxableValue: summary.totalTaxableBase,
      totalCgst: summary.totalCgst,
      totalSgst: summary.totalSgst,
      totalGstLiability: summary.totalGstPayable,
      avgBasketValue: summary.totalInvoiceCount > 0 ? summary.grossInvoicedAmount / summary.totalInvoiceCount : 0,
      totalOrders: summary.totalInvoiceCount,
      rejectedCount: summary.rejectedExitCount,
      pendingCount: summary.pendingExitCount,
      refundCount: summary.refundedOrderCount,
      refundAmount: summary.totalRefundAmount,
      cashRefundAmount: summary.cashRefundAmount,
      digitalRefundAmount: summary.digitalRefundAmount,
      netRealizedRevenue: summary.netRealizedRevenue,
      isReconciled: summary.isReconciled,
      reconciliationVariance: summary.reconciliationVariance,
      reconciliationStatusText: summary.reconciliationStatusText,
      activeAlerts: summary.reconciliationAuditNotes,
    };
  } catch (err) {
    console.error("Error computing daily financials:", err);
    return EMPTY;
  }
}

export async function getAuditorOrders(
  role: string,
  tenantId: string | null,
  branchCode: string | null,
  limitCount: number = 200
): Promise<AuditOrder[]> {
  if (!tenantId && role !== "super_admin") return [];

  let query: FirebaseFirestore.Query = adminDb.collection("orders").orderBy("timestamp", "desc").limit(limitCount);
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const canonical = normalizeCanonicalOrder(doc.id, data);

    return {
      id: canonical.id,
      invoiceNo: canonical.invoiceNo,
      timestampMs: canonical.timestampMs,
      paymentMode: canonical.paymentMode,
      totalAmount: canonical.grossAmount,
      netRealizedAmount: canonical.netRealizedAmount,
      taxableValue: canonical.taxableBase,
      gstTotal: canonical.gstTotal,
      cgst: canonical.cgst,
      sgst: canonical.sgst,
      status: canonical.status,
      exitStatus: canonical.exitStatus,
      isRefunded: canonical.isRefunded,
      refundId: canonical.refundId,
      refundAmount: canonical.refundAmount,
      refundPayoutMode: canonical.refundPayoutMode,
      refundReason: canonical.refundReason,
      refundTimestampMs: canonical.refundTimestampMs,
      fraudScore: Number(data.fraudScore ?? 0),
      cashierName: canonical.cashierName,
      verifiedByGuard: canonical.exitVerifier,
      upiTxnId: canonical.upiTxnId,
      customerName: canonical.customerName,
      customerPhone: canonical.customerPhone,
      items: canonical.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        originalPrice: i.originalPrice,
        gst: i.gstRate > 0 ? `${i.gstRate}%` : "0%",
        taxable: i.taxableBase,
        cgst: i.cgst,
        sgst: i.sgst,
      })),
    };
  });
}

export async function getCashReconciliation(
  role: string,
  tenantId: string | null,
  branchCode: string | null,
  period: "ALL" | "THIS_MONTH" | "TODAY" = "ALL"
): Promise<CashReconciliation> {
  const defaultRecon: CashReconciliation = {
    posCashCollected: 0,
    vaultDepositsHandedOver: 0,
    variance: 0,
    status: "BALANCED",
  };

  if (!tenantId && role !== "super_admin") return defaultRecon;

  const now = new Date();
  let ordersQuery: FirebaseFirestore.Query = adminDb
    .collection("orders")
    .where("paymentMode", "==", "CASH");

  if (period === "TODAY") {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    ordersQuery = ordersQuery.where("timestamp", ">=", Timestamp.fromDate(startOfDay));
  } else if (period === "THIS_MONTH") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    ordersQuery = ordersQuery.where("timestamp", ">=", Timestamp.fromDate(startOfMonth));
  }

  if (role !== "super_admin" && tenantId) ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
  if (branchCode) ordersQuery = ordersQuery.where("branchCode", "==", branchCode);

  let posCashCollected = 0;
  try {
    const oSnap = await ordersQuery.limit(500).get();
    for (const d of oSnap.docs) {
      const canonical = normalizeCanonicalOrder(d.id, d.data());
      // Net cash collected = gross cash minus cash refunds handed back
      posCashCollected += canonical.grossAmount - (canonical.isRefunded ? canonical.refundAmount : 0);
    }
  } catch {}

  // 2. Query IDT Vault Handover Deposits
  let idtQuery: FirebaseFirestore.Query = adminDb.collection("idt_deposits");

  if (period === "TODAY") {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    idtQuery = idtQuery.where("timestamp", ">=", Timestamp.fromDate(startOfDay));
  } else if (period === "THIS_MONTH") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    idtQuery = idtQuery.where("timestamp", ">=", Timestamp.fromDate(startOfMonth));
  }

  if (role !== "super_admin" && tenantId) idtQuery = idtQuery.where("tenantId", "==", tenantId);
  if (branchCode) idtQuery = idtQuery.where("branchCode", "==", branchCode);

  let vaultDepositsHandedOver = 0;
  try {
    const iSnap = await idtQuery.limit(500).get();
    for (const d of iSnap.docs) {
      vaultDepositsHandedOver += Number(d.data().amount ?? d.data().cashAmount ?? 0);
    }
  } catch {}

  const variance = posCashCollected - vaultDepositsHandedOver;
  let status: CashReconciliation["status"] = "BALANCED";
  if (variance > 50) status = "DEFICIT"; // Cash collected at register not yet banked to IDT safe
  else if (variance < -50) status = "SURPLUS";

  return {
    posCashCollected,
    vaultDepositsHandedOver,
    variance,
    status,
  };
}

export type AuditLogItem = {
  id: string;
  action: string;
  actor: string;
  target: string;
  details: string;
  severity: string;
  timestamp: string;
};

export async function getAuditLogs(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<AuditLogItem[]> {
  if (!tenantId && role !== "super_admin") return [];

  let query: FirebaseFirestore.Query = adminDb.collection("admin_audit_logs");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode && branchCode !== "HQ") {
    query = query.where("branchCode", "==", branchCode);
  }

  try {
    const snap = await query.orderBy("timestamp", "desc").limit(200).get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      let ts = new Date().toISOString();
      if (data.timestamp?.toDate) {
        ts = data.timestamp.toDate().toISOString();
      } else if (typeof data.timestamp === "string") {
        ts = data.timestamp;
      }
      return {
        id: doc.id,
        action: data.action || data.actionType || "LOG_EVENT",
        actor: data.actorEmail || data.actorId || data.adminEmail || data.adminId || data.actor || "System",
        target: data.targetId || data.targetCollection || data.barcode || "",
        details: data.details || data.reason || "",
        severity: data.severity || "INFO",
        timestamp: ts,
      };
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    return [];
  }
}