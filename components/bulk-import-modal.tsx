"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import {
  validateBulkStaffImport,
  commitBulkStaffImport,
  ValidateBulkStaffReport,
} from "@/actions/staff";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";

export function BulkImportModal({
  defaultBranchCode,
  isBranchLocked = false,
}: {
  defaultBranchCode?: string;
  isBranchLocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [validationReport, setValidationReport] = useState<ValidateBulkStaffReport | null>(null);
  const [commitResults, setCommitResults] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "valid" | "error">("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleReset() {
    setCsvText("");
    setValidationReport(null);
    setCommitResults(null);
    setFilter("all");
    setPage(1);
  }

  function handleTextChange(val: string) {
    setCsvText(val);
    // Invalidate previous validation when user edits CSV text
    if (validationReport) setValidationReport(null);
    if (commitResults) setCommitResults(null);
    setPage(1);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || "";
      handleTextChange(content);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleValidate() {
    if (!csvText.trim()) return;
    startTransition(async () => {
      const rep = await validateBulkStaffImport(csvText, defaultBranchCode);
      setValidationReport(rep);
      setCommitResults(null);
      setFilter("all");
      setPage(1);
    });
  }

  function handleCommit() {
    if (!validationReport || validationReport.validCount === 0) return;
    const validRows = validationReport.rows.filter((r) => r.status === "valid");
    startTransition(async () => {
      const res = await commitBulkStaffImport(validRows, defaultBranchCode);
      if (res.ok) {
        setCommitResults({
          successCount: res.successCount ?? 0,
          failCount: res.failCount ?? 0,
          errors: res.errors ?? [],
        });
        router.refresh();
      }
    });
  }

  // Filtered and paginated rows
  const filteredRows = useMemo(() => {
    if (!validationReport) return [];
    if (filter === "valid") return validationReport.rows.filter((r) => r.status === "valid");
    if (filter === "error") return validationReport.rows.filter((r) => r.status === "error");
    return validationReport.rows;
  }, [validationReport, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const displayedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          handleReset();
        }}
        style={{
          background: "var(--card-bg)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.15s ease",
        }}
      >
        <span>📥</span>
        <span>Import Roster (CSV/Excel)</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            style={{
              width: 760,
              maxWidth: "95vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.45)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "92vh",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>📁</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                    Bulk Personnel Roster Ingestion
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Auto-detects Comma, Tab (Excel), or Semicolon delimiters with pre-validation
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                overflowY: "auto",
                flex: 1,
              }}
            >
              {/* Instructions format card */}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Expected Columns:</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".csv,.tsv,.txt"
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        background: "transparent",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 11,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      📎 Choose File (.csv, .tsv, .txt)
                    </button>
                  </div>
                </div>
                <code style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                  empId, name, email, phone, role, branchCode
                </code>
                <div style={{ marginTop: 6, opacity: 0.85, fontSize: 11 }}>
                  e.g.: <code>EMP-101, Amit Kumar, amit@store.com, 9876543210, cashier, {defaultBranchCode || "QUEST-001"}</code>
                </div>
                {isBranchLocked && defaultBranchCode && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "var(--cta-bg-accent)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span>🔒</span>
                    <span>All imported personnel will be strictly locked to your branch: {defaultBranchCode}</span>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                    Paste CSV or Excel Data:
                  </label>
                  {csvText && (
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: 11,
                        color: "var(--danger)",
                        cursor: "pointer",
                      }}
                    >
                      Clear text
                    </button>
                  )}
                </div>
                <textarea
                  rows={validationReport ? 4 : 7}
                  value={csvText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Paste CSV / Excel rows here..."
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Validation Action Button (Step 1) */}
              {!validationReport && !commitResults && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={isPending || !csvText.trim()}
                    style={{
                      background: "var(--cta-bg-accent)",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 24px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: isPending || !csvText.trim() ? "not-allowed" : "pointer",
                      opacity: isPending || !csvText.trim() ? 0.6 : 1,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {isPending ? "Validating Roster..." : "🔍 Validate Roster (Step 1)"}
                  </button>
                </div>
              )}

              {/* Validation Report Table (Zero Writes) */}
              {validationReport && !commitResults && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    padding: 16,
                    background: "var(--scaffold-bg)",
                  }}
                >
                  {/* Summary Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: "color-mix(in srgb, var(--success) 15%, transparent)",
                          color: "var(--success)",
                          border: "1px solid var(--success)",
                        }}
                      >
                        ✓ {validationReport.validCount} Valid
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background:
                            validationReport.errorCount > 0
                              ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                              : "transparent",
                          color: validationReport.errorCount > 0 ? "var(--danger)" : "var(--text-secondary)",
                          border: `1px solid ${
                            validationReport.errorCount > 0 ? "var(--danger)" : "var(--border)"
                          }`,
                        }}
                      >
                        {validationReport.errorCount > 0
                          ? `🚨 ${validationReport.errorCount} Issues`
                          : "0 Issues"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          background: "var(--card-bg)",
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                        }}
                      >
                        Delimiter: {validationReport.delimiter === "\t" ? "Tab (Excel)" : validationReport.delimiter === ";" ? "Semicolon (;)" : "Comma (,)"}
                      </span>
                    </div>

                    {/* Filter Tabs */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["all", "valid", "error"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            setFilter(f);
                            setPage(1);
                          }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: filter === f ? "var(--text-primary)" : "transparent",
                            color: filter === f ? "var(--scaffold-bg)" : "var(--text-secondary)",
                            border: `1px solid ${filter === f ? "var(--text-primary)" : "var(--border)"}`,
                          }}
                        >
                          {f === "all" ? `All (${validationReport.rows.length})` : f === "valid" ? `Valid (${validationReport.validCount})` : `Errors (${validationReport.errorCount})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rows Table */}
                  <div
                    style={{
                      overflowX: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      background: "var(--card-bg)",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 45 }}>#</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 80 }}>Status</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Emp ID</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Name</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Role</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Phone</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Branch</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Pre-Check Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>
                              No rows match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          displayedRows.map((r) => (
                            <tr
                              key={r.lineNumber}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                background:
                                  r.status === "error"
                                    ? "color-mix(in srgb, var(--danger) 5%, transparent)"
                                    : "transparent",
                              }}
                            >
                              <td style={{ padding: "8px 10px", fontFamily: "monospace", opacity: 0.7 }}>
                                {r.lineNumber}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {r.status === "valid" ? (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "var(--success)",
                                      background: "color-mix(in srgb, var(--success) 12%, transparent)",
                                      padding: "2px 6px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    ✓ Valid
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "var(--danger)",
                                      background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                                      padding: "2px 6px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    ✕ Issue
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 700, fontFamily: "monospace" }}>
                                {r.empId}
                              </td>
                              <td style={{ padding: "8px 10px" }}>{r.name}</td>
                              <td style={{ padding: "8px 10px", textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}>
                                {r.role}
                              </td>
                              <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11 }}>
                                {r.phone || "—"}
                              </td>
                              <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11 }}>
                                {r.branchCode}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {r.status === "valid" ? (
                                  <span style={{ color: "var(--success)", fontSize: 11 }}>Ready to commit</span>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {r.errors.map((err, eIdx) => (
                                      <span key={eIdx} style={{ color: "var(--danger)", fontSize: 11 }}>
                                        • {err}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>
                        Showing {Math.min((page - 1) * pageSize + 1, filteredRows.length)} -{" "}
                        {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} rows
                      </span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={page === 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: 11,
                            cursor: page === 1 ? "not-allowed" : "pointer",
                            opacity: page === 1 ? 0.4 : 1,
                          }}
                        >
                          Previous
                        </button>
                        <span style={{ fontSize: 11 }}>
                          Page {page} of {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: 11,
                            cursor: page >= totalPages ? "not-allowed" : "pointer",
                            opacity: page >= totalPages ? 0.4 : 1,
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation / Action Step */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 4,
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleValidate}
                      disabled={isPending}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        cursor: isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      🔄 Re-validate Text
                    </button>

                    {validationReport.validCount > 0 ? (
                      <button
                        type="button"
                        onClick={handleCommit}
                        disabled={isPending}
                        style={{
                          background: "var(--cta-bg-accent)",
                          color: "#0A0A0A",
                          border: "none",
                          borderRadius: 12,
                          padding: "10px 24px",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: isPending ? "not-allowed" : "pointer",
                          opacity: isPending ? 0.6 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {isPending
                          ? "Committing Valid Personnel..."
                          : `🚀 Confirm Import (${validationReport.validCount} valid rows)`}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                        All rows have issues. Fix errors in text and re-validate before importing.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Commit Final Results (Step 2 Complete) */}
              {commitResults && (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: 16,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>🎉</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                        Import Batch Completed
                      </h4>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        Personnel records have been written to organization staff repository.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    <div
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        background: "color-mix(in srgb, var(--success) 15%, transparent)",
                        border: "1px solid var(--success)",
                        color: "var(--success)",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      ✅ {commitResults.successCount} Onboarded Successfully
                    </div>
                    {commitResults.failCount > 0 && (
                      <div
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                          border: "1px solid var(--danger)",
                          color: "var(--danger)",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        🚨 {commitResults.failCount} Failed During Write
                      </div>
                    )}
                  </div>

                  {commitResults.errors.length > 0 && (
                    <div
                      style={{
                        maxHeight: 120,
                        overflowY: "auto",
                        fontSize: 11,
                        color: "var(--danger)",
                        padding: 10,
                        borderRadius: 8,
                        background: "var(--card-bg)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {commitResults.errors.map((err, idx) => (
                        <div key={idx}>• {err}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      Import Another Roster
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      style={{
                        background: "var(--cta-bg-accent)",
                        color: "#0A0A0A",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 18px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              {!commitResults && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                    marginTop: 6,
                    paddingTop: 14,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "8px 16px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
