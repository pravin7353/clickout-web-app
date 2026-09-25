"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, Badge, Button, Input, ErrorBanner } from "@/components/ui";
import { GstComplianceReport, GstFilingTrackerItem } from "@/lib/services/finance-service";
import { GstFilingType, GstFilingStatus } from "@/lib/schemas/finance-schema";
import { getGstFilingsAction, markGstFilingAsFiledAction } from "@/actions/finance";

interface FinanceGstPanelProps {
  userRole: string;
}

export function FinanceGstPanel({ userRole }: FinanceGstPanelProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7); // e.g. "2026-09"
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthStr);
  const [report, setReport] = useState<GstComplianceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filingTypePending, setFilingTypePending] = useState<GstFilingType | null>(null);

  const [isPending, startTransition] = useTransition();
  const isAuthorizedAdmin = userRole === "super_admin" || userRole === "tenant_admin";

  const loadComplianceReport = (period: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      try {
        const res = await getGstFilingsAction(period);
        if (res.ok) {
          setReport(res.report);
        } else {
          setErrorMsg(res.error || "Failed to load GST compliance report.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error fetching GST compliance data.");
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadComplianceReport(selectedPeriod);
  }, [selectedPeriod]);

  const handleMarkAsFiled = (filingType: GstFilingType, filingName: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFilingTypePending(filingType);

    startTransition(async () => {
      try {
        const res = await markGstFilingAsFiledAction({
          period: selectedPeriod,
          filingType,
        });

        if (res.ok) {
          setSuccessMsg(`✓ Successfully marked ${filingName} for ${selectedPeriod} as FILED.`);
          loadComplianceReport(selectedPeriod);
        } else {
          setErrorMsg(res.error || `Failed to mark ${filingName} as filed.`);
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Error updating filing status.");
      } finally {
        setFilingTypePending(null);
      }
    });
  };

  const liability = report?.liability;
  const filings = report?.filings || [];

  const getStatusBadge = (status: GstFilingStatus, daysRemaining: number) => {
    switch (status) {
      case "FILED":
        return <Badge color="var(--success, #22c55e)">🟢 FILED</Badge>;
      case "OVERDUE":
        return <Badge color="var(--danger, #ef4444)">🔴 OVERDUE ({Math.abs(daysRemaining)}d ago)</Badge>;
      case "DUE_SOON":
        return <Badge color="var(--warning, #f59e0b)">🟡 DUE SOON ({daysRemaining}d left)</Badge>;
      case "NOT_DUE":
      default:
        return <Badge color="var(--text-secondary)">⚪ NOT DUE</Badge>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Controls & Period Selector */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                SELECT GST COMPLIANCE PERIOD
              </label>
              <Input
                type="month"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                style={{ width: 170 }}
              />
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => loadComplianceReport(selectedPeriod)}
            disabled={loading}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {loading ? "Refreshing..." : "🔄 Refresh Tax Computations"}
          </Button>
        </div>
      </Card>

      {errorMsg && <ErrorBanner message={errorMsg} />}
      {successMsg && (
        <div style={{ padding: "12px 18px", borderRadius: 12, background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#22c55e", fontSize: 13, fontWeight: 700 }}>
          {successMsg}
        </div>
      )}

      {/* Statutory GST Tax Liability Calculator Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {/* Output GST */}
        <Card style={{ padding: 18, borderLeft: "4px solid #ef4444" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>
            OUTPUT GST LIABILITY (SALES)
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#ef4444", marginTop: 6 }}>
            ₹{(liability?.outputGst ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            Output CGST + SGST collected on sales
          </div>
        </Card>

        {/* Input Tax Credit (ITC) */}
        <Card style={{ padding: 18, borderLeft: "4px solid #3b82f6" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>
            INPUT TAX CREDIT (ITC) (PURCHASES)
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6", marginTop: 6 }}>
            ₹{(liability?.inputGst ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            {liability?.isInputItemized
              ? "Eligible ITC from purchase invoices"
              : "GST not itemized on purchase orders (₹0.00 ITC)"}
          </div>
        </Card>

        {/* Net GST Payable */}
        <Card
          style={{
            padding: 18,
            borderLeft: "4px solid #f59e0b",
            background: "rgba(245, 158, 11, 0.05)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b" }}>
            NET STATUTORY GST PAYABLE (GSTR-3B)
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#f59e0b", marginTop: 6 }}>
            ₹{(liability?.netGstPayable ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            Output Tax minus Input Tax Credit
          </div>
        </Card>

        {/* ITC Carry Forward */}
        <Card style={{ padding: 18, borderLeft: "4px solid #22c55e" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>
            ITC BALANCE CARRIED FORWARD
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e", marginTop: 6 }}>
            ₹{(liability?.itcCarryForward ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
            Excess ITC available for future offsets
          </div>
        </Card>
      </div>

      {/* Statutory Return Filing Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {filings.map((f) => (
          <Card
            key={f.filingType}
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              borderRadius: 16,
              border:
                f.status === "OVERDUE"
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : f.status === "DUE_SOON"
                  ? "1px solid rgba(245, 158, 11, 0.4)"
                  : f.status === "FILED"
                  ? "1px solid rgba(34, 197, 94, 0.4)"
                  : "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: "0 0 2px 0", fontSize: 18, fontWeight: 900, color: "var(--text-primary)" }}>
                    {f.filingName}
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Period: {selectedPeriod}
                  </span>
                </div>
                {getStatusBadge(f.status, f.daysRemaining)}
              </div>

              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0", lineHeight: 1.4 }}>
                {f.description}
              </p>

              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border)",
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Statutory Due Date:</span>
                  <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                    {new Date(f.dueDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </div>

                {f.filedAtMs ? (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Filed Record:</span>
                    <span style={{ fontWeight: 700, color: "#22c55e" }}>
                      {new Date(f.filedAtMs).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      {f.filedBy ? ` (${f.filedBy.split("@")[0]})` : ""}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Filing Status:</span>
                    <span
                      style={{
                        fontWeight: 800,
                        color: f.status === "OVERDUE" ? "#ef4444" : f.status === "DUE_SOON" ? "#f59e0b" : "var(--text-primary)",
                      }}
                    >
                      {f.status === "OVERDUE"
                        ? `Overdue by ${Math.abs(f.daysRemaining)} day(s)`
                        : f.status === "DUE_SOON"
                        ? `Due in ${f.daysRemaining} day(s)`
                        : "Upcoming"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {isAuthorizedAdmin && (
              <div>
                {f.status === "FILED" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#22c55e", fontSize: 12, fontWeight: 700, padding: "8px 0" }}>
                    <span>✓</span> Return marked as filed for this period
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => handleMarkAsFiled(f.filingType, f.filingName)}
                    disabled={isPending || filingTypePending === f.filingType}
                    style={{ width: "100%", padding: "8px 14px", fontSize: 12 }}
                  >
                    {filingTypePending === f.filingType ? "Updating Status..." : "✓ Mark as Filed"}
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Compliance Disclaimer Notice */}
      <Card
        style={{
          padding: "16px 20px",
          borderRadius: 14,
          background: "rgba(245, 158, 11, 0.06)",
          border: "1px solid rgba(245, 158, 11, 0.25)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <h4 style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 800, color: "#f59e0b" }}>
              Statutory Compliance & Portal Disclaimer
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              This panel operates strictly as an <strong>internal compliance tracking and tax liability calculation system</strong> based on your ClickOut general ledger. It does <strong>not transmit returns directly to the GSTN or Government Portal</strong>. Please upload and submit your official returns via the official GST portal (<strong>gst.gov.in</strong>) or your authorized GST Suvidha Provider (GSP), and then click <em>Mark as Filed</em> here to maintain an immutable compliance trail.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
