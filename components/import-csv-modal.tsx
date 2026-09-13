"use client";

import { useState, useTransition, useMemo } from "react";
import { Modal } from "@/components/profile-menu";
import {
  validateBulkSupplierImport,
  commitBulkSupplierImport,
  ValidateBulkSupplierReport,
  ValidatedBulkSupplierRow,
} from "@/actions/supplier";
import { useRouter } from "next/navigation";

export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [csvContent, setCsvContent] = useState(
    `SupplierID,Name,Email,Phone,Categories,GSTIN\nSUP-101,Reliance Wholesale,supply@reliance.com,9876543210,Groceries,27ABCDE1234F1Z5\nSUP-102,Tata Consumer Products,dist@tata.com,9811223344,FMCG & Salt,29AAACB1234D1Z2`
  );
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [validationReport, setValidationReport] = useState<ValidateBulkSupplierReport | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "valid" | "error">("all");
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 6;
  const router = useRouter();

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvContent(text);
        setError(null);
      }
    };
    reader.readAsText(file);
  }

  function handleValidate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!csvContent.trim()) {
      setError("CSV content is empty. Please upload a file or paste data.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await validateBulkSupplierImport(csvContent);
      if (!res.ok) {
        setError(res.error ?? "Validation failed.");
        return;
      }
      setValidationReport(res);
      setFilterTab(res.errorCount > 0 && res.validCount === 0 ? "error" : "all");
      setPreviewPage(1);
      setStep("review");
    });
  }

  function handleCommit() {
    if (!validationReport) return;
    const validRows = validationReport.rows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      setError("No valid distributors found to import. Please resolve the errors and try again.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await commitBulkSupplierImport(validRows);
      if (!res.ok) {
        setError(res.error ?? "Failed to commit distributors import.");
        return;
      }
      setSuccessMsg(`✅ Successfully imported ${res.successCount} distributor(s)!`);
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1200);
    });
  }

  // Filtered rows for review table
  const displayedRows = useMemo(() => {
    if (!validationReport) return [];
    if (filterTab === "valid") return validationReport.rows.filter((r) => r.status === "valid");
    if (filterTab === "error") return validationReport.rows.filter((r) => r.status === "error");
    return validationReport.rows;
  }, [validationReport, filterTab]);

  const totalPreviewPages = Math.max(1, Math.ceil(displayedRows.length / previewPageSize));
  const paginatedPreviewRows = displayedRows.slice(
    (previewPage - 1) * previewPageSize,
    previewPage * previewPageSize
  );

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 760,
          maxWidth: "94vw",
          maxHeight: "90vh",
          background: "var(--card-bg)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          boxShadow: "0 28px 70px rgba(0, 0, 0, 0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "color-mix(in srgb, var(--accent-orange, #f97316) 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              ☁️
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Import Distributors CSV
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background:
                      step === "input"
                        ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                        : "color-mix(in srgb, var(--success) 12%, transparent)",
                    color: step === "input" ? "var(--primary)" : "var(--success)",
                  }}
                >
                  Step {step === "input" ? "1: Upload & Validate" : "2: Review & Commit"}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "3px 0 0 0" }}>
                Validate data format, duplicates, and GSTINs before writing to database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "var(--danger)",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              🚨 {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                color: "var(--success)",
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {successMsg}
            </div>
          )}

          {step === "input" ? (
            <form onSubmit={handleValidate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  UPLOAD CSV / TSV FILE
                </label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px dashed var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                    CSV RAW DATA / PASTE (Header: SupplierID,Name,Email,Phone,Categories,GSTIN)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCsvContent(
                        `SupplierID,Name,Email,Phone,Categories,GSTIN\nSUP-101,Reliance Wholesale,supply@reliance.com,9876543210,Groceries,27ABCDE1234F1Z5\nSUP-102,Tata Consumer Products,dist@tata.com,9811223344,FMCG & Salt,29AAACB1234D1Z2`
                      )
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--primary)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Reset Sample
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginTop: 4 }}>
                  💡 Delimiters are auto-detected (comma, tab from Excel, or semicolon). 10-digit phone and valid 15-character GSTIN are supported.
                </span>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Review KPI Summary */}
              {validationReport && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "var(--scaffold-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>TOTAL ROWS</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 2 }}>
                      {validationReport.rows.length}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--success) 8%, var(--scaffold-bg))",
                      border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--success)", fontWeight: 700 }}>READY TO COMMIT</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--success)", marginTop: 2 }}>
                      {validationReport.validCount}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background:
                        validationReport.errorCount > 0
                          ? "rgba(239, 68, 68, 0.08)"
                          : "var(--scaffold-bg)",
                      border:
                        validationReport.errorCount > 0
                          ? "1px solid rgba(239, 68, 68, 0.3)"
                          : "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: validationReport.errorCount > 0 ? "var(--danger)" : "var(--text-secondary)",
                        fontWeight: 700,
                      }}
                    >
                      ERRORS DETECTED
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: validationReport.errorCount > 0 ? "var(--danger)" : "var(--text-primary)",
                        marginTop: 2,
                      }}
                    >
                      {validationReport.errorCount}
                    </div>
                  </div>
                </div>
              )}

              {/* Review Filter Tabs */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>Show:</span>
                {(["all", "valid", "error"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setFilterTab(tab);
                      setPreviewPage(1);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      border: filterTab === tab ? "1px solid var(--primary)" : "1px solid var(--border)",
                      background: filterTab === tab ? "var(--primary)" : "var(--card-bg)",
                      color: filterTab === tab ? "#fff" : "var(--text-secondary)",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {tab === "all" ? "All Records" : tab === "valid" ? "Ready Rows" : "Issues"}
                  </button>
                ))}
              </div>

              {/* Preview Table */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--scaffold-bg)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 700, width: 40 }}>#</th>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 700 }}>DISTRIBUTOR</th>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 700 }}>PHONE / EMAIL</th>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 700 }}>CATEGORIES</th>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: 700 }}>STATUS / NOTES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPreviewRows.map((r, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background:
                            r.status === "error"
                              ? "rgba(239, 68, 68, 0.05)"
                              : "transparent",
                        }}
                      >
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {r.lineNumber}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{r.name}</div>
                          {r.supplierID && (
                            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                              {r.supplierID}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11 }}>
                          {r.phone && <div>📞 {r.phone}</div>}
                          {r.email && <div style={{ color: "var(--text-secondary)" }}>✉️ {r.email}</div>}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-secondary)" }}>
                          {r.categories || "—"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {r.status === "valid" ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                                color: "var(--success)",
                                fontSize: 10,
                                fontWeight: 800,
                              }}
                            >
                              ✓ VALID
                            </span>
                          ) : (
                            <div>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(239, 68, 68, 0.15)",
                                  color: "var(--danger)",
                                  fontSize: 10,
                                  fontWeight: 800,
                                  marginBottom: 2,
                                }}
                              >
                                ⚠ ISSUE
                              </span>
                              <div style={{ fontSize: 10, color: "var(--danger)", lineHeight: 1.3 }}>
                                {r.errors.join("; ")}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview Pagination */}
              {totalPreviewPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Page {previewPage} of {totalPreviewPages} ({displayedRows.length} rows)
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      disabled={previewPage <= 1}
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--card-bg)",
                        cursor: previewPage <= 1 ? "not-allowed" : "pointer",
                        opacity: previewPage <= 1 ? 0.4 : 1,
                      }}
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      disabled={previewPage >= totalPreviewPages}
                      onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--card-bg)",
                        cursor: previewPage >= totalPreviewPages ? "not-allowed" : "pointer",
                        opacity: previewPage >= totalPreviewPages ? 0.4 : 1,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {step === "review" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStep("input")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              ← Re-edit CSV
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            {step === "input" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleValidate()}
                style={{
                  padding: "9px 22px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  border: "none",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {isPending ? "Validating..." : "🔍 Validate CSV Data →"}
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending || (validationReport?.validCount ?? 0) === 0}
                onClick={handleCommit}
                style={{
                  padding: "9px 22px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  background:
                    (validationReport?.validCount ?? 0) > 0 ? "var(--cta-bg)" : "var(--border)",
                  color: (validationReport?.validCount ?? 0) > 0 ? "var(--cta-text)" : "var(--text-secondary)",
                  border: "none",
                  cursor: isPending || (validationReport?.validCount ?? 0) === 0 ? "not-allowed" : "pointer",
                }}
              >
                {isPending
                  ? "Writing to Database..."
                  : `✓ Confirm & Import Valid (${validationReport?.validCount ?? 0})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
