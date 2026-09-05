"use client";

import { useState, useEffect, useTransition } from "react";
import { getInvoiceSettings, updateInvoiceSettings, InvoiceConfig } from "@/actions/invoice";
import { Modal } from "@/components/profile-menu";
import { Button, Card, Input, ErrorBanner } from "@/components/ui";

interface InvoiceSettingsModalProps {
  onClose: () => void;
  branchCode?: string | null;
  storeName?: string | null;
}

export function InvoiceSettingsModal({ onClose, branchCode, storeName }: InvoiceSettingsModalProps) {
  const [prefix, setPrefix] = useState("INV/");
  const [hsnCode, setHsnCode] = useState("");
  const [terms, setTerms] = useState(
    "1. Goods may be returned or refunded within 7 days with original receipt.\n2. Items must be unused with tags intact."
  );
  const [refundPolicyType, setRefundPolicyType] = useState<"NON_REFUNDABLE" | "REFUNDABLE_WINDOW">("REFUNDABLE_WINDOW");
  const [returnWindowDays, setReturnWindowDays] = useState<number>(7);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getInvoiceSettings(branchCode).then((res) => {
      if (res.ok && res.config) {
        setPrefix(res.config.invoicePrefix || "INV/");
        setHsnCode(res.config.hsnCode || "");
        setTerms(
          res.config.terms ||
            "1. Goods may be returned or refunded within 7 days with original receipt.\n2. Items must be unused with tags intact."
        );
        if (res.config.refundPolicyType) {
          setRefundPolicyType(res.config.refundPolicyType);
        }
        if (typeof res.config.returnWindowDays === "number") {
          setReturnWindowDays(res.config.returnWindowDays);
        }
      }
      setIsLoading(false);
    });
  }, [branchCode]);

  const applyPolicyToTerms = (type: "NON_REFUNDABLE" | "REFUNDABLE_WINDOW", days: number) => {
    if (type === "NON_REFUNDABLE") {
      setTerms(
        "1. Goods once sold will not be returned or refunded.\n2. In-store replacement available only for defective merchandise with original receipt within 24 hours."
      );
    } else {
      setTerms(
        `1. Goods may be returned or refunded within ${days} days of purchase with original receipt.\n2. Items must be in original condition with intact packaging/tags.\n3. Refunds processed via original payment or cash at store discretion.`
      );
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await updateInvoiceSettings({
        invoicePrefix: prefix,
        hsnCode,
        terms,
        refundPolicyType,
        returnWindowDays,
        branchCode,
      });

      if (!res.ok) {
        setError(res.error || "Failed to save invoice settings.");
      } else {
        setSuccessMsg("Invoice and return policy rules saved successfully!");
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    });
  };

  // Real-time preview sample number
  const samplePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const previewInvoiceNo = `${samplePrefix}26-27/0042`;

  return (
    <Modal onClose={onClose}>
      <Card
        style={{
          width: "100%",
          maxWidth: 540,
          background: "var(--card-bg)",
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--scaffold-bg)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧾</span>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Invoice & Receipt Rules
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                {storeName ? `Billing configuration for ${storeName}` : "Company billing and receipt configuration"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 20,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            Loading invoice configuration...
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            {error && <ErrorBanner message={error} />}

            {successMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "color-mix(in srgb, var(--success) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                  color: "var(--success)",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>✅</span> {successMsg}
              </div>
            )}

            {/* Prefix & Preview */}
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Invoice Number Prefix
              </label>
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. INV/ or QC/"
                required
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>Preview:</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "var(--success)",
                    background: "color-mix(in srgb, var(--success) 10%, transparent)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {previewInvoiceNo}
                </span>
              </div>
            </div>

            {/* Default HSN / SAC Code */}
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Default HSN / SAC Code (Optional)
              </label>
              <Input
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="e.g. 9983, 8517"
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
                Applied to bills when products don't specify individual HSN.
              </span>
            </div>

            {/* Return & Refund Policy Configuration */}
            <div
              style={{
                padding: "16px",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--scaffold-bg) 80%, transparent)",
                border: "1px solid var(--border)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: 0,
                  }}
                >
                  Return & Refund Policy Enforcement
                </label>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: refundPolicyType === "NON_REFUNDABLE" ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                    color: refundPolicyType === "NON_REFUNDABLE" ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {refundPolicyType === "NON_REFUNDABLE" ? "No Refunds" : `${returnWindowDays}-Day Return Window`}
                </span>
              </div>

              {/* Policy Type Toggle */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setRefundPolicyType("REFUNDABLE_WINDOW");
                    applyPolicyToTerms("REFUNDABLE_WINDOW", returnWindowDays);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: refundPolicyType === "REFUNDABLE_WINDOW" ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: refundPolicyType === "REFUNDABLE_WINDOW" ? "color-mix(in srgb, var(--primary) 10%, var(--card-bg))" : "var(--card-bg)",
                    color: refundPolicyType === "REFUNDABLE_WINDOW" ? "var(--primary)" : "var(--text-primary)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <div>🔄 Return Window Allowed</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-secondary)" }}>
                    Returns accepted within specified days
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRefundPolicyType("NON_REFUNDABLE");
                    applyPolicyToTerms("NON_REFUNDABLE", returnWindowDays);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: refundPolicyType === "NON_REFUNDABLE" ? "2px solid var(--danger)" : "1px solid var(--border)",
                    background: refundPolicyType === "NON_REFUNDABLE" ? "rgba(239, 68, 68, 0.08)" : "var(--card-bg)",
                    color: refundPolicyType === "NON_REFUNDABLE" ? "var(--danger)" : "var(--text-primary)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <div>🚫 Non-Refundable</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-secondary)" }}>
                    Goods once sold will not be refunded
                  </div>
                </button>
              </div>

              {/* Days presets if REFUNDABLE_WINDOW */}
              {refundPolicyType === "REFUNDABLE_WINDOW" && (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                    Select Allowed Return Window (Days):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[3, 7, 15, 30, 60, 180].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          setReturnWindowDays(days);
                          applyPolicyToTerms("REFUNDABLE_WINDOW", days);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: returnWindowDays === days ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: returnWindowDays === days ? "var(--primary)" : "var(--card-bg)",
                          color: returnWindowDays === days ? "#fff" : "var(--text-primary)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {days} Days {days === 7 ? "(Standard)" : days === 30 ? "(Fashion)" : days === 180 ? "(Warranty)" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Terms & Conditions / Receipt Footer */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    margin: 0,
                  }}
                >
                  Terms & Conditions (Printed on Receipts)
                </label>
                <button
                  type="button"
                  onClick={() => applyPolicyToTerms(refundPolicyType, returnWindowDays)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Sync text with policy
                </button>
              </div>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                placeholder="Enter exchange, refund, or warranty policies..."
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button variant="secondary" type="button" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} style={{ minWidth: 120 }}>
                {isPending ? "Saving..." : "Save Rules"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </Modal>
  );
}
