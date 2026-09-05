/**
 * CANONICAL ACCOUNTING SERVICE
 * Single Source of Truth for:
 * Invoice Register -> Payment Settlements -> Refunds -> Gate Exits -> Tax (GST) -> Dashboard -> Auditor
 */

export interface CanonicalItem {
  name: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  clearanceValue?: number;
  gstRate: number;
  taxableBase: number;
  cgst: number;
  sgst: number;
  itemTotal: number;
}

export interface CanonicalOrderRecord {
  id: string;
  invoiceNo: string;
  timestampMs: number;
  dateStr: string;
  customerName: string;
  customerPhone?: string;
  paymentMode: "CASH" | "UPI" | "CARD" | "ONLINE";
  grossAmount: number;
  netRealizedAmount: number;
  taxableBase: number;
  cgst: number;
  sgst: number;
  gstTotal: number;
  status: "COMPLETED" | "PAID" | "REFUNDED" | "PENDING";
  exitStatus: "APPROVED" | "CANCELLED_AND_REFUNDED" | "PENDING_EXIT" | "REJECTED_EXIT";
  isRefunded: boolean;
  refundId?: string;
  refundAmount: number;
  refundPayoutMode?: string;
  refundReason?: string;
  refundTimestampMs?: number;
  cashierName: string;
  exitVerifier: string;
  upiTxnId?: string;
  items: CanonicalItem[];
}

export interface CanonicalFinancialSummary {
  // 1. Turnover
  grossInvoicedAmount: number;
  totalInvoiceCount: number;

  // 2. Realized / Approved Revenue (Exited without cancellation)
  approvedRevenue: number;
  approvedOrderCount: number;

  // 3. Refunds
  totalRefundAmount: number;
  refundedOrderCount: number;
  cashRefundAmount: number;
  digitalRefundAmount: number;

  // 4. Net Revenue (Gross - Refunds - Leakage)
  netRealizedRevenue: number;

  // 5. At-Risk / Leakage
  pendingExitAmount: number;
  pendingExitCount: number;
  rejectedExitAmount: number;
  rejectedExitCount: number;
  totalAtRiskLeakage: number;

  // 6. Payment Tenders
  grossCash: number;
  grossDigital: number;
  netCashCollected: number; // grossCash - cashRefunds
  netDigitalSettled: number; // grossDigital - digitalRefunds

  // 7. Statutory Tax (GST)
  totalTaxableBase: number;
  totalCgst: number;
  totalSgst: number;
  totalGstPayable: number;

  // 8. Reconciliation
  isReconciled: boolean;
  reconciliationVariance: number;
  reconciliationStatusText: "CLEAN [OK]" | "⚠ RECONCILIATION REQUIRED";
  reconciliationAuditNotes: string[];
}

/**
 * Resolves the real billed selling price of an item across all checkout schemas.
 * Priority: explicit billed price -> unitPrice -> finalUnitPrice -> clearanceValue -> originalPrice -> 0.
 */
export function resolveItemBilledPrice(item: any): number {
  if (item.price !== undefined && item.price !== null) {
    return Number(item.price);
  }
  if (item.unitPrice !== undefined && item.unitPrice !== null) {
    return Number(item.unitPrice);
  }
  if (item.finalUnitPrice !== undefined && item.finalUnitPrice !== null) {
    return Number(item.finalUnitPrice);
  }
  if (item.clearanceValue !== undefined && item.clearanceValue !== null) {
    return Number(item.clearanceValue);
  }
  if (item.originalPrice !== undefined && item.originalPrice !== null) {
    return Number(item.originalPrice);
  }
  return 0;
}

/**
 * Normalizes an exit status into canonical state.
 */
export function deriveCanonicalExitStatus(order: any): "APPROVED" | "CANCELLED_AND_REFUNDED" | "PENDING_EXIT" | "REJECTED_EXIT" {
  const status = (order.status ?? "").toString().toUpperCase();
  const exitStatus = (order.exitStatus ?? "").toString().toUpperCase();
  const paymentStatus = (order.paymentStatus ?? "").toString().toUpperCase();
  const isRefunded = status === "REFUNDED" || exitStatus === "CANCELLED_AND_REFUNDED" || Boolean(order.refundId) || paymentStatus === "REFUNDED";

  if (isRefunded) {
    return "CANCELLED_AND_REFUNDED";
  }
  if (exitStatus === "APPROVED" || exitStatus === "COMPLETED" || exitStatus === "EXITED" || order.qrConsumed === true) {
    return "APPROVED";
  }
  if (exitStatus === "REJECTED") {
    return "REJECTED_EXIT";
  }
  return "PENDING_EXIT";
}

/**
 * Transforms raw Firestore order documents into typed CanonicalOrderRecord models.
 */
export function normalizeCanonicalOrder(docId: string, data: any): CanonicalOrderRecord {
  const docGross = Number(data.totalAmount ?? data.amount ?? 0);
  const rawMode = (data.paymentMode ?? data.paymentMethod ?? "UPI").toString().toUpperCase();
  const paymentMode: "CASH" | "UPI" | "CARD" | "ONLINE" = 
    rawMode === "CASH" ? "CASH" : rawMode === "CARD" ? "CARD" : "UPI";

  const exitStatus = deriveCanonicalExitStatus(data);
  const isRefunded = exitStatus === "CANCELLED_AND_REFUNDED";
  const refundAmount = Number(data.refundAmount ?? (isRefunded ? docGross : 0));
  const netRealizedAmount = isRefunded ? Math.max(0, docGross - refundAmount) : docGross;

  // Process item-level tax and lines
  const rawItems = Array.isArray(data.cartItems) ? data.cartItems : Array.isArray(data.items) ? data.items : [];
  const items: CanonicalItem[] = [];
  let orderTaxable = 0;
  let orderGst = 0;

  if (rawItems.length === 0) {
    const base = docGross / 1.18;
    const gst = docGross - base;
    orderTaxable = base;
    orderGst = gst;
    items.push({
      name: "General Merchandise",
      quantity: 1,
      price: docGross,
      gstRate: 18,
      taxableBase: base,
      cgst: gst / 2,
      sgst: gst / 2,
      itemTotal: docGross,
    });
  } else {
    for (const raw of rawItems) {
      const qty = Number(raw.quantity ?? raw.qty ?? 1);
      const price = resolveItemBilledPrice(raw);
      const lineTotal = qty * price;
      const gstRate = parseFloat((raw.gst ?? raw.gstRate ?? raw.taxRate ?? "0").toString().replace(/[^0-9.]/g, "")) || 0;
      const base = lineTotal / (1 + gstRate / 100);
      const gst = lineTotal - base;
      const cgst = gst / 2;
      const sgst = gst / 2;

      orderTaxable += base;
      orderGst += gst;

      items.push({
        name: (raw.name ?? raw.title ?? "Item").toString(),
        quantity: qty,
        price,
        originalPrice: raw.originalPrice ? Number(raw.originalPrice) : undefined,
        clearanceValue: raw.clearanceValue ? Number(raw.clearanceValue) : undefined,
        gstRate,
        taxableBase: base,
        cgst,
        sgst,
        itemTotal: lineTotal,
      });
    }
  }

  const ts = data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp?.toDate ? data.timestamp.toDate().getTime() : Date.now());
  const refundTs = data.refundedAt?.toMillis ? data.refundedAt.toMillis() : (data.refundedAt?.toDate ? data.refundedAt.toDate().getTime() : undefined);

  return {
    id: docId,
    invoiceNo: (data.invoiceNo ?? docId).toString(),
    timestampMs: ts,
    dateStr: new Date(ts).toLocaleDateString("en-IN"),
    customerName: (data.customerName ?? data.buyerName ?? data.userName ?? "Walk-in Customer").toString(),
    customerPhone: data.customerPhone ?? data.phone ?? undefined,
    paymentMode,
    grossAmount: docGross,
    netRealizedAmount,
    taxableBase: orderTaxable,
    cgst: orderGst / 2,
    sgst: orderGst / 2,
    gstTotal: orderGst,
    status: isRefunded ? "REFUNDED" : "COMPLETED",
    exitStatus,
    isRefunded,
    refundId: data.refundId ?? (isRefunded ? `ref_${docId}` : undefined),
    refundAmount,
    refundPayoutMode: data.refundTier ?? data.payoutMode ?? (paymentMode === "CASH" ? "CASH_COUNTER" : "SOURCE_REVERSAL"),
    refundReason: data.refundReason ?? data.reason ?? undefined,
    refundTimestampMs: refundTs,
    cashierName: (data.cashierName ?? (data.orderType === "DIRECT_POS" ? "Cashier Staff" : "Self-Checkout")).toString(),
    exitVerifier: (data.verifiedByGuardId ?? data.exitVerifiedBy ?? (data.orderType === "DIRECT_POS" ? "Auto-Approved (Staff)" : "Pending")).toString(),
    upiTxnId: data.upiTransactionId ?? data.transactionId ?? data.upiTxnId ?? undefined,
    items,
  };
}

/**
 * Computes canonical, mathematically reconciled financials across a set of orders.
 * Guaranteed invariant:
 * Gross Invoiced == Net Realized + Refunds + Pending Leakage + Rejected Leakage == Gross Cash + Gross Digital
 */
export function computeCanonicalFinancials(orders: CanonicalOrderRecord[]): CanonicalFinancialSummary {
  let grossInvoicedAmount = 0;
  let approvedRevenue = 0;
  let approvedOrderCount = 0;
  let totalRefundAmount = 0;
  let refundedOrderCount = 0;
  let cashRefundAmount = 0;
  let digitalRefundAmount = 0;
  let netRealizedRevenue = 0;
  let pendingExitAmount = 0;
  let pendingExitCount = 0;
  let rejectedExitAmount = 0;
  let rejectedExitCount = 0;
  let grossCash = 0;
  let grossDigital = 0;
  let totalTaxableBase = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  for (const o of orders) {
    grossInvoicedAmount += o.grossAmount;
    if (o.paymentMode === "CASH") grossCash += o.grossAmount;
    else grossDigital += o.grossAmount;

    totalTaxableBase += o.taxableBase;
    totalCgst += o.cgst;
    totalSgst += o.sgst;

    if (o.isRefunded) {
      refundedOrderCount++;
      totalRefundAmount += o.refundAmount;
      if (o.paymentMode === "CASH") cashRefundAmount += o.refundAmount;
      else digitalRefundAmount += o.refundAmount;

      const retainedOnOrder = Math.max(0, o.grossAmount - o.refundAmount);
      netRealizedRevenue += retainedOnOrder;
    } else if (o.exitStatus === "APPROVED") {
      approvedOrderCount++;
      approvedRevenue += o.grossAmount;
      netRealizedRevenue += o.grossAmount;
    } else if (o.exitStatus === "REJECTED_EXIT") {
      rejectedExitCount++;
      rejectedExitAmount += o.grossAmount;
    } else {
      pendingExitCount++;
      pendingExitAmount += o.grossAmount;
    }
  }

  const netCashCollected = grossCash - cashRefundAmount;
  const netDigitalSettled = grossDigital - digitalRefundAmount;
  const totalAtRiskLeakage = pendingExitAmount + rejectedExitAmount;
  const totalGstPayable = totalCgst + totalSgst;

  // Reconciliation Equation:
  // Gross Invoiced must equal Net Realized + Refunds + At-Risk Leakage
  const reconciledSum = netRealizedRevenue + totalRefundAmount + totalAtRiskLeakage;
  const variance = Math.abs(grossInvoicedAmount - reconciledSum);
  const isReconciled = variance < 0.05;

  const reconciliationAuditNotes: string[] = [];
  if (!isReconciled) {
    reconciliationAuditNotes.push(
      `CRITICAL MISMATCH: Gross Invoiced (₹${grossInvoicedAmount.toFixed(2)}) differs from Settled Balance (₹${reconciledSum.toFixed(2)}) by ₹${variance.toFixed(2)}.`
    );
  } else {
    reconciliationAuditNotes.push(
      `PERFECT RECONCILIATION: Gross Turnover (₹${grossInvoicedAmount.toFixed(2)}) matches Net Realized (₹${netRealizedRevenue.toFixed(2)}) + Refunds (₹${totalRefundAmount.toFixed(2)}) + Leakage (₹${totalAtRiskLeakage.toFixed(2)}) with ₹0.00 variance.`
    );
  }

  if (Math.abs((grossCash + grossDigital) - grossInvoicedAmount) > 0.05) {
    reconciliationAuditNotes.push(
      `TENDER MISMATCH: Cash (₹${grossCash.toFixed(2)}) + Digital (₹${grossDigital.toFixed(2)}) != Gross Invoiced (₹${grossInvoicedAmount.toFixed(2)}).`
    );
  }

  return {
    grossInvoicedAmount,
    totalInvoiceCount: orders.length,
    approvedRevenue,
    approvedOrderCount,
    totalRefundAmount,
    refundedOrderCount,
    cashRefundAmount,
    digitalRefundAmount,
    netRealizedRevenue,
    pendingExitAmount,
    pendingExitCount,
    rejectedExitAmount,
    rejectedExitCount,
    totalAtRiskLeakage,
    grossCash,
    grossDigital,
    netCashCollected,
    netDigitalSettled,
    totalTaxableBase,
    totalCgst,
    totalSgst,
    totalGstPayable,
    isReconciled,
    reconciliationVariance: variance,
    reconciliationStatusText: isReconciled ? "CLEAN [OK]" : "⚠ RECONCILIATION REQUIRED",
    reconciliationAuditNotes,
  };
}
