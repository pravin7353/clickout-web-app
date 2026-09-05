"use client";

import { useTransition, useState } from "react";
import {
  approveAiSuggestion,
  rejectAiSuggestion,
  approvePO,
  deletePO,
  receivePoStock,
  createManualPO,
} from "@/actions/procurement";
import { AiSuggestion, PORow } from "@/lib/services/po-service";
import { Modal } from "@/components/profile-menu";
import { ConfirmModal } from "@/components/confirm-modal";
import { Card, Button, Input, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function POList({
  suggestions,
  pos,
  branchCode,
  canEdit = false,
}: {
  suggestions: AiSuggestion[];
  pos: PORow[];
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"SUGGESTIONS" | "PENDING" | "HISTORY">("PENDING");
  const [showPoModal, setShowPoModal] = useState(false);
  const [productIdInput, setProductIdInput] = useState("");
  const [qtyInput, setQtyInput] = useState("50");
  const [supplierInput, setSupplierInput] = useState("DEFAULT_SUPPLIER");
  const [modalError, setModalError] = useState("");
  const [globalError, setGlobalError] = useState("");

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Filter POs
  const pendingPos = pos.filter((p) => p.status === "DRAFT" || p.status === "PENDING");
  const historyPos = pos.filter((p) => p.status === "APPROVED" || p.status === "DELIVERED" || p.status === "REJECTED");

  // Metrics
  const totalPendingValue = pendingPos.reduce((sum, p) => sum + p.totalOrderValue, 0);
  const totalHistoryValue = historyPos.reduce((sum, p) => sum + p.totalOrderValue, 0);

  function handleApproveSuggestion(id: string) {
    setGlobalError("");
    startTransition(async () => {
      const res = await approveAiSuggestion(id, branchCode ?? undefined);
      if (!res.ok) setGlobalError(res.error ?? "Failed to approve suggestion.");
      else router.refresh();
    });
  }

  function handleRejectSuggestion(id: string) {
    setGlobalError("");
    startTransition(async () => {
      const res = await rejectAiSuggestion(id);
      if (!res.ok) setGlobalError(res.error ?? "Failed to reject suggestion.");
      else router.refresh();
    });
  }

  function handleApprovePo(id: string) {
    setGlobalError("");
    startTransition(async () => {
      const res = await approvePO(id);
      if (!res.ok) setGlobalError(res.error ?? "Failed to approve PO.");
      else router.refresh();
    });
  }

  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [poToReceive, setPoToReceive] = useState<string | null>(null);

  function handleConfirmDeletePo() {
    if (!poToDelete) return;
    setGlobalError("");
    startTransition(async () => {
      const res = await deletePO(poToDelete);
      if (!res.ok) setGlobalError(res.error ?? "Failed to discard PO.");
      else {
        setPoToDelete(null);
        router.refresh();
      }
    });
  }

  function handleConfirmReceiveStock() {
    if (!poToReceive) return;
    setGlobalError("");
    startTransition(async () => {
      const res = await receivePoStock(poToReceive);
      if (!res.ok) setGlobalError(res.error ?? "Failed to receive stock.");
      else {
        setPoToReceive(null);
        router.refresh();
      }
    });
  }

  function handleDeletePo(id: string) {
    setPoToDelete(id);
  }

  function handleReceiveStock(id: string) {
    setPoToReceive(id);
  }

  function handleCreateManualPo(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(qtyInput);
    if (!productIdInput.trim()) {
      setModalError("Product ID or barcode is required.");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setModalError("Order quantity must be at least 1.");
      return;
    }

    setModalError("");
    startTransition(async () => {
      const res = await createManualPO(
        productIdInput.trim(),
        qty,
        supplierInput.trim() || "DEFAULT_SUPPLIER",
        branchCode ?? undefined
      );
      if (!res.ok) {
        setModalError(res.error ?? "Failed to create PO.");
      } else {
        setShowPoModal(false);
        setProductIdInput("");
        setQtyInput("50");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Bar with Navigation & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Smart Sourcing & Vendor Intelligence
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/suppliers" style={{ textDecoration: "none" }}>
            <Button variant="secondary">
              Vendor Directory →
            </Button>
          </Link>
          {canEdit && (
            <Button onClick={() => setShowPoModal(true)}>
              + Create Manual PO
            </Button>
          )}
        </div>
      </div>

      {globalError && <ErrorBanner message={globalError} />}

      {/* KPI Metrics Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            AI Reorder Suggestions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: suggestions.length > 0 ? "var(--warning)" : "var(--text-primary)" }}>
            {suggestions.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Automated stock alerts
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Pending POs
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>
            {pendingPos.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Value: ₹{totalPendingValue.toFixed(0)}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Orders History
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>
            {historyPos.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Total value: ₹{totalHistoryValue.toFixed(0)}
          </div>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab("PENDING")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeTab === "PENDING" ? "var(--primary)" : "transparent",
            color: activeTab === "PENDING" ? "#fff" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Pending Approvals ({pendingPos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SUGGESTIONS")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeTab === "SUGGESTIONS" ? "var(--warning)" : "transparent",
            color: activeTab === "SUGGESTIONS" ? "#000" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          AI Reorder Engine ({suggestions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("HISTORY")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: activeTab === "HISTORY" ? "var(--card-bg)" : "transparent",
            color: activeTab === "HISTORY" ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            borderBottom: activeTab === "HISTORY" ? "2px solid var(--primary)" : "none",
          }}
        >
          PO History & Receipts ({historyPos.length})
        </button>
      </div>

      {/* TAB 1: PENDING APPROVALS */}
      {activeTab === "PENDING" && (
        <>
          {pendingPos.length === 0 ? (
            <EmptyState message="No purchase orders currently pending approval." />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>PO NUMBER</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>SUPPLIER</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ITEMS</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>BRANCH</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>TOTAL VALUE</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>STATUS</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPos.map((po) => (
                      <tr key={po.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          {po.poId.slice(0, 10).toUpperCase()}
                        </td>
                        <td style={{ padding: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                          {po.supplierName}
                        </td>
                        <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                          {po.items && po.items.length > 0 ? (
                            po.items.map((i, idx) => (
                              <div key={idx}>• {i.name} ({i.orderQty} units)</div>
                            ))
                          ) : (
                            `${po.totalItems} items`
                          )}
                        </td>
                        <td style={{ padding: 12, fontSize: 13, color: "var(--text-primary)" }}>
                          {po.branchCode || "HQ"}
                        </td>
                        <td style={{ padding: 12, fontWeight: 700, color: "var(--success)" }}>
                          ₹{po.totalOrderValue.toFixed(2)}
                        </td>
                        <td style={{ padding: 12 }}>
                          <Badge color="var(--warning)">{po.status}</Badge>
                        </td>
                        <td style={{ padding: 12, textAlign: "right" }}>
                          {canEdit && (
                            <div style={{ display: "inline-flex", gap: 8 }}>
                              <Button
                                variant="secondary"
                                onClick={() => handleDeletePo(po.id)}
                                disabled={isPending}
                                style={{ color: "var(--danger)" }}
                              >
                                Discard
                              </Button>
                              <Button
                                onClick={() => handleApprovePo(po.id)}
                                disabled={isPending}
                              >
                                Approve & Send
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* TAB 2: AI REORDER ENGINE */}
      {activeTab === "SUGGESTIONS" && (
        <>
          {suggestions.length === 0 ? (
            <EmptyState message="AI engine has not detected any inventory shortages requiring PO generation." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {suggestions.map((s) => (
                <Card key={s.id} style={{ padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)", background: "rgba(245, 158, 11, 0.15)", padding: "2px 6px", borderRadius: 4 }}>
                        AI REORDER ALERT
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Branch: {s.branchCode}
                      </span>
                    </div>

                    <h4 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                      {s.productName}
                    </h4>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                      Distributor: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.supplierName}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: 6, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Suggested Qty</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{s.suggestedQty} Units</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Est. Total Cost</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--success)" }}>₹{s.estimatedCost.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        variant="secondary"
                        onClick={() => handleRejectSuggestion(s.id)}
                        disabled={isPending}
                        style={{ flex: 1, color: "var(--danger)" }}
                      >
                        Dismiss
                      </Button>
                      <Button
                        onClick={() => handleApproveSuggestion(s.id)}
                        disabled={isPending}
                        style={{ flex: 1 }}
                      >
                        Create PO
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 3: PO HISTORY */}
      {activeTab === "HISTORY" && (
        <>
          {historyPos.length === 0 ? (
            <EmptyState message="No completed or delivered purchase orders recorded." />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>PO NUMBER</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>SUPPLIER</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>ITEMS</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>TOTAL VALUE</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>STATUS</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>DATE</th>
                      <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPos.map((po) => (
                      <tr key={po.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                          {po.poId.slice(0, 10).toUpperCase()}
                        </td>
                        <td style={{ padding: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                          {po.supplierName}
                        </td>
                        <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                          {po.items && po.items.length > 0 ? (
                            po.items.map((i, idx) => (
                              <div key={idx}>• {i.name} ({i.orderQty} units)</div>
                            ))
                          ) : (
                            `${po.totalItems} items`
                          )}
                        </td>
                        <td style={{ padding: 12, fontWeight: 700, color: "var(--success)" }}>
                          ₹{po.totalOrderValue.toFixed(2)}
                        </td>
                        <td style={{ padding: 12 }}>
                          <Badge
                            color={
                              po.status === "DELIVERED"
                                ? "var(--success)"
                                : po.status === "APPROVED"
                                ? "var(--primary)"
                                : "var(--danger)"
                            }
                          >
                            {po.status}
                          </Badge>
                        </td>
                        <td style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                          {new Date(po.createdAtMs).toLocaleDateString()}
                        </td>
                        <td style={{ padding: 12, textAlign: "right" }}>
                          {canEdit && po.status === "APPROVED" && (
                            <Button
                              onClick={() => handleReceiveStock(po.id)}
                              disabled={isPending}
                              style={{ background: "var(--success)", color: "#000", fontSize: 12, padding: "6px 12px" }}
                            >
                              Receive Delivery
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Manual PO Creation Modal */}
      {showPoModal && (
        <Modal onClose={() => setShowPoModal(false)}>
          <Card style={{ width: 440, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
              Create Purchase Order
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Issue a manual stock procurement order to a distributor.
            </p>

            <form onSubmit={handleCreateManualPo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Product Barcode or ID
                </label>
                <Input
                  placeholder="e.g. 890103091234 or PROD-101"
                  value={productIdInput}
                  onChange={(e) => setProductIdInput(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Order Quantity (Units)
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="50"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Supplier / Distributor Code
                </label>
                <Input
                  placeholder="e.g. DEFAULT_SUPPLIER"
                  value={supplierInput}
                  onChange={(e) => setSupplierInput(e.target.value)}
                />
              </div>

              {modalError && <ErrorBanner message={modalError} />}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setShowPoModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Confirm & Save PO"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Discard PO Confirmation */}
      <ConfirmModal
        isOpen={!!poToDelete}
        title="Discard Purchase Order?"
        message="Are you sure you want to discard this purchase order? This action cannot be undone."
        confirmLabel="Discard PO"
        cancelLabel="Cancel"
        variant="danger"
        isPending={isPending}
        onConfirm={handleConfirmDeletePo}
        onCancel={() => setPoToDelete(null)}
      />

      {/* Receive Stock Confirmation */}
      <ConfirmModal
        isOpen={!!poToReceive}
        title="Confirm Stock Delivery?"
        message="Confirm that goods have been received? This will automatically increment physical inventory stock."
        confirmLabel="Receive Stock"
        cancelLabel="Cancel"
        variant="primary"
        isPending={isPending}
        onConfirm={handleConfirmReceiveStock}
        onCancel={() => setPoToReceive(null)}
      />
    </div>
  );
}