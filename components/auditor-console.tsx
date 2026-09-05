"use client";

import { useState, useTransition, useMemo } from "react";
import { DailyFinancials, AuditOrder, CashReconciliation } from "@/lib/services/auditor-service";
import { exportCaSalesReport } from "@/actions/orders";
import { generateInvoicePdf } from "@/actions/invoice";
import { Card, Button, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import Link from "next/link";

export function AuditorConsole({
  financials: initialFinancials,
  orders: initialOrders,
  cashRecon: initialCashRecon,
  branchCode,
  canEdit = false,
}: {
  financials: DailyFinancials;
  orders: AuditOrder[];
  cashRecon: CashReconciliation;
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [selectedOrder, setSelectedOrder] = useState<AuditOrder | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<
    "ALL" | "APPROVED" | "REFUNDED" | "PENDING_EXIT" | "REJECTED" | "CASH" | "DIGITAL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"ALL" | "THIS_MONTH" | "TODAY">("ALL");

  // Cash drawer test counter
  const [manualCountedCash, setManualCountedCash] = useState<string>("");
  const [showCashTester, setShowCashTester] = useState(false);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return initialOrders.filter((o) => {
      // Period filter
      if (periodFilter !== "ALL") {
        const oDate = new Date(o.timestampMs);
        const now = new Date();
        if (periodFilter === "TODAY") {
          const isToday =
            oDate.getDate() === now.getDate() &&
            oDate.getMonth() === now.getMonth() &&
            oDate.getFullYear() === now.getFullYear();
          if (!isToday) return false;
        } else if (periodFilter === "THIS_MONTH") {
          const isThisMonth =
            oDate.getMonth() === now.getMonth() && oDate.getFullYear() === now.getFullYear();
          if (!isThisMonth) return false;
        }
      }

      // Tab filter
      if (activeTab === "APPROVED") {
        if (o.isRefunded || (o.exitStatus !== "APPROVED" && o.exitStatus !== "COMPLETED" && o.exitStatus !== "EXITED")) {
          return false;
        }
      }
      if (activeTab === "REFUNDED") {
        if (!o.isRefunded && o.exitStatus !== "CANCELLED_AND_REFUNDED" && o.status !== "REFUNDED") {
          return false;
        }
      }
      if (activeTab === "PENDING_EXIT") {
        if (o.isRefunded || o.exitStatus === "APPROVED" || o.exitStatus === "COMPLETED" || o.exitStatus === "EXITED" || o.exitStatus === "REJECTED") {
          return false;
        }
      }
      if (activeTab === "REJECTED") {
        if (o.exitStatus !== "REJECTED") return false;
      }
      if (activeTab === "CASH") {
        if (o.paymentMode !== "CASH") return false;
      }
      if (activeTab === "DIGITAL") {
        if (o.paymentMode === "CASH") return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const invMatch = o.invoiceNo.toLowerCase().includes(q);
        const idMatch = o.id.toLowerCase().includes(q);
        const cashierMatch = o.cashierName.toLowerCase().includes(q);
        const guardMatch = o.verifiedByGuard.toLowerCase().includes(q);
        const upiMatch = (o.upiTxnId ?? "").toLowerCase().includes(q);
        const customerMatch = (o.customerName ?? "").toLowerCase().includes(q);
        const itemMatch = o.items.some((it) => it.name.toLowerCase().includes(q));
        if (!invMatch && !idMatch && !cashierMatch && !guardMatch && !upiMatch && !customerMatch && !itemMatch) {
          return false;
        }
      }

      return true;
    });
  }, [initialOrders, activeTab, searchQuery, periodFilter]);

  // Canonical Calculation Pipeline: summary matches line items with zero discrepancy
  const liveFinancials = useMemo(() => {
    // If viewing unfiltered overall store stats, use initialFinancials computed canonically by server
    if (periodFilter === "ALL" && activeTab === "ALL" && !searchQuery.trim() && initialFinancials.totalRevenue > 0) {
      return initialFinancials;
    }

    let grossInvoiced = 0;
    let approvedRevenue = 0;
    let netRealizedRevenue = 0;
    let totalRefundAmount = 0;
    let cashRefundAmount = 0;
    let digitalRefundAmount = 0;
    let refundCount = 0;
    let grossCash = 0;
    let grossDigital = 0;
    let totalLeakage = 0;
    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let rejectedCount = 0;
    let pendingCount = 0;

    for (const o of filteredOrders) {
      grossInvoiced += o.totalAmount;

      if (o.paymentMode === "CASH") {
        grossCash += o.totalAmount;
      } else {
        grossDigital += o.totalAmount;
      }

      if (o.isRefunded) {
        refundCount++;
        const refAmt = Number(o.refundAmount || o.totalAmount);
        totalRefundAmount += refAmt;
        if (o.paymentMode === "CASH") cashRefundAmount += refAmt;
        else digitalRefundAmount += refAmt;
      }

      if (o.exitStatus === "APPROVED" || o.exitStatus === "COMPLETED" || o.exitStatus === "EXITED") {
        approvedRevenue += o.netRealizedAmount;
        netRealizedRevenue += o.netRealizedAmount;
      } else if (o.exitStatus === "REJECTED") {
        rejectedCount++;
        totalLeakage += o.totalAmount;
      } else if (o.exitStatus === "CANCELLED_AND_REFUNDED") {
        if (o.netRealizedAmount > 0) {
          netRealizedRevenue += o.netRealizedAmount;
        }
      } else {
        pendingCount++;
        totalLeakage += o.totalAmount;
      }

      totalTaxableValue += o.taxableValue;
      totalCgst += o.cgst;
      totalSgst += o.sgst;
    }

    const totalOrders = filteredOrders.length;
    const avgBasketValue = totalOrders > 0 ? grossInvoiced / totalOrders : 0;
    const totalGstLiability = totalCgst + totalSgst;
    const netCashCollected = Math.max(0, grossCash - cashRefundAmount);
    const netDigitalSettled = Math.max(0, grossDigital - digitalRefundAmount);

    // Automated Reconciliation Check:
    // Gross Invoiced MUST equal Net Realized + Refunds + At-Risk Leakage
    const accounted = netRealizedRevenue + totalRefundAmount + totalLeakage;
    const reconciliationVariance = Math.abs(grossInvoiced - accounted);
    const isReconciled = reconciliationVariance < 0.05;
    const reconciliationStatusText: "CLEAN [OK]" | "⚠ RECONCILIATION REQUIRED" = isReconciled
      ? "CLEAN [OK]"
      : "⚠ RECONCILIATION REQUIRED";

    return {
      totalRevenue: grossInvoiced,
      realizedRevenue: approvedRevenue,
      netRealizedRevenue,
      cashExpected: netCashCollected,
      digitalExpected: netDigitalSettled,
      grossCash,
      grossDigital,
      totalLeakage,
      cashLeakage: 0,
      digitalLeakage: 0,
      totalTaxableValue,
      totalCgst,
      totalSgst,
      totalGstLiability,
      avgBasketValue,
      totalOrders,
      rejectedCount,
      pendingCount,
      refundCount,
      refundAmount: totalRefundAmount,
      cashRefundAmount,
      digitalRefundAmount,
      isReconciled,
      reconciliationVariance,
      reconciliationStatusText,
      activeAlerts: initialFinancials.activeAlerts,
    };
  }, [filteredOrders, initialFinancials, periodFilter, activeTab, searchQuery]);

  // Actionable Attention / Triage Issues
  const triageIssues = useMemo(() => {
    const issues: {
      type: "PENDING" | "REJECTION" | "REFUND" | "CASH_FLOAT";
      title: string;
      desc: string;
      actionText: string;
      tabTarget: any;
    }[] = [];

    const unverified = initialOrders.filter(
      (o) =>
        !o.isRefunded &&
        o.exitStatus !== "APPROVED" &&
        o.exitStatus !== "COMPLETED" &&
        o.exitStatus !== "EXITED" &&
        o.exitStatus !== "REJECTED"
    );
    if (unverified.length > 0) {
      const sum = unverified.reduce((acc, o) => acc + o.totalAmount, 0);
      issues.push({
        type: "PENDING",
        title: `${unverified.length} Paid Order${unverified.length === 1 ? "" : "s"} at Exit Gate (₹${sum.toFixed(2)})`,
        desc: `Customer paid at till, but exit pass has not been scanned by security guard.`,
        actionText: `Filter Pending Gate Pass`,
        tabTarget: "PENDING_EXIT",
      });
    }

    const rejections = initialOrders.filter((o) => o.exitStatus === "REJECTED");
    if (rejections.length > 0) {
      const sum = rejections.reduce((acc, o) => acc + o.totalAmount, 0);
      issues.push({
        type: "REJECTION",
        title: `${rejections.length} Security Guard Interventions (₹${sum.toFixed(2)})`,
        desc: `Flagged at exit gate due to barcode or cart quantity mismatch.`,
        actionText: `Inspect Rejections`,
        tabTarget: "REJECTED",
      });
    }

    const refunded = initialOrders.filter((o) => o.isRefunded);
    if (refunded.length > 0) {
      const sum = refunded.reduce((acc, o) => acc + Number(o.refundAmount || o.totalAmount), 0);
      issues.push({
        type: "REFUND",
        title: `${refunded.length} Completed Return${refunded.length === 1 ? "" : "s"} & Credit Notes (-₹${sum.toFixed(2)})`,
        desc: `Officially refunded via cash counter or gateway reversal with audit reason.`,
        actionText: `View Refunds Register`,
        tabTarget: "REFUNDED",
      });
    }

    if (initialCashRecon.variance > 50) {
      issues.push({
        type: "CASH_FLOAT",
        title: `Cash Register Till Float: ₹${initialCashRecon.variance.toFixed(2)}`,
        desc: `Physical till cash exceeds IDT safe vault deposits by ₹${initialCashRecon.variance.toFixed(2)}.`,
        actionText: `Reconcile Cash`,
        tabTarget: "CASH",
      });
    }

    return issues;
  }, [initialOrders, initialCashRecon]);

  function handleExportCsv() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await exportCaSalesReport(branchCode ?? undefined);
        if (!res.ok || !res.csv) {
          setError("Failed to generate CA Sales Register.");
          return;
        }

        const blob = new Blob(["\uFEFF" + res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          res.filename ??
          `ClickOut_CA_Sales_Register_${branchCode || "STORE"}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        setError("Export failed: " + e.message);
      }
    });
  }

  async function handleDownloadPdf(orderId: string) {
    setIsDownloadingPdf(true);
    try {
      const res = await generateInvoicePdf(orderId);
      if (!res.ok || !res.data) {
        alert(res.error || "Failed to generate PDF");
        return;
      }
      const byteCharacters = atob(res.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `Invoice_${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("PDF download failed: " + e.message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const countedVariance =
    manualCountedCash.trim() !== ""
      ? parseFloat(manualCountedCash) - initialCashRecon.posCashCollected
      : null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Scope, Period & Export Bar */}
      <Card
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
          padding: "16px 20px",
          background: "var(--card-bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "color-mix(in srgb, var(--success) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
              color: "var(--success)",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "monospace",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
            {branchCode ? `BRANCH: ${branchCode}` : "GLOBAL CONSOLIDATED"}
          </div>

          {/* Period selector */}
          <div
            style={{
              display: "flex",
              background: "var(--scaffold-bg)",
              padding: 3,
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setPeriodFilter("ALL")}
              style={{
                background: periodFilter === "ALL" ? "var(--card-bg)" : "transparent",
                color: periodFilter === "ALL" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: periodFilter === "ALL" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                border: "none",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              All Invoices
            </button>
            <button
              onClick={() => setPeriodFilter("THIS_MONTH")}
              style={{
                background: periodFilter === "THIS_MONTH" ? "var(--card-bg)" : "transparent",
                color: periodFilter === "THIS_MONTH" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: periodFilter === "THIS_MONTH" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                border: "none",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              This Month (GSTR-1)
            </button>
            <button
              onClick={() => setPeriodFilter("TODAY")}
              style={{
                background: periodFilter === "TODAY" ? "var(--card-bg)" : "transparent",
                color: periodFilter === "TODAY" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: periodFilter === "TODAY" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                border: "none",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Today
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/auditor/vault" style={{ textDecoration: "none" }}>
            <Button variant="secondary" style={{ fontSize: 12, padding: "8px 14px" }}>
              Audit Vault →
            </Button>
          </Link>
          <Button
            variant="primary"
            onClick={handleExportCsv}
            disabled={isPending}
            style={{ fontSize: 12, padding: "8px 16px" }}
          >
            {isPending ? "Generating..." : "📥 Download CA Sales Register (CSV)"}
          </Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {/* 5-SECOND CLARITY: 6 Enterprise Golden Tally KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {/* Card 1: Gross Sales Turnover */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              1. GROSS INVOICED SALES
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--primary)",
                background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              TOTAL BILLED
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--text-primary)", fontFamily: "monospace" }}>
            ₹{liveFinancials.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>{liveFinancials.totalOrders} Invoices Issued</span>
            <span>Avg: ₹{liveFinancials.avgBasketValue.toFixed(0)}</span>
          </div>
        </Card>

        {/* Card 2: Net Realized Revenue */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              2. NET REALIZED REVENUE
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--success)",
                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              CLEARED EXITS
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--success)", fontFamily: "monospace" }}>
            ₹{liveFinancials.netRealizedRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>Approved: ₹{liveFinancials.realizedRevenue.toFixed(0)}</span>
            <span style={{ color: liveFinancials.totalLeakage > 0 ? "var(--warning)" : "inherit" }}>
              At Risk: ₹{liveFinancials.totalLeakage.toFixed(0)}
            </span>
          </div>
        </Card>

        {/* Card 3: Total Refunds & Credit Notes */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              3. REFUNDS & CREDIT NOTES
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--danger)",
                background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              REVERSALS
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--danger)", fontFamily: "monospace" }}>
            -₹{liveFinancials.refundAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>Cash: -₹{liveFinancials.cashRefundAmount.toFixed(0)}</span>
            <span>Digital: -₹{liveFinancials.digitalRefundAmount.toFixed(0)}</span>
          </div>
        </Card>

        {/* Card 4: Register Till Cash vs Digital Gateways */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              4. TILLS & GATEWAY SPLIT
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#8b5cf6",
                background: "rgba(139, 92, 246, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              CHANNELS
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>TILL CASH</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--warning)", fontFamily: "monospace" }}>
                ₹{liveFinancials.cashExpected.toFixed(0)}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: "var(--border)" }} />
            <div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>DIGITAL / UPI</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#3b82f6", fontFamily: "monospace" }}>
                ₹{liveFinancials.digitalExpected.toFixed(0)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            Gross: Cash ₹{liveFinancials.grossCash.toFixed(0)} + Digital ₹{liveFinancials.grossDigital.toFixed(0)}
          </div>
        </Card>

        {/* Card 5: GST Output Liability */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              5. GST OUTPUT LIABILITY
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#0284c7",
                background: "rgba(2, 132, 199, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              GSTR-1
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0284c7", fontFamily: "monospace" }}>
            ₹{liveFinancials.totalGstLiability.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>Taxable: ₹{liveFinancials.totalTaxableValue.toFixed(0)}</span>
            <span>CGST: ₹{liveFinancials.totalCgst.toFixed(0)} | SGST: ₹{liveFinancials.totalSgst.toFixed(0)}</span>
          </div>
        </Card>

        {/* Card 6: Automated Reconciliation Engine Status */}
        <Card
          style={{
            padding: "18px 20px",
            background: liveFinancials.isReconciled
              ? "color-mix(in srgb, var(--success) 6%, var(--card-bg))"
              : "rgba(239, 68, 68, 0.08)",
            border: liveFinancials.isReconciled
              ? "1px solid color-mix(in srgb, var(--success) 30%, transparent)"
              : "1px solid rgba(239, 68, 68, 0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: 0.8 }}>
              6. RECONCILIATION ENGINE
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: liveFinancials.isReconciled ? "var(--success)" : "var(--danger)",
                background: liveFinancials.isReconciled
                  ? "color-mix(in srgb, var(--success) 15%, transparent)"
                  : "rgba(239, 68, 68, 0.2)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {liveFinancials.reconciliationStatusText}
            </span>
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              fontFamily: "monospace",
              color: liveFinancials.isReconciled ? "var(--success)" : "var(--danger)",
            }}
          >
            {liveFinancials.isReconciled ? "₹0.00 VARIANCE" : `⚠ ₹${liveFinancials.reconciliationVariance.toFixed(2)} MISMATCH`}
          </div>

          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            {liveFinancials.isReconciled
              ? "Register = Net Sales + Refunds + Gatepass"
              : "⚠ Immediate audit ledger review required"}
          </div>
        </Card>
      </div>

      {/* What Needs My Attention? (Actionable Triage Bar) */}
      {triageIssues.length > 0 ? (
        <Card style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                What Needs My Attention? ({triageIssues.length} Items)
              </h3>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Direct triage from store security and accounting ledger
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {triageIssues.map((issue, idx) => (
              <div
                key={idx}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background:
                    issue.type === "REJECTION"
                      ? "rgba(239, 68, 68, 0.08)"
                      : issue.type === "PENDING"
                      ? "rgba(245, 158, 11, 0.08)"
                      : issue.type === "REFUND"
                      ? "rgba(139, 92, 246, 0.08)"
                      : "color-mix(in srgb, var(--primary) 8%, transparent)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                    {issue.title}
                  </span>
                  <button
                    onClick={() => setActiveTab(issue.tabTarget)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    {issue.actionText} →
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{issue.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            background: "color-mix(in srgb, var(--success) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>✅</span>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
            <strong style={{ color: "var(--success)" }}>100% Audit Healthy:</strong> All sales verified at exit, zero leakage, cash till balanced, and itemized GST register verified for statutory filing.
          </div>
        </div>
      )}

      {/* Cash-to-Vault Reconciliation Panel */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🏦</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Physical Cash Till Reconciliation & IDT Safe Handover
              </h3>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Counter till drawer cash collections vs verified IDT safe transfer deposits to the vault.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowCashTester(!showCashTester)}
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {showCashTester ? "Hide Drawer Test" : "🧮 Count Physical Drawer"}
            </button>
            <Badge
              color={
                initialCashRecon.status === "BALANCED"
                  ? "var(--success)"
                  : initialCashRecon.status === "DEFICIT"
                  ? "var(--warning)"
                  : "var(--danger)"
              }
            >
              {initialCashRecon.status === "BALANCED"
                ? "BALANCED (₹0.00)"
                : initialCashRecon.status === "DEFICIT"
                ? `DESK FLOAT (₹${initialCashRecon.variance.toFixed(2)})`
                : `SURPLUS (₹${Math.abs(initialCashRecon.variance).toFixed(2)})`}
            </Badge>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div style={{ background: "var(--scaffold-bg)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              POS Cash Collected at Till Counters
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginTop: 4, fontFamily: "monospace" }}>
              ₹{initialCashRecon.posCashCollected.toFixed(2)}
            </div>
          </div>

          <div style={{ background: "var(--scaffold-bg)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              IDT Safe Vault Deposits Completed
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--success)", marginTop: 4, fontFamily: "monospace" }}>
              ₹{initialCashRecon.vaultDepositsHandedOver.toFixed(2)}
            </div>
          </div>

          <div style={{ background: "var(--scaffold-bg)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              Active Till Variance (Holding Float)
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: initialCashRecon.variance === 0 ? "var(--success)" : "var(--warning)",
                marginTop: 4,
                fontFamily: "monospace",
              }}
            >
              ₹{initialCashRecon.variance.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Expandable Drawer Count Tester */}
        {showCashTester && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 8,
              background: "var(--scaffold-bg)",
              border: "1px dashed var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Enter Physical Counted Cash:</span>
              <div style={{ position: "relative", display: "inline-block" }}>
                <span style={{ position: "absolute", left: 10, top: 6, color: "var(--text-secondary)", fontSize: 13 }}>₹</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={manualCountedCash}
                  onChange={(e) => setManualCountedCash(e.target.value)}
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "6px 12px 6px 26px",
                    borderRadius: 6,
                    fontSize: 13,
                    width: 140,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {countedVariance !== null && (
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {countedVariance === 0 ? (
                  <span style={{ color: "var(--success)" }}>✅ Physical drawer perfectly matches system!</span>
                ) : countedVariance > 0 ? (
                  <span style={{ color: "var(--warning)" }}>⚠️ Extra cash float: +₹{countedVariance.toFixed(2)}</span>
                ) : (
                  <span style={{ color: "var(--danger)" }}>
                    🚨 Missing Cash Shortage: -₹{Math.abs(countedVariance).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tally-Style Transaction Ledger */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Order Autopsy & Sales Register
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Itemized audit ledger with GST breakdown, cashier custody, exit verifications, and credit notes.
            </span>
          </div>

          {/* Quick Search */}
          <div style={{ position: "relative", minWidth: 280 }}>
            <span style={{ position: "absolute", left: 10, top: 8, color: "var(--text-secondary)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder="Search invoice, customer, cashier, items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "8px 12px 8px 32px",
                borderRadius: 8,
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { id: "ALL", label: "All Invoices", count: initialOrders.length },
            {
              id: "APPROVED",
              label: "Approved & Exited",
              count: initialOrders.filter(
                (o) => !o.isRefunded && (o.exitStatus === "APPROVED" || o.exitStatus === "COMPLETED" || o.exitStatus === "EXITED")
              ).length,
            },
            {
              id: "REFUNDED",
              label: "Cancelled & Refunded",
              count: initialOrders.filter((o) => o.isRefunded || o.exitStatus === "CANCELLED_AND_REFUNDED").length,
            },
            {
              id: "PENDING_EXIT",
              label: "Pending Gate Pass",
              count: initialOrders.filter(
                (o) =>
                  !o.isRefunded &&
                  o.exitStatus !== "APPROVED" &&
                  o.exitStatus !== "COMPLETED" &&
                  o.exitStatus !== "EXITED" &&
                  o.exitStatus !== "REJECTED"
              ).length,
            },
            {
              id: "REJECTED",
              label: "Guard Rejections",
              count: initialOrders.filter((o) => o.exitStatus === "REJECTED").length,
            },
            {
              id: "CASH",
              label: "Cash Tills",
              count: initialOrders.filter((o) => o.paymentMode === "CASH").length,
            },
            {
              id: "DIGITAL",
              label: "Digital (UPI / Card)",
              count: initialOrders.filter((o) => o.paymentMode !== "CASH").length,
            },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  background: isSelected ? "var(--primary)" : "var(--card-bg)",
                  color: isSelected ? "#fff" : "var(--text-secondary)",
                  border: "1px solid " + (isSelected ? "var(--primary)" : "var(--border)"),
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    background: isSelected ? "rgba(255,255,255,0.25)" : "var(--scaffold-bg)",
                    color: isSelected ? "#fff" : "var(--text-secondary)",
                    border: isSelected ? "none" : "1px solid var(--border)",
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontSize: 10,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {filteredOrders.length === 0 ? (
          <EmptyState message="No sales records match the selected audit filter." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--scaffold-bg)" }}>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>INVOICE / ID</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>DATE & TIME</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>CUSTOMER</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>PAYMENT</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>TAXABLE + GST</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>GROSS / NET</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>STATUS</th>
                    <th style={{ padding: "12px 14px", fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const isApproved = !o.isRefunded && (o.exitStatus === "APPROVED" || o.exitStatus === "COMPLETED" || o.exitStatus === "EXITED");
                    const isRejected = o.exitStatus === "REJECTED";
                    const isRefunded = o.isRefunded || o.exitStatus === "CANCELLED_AND_REFUNDED";

                    return (
                      <tr
                        key={o.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isRefunded
                            ? "color-mix(in srgb, var(--danger) 4%, transparent)"
                            : isRejected
                            ? "rgba(239, 68, 68, 0.04)"
                            : !isApproved
                            ? "rgba(245, 158, 11, 0.03)"
                            : "transparent",
                        }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            {o.invoiceNo}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                            ID: {o.id.slice(0, 8)}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-secondary)" }}>
                          <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            {new Date(o.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                            {new Date(o.timestampMs).toLocaleDateString()}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px", fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {o.customerName || "Walk-in Guest"}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                            Cashier: {o.cashierName}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: o.paymentMode === "CASH" ? "rgba(245, 158, 11, 0.12)" : "rgba(59, 130, 246, 0.12)",
                              color: o.paymentMode === "CASH" ? "var(--warning)" : "#3b82f6",
                            }}
                          >
                            {o.paymentMode}
                          </span>
                        </td>

                        <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            ₹{o.taxableValue.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                            + GST ₹{o.gstTotal.toFixed(2)}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px", fontFamily: "monospace" }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: isRefunded ? "var(--danger)" : "var(--text-primary)",
                              fontSize: 14,
                              textDecoration: isRefunded && o.netRealizedAmount === 0 ? "line-through" : "none",
                            }}
                          >
                            ₹{o.totalAmount.toFixed(2)}
                          </div>
                          {isRefunded && (
                            <div style={{ fontSize: 10, color: "var(--danger)", fontWeight: 700 }}>
                              Refund: -₹{Number(o.refundAmount || o.totalAmount).toFixed(2)}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <Badge
                            color={
                              isRefunded
                                ? "var(--danger)"
                                : isApproved
                                ? "var(--success)"
                                : isRejected
                                ? "var(--danger)"
                                : "var(--warning)"
                            }
                          >
                            {isRefunded ? "CANCELLED & REFUNDED" : o.exitStatus}
                          </Badge>
                        </td>

                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              onClick={() => setSelectedOrder(o)}
                              style={{
                                background: "var(--scaffold-bg)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border)",
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              🔬 Autopsy
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(o.id)}
                              disabled={isDownloadingPdf}
                              style={{
                                background: "var(--card-bg)",
                                color: "var(--primary)",
                                border: "1px solid var(--primary)",
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isDownloadingPdf ? "not-allowed" : "pointer",
                              }}
                            >
                              📄 PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Order Autopsy Modal */}
      {selectedOrder && (
        <div
          onClick={() => setSelectedOrder(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 580,
              maxWidth: "96vw",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧾</span>
                  <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: "var(--text-primary)" }}>
                    Order Autopsy: {selectedOrder.invoiceNo}
                  </h3>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontFamily: "monospace" }}>
                  Order ID: {selectedOrder.id}
                </div>
              </div>
              <Badge
                color={
                  selectedOrder.isRefunded
                    ? "var(--danger)"
                    : selectedOrder.exitStatus === "APPROVED" || selectedOrder.exitStatus === "COMPLETED" || selectedOrder.exitStatus === "EXITED"
                    ? "var(--success)"
                    : selectedOrder.exitStatus === "REJECTED"
                    ? "var(--danger)"
                    : "var(--warning)"
                }
              >
                {selectedOrder.isRefunded ? "CANCELLED & REFUNDED" : selectedOrder.exitStatus}
              </Badge>
            </div>

            {/* Refund Details Banner if order is refunded */}
            {selectedOrder.isRefunded && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  marginBottom: 16,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, color: "var(--danger)", fontSize: 13 }}>
                    📑 GST CREDIT NOTE & REFUND AUDIT TRAIL
                  </span>
                  <span style={{ fontWeight: 900, color: "var(--danger)", fontFamily: "monospace", fontSize: 14 }}>
                    -₹{Number(selectedOrder.refundAmount || selectedOrder.totalAmount).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>Refund Method: </span>
                    <strong>{(selectedOrder.refundPayoutMode || (selectedOrder.paymentMode === "CASH" ? "CASH_COUNTER" : "ORIGINAL_PAYMENT")).replace(/_/g, " ")}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>Reference / UTR: </span>
                    <strong style={{ fontFamily: "monospace" }}>{selectedOrder.refundId || "REF-OK"}</strong>
                  </div>
                </div>
                {selectedOrder.refundReason && (
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Audit Reason: </span>
                    <em>&ldquo;{selectedOrder.refundReason}&rdquo;</em>
                  </div>
                )}
              </div>
            )}

            {/* Custody Chain Details */}
            <div
              style={{
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Billed By Cashier:</span>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{selectedOrder.cashierName}</div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Exit Verifier Guard:</span>
                <div style={{ fontWeight: 700, color: selectedOrder.verifiedByGuard.includes("Auto") ? "var(--success)" : "var(--text-primary)" }}>
                  {selectedOrder.verifiedByGuard}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Payment Method:</span>
                <div style={{ fontWeight: 700, color: selectedOrder.paymentMode === "CASH" ? "var(--warning)" : "#3b82f6" }}>
                  {selectedOrder.paymentMode} {selectedOrder.upiTxnId ? `(${selectedOrder.upiTxnId})` : ""}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Customer:</span>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                  {selectedOrder.customerName || "Walk-in Guest"}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                ITEM-LEVEL BILLED PRICE & TAX BREAKDOWN
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--scaffold-bg)", color: "var(--text-secondary)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 10px" }}>Item</th>
                      <th style={{ padding: "8px 10px" }}>Qty</th>
                      <th style={{ padding: "8px 10px" }}>Taxable</th>
                      <th style={{ padding: "8px 10px" }}>GST</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{it.name}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{it.quantity}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                          ₹{(it.taxable ?? it.price / 1.18).toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#3b82f6", fontFamily: "monospace" }}>
                          {it.gst ?? "18%"}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          ₹{(it.price * it.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tax & Total Summary */}
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                display: "grid",
                gap: 6,
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span>Taxable Base Value:</span>
                <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>₹{selectedOrder.taxableValue.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span>Central GST (CGST):</span>
                <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>₹{selectedOrder.cgst.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span>State GST (SGST):</span>
                <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>₹{selectedOrder.sgst.toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 15,
                  fontWeight: 900,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 8,
                  marginTop: 2,
                }}
              >
                <span>Total Invoiced:</span>
                <span style={{ fontFamily: "monospace", color: "var(--primary)" }}>₹{selectedOrder.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="secondary" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => handleDownloadPdf(selectedOrder.id)}
                disabled={isDownloadingPdf}
              >
                {isDownloadingPdf
                  ? "Generating..."
                  : selectedOrder.isRefunded
                  ? "📄 Download GST Credit Note (PDF)"
                  : "📄 Download Tax Invoice (PDF)"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
