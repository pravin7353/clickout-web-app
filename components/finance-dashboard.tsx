"use client";

import { useState, useEffect, useTransition } from "react";
import { LedgerAccountDocument } from "@/lib/schemas/finance-schema";
import {
  TrialBalanceResult,
  ProfitAndLossResult,
  BalanceSheetResult,
} from "@/lib/services/finance-service";
import { getFinancialStatementsAction } from "@/actions/finance";
import { FinanceVoucherForm } from "@/components/finance-voucher-form";
import { FinanceLedgerView } from "@/components/finance-ledger-view";
import { FinanceGstPanel } from "@/components/finance-gst-panel";
import { FinanceBankReconciliation } from "@/components/finance-bank-reconciliation";
import { Card, Badge, Button, Input, Select, ErrorBanner } from "@/components/ui";

interface FinanceDashboardProps {
  initialAccounts: LedgerAccountDocument[];
  tenantId?: string | null;
  userRole: string;
}

export function FinanceDashboard({
  initialAccounts,
  tenantId,
  userRole,
}: FinanceDashboardProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const startOfYearStr = `${new Date().getFullYear()}-04-01`; // Indian Financial Year starts Apr 1

  // View state: Owner vs CA vs GST vs Bank vs Operational
  const [viewMode, setViewMode] = useState<"owner" | "ca" | "gst" | "bank" | "vouchers" | "ledger" | "accounts">("owner");
  const [caStatementTab, setCaStatementTab] = useState<"tb" | "pnl" | "bs">("tb");

  // Date controls
  const [asOfDate, setAsOfDate] = useState<string>(todayStr);
  const [pnlStartDate, setPnlStartDate] = useState<string>(startOfYearStr <= todayStr ? startOfYearStr : `${new Date().getFullYear() - 1}-04-01`);
  const [pnlEndDate, setPnlEndDate] = useState<string>(todayStr);

  // Statements Data
  const [statements, setStatements] = useState<{
    trialBalance: TrialBalanceResult | null;
    profitAndLoss: ProfitAndLossResult | null;
    balanceSheet: BalanceSheetResult | null;
  }>({
    trialBalance: null,
    profitAndLoss: null,
    balanceSheet: null,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<LedgerAccountDocument[]>(initialAccounts);
  const [isPending, startTransition] = useTransition();

  const loadStatements = (asDate: string, sDate: string, eDate: string) => {
    setLoading(true);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await getFinancialStatementsAction({
          asOfDate: asDate,
          startDate: sDate,
          endDate: eDate,
        });

        if (res.ok) {
          setStatements({
            trialBalance: res.trialBalance,
            profitAndLoss: res.profitAndLoss,
            balanceSheet: res.balanceSheet,
          });
        } else {
          setErrorMsg(res.error || "Failed to generate financial statements.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error loading financial statements.");
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadStatements(asOfDate, pnlStartDate, pnlEndDate);
  }, []);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadStatements(asOfDate, pnlStartDate, pnlEndDate);
  };

  // ─── CSV EXPORT UTILITIES FOR ALL 3 STATEMENTS ─────────────────────────

  const exportTrialBalanceCsv = () => {
    const tb = statements.trialBalance;
    if (!tb) return;

    const header = [
      `CLICKOUT ENTERPRISE -- TRIAL BALANCE STATEMENT`,
      `As of Date: ${tb.asOfDate}`,
      `Reconciliation Status: ${tb.isBalanced ? "BALANCED" : "OUT OF BALANCE (Variance: Rs. " + tb.imbalanceAmount.toFixed(2) + ")"}`,
      ``,
      `Account Name,Group,Primary Type,Debit (Rs),Credit (Rs)`,
    ];

    const rows = tb.rows.map(
      (r) =>
        `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}","${r.accountType}",${r.debit > 0 ? r.debit.toFixed(2) : ""},${r.credit > 0 ? r.credit.toFixed(2) : ""}`
    );

    rows.push(
      `"TOTAL",,,"${tb.totalDebit.toFixed(2)}","${tb.totalCredit.toFixed(2)}"`
    );

    downloadCsv(`Trial_Balance_${tb.asOfDate}.csv`, [...header, ...rows].join("\n"));
  };

  const exportProfitAndLossCsv = () => {
    const pnl = statements.profitAndLoss;
    if (!pnl) return;

    const header = [
      `CLICKOUT ENTERPRISE -- PROFIT & LOSS STATEMENT`,
      `Period: ${pnl.startDate} to ${pnl.endDate}`,
      `Net Status: ${pnl.isProfit ? "NET PROFIT" : "NET LOSS"} (Rs. ${Math.abs(pnl.netProfit).toFixed(2)})`,
      ``,
      `== REVENUE / INCOME ==`,
      `Account Name,Group,Amount (Rs)`,
    ];

    const incomeRows = pnl.incomeRows.map(
      (r) => `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}",${r.amount.toFixed(2)}`
    );

    const expenseHeader = [
      `"Total Income",,"${pnl.totalIncome.toFixed(2)}"`,
      ``,
      `== OPERATING EXPENSES ==`,
      `Account Name,Group,Amount (Rs)`,
    ];

    const expenseRows = pnl.expenseRows.map(
      (r) => `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}",${r.amount.toFixed(2)}`
    );

    const summary = [
      `"Total Expenses",,"${pnl.totalExpense.toFixed(2)}"`,
      ``,
      `"NET PROFIT / (LOSS)",,"${pnl.netProfit.toFixed(2)}"`,
    ];

    downloadCsv(`Profit_And_Loss_${pnl.startDate}_to_${pnl.endDate}.csv`, [...header, ...incomeRows, ...expenseHeader, ...expenseRows, ...summary].join("\n"));
  };

  const exportBalanceSheetCsv = () => {
    const bs = statements.balanceSheet;
    if (!bs) return;

    const header = [
      `CLICKOUT ENTERPRISE -- BALANCE SHEET STATEMENT`,
      `As of Date: ${bs.asOfDate}`,
      `Equation Verification: Assets (Rs. ${bs.totalAssets.toFixed(2)}) == Liabilities (Rs. ${bs.totalLiabilities.toFixed(2)}) + Equity (Rs. ${bs.totalEquity.toFixed(2)})`,
      ``,
      `== ASSETS ==`,
      `Account Name,Group,Amount (Rs)`,
    ];

    const assetRows = bs.assetRows.map(
      (r) => `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}",${r.amount.toFixed(2)}`
    );

    const liabHeader = [
      `"TOTAL ASSETS",,"${bs.totalAssets.toFixed(2)}"`,
      ``,
      `== LIABILITIES ==`,
      `Account Name,Group,Amount (Rs)`,
    ];

    const liabRows = bs.liabilityRows.map(
      (r) => `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}",${r.amount.toFixed(2)}`
    );

    const eqHeader = [
      `"Total Liabilities",,"${bs.totalLiabilities.toFixed(2)}"`,
      ``,
      `== CAPITAL & EQUITY ==`,
      `Account Name,Group,Amount (Rs)`,
    ];

    const eqRows = bs.equityRows.map(
      (r) => `"${r.accountName.replace(/"/g, '""')}","${r.accountGroup.replace(/"/g, '""')}",${r.amount.toFixed(2)}`
    );

    const summary = [
      `"Total Equity & Retained Earnings",,"${bs.totalEquity.toFixed(2)}"`,
      `"TOTAL LIABILITIES & EQUITY",,"${bs.totalLiabilitiesAndEquity.toFixed(2)}"`,
    ];

    downloadCsv(`Balance_Sheet_${bs.asOfDate}.csv`, [...header, ...assetRows, ...liabHeader, ...liabRows, ...eqHeader, ...eqRows, ...summary].join("\n"));
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── DERIVED OWNER VIEW VALUES (EXACT SAME SOURCE FUNCTIONS) ────────────
  const pnl = statements.profitAndLoss;
  const bs = statements.balanceSheet;
  const tb = statements.trialBalance;

  const totalRevenue = pnl?.totalIncome ?? 0;
  const totalExpense = pnl?.totalExpense ?? 0;
  const netProfit = pnl?.netProfit ?? 0;
  const isProfit = (pnl?.netProfit ?? 0) >= 0;

  // Extract GST Payable from Balance Sheet or Trial Balance
  const gstLiabilityItem = bs?.liabilityRows.find(
    (l) => l.accountName.toLowerCase().includes("gst") || l.accountGroup.toLowerCase().includes("gst")
  );
  const gstPayableAmount = gstLiabilityItem ? gstLiabilityItem.amount : 0;

  // Extract Cash in Hand + Bank Accounts from Balance Sheet
  const liquidCashBank = (bs?.assetRows ?? [])
    .filter(
      (a) =>
        a.accountName.toLowerCase().includes("cash") ||
        a.accountName.toLowerCase().includes("bank") ||
        a.accountGroup.toLowerCase().includes("cash") ||
        a.accountGroup.toLowerCase().includes("bank")
    )
    .reduce((sum, a) => sum + a.amount, 0);

  const profitMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Header & Audience Presentation Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
              Finance & Accounting Suite
            </h1>
            <Badge color={tb?.isBalanced ? "var(--success, #22c55e)" : "var(--warning, #f59e0b)"}>
              {tb?.isBalanced ? "Double-Entry Balanced" : "Audited Books"}
            </Badge>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            Real-time double-entry general ledger, automated statutory statements, and executive performance analytics
          </p>
        </div>

        {/* Global Presentation Mode Switcher */}
        <div
          style={{
            display: "inline-flex",
            padding: 4,
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--border)",
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("owner")}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              background: viewMode === "owner" ? "var(--primary, #3b82f6)" : "transparent",
              color: viewMode === "owner" ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>👔</span> Owner View
          </button>

          <button
            type="button"
            onClick={() => setViewMode("ca")}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              background: viewMode === "ca" ? "var(--primary, #3b82f6)" : "transparent",
              color: viewMode === "ca" ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📊</span> CA & Audit View
          </button>

          <button
            type="button"
            onClick={() => setViewMode("gst")}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              background: viewMode === "gst" ? "var(--primary, #3b82f6)" : "transparent",
              color: viewMode === "gst" ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🏛️</span> GST Compliance
          </button>

          <button
            type="button"
            onClick={() => setViewMode("bank")}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              background: viewMode === "bank" ? "var(--primary, #3b82f6)" : "transparent",
              color: viewMode === "bank" ? "#fff" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🏦</span> Bank Reconciliation
          </button>

          <button
            type="button"
            onClick={() => setViewMode("vouchers")}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: viewMode === "vouchers" ? "var(--card-bg)" : "transparent",
              color: viewMode === "vouchers" ? "var(--text-primary)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>✍️</span> Vouchers
          </button>

          <button
            type="button"
            onClick={() => setViewMode("ledger")}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: viewMode === "ledger" ? "var(--card-bg)" : "transparent",
              color: viewMode === "ledger" ? "var(--text-primary)" : "var(--text-secondary)",
              transition: "all 0.15s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📖</span> Ledger
          </button>
        </div>
      </div>

      {errorMsg && <ErrorBanner message={errorMsg} />}

      {/* Global Filter Bar for Statements */}
      {(viewMode === "owner" || viewMode === "ca") && (
        <Card style={{ padding: "14px 20px" }}>
          <form onSubmit={handleApplyFilter} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)" }}>
                STATEMENT PERIOD:
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>From</label>
                <Input
                  type="date"
                  value={pnlStartDate}
                  onChange={(e) => setPnlStartDate(e.target.value)}
                  style={{ width: 145 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>To / As Of</label>
                <Input
                  type="date"
                  value={pnlEndDate}
                  onChange={(e) => {
                    setPnlEndDate(e.target.value);
                    setAsOfDate(e.target.value);
                  }}
                  style={{ width: 145 }}
                />
              </div>
              <Button variant="secondary" type="submit" disabled={loading} style={{ padding: "6px 14px", fontSize: 12 }}>
                {loading ? "Refreshing..." : "Apply Range"}
              </Button>
            </div>

            {viewMode === "ca" && (
              <div style={{ display: "flex", gap: 8 }}>
                {caStatementTab === "tb" && (
                  <Button variant="secondary" onClick={exportTrialBalanceCsv} style={{ fontSize: 12, padding: "6px 12px" }}>
                    📥 Export Trial Balance (CSV)
                  </Button>
                )}
                {caStatementTab === "pnl" && (
                  <Button variant="secondary" onClick={exportProfitAndLossCsv} style={{ fontSize: 12, padding: "6px 12px" }}>
                    📥 Export P&L (CSV)
                  </Button>
                )}
                {caStatementTab === "bs" && (
                  <Button variant="secondary" onClick={exportBalanceSheetCsv} style={{ fontSize: 12, padding: "6px 12px" }}>
                    📥 Export Balance Sheet (CSV)
                  </Button>
                )}
                <Button variant="ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: "6px 12px" }}>
                  🖨️ Print
                </Button>
              </div>
            )}
          </form>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. OWNER VIEW (EXECUTIVE PLAIN-LANGUAGE CARDS)                        */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {viewMode === "owner" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Executive KPI Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {/* Total Revenue */}
            <Card style={{ padding: 20, borderLeft: "4px solid #22c55e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>TOTAL REVENUE</span>
                <span style={{ fontSize: 18 }}>📈</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#22c55e", marginTop: 8 }}>
                ₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Taxable Sales & Operating Turnover
              </div>
            </Card>

            {/* Total Expenses */}
            <Card style={{ padding: 20, borderLeft: "4px solid #ef4444" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>TOTAL EXPENSES</span>
                <span style={{ fontSize: 18 }}>📉</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#ef4444", marginTop: 8 }}>
                ₹{totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Purchases, Salaries & Operational Costs
              </div>
            </Card>

            {/* Net Profit */}
            <Card
              style={{
                padding: 20,
                borderLeft: `4px solid ${isProfit ? "#22c55e" : "#ef4444"}`,
                background: isProfit ? "rgba(34, 197, 94, 0.05)" : "rgba(239, 68, 68, 0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>NET OPERATING PROFIT</span>
                <span style={{ fontSize: 18 }}>{isProfit ? "💰" : "⚠️"}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: isProfit ? "#22c55e" : "#ef4444", marginTop: 8 }}>
                {isProfit ? "+" : ""}₹{netProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: isProfit ? "#22c55e" : "#ef4444", marginTop: 6 }}>
                Margin: {profitMarginPct.toFixed(1)}% {isProfit ? "Net Profit" : "Net Loss"}
              </div>
            </Card>

            {/* GST Payable */}
            <Card style={{ padding: 20, borderLeft: "4px solid #f59e0b" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>GST LIABILITY</span>
                <span style={{ fontSize: 18 }}>🏛️</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#f59e0b", marginTop: 8 }}>
                ₹{gstPayableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Statutory Output GST Payable to Govt
              </div>
            </Card>

            {/* Cash & Bank Reserves */}
            <Card style={{ padding: 20, borderLeft: "4px solid #3b82f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>LIQUID CASH & BANK</span>
                <span style={{ fontSize: 18 }}>🏦</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#3b82f6", marginTop: 8 }}>
                ₹{liquidCashBank.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                Total Cash in Hand + Bank Accounts
              </div>
            </Card>
          </div>

          {/* Revenue & Cost Drivers Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16 }}>
            {/* Revenue Streams */}
            <Card style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                Income Streams Breakdown
              </h3>
              {pnl?.incomeRows.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
                  No income transactions logged in this period.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pnl?.incomeRows.map((r) => (
                    <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{r.accountName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.accountGroup}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>
                        ₹{r.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Expense Breakdown */}
            <Card style={{ padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                Expense Distribution Breakdown
              </h3>
              {pnl?.expenseRows.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
                  No expense transactions logged in this period.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pnl?.expenseRows.map((r) => (
                    <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{r.accountName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.accountGroup}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444" }}>
                        ₹{r.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 2. CA & AUDIT VIEW (TRADITIONAL STATUTORY FINANCIAL STATEMENTS)       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {viewMode === "ca" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Statement Sub-Tabs */}
          <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <button
              type="button"
              onClick={() => setCaStatementTab("tb")}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: caStatementTab === "tb" ? "var(--primary, #3b82f6)" : "transparent",
                color: caStatementTab === "tb" ? "#fff" : "var(--text-secondary)",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              1. Trial Balance
            </button>

            <button
              type="button"
              onClick={() => setCaStatementTab("pnl")}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: caStatementTab === "pnl" ? "var(--primary, #3b82f6)" : "transparent",
                color: caStatementTab === "pnl" ? "#fff" : "var(--text-secondary)",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              2. Profit & Loss Statement
            </button>

            <button
              type="button"
              onClick={() => setCaStatementTab("bs")}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: caStatementTab === "bs" ? "var(--primary, #3b82f6)" : "transparent",
                color: caStatementTab === "bs" ? "#fff" : "var(--text-secondary)",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              3. Balance Sheet
            </button>
          </div>

          {/* ─── STATEMENT 1: TRIAL BALANCE ───────────────────────────────── */}
          {caStatementTab === "tb" && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    Statutory Trial Balance Statement
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    As of {tb?.asOfDate || todayStr}
                  </span>
                </div>
                <Badge color={tb?.isBalanced ? "var(--success, #22c55e)" : "var(--danger, #ef4444)"}>
                  {tb?.isBalanced ? "✓ Books in Balance (Σ Dr == Σ Cr)" : `⚠️ Imbalance: ₹${tb?.imbalanceAmount.toFixed(2)}`}
                </Badge>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>PARTICULARS / ACCOUNT</th>
                      <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>GROUP</th>
                      <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>TYPE</th>
                      <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>DEBIT (₹)</th>
                      <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>CREDIT (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)" }}>
                          Compiling Trial Balance ledger sums...
                        </td>
                      </tr>
                    ) : !tb || tb.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                          No accounts or transactions recorded.
                        </td>
                      </tr>
                    ) : (
                      tb.rows.map((row) => (
                        <tr key={row.accountId} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                          <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                            {row.accountName}
                          </td>
                          <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>
                            {row.accountGroup}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                              {row.accountType}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: row.debit > 0 ? "#3b82f6" : "var(--text-secondary)" }}>
                            {row.debit > 0 ? `₹${row.debit.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: row.credit > 0 ? "#22c55e" : "var(--text-secondary)" }}>
                            {row.credit > 0 ? `₹${row.credit.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {tb && tb.rows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "rgba(255, 255, 255, 0.04)", fontWeight: 900, borderTop: "2px solid var(--border)" }}>
                        <td colSpan={3} style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>
                          TOTAL TRIAL BALANCE SUMS
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 15, color: "#3b82f6" }}>
                          ₹{tb.totalDebit.toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 15, color: "#22c55e" }}>
                          ₹{tb.totalCredit.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}

          {/* ─── STATEMENT 2: PROFIT & LOSS ───────────────────────────────── */}
          {caStatementTab === "pnl" && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    Profit & Loss Statement (Income Statement)
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Period: {pnl?.startDate} to {pnl?.endDate}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: isProfit ? "#22c55e" : "#ef4444" }}>
                  Net {isProfit ? "Profit" : "Loss"}: ₹{Math.abs(netProfit).toFixed(2)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
                {/* Left: Expenses (Dr) */}
                <div style={{ borderRight: "1px solid var(--border)", padding: "16px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                    OPERATING EXPENSES (DEBIT)
                  </div>
                  {pnl?.expenseRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>No expenses recorded.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {pnl?.expenseRows.map((r) => (
                        <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-primary)" }}>To {r.accountName}</span>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>₹{r.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 10, borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                    <span>Total Expenses:</span>
                    <span style={{ color: "#ef4444" }}>₹{pnl?.totalExpense.toFixed(2)}</span>
                  </div>
                </div>

                {/* Right: Income (Cr) */}
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#22c55e", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                    REVENUES & INCOMES (CREDIT)
                  </div>
                  {pnl?.incomeRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>No income recorded.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {pnl?.incomeRows.map((r) => (
                        <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "var(--text-primary)" }}>By {r.accountName}</span>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>₹{r.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 10, borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                    <span>Total Income:</span>
                    <span style={{ color: "#22c55e" }}>₹{pnl?.totalIncome.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div style={{ padding: "14px 20px", background: "rgba(255, 255, 255, 0.03)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>NET BALANCE TRANSFERRED TO CAPITAL / EQUITY:</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: isProfit ? "#22c55e" : "#ef4444" }}>
                  ₹{netProfit.toFixed(2)} ({isProfit ? "Profit" : "Loss"})
                </span>
              </div>
            </Card>
          )}

          {/* ─── STATEMENT 3: BALANCE SHEET ──────────────────────────────── */}
          {caStatementTab === "bs" && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    Statutory Balance Sheet
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    As of {bs?.asOfDate || todayStr}
                  </span>
                </div>
                <Badge color={bs?.isBalanced ? "var(--success, #22c55e)" : "var(--danger, #ef4444)"}>
                  {bs?.isBalanced ? "✓ Balance Sheet Reconciled (Assets == Liabilities + Equity)" : `⚠️ Imbalance: ₹${bs?.imbalanceAmount.toFixed(2)}`}
                </Badge>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)" }}>
                {/* Left: Liabilities & Equity */}
                <div style={{ borderRight: "1px solid var(--border)", padding: "16px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f59e0b", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                    LIABILITIES & CAPITAL
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Liabilities:</div>
                  {bs?.liabilityRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", paddingBottom: 10 }}>No liabilities recorded.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                      {bs?.liabilityRows.map((r) => (
                        <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span>{r.accountName} ({r.accountGroup})</span>
                          <span style={{ fontWeight: 700 }}>₹{r.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Capital & Reserves:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {bs?.equityRows.map((r) => (
                      <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: r.accountId === "RETAINED_EARNINGS" ? "#22c55e" : "var(--text-primary)", fontWeight: r.accountId === "RETAINED_EARNINGS" ? 700 : 400 }}>
                          {r.accountName}
                        </span>
                        <span style={{ fontWeight: 700, color: r.accountId === "RETAINED_EARNINGS" ? "#22c55e" : "var(--text-primary)" }}>
                          ₹{r.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 10, borderTop: "2px solid var(--border)", fontWeight: 900, fontSize: 14 }}>
                    <span>TOTAL LIABILITIES & EQUITY:</span>
                    <span style={{ color: "#f59e0b" }}>₹{bs?.totalLiabilitiesAndEquity.toFixed(2)}</span>
                  </div>
                </div>

                {/* Right: Assets */}
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                    ASSETS & PROPERTIES
                  </div>

                  {bs?.assetRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 12 }}>No assets recorded.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {bs?.assetRows.map((r) => (
                        <div key={r.accountId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span>{r.accountName} ({r.accountGroup})</span>
                          <span style={{ fontWeight: 700, color: "#3b82f6" }}>₹{r.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 10, borderTop: "2px solid var(--border)", fontWeight: 900, fontSize: 14 }}>
                    <span>TOTAL ASSETS:</span>
                    <span style={{ color: "#3b82f6" }}>₹{bs?.totalAssets.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 3. GST STATUTORY COMPLIANCE & LIABILITY TRACKER                     */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {viewMode === "gst" && (
        <FinanceGstPanel userRole={userRole} />
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4. BANK STATEMENT IMPORT & RECONCILIATION                            */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {viewMode === "bank" && (
        <FinanceBankReconciliation accounts={accounts} userRole={userRole} />
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 5. OPERATIONAL TABS: VOUCHER FORM & LEDGER VIEW                      */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {viewMode === "vouchers" && (
        <FinanceVoucherForm
          accounts={accounts}
          onVoucherCreated={() => loadStatements(asOfDate, pnlStartDate, pnlEndDate)}
        />
      )}

      {viewMode === "ledger" && (
        <FinanceLedgerView accounts={accounts} />
      )}
    </div>
  );
}
