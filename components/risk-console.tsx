"use client";

import { useState } from "react";
import { RejectedOrder } from "@/lib/services/risk-engine-service";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Badge, EmptyState } from "@/components/ui";

export function RiskConsole({
  orders,
  branchCode,
  canEdit = false,
}: {
  orders: RejectedOrder[];
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [selectedIncident, setSelectedIncident] = useState<RejectedOrder | null>(null);

  const totalValue = orders.reduce((sum, o) => sum + o.amount, 0);
  const criticalCount = orders.filter((o) => o.severity === "CRITICAL").length;
  const isHighAlert = orders.length >= 3 || criticalCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Scope Notice */}
      {branchCode && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Risk Engine Monitoring Scope:</span>
          <Badge color="var(--danger)">{branchCode}</Badge>
        </div>
      )}

      {/* High Alert or Secure Banner */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: isHighAlert ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)",
          border: `1px solid ${isHighAlert ? "var(--danger)" : "var(--success)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>{isHighAlert ? "🚨" : "🛡️"}</div>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: isHighAlert ? "var(--danger)" : "var(--success)",
              }}
            >
              {isHighAlert ? "HIGH RISK ALERT ACTIVE" : "SYSTEM SECURE — NO FRAUD SURGES"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {isHighAlert
                ? `${orders.length} failed gate scan(s) intercepted. Guard inspections flagged discrepancies.`
                : "Zero critical exit gate anomalies reported in the current monitoring window."}
            </div>
          </div>
        </div>

        <Badge color={isHighAlert ? "var(--danger)" : "var(--success)"}>
          {isHighAlert ? "ELEVATED VIGILANCE" : "NORMAL THREAT LEVEL"}
        </Badge>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Total Gate Rejections
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: orders.length > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {orders.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Blocked at store exit
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Total Blocked Value
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--warning)" }}>
            ₹{totalValue.toFixed(0)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Protected inventory value
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Critical Severity Incidents
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: criticalCount > 0 ? "var(--danger)" : "var(--success)" }}>
            {criticalCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            High value or heavy item discrepancy
          </div>
        </Card>
      </div>

      {/* Rejection Logs Table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--danger)" }}>
            Rejection Incident Logs
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Live stream of blocked gate scans
          </span>
        </div>

        {orders.length === 0 ? (
          <EmptyState message="No rejected orders found. Store gate verification is clean." />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>INCIDENT TIME</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ORDER / INVOICE</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>BRANCH</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>AMOUNT</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>REASON</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>GUARD</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>SEVERITY</th>
                    <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                        {new Date(o.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })},{" "}
                        {new Date(o.timestampMs).toLocaleDateString()}
                      </td>
                      <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {o.invoiceNo}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: "var(--text-primary)" }}>
                        {o.branchCode}
                      </td>
                      <td style={{ padding: 12, fontWeight: 700, color: "var(--danger)" }}>
                        ₹{o.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.reason}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                        {o.verifiedByGuardId}
                      </td>
                      <td style={{ padding: 12 }}>
                        <Badge
                          color={
                            o.severity === "CRITICAL"
                              ? "var(--danger)"
                              : o.severity === "HIGH"
                              ? "var(--warning)"
                              : "var(--primary)"
                          }
                        >
                          {o.severity}
                        </Badge>
                      </td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedIncident(o)}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          🔬 Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Incident Detail Modal */}
      {selectedIncident && (
        <Modal onClose={() => setSelectedIncident(null)}>
          <Card style={{ width: 480, maxWidth: "92vw", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px 0", color: "var(--danger)" }}>
                  Rejection Dossier: {selectedIncident.invoiceNo}
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Order ID: <code>{selectedIncident.id}</code>
                </span>
              </div>
              <Badge color="var(--danger)">{selectedIncident.severity} RISK</Badge>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "rgba(255, 255, 255, 0.02)", padding: 14, borderRadius: 8, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Rejection Reason Stated by Guard:</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)", marginTop: 2 }}>
                  &ldquo;{selectedIncident.reason}&rdquo;
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Guard Identity</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedIncident.verifiedByGuardId}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Customer Phone</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedIncident.customerPhone}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Payment Method</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedIncident.paymentMode}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total Items Count</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedIncident.itemsCount} units</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>Blocked Amount</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "var(--danger)" }}>
                ₹{selectedIncident.amount.toFixed(2)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setSelectedIncident(null)}>
                Close Dossier
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}
