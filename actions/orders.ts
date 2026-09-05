"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { Timestamp } from "firebase-admin/firestore";
import { resolveStoreScope } from "@/lib/rbac";
import { normalizeCanonicalOrder, computeCanonicalFinancials } from "@/lib/services/canonical-accounting";

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
  const p = (o.paymentStatus ?? o.status ?? "").toString().toUpperCase();
  const e = (o.exitStatus ?? "").toString().toUpperCase();
  const wasEverRejected = o.wasEverRejected === true;
  const qrConsumed = o.qrConsumed === true;

  // 1. Refunds have absolute priority (matching Flutter's revenue_provider.dart)
  if (p === "REFUNDED" || e === "CANCELLED_AND_REFUNDED" || o.refund === true) {
    return "Refund";
  }

  // 2. Gate Rejection
  if (e === "REJECTED") return "Reject";

  // 3. Clean exit
  const isCleanExit =
    e === "COMPLETED" || e === "EXITED" || e === "APPROVED" || (qrConsumed && e !== "REJECTED");
  if (isCleanExit) return wasEverRejected ? "Fix & Exit" : "Clear Exit";

  // 4. QR Expiration
  if (e === "EXPIRED" || e === "EXPIRED_BY_SYSTEM") return "QR Expire";

  // 5. Gate Pass Pending
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

export async function exportCaSalesReport(targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager", "auditor"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode);

  let query: FirebaseFirestore.Query = adminDb.collection("orders").orderBy("timestamp", "desc").limit(1000);
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.get();
  let companyName = "CLICKOUT RETAIL";
  let gstin = "N/A";
  let storeAddress = "N/A";

  if (tenantId) {
    try {
      const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
      if (tDoc.exists) {
        const tData = tDoc.data()!;
        companyName = tData.companyName ?? tData.name ?? companyName;
        gstin = tData.gstin ?? tData.gstNumber ?? gstin;
      }
    } catch {}
  }

  if (branchCode && branchCode !== "ALL") {
    try {
      const sSnap = await adminDb.collection("stores").where("branchCode", "==", branchCode).limit(1).get();
      if (!sSnap.empty) {
        const sData = sSnap.docs[0].data();
        companyName = sData.storeName ?? sData.branchName ?? companyName;
        if (sData.gstin) gstin = sData.gstin;
        storeAddress = sData.completeStoreAddress ?? sData.address ?? storeAddress;
      }
    } catch {}
  }

  // ─── CANONICAL RECONCILIATION PIPELINE ────────────────────────────
  const canonicalOrders = snap.docs.map((doc) => normalizeCanonicalOrder(doc.id, doc.data()));
  const summary = computeCanonicalFinancials(canonicalOrders);

  const leakageInvoices: { invoiceNo: string; amount: number; mode: string; reason: string }[] = [];
  const rejectedInvoices: { invoiceNo: string; amount: number; reason: string }[] = [];

  let rawLedger = "Invoice No,Bill Date,Exit Time,Order ID,Customer Name,Payment Mode,UPI Txn ID,Product Name,Qty,Unit Price,Gross Amount,Taxable Value,GST %,CGST Amount,SGST Amount,Line Total,Exit Status,Billed By,Exit Verifier,Refund Status\n";

  for (const o of canonicalOrders) {
    if (o.exitStatus === "REJECTED_EXIT") {
      rejectedInvoices.push({
        invoiceNo: o.invoiceNo,
        amount: o.grossAmount,
        reason: "Guard exit barcode or item count mismatch",
      });
    } else if (o.exitStatus === "PENDING_EXIT") {
      leakageInvoices.push({
        invoiceNo: o.invoiceNo,
        amount: o.grossAmount,
        mode: o.paymentMode,
        reason: "Paid but awaiting physical security exit verification",
      });
    }

    const billTime = new Date(o.timestampMs).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const exitTime = o.exitStatus === "APPROVED" ? billTime : o.exitStatus;
    const upiTxn = o.upiTxnId ?? "N/A";
    const customer = o.customerName.replace(/"/g, '""');
    const billedBy = o.cashierName.replace(/"/g, '""');
    const exitVerifier = o.exitVerifier.replace(/"/g, '""');
    const refundTag = o.isRefunded ? `REFUNDED (₹${o.refundAmount.toFixed(2)})` : "NONE";

    for (const item of o.items) {
      const itemName = `"${item.name.replace(/"/g, '""')}"`;
      rawLedger += `"${o.invoiceNo}","${billTime}","${exitTime}","${o.id}","${customer}","${o.paymentMode}","${upiTxn}",${itemName},${item.quantity},${item.price.toFixed(2)},${item.itemTotal.toFixed(2)},${item.taxableBase.toFixed(2)},"${item.gstRate}%",${item.cgst.toFixed(2)},${item.sgst.toFixed(2)},${item.itemTotal.toFixed(2)},"${o.exitStatus}","${billedBy}","${exitVerifier}","${refundTag}"\n`;
    }
  }

  const leakageRate = summary.grossInvoicedAmount > 0 ? (summary.totalAtRiskLeakage / summary.grossInvoicedAmount) * 100 : 0;
  const avgBasket = summary.totalInvoiceCount > 0 ? summary.grossInvoicedAmount / summary.totalInvoiceCount : 0;

  // ─── BUILD CSV CONTENT ─────────────────────────────────────────
  let csv = "";
  // Header Meta
  csv += `CLICKOUT ENTERPRISE -- CA STATUTORY AUDIT & GST SALES REGISTER\n`;
  csv += `Company Name,"${companyName.replace(/"/g, '""')}"\n`;
  csv += `GSTIN,"${gstin}"\n`;
  csv += `Branch / Store,"${branchCode ?? "ALL CONSOLIDATED"}"\n`;
  csv += `Store Address,"${storeAddress.replace(/"/g, '""')}"\n`;
  csv += `Generated On,"${new Date().toLocaleString("en-IN")}"\n`;
  csv += `Report Status,"${summary.reconciliationStatusText}"\n\n`;

  // SECTION 1: EXECUTIVE RECONCILED SUMMARY
  csv += `== SECTION 1: EXECUTIVE TAX & AUDIT SUMMARY ==\n`;
  csv += `Audit Metric,Value,Accounting Basis / Formula\n`;
  csv += `"Total Gross Sales (Turnover)","Rs. ${summary.grossInvoicedAmount.toFixed(2)}","SUM(All Billed Invoices - Section 3 Items)"\n`;
  csv += `"Approved Realized Revenue","Rs. ${summary.approvedRevenue.toFixed(2)}","Orders Cleared Gate Pass Exit (Active)"\n`;
  csv += `"Total Completed Refunds","Rs. ${summary.totalRefundAmount.toFixed(2)} (${summary.refundedOrderCount} orders)","Physical Cash & Source Reversals Returned to Customers"\n`;
  csv += `"  - Cash Refunds Returned at Till","Rs. ${summary.cashRefundAmount.toFixed(2)}","Physical Currency Paid Out from Till"\n`;
  csv += `"  - Digital / UPI Refunds Reversal","Rs. ${summary.digitalRefundAmount.toFixed(2)}","Reversed to Customer Bank / Payment Source"\n`;
  csv += `"Net Settled Revenue","Rs. ${summary.netRealizedRevenue.toFixed(2)}","Gross Turnover minus Completed Refunds"\n`;
  csv += `"Financial Leakage (At-Risk)","Rs. ${summary.totalAtRiskLeakage.toFixed(2)}","Pending Exit Gatepass (Rs. ${summary.pendingExitAmount.toFixed(2)}) + Rejected (Rs. ${summary.rejectedExitAmount.toFixed(2)})"\n`;
  csv += `"Net Taxable Turnover (Base)","Rs. ${summary.totalTaxableBase.toFixed(2)}","Taxable Turnover for GSTR-1 Table 4 / 7"\n`;
  csv += `"Total CGST Liability (Central)","Rs. ${summary.totalCgst.toFixed(2)}","50% of Output GST"\n`;
  csv += `"Total SGST Liability (State)","Rs. ${summary.totalSgst.toFixed(2)}","50% of Output GST"\n`;
  csv += `"Total Output GST Payable","Rs. ${summary.totalGstPayable.toFixed(2)}","CGST + SGST (GSTR-1 / GSTR-3B Liability)"\n`;
  csv += `"Gross Cash Billed","Rs. ${summary.grossCash.toFixed(2)}","Total Cash Invoices Issued"\n`;
  csv += `"Net Cash in Till Drawer","Rs. ${summary.netCashCollected.toFixed(2)}","Gross Cash minus Cash Refunds"\n`;
  csv += `"Net Digital Settlements (UPI / Card)","Rs. ${summary.netDigitalSettled.toFixed(2)}","Merchant Bank Settlement after Digital Refunds"\n`;
  csv += `"Total Invoices Issued","${summary.totalInvoiceCount}","Total Invoice Count"\n`;
  csv += `"Average Basket Value","Rs. ${avgBasket.toFixed(2)}","Gross Sales / Total Invoices"\n`;
  csv += `"Audit Reconciliation Verification","${summary.reconciliationStatusText}","Variance: Rs. ${summary.reconciliationVariance.toFixed(2)} (Net Realized + Refunds + Leakage == Gross Turnover)"\n\n`;

  // SECTION 2: AUDIT DIAGNOSIS & ACTIONABLE SOLUTIONS
  csv += `== SECTION 2: AUDIT DIAGNOSIS & ACTIONABLE SOLUTIONS ==\n`;
  csv += `Diagnosis Area,Identified Issue,Root Cause & Recommended Action\n`;

  if (leakageInvoices.length > 0) {
    const listStr = leakageInvoices.slice(0, 5).map(l => `${l.invoiceNo} (Rs. ${l.amount.toFixed(0)})`).join("; ");
    csv += `"Exit Leakage","${leakageInvoices.length} order(s) pending exit: ${listStr}","ACTION: Security guard must scan customer QR at exit, or manager clear in Order Autopsy."\n`;
  } else {
    csv += `"Exit Leakage","Zero exit leakage detected","100% of billed customers completed verified exit."\n`;
  }

  if (rejectedInvoices.length > 0) {
    const rejStr = rejectedInvoices.map(r => `${r.invoiceNo} (Rs. ${r.amount.toFixed(0)} - ${r.reason})`).join("; ");
    csv += `"Guard Rejections","${summary.rejectedExitCount} security rejection(s): ${rejStr}","ACTION: Review CCTV footage & physical cart contents against invoice line items in Order Autopsy."\n`;
  } else {
    csv += `"Guard Rejections","Zero guard rejections","No physical gatepass discrepancies flagged."\n`;
  }

  if (summary.totalRefundAmount > 0) {
    csv += `"Refunds Audit","Rs. ${summary.totalRefundAmount.toFixed(2)} returned across ${summary.refundedOrderCount} order(s)","ACTION: Reconcile till cash deductions (Rs. ${summary.cashRefundAmount.toFixed(2)}) with register count. Verify Credit Notes in Auditor."\n`;
  } else {
    csv += `"Refunds Audit","Zero customer returns","100% sales retained without reversals."\n`;
  }

  csv += `"Tax Compliance","Total Output GST: Rs. ${summary.totalGstPayable.toFixed(2)}","ACTION: File Section 3 line items in monthly GSTR-1 (B2C/B2B tables)."\n\n`;

  // SECTION 3: RAW TRANSACTION LEDGER
  csv += `== SECTION 3: ITEM-LEVEL SALES & GST REGISTER ==\n`;
  csv += rawLedger;

  return {
    ok: true,
    csv,
    filename: `ClickOut_CA_Audit_Report_${branchCode ?? "ALL"}_${new Date().toISOString().slice(0, 10)}.csv`,
  };
}