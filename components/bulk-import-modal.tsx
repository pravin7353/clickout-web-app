"use client";

import { useState, useTransition } from "react";
import { bulkImportStaff } from "@/actions/staff";
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
  const [results, setResults] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleImport() {
    if (!csvText.trim()) return;
    startTransition(async () => {
      const res = await bulkImportStaff(csvText, defaultBranchCode);
      if (res.ok) {
        setResults({
          successCount: res.successCount ?? 0,
          failCount: res.failCount ?? 0,
          errors: res.errors ?? [],
        });
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setResults(null);
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
        <span>Import CSV</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div
            style={{
              width: 580,
              maxWidth: "94vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.45)",
              display: "flex",
              flexDirection: "column",
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
                    Upload or paste comma-separated employee records
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

            {/* Content */}
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  fontFamily: "monospace",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Expected CSV Format:</div>
                <code>empId, name, email, phone, role, branchCode</code>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  e.g.: EMP-101, Amit Kumar, amit@store.com, 9876543210, cashier, {defaultBranchCode || "QUEST-001"}
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

              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV rows here..."
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none",
                  resize: "vertical",
                }}
              />

              {results && (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Import Results:{" "}
                    <span style={{ color: "var(--success)" }}>✅ {results.successCount} Success</span>{" "}
                    {results.failCount > 0 && <span style={{ color: "var(--danger)" }}>🚨 {results.failCount} Failed</span>}
                  </div>
                  {results.errors.length > 0 && (
                    <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, color: "var(--danger)" }}>
                      {results.errors.map((err, idx) => (
                        <div key={idx}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
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
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleImport}
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
                  }}
                >
                  {isPending ? "Processing..." : "Process Import"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
