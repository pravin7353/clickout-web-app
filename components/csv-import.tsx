"use client";

import { useState, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { clientFunctions } from "@/lib/firebase-client";
import { useRouter } from "next/navigation";
import { Card, Button, ErrorBanner } from "@/components/ui";

const TEMPLATE_COLUMNS = "barcode, name, price, unit_cost, gst, physical_stock, expiry_date, weight";
const TEMPLATE_EXAMPLE = "8901542001234, Mango Juice, 100, 70, 18, 50, 12/2027, 250";

type ParsedProduct = {
  barcode: string; name: string; itemType: string; searchKey: string;
  price: number; unitCost: number; gst: string; physicalStock: number;
  openingStock: number; expiryDate: string | null; weight: string;
};

function validateNumericField(value: string, fieldName: string, rowNum: number): string | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (/[a-zA-Z%₹\s]/.test(cleaned)) {
    const wrongEx = fieldName === "weight" ? "250ml" : fieldName === "gst" ? "18%" : "₹100";
    const rightEx = fieldName === "weight" ? "250" : fieldName === "gst" ? "18" : "100";
    return `Row ${rowNum}: '${fieldName}' = '${cleaned}' is invalid. Wrong: ${wrongEx} — Correct: ${rightEx}`;
  }
  return null;
}

export function CsvImport() {
  const [showTemplate, setShowTemplate] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setPendingFile(file); setShowRules(true); }
  }

  async function processCsvImport() {
    if (!pendingFile) return;
    setShowRules(false);
    setIsUploading(true);
    setError("");

    try {
      const text = await pendingFile.text();
      const lines = text.split("\n");
      if (lines.length <= 1) throw new Error("CSV is empty or missing data rows!");

      const products: ParsedProduct[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const row = line.split(",").map((c) => c.trim());
        if (!row[0]) continue;

        // column order: barcode, name, price, unit_cost, gst, physical_stock, expiry_date, weight
        for (const [idx, field] of [[2, "price"], [3, "unit cost"], [4, "gst"], [7, "weight"]] as [number, string][]) {
          const err = validateNumericField(row[idx] ?? "", field, i);
          if (err) throw new Error(err);
        }

        const rawDate = row[6] ?? "";
        products.push({
          barcode: row[0],
          name: row[1] ?? "Unknown Item",
          itemType: "PRODUCT",
          searchKey: (row[1] ?? "").toLowerCase(),
          price: parseFloat(row[2]) || 0,
          unitCost: parseFloat(row[3]) || 0,
          gst: row[4] ?? "0",
          physicalStock: parseInt(row[5], 10) || 0,
          openingStock: parseInt(row[5], 10) || 0,
          expiryDate: rawDate ? rawDate.replace(/-/g, "/") : null,
          weight: row[7] ?? "0",
        });
      }

      if (products.length === 0) throw new Error("No valid data found in CSV!");

      const bulkImport = httpsCallable(clientFunctions, "bulkImportProducts");
      const result: any = await bulkImport({ products });

      if (!result.data?.success && result.data?.success !== undefined) {
        throw new Error(result.data.message ?? "Import failed.");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Import failed.");
    } finally {
      setIsUploading(false);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function copyTemplate() {
    navigator.clipboard.writeText(`${TEMPLATE_COLUMNS}\n${TEMPLATE_EXAMPLE}`);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => setShowTemplate(true)}>ⓘ View Template</Button>
        <Button variant="secondary" onClick={pickFile} disabled={isUploading}>
          {isUploading ? "Uploading..." : "⬆ Import CSV"}
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileSelected} style={{ display: "none" }} />
      </div>

      {error && <div style={{ marginTop: 12 }}><ErrorBanner message={error} /></div>}

      {showTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <Card style={{ width: 460 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>CSV Format Template</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Column Order:</p>
            <p style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 12 }}>{TEMPLATE_COLUMNS}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Example row:</p>
            <p style={{ fontSize: 13, color: "var(--success)", marginBottom: 20 }}>{TEMPLATE_EXAMPLE}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowTemplate(false)}>Close</Button>
              <Button onClick={copyTemplate}>📋 Copy Template</Button>
            </div>
          </Card>
        </div>
      )}

      {showRules && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <Card style={{ width: 460 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, color: "var(--warning)" }}>⚠ CSV Format Rules</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Numeric fields must be NUMBERS ONLY:</p>
            <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 16 }}>
              <div>Weight: <span style={{ color: "var(--danger)" }}>250ml ✗</span> → <span style={{ color: "var(--success)" }}>250 ✓</span></div>
              <div>Price: <span style={{ color: "var(--danger)" }}>₹100 ✗</span> → <span style={{ color: "var(--success)" }}>100 ✓</span></div>
              <div>GST: <span style={{ color: "var(--danger)" }}>18% ✗</span> → <span style={{ color: "var(--success)" }}>18 ✓</span></div>
              <div>Unit Cost: <span style={{ color: "var(--danger)" }}>₹70 ✗</span> → <span style={{ color: "var(--success)" }}>70 ✓</span></div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 12, marginBottom: 16 }}>
              ⚠ Units or symbols in numeric fields will cause the row to be rejected.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => { setShowRules(false); setPendingFile(null); }}>Cancel</Button>
              <Button onClick={processCsvImport}>Understood, Upload CSV</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}