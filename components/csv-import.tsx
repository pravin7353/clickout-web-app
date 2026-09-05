"use client";

import { useState, useRef, useTransition } from "react";
import { bulkImportProductsAction } from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { Card, Button, ErrorBanner } from "@/components/ui";
import { Modal } from "@/components/profile-menu";

const TEMPLATE_COLUMNS = "barcode, name, price, unit_cost, gst, physical_stock, expiry_date, weight";
const TEMPLATE_EXAMPLE = "8901542001234, Mango Juice 250ml, 100, 70, 18, 50, 2027-12-31, 250";

type ParsedProduct = {
  barcode: string;
  name: string;
  price: number;
  unitCost: number;
  gst: string;
  physicalStock: number;
  weight: string;
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

export function CsvImport({ branchParam }: { branchParam?: string }) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowRules(true);
    }
  }

  async function processCsvImport() {
    if (!pendingFile) return;
    setShowRules(false);
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
        for (const [idx, field] of [
          [2, "price"],
          [3, "unit cost"],
          [4, "gst"],
          [7, "weight"],
        ] as [number, string][]) {
          const err = validateNumericField(row[idx] ?? "", field, i);
          if (err) throw new Error(err);
        }

        products.push({
          barcode: row[0],
          name: row[1] ?? "Unknown Item",
          price: parseFloat(row[2]) || 0,
          unitCost: parseFloat(row[3]) || 0,
          gst: row[4] ?? "0",
          physicalStock: parseInt(row[5], 10) || 0,
          weight: row[7] ?? "0",
        });
      }

      if (products.length === 0) throw new Error("No valid data rows found in CSV!");

      startTransition(async () => {
        const res = await bulkImportProductsAction(products, branchParam);
        if (!res.ok) {
          setError(res.error ?? "Import failed.");
        } else {
          router.refresh();
        }
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to parse CSV file.");
    } finally {
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
        <Button variant="secondary" onClick={() => setShowTemplate(true)}>
          ⓘ Template
        </Button>
        <Button variant="secondary" onClick={pickFile} disabled={isPending}>
          {isPending ? "Importing..." : "⬆ Import CSV"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileSelected}
          style={{ display: "none" }}
        />
      </div>

      {error && (
        <div style={{ marginTop: 12 }}>
          <ErrorBanner message={error} />
        </div>
      )}

      {showTemplate && (
        <Modal onClose={() => setShowTemplate(false)}>
          <Card style={{ width: 480, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
              CSV Format Template
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px 0" }}>
              Column Header Order:
            </p>
            <p style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-primary)", marginBottom: 12 }}>
              {TEMPLATE_COLUMNS}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 6px 0" }}>
              Sample Data Row:
            </p>
            <p style={{ fontSize: 13, fontFamily: "monospace", color: "var(--success)", marginBottom: 20 }}>
              {TEMPLATE_EXAMPLE}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowTemplate(false)}>
                Close
              </Button>
              <Button onClick={copyTemplate}>📋 Copy Template</Button>
            </div>
          </Card>
        </Modal>
      )}

      {showRules && (
        <Modal onClose={() => { setShowRules(false); setPendingFile(null); }}>
          <Card style={{ width: 480, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px 0", color: "var(--warning)" }}>
              ⚠ CSV Formatting Requirements
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              Numeric fields must contain numbers only without currency or unit symbols:
            </p>
            <div style={{ fontSize: 13, color: "var(--text-primary)", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              <div>Weight: <span style={{ color: "var(--danger)" }}>250ml ✗</span> → <span style={{ color: "var(--success)" }}>250 ✓</span></div>
              <div>Price: <span style={{ color: "var(--danger)" }}>₹100 ✗</span> → <span style={{ color: "var(--success)" }}>100 ✓</span></div>
              <div>GST: <span style={{ color: "var(--danger)" }}>18% ✗</span> → <span style={{ color: "var(--success)" }}>18 ✓</span></div>
              <div>Unit Cost: <span style={{ color: "var(--danger)" }}>₹70 ✗</span> → <span style={{ color: "var(--success)" }}>70 ✓</span></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => { setShowRules(false); setPendingFile(null); }}>
                Cancel
              </Button>
              <Button onClick={processCsvImport}>
                Proceed &amp; Upload
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </>
  );
}