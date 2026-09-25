"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Card, Badge, Button, Input, Select, ErrorBanner } from "@/components/ui";
import { LedgerAccountDocument } from "@/lib/schemas/finance-schema";
import {
  BankReconciliationSummary,
  EnrichedBankStatementRow,
} from "@/lib/services/finance-service";
import {
  importBankStatementAction,
  reconcileBankStatementAction,
  linkBankStatementRowAction,
  unlinkBankStatementRowAction,
  getBankReconciliationSummaryAction,
  getUnmatchedLedgerEntriesAction,
  listBankStatementImportsAction,
  deleteBankStatementImportAction,
} from "@/actions/finance";

interface FinanceBankReconciliationProps {
  accounts: LedgerAccountDocument[];
  userRole: string;
}

export function FinanceBankReconciliation({
  accounts,
  userRole,
}: FinanceBankReconciliationProps) {
  const isAuthorized = userRole === "super_admin" || userRole === "tenant_admin";

  // Available bank accounts
  const bankAccounts = accounts.filter(
    (a) =>
      a.accountType === "ASSET" &&
      (a.accountName.toLowerCase().includes("bank") || a.accountGroup.toLowerCase().includes("bank"))
  );
  const defaultBankAccountId = bankAccounts[0]?.id || "";

  // Sessions and Active Import
  const [importsList, setImportsList] = useState<
    Array<{ id: string; fileName: string; uploadedAtMs: number; uploadedBy: string; rowCount: number; matchedCount: number }>
  >([]);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BankReconciliationSummary | null>(null);

  // Filter and view tabs
  const [activeTab, setActiveTab] = useState<"unmatched" | "matched" | "all">("unmatched");
  const [tableSearch, setTableSearch] = useState<string>("");

  // Upload UI state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadBankAccountId, setUploadBankAccountId] = useState<string>(defaultBankAccountId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manual Link Modal state
  const [linkingRow, setLinkingRow] = useState<EnrichedBankStatementRow | null>(null);
  const [unmatchedLedgerCandidates, setUnmatchedLedgerCandidates] = useState<
    Array<{
      id: string;
      date: string;
      amount: number;
      entryType: "DR" | "CR";
      voucherId: string;
      voucherNo: string;
      narration: string;
      voucherType: string;
    }>
  >([]);
  const [candidateSearch, setCandidateSearch] = useState<string>("");
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);
  const [linkPendingId, setLinkPendingId] = useState<string | null>(null);

  // Global component state
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load list of imports
  const loadImportsList = (selectLatest: boolean = false) => {
    setLoading(true);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await listBankStatementImportsAction();
        if (res.ok && res.imports) {
          setImportsList(res.imports);
          if (res.imports.length > 0) {
            if (selectLatest || !selectedImportId) {
              setSelectedImportId(res.imports[0].id);
              loadSummary(res.imports[0].id);
            }
          } else {
            setSelectedImportId(null);
            setSummary(null);
          }
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load bank statement imports.");
      } finally {
        setLoading(false);
      }
    });
  };

  // Load summary for specific import
  const loadSummary = (importId: string) => {
    setLoading(true);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await getBankReconciliationSummaryAction({ importId });
        if (res.ok) {
          setSummary(res.summary);
        } else {
          setErrorMsg(res.error || "Failed to load reconciliation summary.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error fetching reconciliation data.");
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadImportsList(true);
  }, []);

  const handleSelectImport = (id: string) => {
    setSelectedImportId(id);
    loadSummary(id);
  };

  // Re-run auto match
  const handleAutoReconcile = () => {
    if (!selectedImportId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      try {
        const res = await reconcileBankStatementAction({ importId: selectedImportId });
        if (res.ok) {
          setSuccessMsg(`✓ Auto-reconciliation complete: ${res.matchedCount} matched, ${res.unmatchedCount} remaining.`);
          loadSummary(selectedImportId);
        } else {
          setErrorMsg(res.error || "Failed to auto-reconcile.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Auto-reconcile error.");
      }
    });
  };

  // Handle file upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select a CSV or text file to upload.");
      return;
    }

    setUploadError(null);
    try {
      const text = await selectedFile.text();
      startTransition(async () => {
        const res = await importBankStatementAction({
          fileName: selectedFile.name,
          csvContent: text,
          bankAccountId: uploadBankAccountId || defaultBankAccountId,
          autoReconcile: true,
        });

        if (res.ok) {
          setShowUploadModal(false);
          setSelectedFile(null);
          setSuccessMsg(`✓ Successfully imported '${selectedFile.name}' and auto-matched transactions.`);
          loadImportsList(true);
        } else {
          setUploadError(res.error || "Failed to parse bank statement file.");
        }
      });
    } catch (err: any) {
      setUploadError(err.message || "Error reading file contents.");
    }
  };

  // Delete current import
  const handleDeleteImport = (importId: string) => {
    if (!window.confirm("Are you sure you want to delete this bank statement import session?")) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await deleteBankStatementImportAction({ importId });
        if (res.ok) {
          setSuccessMsg("✓ Bank statement import session deleted.");
          loadImportsList(true);
        } else {
          setErrorMsg(res.error || "Failed to delete import session.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Delete error.");
      }
    });
  };

  // Open manual linking modal
  const handleOpenLinkModal = (row: EnrichedBankStatementRow) => {
    setLinkingRow(row);
    setCandidateSearch("");
    setLoadingCandidates(true);

    startTransition(async () => {
      try {
        const res = await getUnmatchedLedgerEntriesAction({
          bankAccountId: summary?.bankAccount?.id,
        });
        if (res.ok && res.entries) {
          setUnmatchedLedgerCandidates(res.entries);
        }
      } catch (err: any) {
        console.error("Error loading candidates", err);
      } finally {
        setLoadingCandidates(false);
      }
    });
  };

  // Perform manual link
  const handleConfirmLink = (ledgerEntryId: string) => {
    if (!selectedImportId || !linkingRow) return;
    setLinkPendingId(ledgerEntryId);

    startTransition(async () => {
      try {
        const res = await linkBankStatementRowAction({
          importId: selectedImportId,
          rowId: linkingRow.id,
          ledgerEntryId,
        });

        if (res.ok) {
          setSuccessMsg(`✓ Linked statement row '${linkingRow.description || "Txn"}' to ledger entry.`);
          setLinkingRow(null);
          loadSummary(selectedImportId);
        } else {
          setErrorMsg(res.error || "Failed to link row.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Linking error.");
      } finally {
        setLinkPendingId(null);
      }
    });
  };

  // Perform unlink
  const handleUnlink = (rowId: string) => {
    if (!selectedImportId) return;

    startTransition(async () => {
      try {
        const res = await unlinkBankStatementRowAction({
          importId: selectedImportId,
          rowId,
        });

        if (res.ok) {
          setSuccessMsg("✓ Transaction unlinked from ledger entry.");
          loadSummary(selectedImportId);
        } else {
          setErrorMsg(res.error || "Failed to unlink.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Unlink error.");
      }
    });
  };

  // Export BRS to CSV
  const handleExportBrsCsv = () => {
    if (!summary) return;

    const header = [
      `CLICKOUT ENTERPRISE -- BANK RECONCILIATION STATEMENT (BRS)`,
      `Bank Account: ${summary.bankAccount?.accountName || "Bank Account"}`,
      `Statement File: ${summary.importDoc.fileName}`,
      `Imported On: ${new Date(summary.importDoc.uploadedAtMs).toLocaleString("en-IN")}`,
      ``,
      `== RECONCILIATION SUMMARY ==`,
      `Particulars,Amount (Rs)`,
      `"Balance as per Bank Statement",${summary.statementBalance.toFixed(2)}`,
      `"Add: Deposits in Statement not yet entered in Books",${summary.unmatchedCreditTotal.toFixed(2)}`,
      `"Less: Withdrawals in Statement not yet entered in Books",${summary.unmatchedDebitTotal.toFixed(2)}`,
      `"Balance as per General Ledger (Books)",${summary.bookBalance.toFixed(2)}`,
      `"Net Reconciled Variance",${summary.reconciledVariance.toFixed(2)}`,
      ``,
      `== STATEMENT TRANSACTION DETAILS ==`,
      `Date,Description,Type,Amount (Rs),Status,Matched Voucher No,Matched Narration`,
    ];

    const rows = [...summary.unmatchedRows, ...summary.matchedRows]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => {
        const status = r.matchedLedgerEntryId ? (r.matchType === "AUTO" ? "MATCHED (AUTO)" : "MATCHED (MANUAL)") : "UNMATCHED";
        const vNo = r.matchedEntry?.voucherNo || "";
        const narr = (r.matchedEntry?.narration || "").replace(/"/g, '""');
        const desc = r.description.replace(/"/g, '""');
        return `"${r.date}","${desc}","${r.type}",${r.amount.toFixed(2)},"${status}","${vNo}","${narr}"`;
      });

    const csvContent = [...header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bank_Reconciliation_${summary.importDoc.fileName.replace(/\.[^/.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sample CSV template download
  const handleDownloadSampleCsv = () => {
    const sample = [
      `Date,Description,Debit,Credit,Balance`,
      `2026-09-01,Opening Balance,,,100000.00`,
      `2026-09-05,NEFT-Client Payment-Order 101,,15000.00,115000.00`,
      `2026-09-10,Vendor Payment PO-88,4500.00,,110500.00`,
      `2026-09-15,Staff Salary Payout,25000.00,,85500.00`,
      `2026-09-20,Customer UPI Deposit,,8200.00,93700.00`,
    ].join("\n");

    const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sample_Bank_Statement_Template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter rows for display
  const displayedRows = (
    activeTab === "unmatched"
      ? summary?.unmatchedRows ?? []
      : activeTab === "matched"
      ? summary?.matchedRows ?? []
      : [...(summary?.unmatchedRows ?? []), ...(summary?.matchedRows ?? [])]
  ).filter((r) => {
    if (!tableSearch) return true;
    const q = tableSearch.toLowerCase();
    return (
      r.date.includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.amount.toString().includes(q) ||
      r.type.toLowerCase().includes(q) ||
      (r.matchedEntry?.voucherNo || "").toLowerCase().includes(q)
    );
  });

  const reconciliationProgressPct =
    summary && summary.totalRowsCount > 0
      ? Math.round((summary.matchedCount / summary.totalRowsCount) * 100)
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Header & Session Selector Bar */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                BANK STATEMENT IMPORT SESSION
              </label>
              {importsList.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>No bank statements uploaded yet.</span>
              ) : (
                <Select
                  value={selectedImportId || ""}
                  onChange={(e) => handleSelectImport(e.target.value)}
                  style={{ minWidth: 260, fontWeight: 700 }}
                >
                  {importsList.map((imp) => (
                    <option key={imp.id} value={imp.id}>
                      📄 {imp.fileName} ({new Date(imp.uploadedAtMs).toLocaleDateString("en-IN")}) — {imp.matchedCount}/{imp.rowCount} matched
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {selectedImportId && isAuthorized && (
              <Button
                variant="secondary"
                onClick={handleAutoReconcile}
                disabled={isPending}
                style={{ fontSize: 12, padding: "8px 14px", marginTop: 18 }}
              >
                ⚡ Re-Run Auto-Match
              </Button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button
              variant="secondary"
              onClick={handleDownloadSampleCsv}
              style={{ fontSize: 12, padding: "8px 12px" }}
            >
              📥 Sample CSV
            </Button>

            {isAuthorized && (
              <Button
                variant="primary"
                onClick={() => setShowUploadModal(true)}
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                ➕ Upload Bank Statement
              </Button>
            )}

            {selectedImportId && isAuthorized && (
              <Button
                variant="ghost"
                onClick={() => handleDeleteImport(selectedImportId)}
                disabled={isPending}
                style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px" }}
              >
                🗑️ Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}
      {successMsg && (
        <div style={{ padding: "12px 18px", borderRadius: 12, background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
          {successMsg}
        </div>
      )}

      {/* No Imports Empty State */}
      {!summary && !loading && (
        <Card style={{ padding: 48, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 44 }}>🏦</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
            No Bank Statement Active
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", maxWidth: 500 }}>
            Upload a CSV/Excel bank statement to automatically reconcile imported deposits and withdrawals against your ClickOut double-entry general ledger.
          </p>
          {isAuthorized && (
            <Button
              variant="primary"
              onClick={() => setShowUploadModal(true)}
              style={{ marginTop: 8, padding: "10px 20px" }}
            >
              Upload Your First Statement (CSV/TSV)
            </Button>
          )}
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. BANK RECONCILIATION STATEMENT (BRS) EXECUTIVE METRICS              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {/* Statement Balance */}
            <Card style={{ padding: 18, borderLeft: "4px solid #3b82f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>STATEMENT BALANCE</span>
                <span>📄</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6", marginTop: 6 }}>
                ₹{summary.statementBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                Net balance per bank statement file
              </div>
            </Card>

            {/* Book Balance */}
            <Card style={{ padding: 18, borderLeft: "4px solid #22c55e" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>LEDGER BOOK BALANCE</span>
                <span>📖</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e", marginTop: 6 }}>
                ₹{summary.bookBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                Bank Account general ledger balance
              </div>
            </Card>

            {/* Reconciled Variance */}
            <Card
              style={{
                padding: 18,
                borderLeft: `4px solid ${Math.abs(summary.reconciledVariance) < 0.01 ? "#22c55e" : "#f59e0b"}`,
                background: Math.abs(summary.reconciledVariance) < 0.01 ? "rgba(34, 197, 94, 0.04)" : "rgba(245, 158, 11, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>UNRECONCILED VARIANCE</span>
                <span>{Math.abs(summary.reconciledVariance) < 0.01 ? "✓" : "⚠️"}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: Math.abs(summary.reconciledVariance) < 0.01 ? "#22c55e" : "#f59e0b", marginTop: 6 }}>
                ₹{Math.abs(summary.reconciledVariance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {Math.abs(summary.reconciledVariance) < 0.01 ? "Fully reconciled books" : "Timing differences pending match"}
              </div>
            </Card>

            {/* Reconciliation Progress */}
            <Card style={{ padding: 18, borderLeft: "4px solid #a855f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>RECONCILIATION PROGRESS</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#a855f7" }}>{reconciliationProgressPct}%</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", marginTop: 6 }}>
                {summary.matchedCount} <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>of {summary.totalRowsCount} rows</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {summary.unmatchedCount} unmatched item(s) to link
              </div>
            </Card>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* 2. FORMAL BANK RECONCILIATION STATEMENT (BRS) REPORT              */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                  Statutory Bank Reconciliation Statement (BRS)
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Account: {summary.bankAccount?.accountName || "Bank Account"} | Source: {summary.importDoc.fileName}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={handleExportBrsCsv} style={{ fontSize: 12, padding: "6px 14px" }}>
                  📥 Export BRS (CSV)
                </Button>
                <Button variant="ghost" onClick={() => window.print()} style={{ fontSize: 12, padding: "6px 12px" }}>
                  🖨️ Print
                </Button>
              </div>
            </div>

            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>1. Balance as per Bank Statement</span>
                <span style={{ fontWeight: 800, color: "#3b82f6" }}>₹{summary.statementBalance.toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", paddingLeft: 16 }}>
                <span>Add: Uncredited Deposits (In statement, not in books)</span>
                <span style={{ fontWeight: 700, color: "#22c55e" }}>+ ₹{summary.unmatchedCreditTotal.toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", paddingLeft: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <span>Less: Unpresented Debits (In statement, not in books)</span>
                <span style={{ fontWeight: 700, color: "#ef4444" }}>- ₹{summary.unmatchedDebitTotal.toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, fontWeight: 800 }}>
                <span>2. Computed Balance as per General Ledger Books</span>
                <span style={{ color: "#22c55e" }}>₹{summary.bookBalance.toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", fontWeight: 900 }}>
                <span>NET RECONCILED DIFFERENCE / VARIANCE:</span>
                <span style={{ color: Math.abs(summary.reconciledVariance) < 0.01 ? "#22c55e" : "#f59e0b" }}>
                  ₹{summary.reconciledVariance.toFixed(2)}
                </span>
              </div>
            </div>
          </Card>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* 3. TRANSACTION LIST: SPLIT / FILTER TABS                          */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {/* Filter and Tab Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 10, border: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("unmatched")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    background: activeTab === "unmatched" ? "#f59e0b" : "transparent",
                    color: activeTab === "unmatched" ? "#000" : "var(--text-secondary)",
                  }}
                >
                  🟡 Unmatched ({summary.unmatchedCount})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("matched")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    background: activeTab === "matched" ? "var(--primary, #3b82f6)" : "transparent",
                    color: activeTab === "matched" ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  🟢 Matched ({summary.matchedCount})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    background: activeTab === "all" ? "var(--card-bg)" : "transparent",
                    color: activeTab === "all" ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  All Rows ({summary.totalRowsCount})
                </button>
              </div>

              <div style={{ width: 220 }}>
                <Input
                  type="text"
                  placeholder="Filter transactions..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  style={{ fontSize: 12, padding: "6px 10px" }}
                />
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>DATE</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>DESCRIPTION</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>TYPE</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "right" }}>AMOUNT (₹)</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>MATCHED ENTRY</th>
                    <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textAlign: "center" }}>STATUS / ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                        {activeTab === "unmatched"
                          ? "🎉 All transactions in this statement are fully matched!"
                          : "No transactions found matching filter."}
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row) => {
                      const isMatched = !!row.matchedLedgerEntryId;
                      return (
                        <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                          <td style={{ padding: "12px 16px", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {row.date}
                          </td>
                          <td style={{ padding: "12px 16px", maxWidth: 280 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.description}</div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <Badge color={row.type === "CREDIT" ? "var(--success, #22c55e)" : "var(--danger, #ef4444)"}>
                              {row.type === "CREDIT" ? "↓ Deposit (Cr)" : "↑ Withdrawal (Dr)"}
                            </Badge>
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "right",
                              fontWeight: 800,
                              color: row.type === "CREDIT" ? "#22c55e" : "#ef4444",
                            }}
                          >
                            ₹{row.amount.toFixed(2)}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12 }}>
                            {isMatched && row.matchedEntry ? (
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                  Vch #{row.matchedEntry.voucherNo} ({row.matchedEntry.voucherType})
                                </div>
                                <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>
                                  {row.matchedEntry.narration || "General entry"} • {row.matchedEntry.date}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Not linked</span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center" }}>
                            {isMatched ? (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Badge color={row.matchType === "AUTO" ? "var(--success, #22c55e)" : "var(--primary, #3b82f6)"}>
                                  {row.matchType === "AUTO" ? "⚡ Auto" : "👤 Manual"}
                                </Badge>
                                {isAuthorized && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlink(row.id)}
                                    disabled={isPending}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      color: "var(--text-secondary)",
                                      cursor: "pointer",
                                      fontSize: 11,
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    Unlink
                                  </button>
                                )}
                              </div>
                            ) : (
                              isAuthorized && (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleOpenLinkModal(row)}
                                  disabled={isPending}
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                >
                                  🔗 Link to Entry
                                </Button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4. MODAL: UPLOAD BANK STATEMENT FILE                                  */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <Card style={{ width: "100%", maxWidth: 500, padding: 24, borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Upload Bank Statement</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>

            {uploadError && <ErrorBanner message={uploadError} />}

            <form onSubmit={handleFileUpload} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Target Bank Ledger Account
                </label>
                <Select
                  value={uploadBankAccountId}
                  onChange={(e) => setUploadBankAccountId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      🏦 {acc.accountName} ({acc.accountGroup})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Statement File (.CSV / .TSV / .TXT)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "2px dashed var(--border)",
                    borderRadius: 12,
                    padding: "24px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: "rgba(255, 255, 255, 0.02)",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{ display: "none" }}
                  />
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                    {selectedFile ? selectedFile.name : "Click to browse CSV / TSV file"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                    Supports standard bank statement exports (Date, Narration, Debit, Credit, Balance)
                  </div>
                </div>
              </div>

              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", fontSize: 11, color: "var(--text-secondary)" }}>
                ℹ️ PDF bank statements require OCR parsing and are queued for a future release. Please upload a standard CSV or Excel text export from your bank.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button variant="ghost" type="button" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending || !selectedFile}>
                  {isPending ? "Parsing & Importing..." : "Upload & Auto-Reconcile"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 5. MODAL: SEARCHABLE MANUAL LINK TO LEDGER ENTRY                      */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {linkingRow && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <Card style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 24, borderRadius: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Manually Link to Ledger Entry</h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Select the corresponding entry from your general ledger to reconcile this statement transaction.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLinkingRow(null)}
                style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>

            {/* Target Statement Row Context Box */}
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border)",
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>
                  STATEMENT ROW ({linkingRow.date})
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                  {linkingRow.description}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Direction: {linkingRow.type === "CREDIT" ? "Deposit (Bank Credit)" : "Withdrawal (Bank Debit)"} → Needs{" "}
                  <strong>{linkingRow.type === "CREDIT" ? "Debit (DR)" : "Credit (CR)"}</strong> in Books
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: linkingRow.type === "CREDIT" ? "#22c55e" : "#ef4444" }}>
                ₹{linkingRow.amount.toFixed(2)}
              </div>
            </div>

            {/* Search Filter */}
            <div style={{ marginBottom: 12 }}>
              <Input
                type="text"
                placeholder="Search ledger entries by voucher no, amount, or narration..."
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                style={{ fontSize: 12 }}
              />
            </div>

            {/* Candidates List */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 200, maxHeight: 320, paddingRight: 4 }}>
              {loadingCandidates ? (
                <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                  Searching unmatched ledger entries...
                </div>
              ) : (
                (() => {
                  const expectedEntryType = linkingRow.type === "CREDIT" ? "DR" : "CR";
                  const filtered = unmatchedLedgerCandidates.filter((c) => {
                    if (!candidateSearch) return true;
                    const q = candidateSearch.toLowerCase();
                    return (
                      c.voucherNo.toLowerCase().includes(q) ||
                      c.narration.toLowerCase().includes(q) ||
                      c.amount.toString().includes(q) ||
                      c.date.includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                        No unmatched ledger entries found for this bank account.
                      </div>
                    );
                  }

                  return filtered.map((candidate) => {
                    const isAmountMatch = Math.abs(candidate.amount - linkingRow.amount) < 0.01;
                    const isTypeMatch = candidate.entryType === expectedEntryType;

                    return (
                      <div
                        key={candidate.id}
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          border: isAmountMatch && isTypeMatch ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid var(--border)",
                          background: isAmountMatch && isTypeMatch ? "rgba(34, 197, 94, 0.03)" : "rgba(255,255,255,0.01)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text-primary)" }}>
                              Voucher #{candidate.voucherNo}
                            </span>
                            <Badge color="var(--text-secondary)">{candidate.voucherType}</Badge>
                            <Badge color={candidate.entryType === "DR" ? "var(--primary, #3b82f6)" : "var(--warning, #f59e0b)"}>
                              {candidate.entryType}
                            </Badge>
                            {isAmountMatch && isTypeMatch && (
                              <Badge color="var(--success, #22c55e)">Exact Amount Match</Badge>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                            {candidate.narration || "No narration"} • Date: {candidate.date}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                            ₹{candidate.amount.toFixed(2)}
                          </span>
                          <Button
                            variant={isAmountMatch ? "primary" : "secondary"}
                            onClick={() => handleConfirmLink(candidate.id)}
                            disabled={linkPendingId === candidate.id}
                            style={{ padding: "6px 14px", fontSize: 12 }}
                          >
                            {linkPendingId === candidate.id ? "Linking..." : "Link"}
                          </Button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setLinkingRow(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
