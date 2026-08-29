"use client";

import { useState, useTransition } from "react";
import { saveInvoiceRules } from "@/actions/invoice-rules";

type Rules = { invoicePrefix: string; hsnCode: string; terms: string };

export function InvoiceRulesForm({ initialRules }: { initialRules: Rules }) {
  const [prefix, setPrefix] = useState(initialRules.invoicePrefix);
  const [hsn, setHsn] = useState(initialRules.hsnCode);
  const [terms, setTerms] = useState(initialRules.terms);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveInvoiceRules({ invoicePrefix: prefix, hsnCode: hsn, terms });
      setMessage(res.ok ? "✅ Invoice Rules Saved!" : `❌ ${res.error}`);
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Invoice Rules</h1>

      <label style={{ fontSize: 12, color: "#888" }}>Invoice Prefix</label>
      <input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, marginBottom: 16 }} />

      <label style={{ fontSize: 12, color: "#888" }}>HSN Code</label>
      <input value={hsn} onChange={(e) => setHsn(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, marginBottom: 16 }} />

      <label style={{ fontSize: 12, color: "#888" }}>Terms & Conditions</label>
      <textarea value={terms} onChange={(e) => setTerms(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4, minHeight: 100, marginBottom: 16 }} />

      {message && <p style={{ marginBottom: 12 }}>{message}</p>}

      <button onClick={save} disabled={isPending} style={{ padding: "10px 20px", background: "#22c55e", color: "#000", border: "none", borderRadius: 8, fontWeight: 700 }}>
        {isPending ? "Saving..." : "Save Rules"}
      </button>
    </div>
  );
}