"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import {
  validateBulkProductImport,
  commitBulkProductImport,
  ValidateBulkProductReport,
} from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { Card, Button } from "@/components/ui";

const TEMPLATE_COLUMNS = "barcode, name, price, unit_cost, gst, physical_stock, expiry_date, weight";
const TEMPLATE_EXAMPLE = "8901542001234, Mango Juice 250ml, 100, 70, 18, 50, 2027-12-31, 250";

export function CsvImport({ branchParam }: { branchParam?: string }) {
  const [open, setOpen] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [validationReport, setValidationReport] = useState<ValidateBulkProductReport | null>(null);
  const [commitResults, setCommitResults] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [generalError, setGeneralError] = useState("");
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
    setGeneralError("");
    setFilter("all");
    setPage(1);
  }

  function handleTextChange(val: string) {
    setCsvText(val);
    // Invalidate previous report/results when input changes (stale-protection)
    if (validationReport) setValidationReport(null);
    if (commitResults) setCommitResults(null);
    if (generalError) setGeneralError("");
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
    setGeneralError("");
    startTransition(async () => {
      try {
        const rep = await validateBulkProductImport(csvText, branchParam);
        if (!rep.ok) {
          setGeneralError(rep.error ?? "Validation failed.");
        } else {
          setValidationReport(rep);
          setCommitResults(null);
          setFilter("all");
          setPage(1);
        }
      } catch (e: any) {
        setGeneralError(e.message ?? "Failed to validate catalog data.");
      }
    });
  }

  function handleCommit() {
    if (!validationReport || validationReport.validCount === 0) return;
    const validRows = validationReport.rows.filter((r) => r.status === "valid");
    setGeneralError("");
    startTransition(async () => {
      try {
        const res = await commitBulkProductImport(validRows, branchParam);
        if (res.ok) {
          setCommitResults({
            successCount: res.successCount ?? res.count ?? 0,
            failCount: res.failCount ?? 0,
            errors: res.errors ?? [],
          });
          router.refresh();
        } else {
          setGeneralError(res.error ?? "Failed to commit products.");
        }
      } catch (e: any) {
        setGeneralError(e.message ?? "Error occurred during catalog commit.");
      }
    });
  }

  function copyTemplate() {
    navigator.clipboard.writeText(`${TEMPLATE_COLUMNS}\n${TEMPLATE_EXAMPLE}`);
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
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => setShowTemplate(true)}>
          ⓘ Template
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
            handleReset();
          }}
        >
          ⬆ Import Products (CSV/Excel)
        </Button>
      </div>

      {/* Standalone Template Helper Modal */}
      {showTemplate && (
        <Modal onClose={() => setShowTemplate(false)}>
          <Card style={{ width: 500, maxWidth: "92vw", padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
              Product CSV / Excel Template
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px 0" }}>
              Column Header Order:
            </p>
            <p style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)", marginBottom: 12, background: "var(--scaffold-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              {TEMPLATE_COLUMNS}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px 0" }}>
              Sample Data Row:
            </p>
            <p style={{ fontSize: 12, fontFamily: "monospace", color: "var(--success)", marginBottom: 16, background: "var(--scaffold-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              {TEMPLATE_EXAMPLE}
            </p>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              <div>• <strong>price</strong> and <strong>unit_cost</strong> must be positive numbers (e.g. 100, 70).</div>
              <div>• Do not include currency symbols (₹) or units (ml, g) in numeric fields.</div>
              <div>• Duplicate barcodes in batch or existing store catalog will be flagged before commit.</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowTemplate(false)}>
                Close
              </Button>
              <Button onClick={copyTemplate}>📋 Copy Template</Button>
            </div>
          </Card>
        </Modal>
      )}

      {/* Two-Step Bulk Import Modal */}
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            style={{
              width: 820,
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
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                    Bulk Product Catalog Ingestion
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
                    <button
                      type="button"
                      onClick={copyTemplate}
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
                      📋 Copy Template
                    </button>
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
                  {TEMPLATE_COLUMNS}
                </code>
                <div style={{ marginTop: 6, opacity: 0.85, fontSize: 11 }}>
                  e.g.: <code>{TEMPLATE_EXAMPLE}</code>
                </div>
                {branchParam && (
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
                    <span>Targeting Store Branch: {branchParam}</span>
                  </div>
                )}
              </div>

              {/* General Error Banner */}
              {generalError && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {generalError}
                </div>
              )}

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
                  placeholder={`Paste CSV / Excel rows here...\n${TEMPLATE_COLUMNS}\n${TEMPLATE_EXAMPLE}`}
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
                    {isPending ? "Validating Catalog..." : "🔍 Validate Catalog (Step 1)"}
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
                      {validationReport.delimiter && (
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
                          Delimiter:{" "}
                          {validationReport.delimiter === "\t"
                            ? "Tab (Excel)"
                            : validationReport.delimiter === ";"
                            ? "Semicolon (;)"
                            : "Comma (,)"}
                        </span>
                      )}
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
                          {f === "all"
                            ? `All (${validationReport.rows.length})`
                            : f === "valid"
                            ? `Valid (${validationReport.validCount})`
                            : `Errors (${validationReport.errorCount})`}
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
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Barcode</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Name</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", width: 75 }}>Price</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", width: 75 }}>Cost</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", width: 65 }}>Stock</th>
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
                                {r.barcode}
                              </td>
                              <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                                {r.price > 0 ? `₹${r.price}` : "—"}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                                {r.unitCost > 0 ? `₹${r.unitCost}` : "—"}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                                {r.physicalStock ?? 0}
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
                          ? "Committing Valid Catalog..."
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
                        Products have been committed to the branch inventory repository.
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
                      ✅ {commitResults.successCount} Products Imported Successfully
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
                      Import Another Catalog
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