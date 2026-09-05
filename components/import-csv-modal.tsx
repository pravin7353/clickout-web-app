"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/profile-menu";
import { importSuppliersCsv } from "@/actions/procurement";
import { useRouter } from "next/navigation";

export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const [csvContent, setCsvContent] = useState(
    `SupplierID,Name,Email,Phone,Categories\nSUP-101,Reliance Wholesale,supply@reliance.com,+919876543210,Groceries\nSUP-102,Tata Consumer Products,dist@tata.com,+919811223344,FMCG & Salt`
  );
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) setCsvContent(text);
    };
    reader.readAsText(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await importSuppliersCsv(csvContent);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
      } else {
        setSuccessMsg(`✅ Successfully imported ${res.count} distributors!`);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1200);
      }
    });
  }

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 580,
          maxWidth: "94vw",
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
                background: "color-mix(in srgb, var(--accent-orange) 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              ☁️
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px 0", color: "var(--text-primary)" }}>
                Import Distributors CSV
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                Bulk upload suppliers & vendors via standard CSV
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

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {error && (
              <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 700 }}>
                🚨 {error}
              </div>
            )}
            {successMsg && (
              <div style={{ color: "var(--success)", fontSize: 13, fontWeight: 700 }}>
                {successMsg}
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                UPLOAD CSV FILE
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px dashed var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                CSV RAW DATA / PREVIEW (Header: SupplierID,Name,Email,Phone,Categories)
              </label>
              <textarea
                rows={6}
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
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
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

            <button
              type="submit"
              disabled={isPending}
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
              {isPending ? "Importing..." : "✓ Import Distributors"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
