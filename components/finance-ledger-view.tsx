"use client";

import { useState, useEffect, useTransition } from "react";
import { LedgerAccountDocument } from "@/lib/schemas/finance-schema";
import { AccountLedgerResult, LedgerViewRow } from "@/lib/services/finance-service";
import { getAccountLedgerAction } from "@/actions/finance";

interface FinanceLedgerViewProps {
  accounts: LedgerAccountDocument[];
  initialAccountId?: string;
}

export function FinanceLedgerView({ accounts, initialAccountId }: FinanceLedgerViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || accounts[0]?.id || ""
  );
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ledgerData, setLedgerData] = useState<AccountLedgerResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const fetchLedger = (accId: string, sDate?: string, eDate?: string) => {
    if (!accId) return;
    setLoading(true);
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await getAccountLedgerAction({
          accountId: accId,
          startDate: sDate || undefined,
          endDate: eDate || undefined,
        });

        if (res.ok && res.ledger) {
          setLedgerData(res.ledger);
        } else {
          setErrorMsg(res.error || "Failed to load ledger statements.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error fetching account ledger.");
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger(selectedAccountId, startDate, endDate);
    }
  }, [selectedAccountId]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLedger(selectedAccountId, startDate, endDate);
  };

  const handleExportCsv = () => {
    if (!ledgerData) return;

    const acc = ledgerData.account;
    const headerLines = [
      `ClickOut Financial General Ledger Statement`,
      `Account: ${acc.accountName} (${acc.accountGroup} - ${acc.accountType})`,
      `Date Range: ${startDate || "Inception"} to ${endDate || "Present"}`,
      `Opening Balance: Rs. ${ledgerData.openingBalance.amount.toFixed(2)} ${ledgerData.openingBalance.type}`,
      `Closing Balance: Rs. ${ledgerData.closingBalance.amount.toFixed(2)} ${ledgerData.closingBalance.type}`,
      ``,
      `Date,Particulars,Voucher Type,Voucher No,Debit (Rs),Credit (Rs),Running Balance,Balance Type,Narration`,
    ];

    const dataLines = ledgerData.rows.map((r) => {
      const date = `"${r.date}"`;
      const particulars = `"${r.particulars.replace(/"/g, '""')}"`;
      const vType = `"${r.voucherType}"`;
      const vNo = `"${r.voucherNo}"`;
      const dr = r.debit !== null ? r.debit.toFixed(2) : "";
      const cr = r.credit !== null ? r.credit.toFixed(2) : "";
      const rb = r.runningBalance.toFixed(2);
      const rbType = `"${r.runningBalanceType}"`;
      const narr = `"${(r.narration || "").replace(/"/g, '""')}"`;
      return `${date},${particulars},${vType},${vNo},${dr},${cr},${rb},${rbType},${narr}`;
    });

    // Summary totals row
    dataLines.push(
      `"Total",,,,"${ledgerData.totalDebit.toFixed(2)}","${ledgerData.totalCredit.toFixed(2)}","${ledgerData.closingBalance.amount.toFixed(2)}","${ledgerData.closingBalance.type}",`
    );

    const csvContent = "\uFEFF" + [...headerLines, ...dataLines].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ledger_${acc.accountName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls: Account Selector & Date Range Filters */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "18px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", flex: 1 }}>
          <div style={{ minWidth: 260 }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              SELECT LEDGER ACCOUNT
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} — {acc.accountGroup} ({acc.accountType})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleApplyFilter} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                FROM DATE
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                TO DATE
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "rgba(59, 130, 246, 0.15)",
                color: "#3b82f6",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Filter
            </button>
          </form>
        </div>

        {/* Action Buttons: Export CSV & Print */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!ledgerData || ledgerData.rows.length === 0}
            style={{
              padding: "9px 15px",
              borderRadius: 10,
              background: "rgba(34, 197, 94, 0.12)",
              color: "#22c55e",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              fontWeight: 800,
              fontSize: 12,
              cursor: ledgerData && ledgerData.rows.length > 0 ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📥</span> Export Excel (CSV)
          </button>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: "9px 15px",
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.05)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🖨️</span> Print Ledger
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: 13, fontWeight: 700 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Account Balance Summary Cards */}
      {ledgerData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ padding: "14px 18px", borderRadius: 14, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>OPENING BALANCE</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              ₹{ledgerData.openingBalance.amount.toFixed(2)}{" "}
              <span style={{ fontSize: 12, color: ledgerData.openingBalance.type === "DR" ? "#3b82f6" : "#22c55e" }}>
                {ledgerData.openingBalance.type}
              </span>
            </div>
          </div>

          <div style={{ padding: "14px 18px", borderRadius: 14, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>TOTAL DEBITS</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#3b82f6", marginTop: 4 }}>
              ₹{ledgerData.totalDebit.toFixed(2)}
            </div>
          </div>

          <div style={{ padding: "14px 18px", borderRadius: 14, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>TOTAL CREDITS</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e", marginTop: 4 }}>
              ₹{ledgerData.totalCredit.toFixed(2)}
            </div>
          </div>

          <div style={{ padding: "14px 18px", borderRadius: 14, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6" }}>NET CLOSING BALANCE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
              ₹{ledgerData.closingBalance.amount.toFixed(2)}{" "}
              <span style={{ fontSize: 13, fontWeight: 900, color: ledgerData.closingBalance.type === "DR" ? "#3b82f6" : "#22c55e" }}>
                {ledgerData.closingBalance.type}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 📖 Tally-Style General Ledger Table */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 18,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
              {selectedAccount?.accountName || "Account Statement"}
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Group: {selectedAccount?.accountGroup} • Type: {selectedAccount?.accountType}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {ledgerData?.rows.length || 0} transaction line(s)
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>DATE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>PARTICULARS</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>VCH TYPE</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>VCH NO.</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>DEBIT (₹)</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>CREDIT (₹)</th>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>RUNNING BALANCE</th>
              </tr>
            </thead>
            <tbody>
              {/* Row 0: Opening Balance */}
              {ledgerData && (
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255, 255, 255, 0.01)", fontStyle: "italic" }}>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)" }}>
                    {startDate || "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    Opening Balance
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)" }}>—</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)" }}>—</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: "#3b82f6" }}>
                    {ledgerData.openingBalance.type === "DR" ? `₹${ledgerData.openingBalance.amount.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: "#22c55e" }}>
                    {ledgerData.openingBalance.type === "CR" ? `₹${ledgerData.openingBalance.amount.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                    ₹{ledgerData.openingBalance.amount.toFixed(2)} {ledgerData.openingBalance.type}
                  </td>
                </tr>
              )}

              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)" }}>
                    Loading general ledger entries...
                  </td>
                </tr>
              ) : !ledgerData || ledgerData.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                    No transactions recorded for this ledger account in the selected period.
                  </td>
                </tr>
              ) : (
                ledgerData.rows.map((row) => (
                  <tr key={row.entryId} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {row.date}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      <div>{row.particulars}</div>
                      {row.narration && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400, marginTop: 2 }}>
                          {row.narration}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "rgba(59, 130, 246, 0.1)",
                          color: "#3b82f6",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {row.voucherType}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                      {row.voucherNo}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: row.debit ? "#3b82f6" : "var(--text-secondary)" }}>
                      {row.debit !== null ? `₹${row.debit.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: row.credit ? "#22c55e" : "var(--text-secondary)" }}>
                      {row.credit !== null ? `₹${row.credit.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 900, color: "var(--text-primary)" }}>
                      ₹{row.runningBalance.toFixed(2)}{" "}
                      <span style={{ fontSize: 11, color: row.runningBalanceType === "DR" ? "#3b82f6" : "#22c55e" }}>
                        {row.runningBalanceType}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ledgerData && ledgerData.rows.length > 0 && (
              <tfoot>
                <tr style={{ background: "rgba(255, 255, 255, 0.03)", fontWeight: 900, borderTop: "2px solid var(--border)" }}>
                  <td colSpan={4} style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-primary)" }}>
                    TOTAL PERIOD TRANSACTIONS & CLOSING BALANCE
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, color: "#3b82f6" }}>
                    ₹{ledgerData.totalDebit.toFixed(2)}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 14, color: "#22c55e" }}>
                    ₹{ledgerData.totalCredit.toFixed(2)}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 15, color: "var(--text-primary)" }}>
                    ₹{ledgerData.closingBalance.amount.toFixed(2)} {ledgerData.closingBalance.type}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
