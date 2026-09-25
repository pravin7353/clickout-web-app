"use client";

import { useState, useTransition, useMemo } from "react";
import { LedgerAccountDocument, VoucherType, BalanceType } from "@/lib/schemas/finance-schema";
import { createVoucherAction } from "@/actions/finance";

interface EntryRow {
  id: string;
  accountId: string;
  entryType: BalanceType;
  amount: string;
}

interface FinanceVoucherFormProps {
  accounts: LedgerAccountDocument[];
  onVoucherCreated?: () => void;
}

export function FinanceVoucherForm({ accounts, onVoucherCreated }: FinanceVoucherFormProps) {
  const [voucherType, setVoucherType] = useState<VoucherType>("PAYMENT");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState<string>("");

  // Default 2 balanced entry rows
  const [entries, setEntries] = useState<EntryRow[]>([
    { id: "row-1", accountId: accounts[0]?.id || "", entryType: "DR", amount: "" },
    { id: "row-2", accountId: accounts[1]?.id || "", entryType: "CR", amount: "" },
  ]);

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live calculation of debits, credits, and balance status
  const { totalDr, totalCr, diff, isBalanced } = useMemo(() => {
    let dr = 0;
    let cr = 0;

    for (const r of entries) {
      const val = parseFloat(r.amount) || 0;
      if (r.entryType === "DR") dr += val;
      else if (r.entryType === "CR") cr += val;
    }

    const difference = Math.abs(dr - cr);
    const balanced = entries.length >= 2 && dr > 0 && cr > 0 && difference <= 0.001;

    return {
      totalDr: Math.round(dr * 100) / 100,
      totalCr: Math.round(cr * 100) / 100,
      diff: Math.round(difference * 100) / 100,
      isBalanced: balanced,
    };
  }, [entries]);

  const handleAddRow = () => {
    // Smart balance suggestion for next row
    const nextType: BalanceType = totalDr > totalCr ? "CR" : "DR";
    const suggestedAmt = diff > 0 ? diff.toString() : "";

    setEntries([
      ...entries,
      {
        id: `row-${Date.now()}`,
        accountId: accounts[0]?.id || "",
        entryType: nextType,
        amount: suggestedAmt,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (entries.length <= 2) {
      setErrorMsg("A voucher must have at least 2 entries (double-entry).");
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    setEntries(entries.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof EntryRow, val: any) => {
    setEntries(
      entries.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isBalanced) {
      setErrorMsg(`Unbalanced voucher! Difference: ₹${diff.toFixed(2)}.`);
      return;
    }

    // Prepare payload
    const payloadEntries = entries.map((r) => ({
      accountId: r.accountId,
      entryType: r.entryType,
      amount: parseFloat(r.amount) || 0,
    }));

    startTransition(async () => {
      try {
        const res = await createVoucherAction({
          voucherType,
          date,
          narration,
          entries: payloadEntries,
          sourceType: "MANUAL",
        });

        if (res.ok) {
          setSuccessMsg(`Voucher [${res.voucherNo}] posted successfully!`);
          setNarration("");
          setEntries([
            { id: `row-${Date.now()}-1`, accountId: accounts[0]?.id || "", entryType: "DR", amount: "" },
            { id: `row-${Date.now()}-2`, accountId: accounts[1]?.id || "", entryType: "CR", amount: "" },
          ]);
          if (onVoucherCreated) onVoucherCreated();
          setTimeout(() => setSuccessMsg(null), 4000);
        } else {
          setErrorMsg(res.error || "Failed to post voucher.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Unexpected error posting voucher.");
      }
    });
  };

  const voucherTypes: Array<{ key: VoucherType; label: string; desc: string }> = [
    { key: "PAYMENT", label: "Payment (F5)", desc: "Bank/Cash paid to party/expense" },
    { key: "RECEIPT", label: "Receipt (F6)", desc: "Money received into Bank/Cash" },
    { key: "JOURNAL", label: "Journal (F7)", desc: "Adjustments, non-cash entries" },
    { key: "CONTRA", label: "Contra (F4)", desc: "Cash deposit/withdrawal from bank" },
    { key: "SALES", label: "Sales (F8)", desc: "Direct / manual invoice posting" },
    { key: "PURCHASE", label: "Purchase (F9)", desc: "Supplier procurement booking" },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
      }}
    >
      {/* Voucher Type Selector Tabs */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
          VOUCHER TYPE
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
          {voucherTypes.map((vt) => {
            const isSelected = voucherType === vt.key;
            return (
              <button
                key={vt.key}
                type="button"
                onClick={() => setVoucherType(vt.key)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: isSelected ? "2px solid var(--cta-bg)" : "1px solid var(--border)",
                  background: isSelected ? "color-mix(in srgb, var(--cta-bg) 15%, transparent)" : "var(--bg)",
                  color: isSelected ? "var(--cta-text)" : "var(--text-primary)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <div>{vt.label}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>
                  {vt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date & Narration Header Row */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
            VOUCHER DATE
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 700,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
            NARRATION / REMARKS
          </label>
          <input
            type="text"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="e.g. Being office rent paid via HDFC Bank for September"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* Dynamic Double-Entry Lines Table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)" }}>
            DOUBLE-ENTRY LEDGER LINES (MIN 2 ROWS)
          </label>
          <button
            type="button"
            onClick={handleAddRow}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(59, 130, 246, 0.12)",
              color: "#3b82f6",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ➕ Add Line
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((row, idx) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 140px 40px",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              {/* DR / CR Selector */}
              <select
                value={row.entryType}
                onChange={(e) => handleUpdateRow(row.id, "entryType", e.target.value as BalanceType)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: row.entryType === "DR" ? "rgba(59, 130, 246, 0.15)" : "rgba(34, 197, 94, 0.15)",
                  color: row.entryType === "DR" ? "#3b82f6" : "#22c55e",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                <option value="DR">Dr (By)</option>
                <option value="CR">Cr (To)</option>
              </select>

              {/* Account Dropdown */}
              <select
                value={row.accountId}
                onChange={(e) => handleUpdateRow(row.id, "accountId", e.target.value)}
                required
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountName} ({acc.accountGroup})
                  </option>
                ))}
              </select>

              {/* Amount Input */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 700 }}>₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={row.amount}
                  onChange={(e) => handleUpdateRow(row.id, "amount", e.target.value)}
                  placeholder="0.00"
                  required
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 800,
                    textAlign: "right",
                  }}
                />
              </div>

              {/* Delete Row Button */}
              <button
                type="button"
                onClick={() => handleRemoveRow(row.id)}
                disabled={entries.length <= 2}
                style={{
                  background: "transparent",
                  border: "none",
                  color: entries.length <= 2 ? "var(--border)" : "#ef4444",
                  fontSize: 16,
                  cursor: entries.length <= 2 ? "not-allowed" : "pointer",
                }}
                title="Remove Line"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ⚡ Live Balanced vs Unbalanced Indicator Bar */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: 14,
          background: isBalanced ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
          border: isBalanced ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>TOTAL DEBIT: </span>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#3b82f6" }}>₹{totalDr.toFixed(2)}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>TOTAL CREDIT: </span>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#22c55e" }}>₹{totalCr.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isBalanced ? (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                background: "rgba(34, 197, 94, 0.2)",
                color: "#22c55e",
                fontWeight: 900,
                fontSize: 13,
                border: "1px solid #22c55e",
              }}
            >
              ✓ Balanced Voucher
            </span>
          ) : (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                background: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
                fontWeight: 900,
                fontSize: 13,
                border: "1px solid #ef4444",
              }}
            >
              ✗ Unbalanced (Diff: ₹{diff.toFixed(2)})
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: 13, fontWeight: 700 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
          ✅ {successMsg}
        </div>
      )}

      {/* Submit Action Button */}
      <button
        type="submit"
        disabled={isPending || !isBalanced}
        style={{
          padding: "14px 20px",
          borderRadius: 12,
          background: isBalanced ? "var(--cta-bg)" : "rgba(255, 255, 255, 0.08)",
          color: isBalanced ? "var(--cta-text)" : "var(--text-secondary)",
          fontWeight: 900,
          fontSize: 15,
          border: "none",
          cursor: isBalanced && !isPending ? "pointer" : "not-allowed",
          boxShadow: isBalanced ? "0 4px 14px rgba(59, 130, 246, 0.35)" : "none",
          transition: "all 0.15s ease",
        }}
      >
        {isPending ? "Posting to General Ledger..." : `Post ${voucherType} Voucher (₹${totalDr.toFixed(2)}) →`}
      </button>
    </form>
  );
}
