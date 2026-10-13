"use client";

import React, { useState, useTransition } from "react";
import { Card, Badge } from "@/components/ui";
import {
  requestStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  cancelStockTransfer,
  getProductStockAtBranch,
} from "@/actions/inventory";

export interface StockTransferItem {
  id: string;
  transferId?: string;
  tenantId: string;
  fromBranchCode: string;
  toBranchCode: string;
  barcode: string;
  productName: string;
  quantityRequested: number;
  quantityDispatched?: number;
  quantityReceived?: number;
  status: "PENDING" | "DISPATCHED" | "RECEIVED" | "CANCELLED";
  requestedBy: string;
  requestedAt?: any;
  dispatchedBy?: string;
  dispatchedAt?: any;
  receivedBy?: string;
  receivedAt?: any;
  cancelledBy?: string;
  cancelledAt?: any;
  notes?: string;
  challanNumber?: string;
}

export interface StoreOption {
  branchCode: string;
  storeName: string;
}

interface TransfersClientProps {
  stores: StoreOption[];
  initialTransfers: StockTransferItem[];
  userRole: string;
  userBranchCode?: string | null;
}

export function TransfersDashboardClient({
  stores,
  initialTransfers,
  userRole,
  userBranchCode,
}: TransfersClientProps) {
  const [activeTab, setActiveTab] = useState<"list" | "new" | "challan">("list");
  const [transfers, setTransfers] = useState<StockTransferItem[]>(initialTransfers);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransferItem | null>(
    initialTransfers[0] ?? null
  );

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // Tab 2 Form State
  const defaultFrom =
    userRole === "manager" && userBranchCode
      ? userBranchCode
      : stores[0]?.branchCode ?? "";
  const [fromBranch, setFromBranch] = useState<string>(defaultFrom);
  const [toBranch, setToBranch] = useState<string>(
    stores.find((s) => s.branchCode !== defaultFrom)?.branchCode ?? ""
  );
  const [barcode, setBarcode] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookedUpProduct, setLookedUpProduct] = useState<{
    name: string;
    physicalStock: number;
    price: number;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string>("");

  // Modals
  const [dispatchModal, setDispatchModal] = useState<{
    open: boolean;
    transfer: StockTransferItem | null;
    qty: number;
  }>({ open: false, transfer: null, qty: 1 });

  const [receiveModal, setReceiveModal] = useState<{
    open: boolean;
    transfer: StockTransferItem | null;
    qty: number;
  }>({ open: false, transfer: null, qty: 1 });

  const [cancelModal, setCancelModal] = useState<{
    open: boolean;
    transfer: StockTransferItem | null;
    reason: string;
  }>({ open: false, transfer: null, reason: "" });

  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isTenantAdmin = userRole === "tenant_admin" || userRole === "super_admin";

  // Product Lookup Handler
  async function handleLookupBarcode() {
    if (!barcode.trim() || !fromBranch) return;
    setLookupLoading(true);
    setLookupError("");
    setLookedUpProduct(null);

    const res = await getProductStockAtBranch(barcode.trim(), fromBranch);
    setLookupLoading(false);
    if (!res.ok || !res.product) {
      setLookupError(res.error ?? "Product not found at source branch");
    } else {
      setLookedUpProduct(res.product);
      setQuantity(Math.min(1, res.product.physicalStock));
    }
  }

  // Request Transfer Submit
  function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMsg(null);

    if (fromBranch === toBranch) {
      setFeedbackMsg({ text: "Source and destination branch cannot be the same.", type: "error" });
      return;
    }
    if (!barcode.trim()) {
      setFeedbackMsg({ text: "Please enter product barcode.", type: "error" });
      return;
    }
    if (quantity < 1) {
      setFeedbackMsg({ text: "Quantity must be at least 1.", type: "error" });
      return;
    }

    startTransition(async () => {
      const res = await requestStockTransfer({
        fromBranchCode: fromBranch,
        toBranchCode: toBranch,
        barcode: barcode.trim(),
        quantityRequested: quantity,
        notes: notes.trim() || undefined,
      });

      if (!res.ok) {
        setFeedbackMsg({ text: res.error ?? "Failed to request transfer.", type: "error" });
      } else {
        const transferIdStr = (res as any).transferId ?? `trf_${Date.now()}`;
        const newDoc: StockTransferItem = {
          id: transferIdStr,
          transferId: transferIdStr,
          tenantId: "",
          fromBranchCode: fromBranch,
          toBranchCode: toBranch,
          barcode: barcode.trim(),
          productName: lookedUpProduct?.name ?? barcode.trim(),
          quantityRequested: quantity,
          quantityDispatched: 0,
          quantityReceived: 0,
          status: "PENDING",
          requestedBy: "You",
          requestedAt: Date.now(),
          challanNumber: res.challanNumber,
          notes,
        };

        setTransfers([newDoc, ...transfers]);
        setSelectedTransfer(newDoc);
        setFeedbackMsg({
          text: `✅ Transfer request created successfully! Challan: ${res.challanNumber}`,
          type: "success",
        });

        // Reset
        setBarcode("");
        setLookedUpProduct(null);
        setNotes("");
        setQuantity(1);
        setActiveTab("list");
      }
    });
  }

  // Dispatch Action
  function confirmDispatch() {
    if (!dispatchModal.transfer) return;
    const t = dispatchModal.transfer;
    const qty = dispatchModal.qty;
    startTransition(async () => {
      const res = await dispatchStockTransfer(t.id || t.transferId || "", qty);
      if (!res.ok) {
        setFeedbackMsg({ text: res.error ?? "Dispatch failed", type: "error" });
      } else {
        setFeedbackMsg({ text: `✅ Transfer ${t.challanNumber || t.id} dispatched successfully!`, type: "success" });
        setTransfers(
          transfers.map((item) =>
            item.id === t.id
              ? { ...item, status: "DISPATCHED", quantityDispatched: qty, dispatchedAt: Date.now() }
              : item
          )
        );
        if (selectedTransfer?.id === t.id) {
          setSelectedTransfer({
            ...selectedTransfer,
            status: "DISPATCHED",
            quantityDispatched: qty,
            dispatchedAt: Date.now(),
          });
        }
      }
      setDispatchModal({ open: false, transfer: null, qty: 1 });
    });
  }

  // Receive Action
  function confirmReceive() {
    if (!receiveModal.transfer) return;
    const t = receiveModal.transfer;
    const qty = receiveModal.qty;
    startTransition(async () => {
      const res = await receiveStockTransfer(t.id || t.transferId || "", qty);
      if (!res.ok) {
        setFeedbackMsg({ text: res.error ?? "Receive failed", type: "error" });
      } else {
        setFeedbackMsg({ text: `✅ Transfer ${t.challanNumber || t.id} received and stock updated!`, type: "success" });
        setTransfers(
          transfers.map((item) =>
            item.id === t.id
              ? { ...item, status: "RECEIVED", quantityReceived: qty, receivedAt: Date.now() }
              : item
          )
        );
        if (selectedTransfer?.id === t.id) {
          setSelectedTransfer({
            ...selectedTransfer,
            status: "RECEIVED",
            quantityReceived: qty,
            receivedAt: Date.now(),
          });
        }
      }
      setReceiveModal({ open: false, transfer: null, qty: 1 });
    });
  }

  // Cancel Action
  function confirmCancel() {
    if (!cancelModal.transfer) return;
    const t = cancelModal.transfer;
    const reason = cancelModal.reason;
    startTransition(async () => {
      const res = await cancelStockTransfer(t.id || t.transferId || "", reason);
      if (!res.ok) {
        setFeedbackMsg({ text: res.error ?? "Cancellation failed", type: "error" });
      } else {
        setFeedbackMsg({ text: `Transfer ${t.challanNumber || t.id} cancelled.`, type: "success" });
        setTransfers(
          transfers.map((item) =>
            item.id === t.id
              ? { ...item, status: "CANCELLED", notes: reason || item.notes }
              : item
          )
        );
      }
      setCancelModal({ open: false, transfer: null, reason: "" });
    });
  }

  // Filtered transfers
  const filteredTransfers = transfers.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (branchFilter !== "ALL") {
      if (t.fromBranchCode !== branchFilter && t.toBranchCode !== branchFilter) return false;
    }
    return true;
  });

  function formatDate(d: any) {
    if (!d) return "—";
    const ms = typeof d === "number" ? d : d?._seconds ? d._seconds * 1000 : null;
    if (!ms) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Print-only CSS */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-challan-section,
          #printable-challan-section * {
            visibility: visible;
          }
          #printable-challan-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 24px;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className="no-print"
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background:
              feedbackMsg.type === "success"
                ? "color-mix(in srgb, var(--success) 15%, var(--card-bg))"
                : "color-mix(in srgb, var(--danger) 15%, var(--card-bg))",
            color: feedbackMsg.type === "success" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${feedbackMsg.type === "success" ? "var(--success)" : "var(--danger)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs Navigation Header */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 4,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setActiveTab("list")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px 8px 0 0",
            border: "none",
            borderBottom: activeTab === "list" ? "2px solid var(--primary)" : "2px solid transparent",
            background: activeTab === "list" ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
            color: activeTab === "list" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "list" ? 700 : 500,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>📦</span>
          <span>Transfers Overview</span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 10,
              background: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {transfers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("new")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px 8px 0 0",
            border: "none",
            borderBottom: activeTab === "new" ? "2px solid var(--primary)" : "2px solid transparent",
            background: activeTab === "new" ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
            color: activeTab === "new" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "new" ? 700 : 500,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>➕</span>
          <span>New Transfer Request</span>
        </button>

        <button
          onClick={() => setActiveTab("challan")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px 8px 0 0",
            border: "none",
            borderBottom: activeTab === "challan" ? "2px solid var(--primary)" : "2px solid transparent",
            background: activeTab === "challan" ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
            color: activeTab === "challan" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "challan" ? 700 : 500,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>📄</span>
          <span>Challan / Gate Pass</span>
          {selectedTransfer && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--primary) 20%, transparent)",
                color: "var(--primary)",
              }}
            >
              {selectedTransfer.challanNumber || selectedTransfer.id.slice(0, 8)}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================
          TAB 1: TRANSFERS LIST
         ======================================================== */}
      {activeTab === "list" && (
        <Card style={{ padding: 20 }}>
          {/* Controls Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                  Status Filter
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending (Draft)</option>
                  <option value="DISPATCHED">In Transit (Dispatched)</option>
                  <option value="RECEIVED">Received</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              {isTenantAdmin && (
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                    Branch Filter
                  </label>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                    }}
                  >
                    <option value="ALL">All Branches</option>
                    {stores.map((s) => (
                      <option key={s.branchCode} value={s.branchCode}>
                        {s.storeName} ({s.branchCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveTab("new")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>+</span> Request Stock Transfer
            </button>
          </div>

          {/* Transfers Table */}
          {filteredTransfers.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: 14,
              }}
            >
              No inter-branch transfers found matching the selected filter.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      textAlign: "left",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    <th style={{ padding: "10px 12px" }}>Challan No</th>
                    <th style={{ padding: "10px 12px" }}>From → To</th>
                    <th style={{ padding: "10px 12px" }}>Product & Barcode</th>
                    <th style={{ padding: "10px 12px" }}>Qty</th>
                    <th style={{ padding: "10px 12px" }}>Status</th>
                    <th style={{ padding: "10px 12px" }}>Date</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransfers.map((t) => {
                    const isFromManager = userRole === "manager" && userBranchCode === t.fromBranchCode;
                    const isToManager = userRole === "manager" && userBranchCode === t.toBranchCode;
                    const canDispatch = t.status === "PENDING" && (isTenantAdmin || isFromManager);
                    const canReceive = t.status === "DISPATCHED" && (isTenantAdmin || isToManager);
                    const canCancel = t.status === "PENDING" && (isTenantAdmin || isFromManager || isToManager);

                    let badgeColor = "var(--border)";
                    let badgeBg = "rgba(128, 128, 128, 0.15)";
                    let badgeText = "var(--text-secondary)";
                    if (t.status === "PENDING") {
                      badgeColor = "var(--warning)";
                      badgeBg = "color-mix(in srgb, var(--warning) 15%, transparent)";
                      badgeText = "var(--warning)";
                    } else if (t.status === "DISPATCHED") {
                      badgeColor = "#3b82f6";
                      badgeBg = "color-mix(in srgb, #3b82f6 15%, transparent)";
                      badgeText = "#3b82f6";
                    } else if (t.status === "RECEIVED") {
                      badgeColor = "var(--success)";
                      badgeBg = "color-mix(in srgb, var(--success) 15%, transparent)";
                      badgeText = "var(--success)";
                    }

                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          transition: "background 0.2s ease",
                        }}
                      >
                        <td style={{ padding: "12px", fontFamily: "monospace", fontWeight: 700 }}>
                          {t.challanNumber || t.id.slice(0, 8)}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontWeight: 600 }}>{t.fromBranchCode}</span>
                          <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>➔</span>
                          <span style={{ fontWeight: 600 }}>{t.toBranchCode}</span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: 600 }}>{t.productName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                            {t.barcode}
                          </div>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: 700 }}>
                            {t.status === "RECEIVED"
                              ? t.quantityReceived
                              : t.status === "DISPATCHED"
                              ? t.quantityDispatched
                              : t.quantityRequested}{" "}
                            units
                          </div>
                          {t.status === "DISPATCHED" && t.quantityDispatched !== t.quantityRequested && (
                            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                              Req: {t.quantityRequested}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 800,
                              background: badgeBg,
                              border: `1px solid ${badgeColor}`,
                              color: badgeText,
                              letterSpacing: "0.5px",
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontSize: 12, color: "var(--text-secondary)" }}>
                          {formatDate(t.requestedAt)}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            {canDispatch && (
                              <button
                                onClick={() =>
                                  setDispatchModal({
                                    open: true,
                                    transfer: t,
                                    qty: t.quantityRequested,
                                  })
                                }
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "#3b82f6",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Dispatch
                              </button>
                            )}

                            {canReceive && (
                              <button
                                onClick={() =>
                                  setReceiveModal({
                                    open: true,
                                    transfer: t,
                                    qty: t.quantityDispatched || t.quantityRequested,
                                  })
                                }
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "var(--success)",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Receive
                              </button>
                            )}

                            {canCancel && (
                              <button
                                onClick={() =>
                                  setCancelModal({
                                    open: true,
                                    transfer: t,
                                    reason: "",
                                  })
                                }
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: "var(--danger)",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedTransfer(t);
                                setActiveTab("challan");
                              }}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "var(--card-bg)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Challan
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================
          TAB 2: NEW TRANSFER REQUEST FORM
         ======================================================== */}
      {activeTab === "new" && (
        <Card style={{ padding: 24, maxWidth: 800, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              Create Stock Transfer Request
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Request inventory re-allocation from one retail store or godown to another.
            </p>
          </div>

          <form onSubmit={handleRequestSubmit} style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* From Branch */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Source Branch (From) *
                </label>
                <select
                  disabled={!isTenantAdmin}
                  value={fromBranch}
                  onChange={(e) => {
                    setFromBranch(e.target.value);
                    setLookedUpProduct(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                  }}
                >
                  {stores.map((s) => (
                    <option key={s.branchCode} value={s.branchCode}>
                      {s.storeName} ({s.branchCode})
                    </option>
                  ))}
                </select>
                {!isTenantAdmin && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                    Manager role is locked to assigned store
                  </div>
                )}
              </div>

              {/* To Branch */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Destination Branch (To) *
                </label>
                <select
                  value={toBranch}
                  onChange={(e) => setToBranch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                  }}
                >
                  {stores
                    .filter((s) => s.branchCode !== fromBranch)
                    .map((s) => (
                      <option key={s.branchCode} value={s.branchCode}>
                        {s.storeName} ({s.branchCode})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Product Barcode */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Product Barcode *
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="e.g. 8901030012345 or SKU-999"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    setLookedUpProduct(null);
                    setLookupError("");
                  }}
                  onBlur={handleLookupBarcode}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={handleLookupBarcode}
                  disabled={lookupLoading || !barcode.trim()}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "color-mix(in srgb, var(--primary) 12%, var(--card-bg))",
                    color: "var(--primary)",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {lookupLoading ? "Checking..." : "Verify Stock"}
                </button>
              </div>

              {lookupError && (
                <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6, fontWeight: 500 }}>
                  ⚠️ {lookupError}
                </div>
              )}

              {lookedUpProduct && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--success) 10%, var(--card-bg))",
                    border: "1px solid var(--success)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>Product:</strong> {lookedUpProduct.name}
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--success)" }}>
                    Available Stock at {fromBranch}: {lookedUpProduct.physicalStock} units
                  </div>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Quantity to Transfer *
              </label>
              <input
                type="number"
                min={1}
                max={lookedUpProduct ? lookedUpProduct.physicalStock : 99999}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value || "1", 10))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                }}
              />
              {lookedUpProduct && (
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                  Maximum transferable: {lookedUpProduct.physicalStock} units
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Transfer Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Festival inventory replenishment, rush shift transfer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setActiveTab("list")}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--primary)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: isPending ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              >
                {isPending ? "Submitting..." : "Generate Transfer Request"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ========================================================
          TAB 3: PRINTABLE CHALLAN / GATE PASS
         ======================================================== */}
      {activeTab === "challan" && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Top selection bar */}
          <Card className="no-print" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Select Transfer:</span>
              <select
                value={selectedTransfer?.id ?? ""}
                onChange={(e) => {
                  const match = transfers.find((t) => t.id === e.target.value);
                  if (match) setSelectedTransfer(match);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {transfers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.challanNumber || t.id.slice(0, 8)} — {t.fromBranchCode} ➔ {t.toBranchCode} ({t.status})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => window.print()}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>🖨️</span> Print Challan
            </button>
          </Card>

          {/* Printable Challan Document */}
          {selectedTransfer ? (
            <div id="printable-challan-section">
              <div
                style={{
                  maxWidth: 680,
                  margin: "0 auto",
                  padding: 32,
                  borderRadius: 12,
                  border: "2px solid #333",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontFamily: "monospace",
                }}
              >
                {/* Header */}
                <div style={{ textAlign: "center", borderBottom: "2px dashed #666", paddingBottom: 16, marginBottom: 16 }}>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "1px" }}>
                    CLICKOUT — STOCK TRANSFER CHALLAN
                  </h1>
                  <p style={{ margin: "4px 0 0 0", fontSize: 12, opacity: 0.8 }}>
                    Inter-Branch Delivery Gate Pass & Internal Stock Movement
                  </p>
                </div>

                {/* Metadata Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    borderBottom: "1px solid #444",
                    paddingBottom: 14,
                    marginBottom: 14,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span style={{ opacity: 0.7 }}>Challan No: </span>
                    <strong>{selectedTransfer.challanNumber || selectedTransfer.id}</strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ opacity: 0.7 }}>Date: </span>
                    <strong>{formatDate(selectedTransfer.requestedAt)}</strong>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Source Branch (From): </span>
                    <strong style={{ fontSize: 14 }}>{selectedTransfer.fromBranchCode}</strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ opacity: 0.7 }}>Destination (To): </span>
                    <strong style={{ fontSize: 14 }}>{selectedTransfer.toBranchCode}</strong>
                  </div>
                </div>

                {/* Items Table */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #666", textAlign: "left" }}>
                      <th style={{ padding: "8px 0" }}>Product Item</th>
                      <th style={{ padding: "8px 0" }}>Barcode</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Req</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Dispatched</th>
                      <th style={{ padding: "8px 0", textAlign: "right" }}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #444" }}>
                      <td style={{ padding: "10px 0", fontWeight: 700 }}>{selectedTransfer.productName}</td>
                      <td style={{ padding: "10px 0" }}>{selectedTransfer.barcode}</td>
                      <td style={{ padding: "10px 0", textAlign: "right" }}>{selectedTransfer.quantityRequested}</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {selectedTransfer.quantityDispatched ?? "—"}
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {selectedTransfer.quantityReceived ?? "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Transfer Remarks */}
                {selectedTransfer.notes && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      background: "rgba(128, 128, 128, 0.08)",
                      border: "1px dashed #666",
                      fontSize: 12,
                      marginBottom: 20,
                    }}
                  >
                    <strong>Notes: </strong> {selectedTransfer.notes}
                  </div>
                )}

                {/* Sign-off & Audit Box */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                    borderTop: "2px dashed #666",
                    paddingTop: 16,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div>
                      <strong>Dispatched By:</strong> {selectedTransfer.dispatchedBy || "Pending Dispatch"}
                    </div>
                    <div style={{ opacity: 0.7, marginTop: 4 }}>
                      Date: {formatDate(selectedTransfer.dispatchedAt)}
                    </div>
                    <div style={{ marginTop: 24, borderTop: "1px solid #666", width: "80%", paddingTop: 4 }}>
                      Dispatcher Signature
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div>
                      <strong>Received By:</strong> {selectedTransfer.receivedBy || "Pending Receipt"}
                    </div>
                    <div style={{ opacity: 0.7, marginTop: 4 }}>
                      Date: {formatDate(selectedTransfer.receivedAt)}
                    </div>
                    <div
                      style={{
                        marginTop: 24,
                        borderTop: "1px solid #666",
                        width: "80%",
                        paddingTop: 4,
                        marginLeft: "auto",
                      }}
                    >
                      Receiver Signature
                    </div>
                  </div>
                </div>

                {/* Footer status */}
                <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, fontWeight: 800 }}>
                  STATUS: {selectedTransfer.status} ✓
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
              No transfer selected.
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODAL: DISPATCH
         ======================================================== */}
      {dispatchModal.open && dispatchModal.transfer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700 }}>
              Dispatch Stock Transfer
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Challan: <strong>{dispatchModal.transfer.challanNumber || dispatchModal.transfer.id}</strong>
              <br />
              Item: {dispatchModal.transfer.productName} ({dispatchModal.transfer.barcode})
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Actual Quantity Dispatched
            </label>
            <input
              type="number"
              min={1}
              value={dispatchModal.qty}
              onChange={(e) =>
                setDispatchModal({ ...dispatchModal, qty: parseInt(e.target.value || "1", 10) })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                marginBottom: 18,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setDispatchModal({ open: false, transfer: null, qty: 1 })}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDispatch}
                disabled={isPending}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPending ? "Dispatching..." : "Confirm Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: RECEIVE
         ======================================================== */}
      {receiveModal.open && receiveModal.transfer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700 }}>
              Receive Stock at Destination
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Challan: <strong>{receiveModal.transfer.challanNumber || receiveModal.transfer.id}</strong>
              <br />
              Dispatched: {receiveModal.transfer.quantityDispatched} units of {receiveModal.transfer.productName}
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Actual Quantity Received
            </label>
            <input
              type="number"
              min={1}
              value={receiveModal.qty}
              onChange={(e) =>
                setReceiveModal({ ...receiveModal, qty: parseInt(e.target.value || "1", 10) })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                marginBottom: 18,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setReceiveModal({ open: false, transfer: null, qty: 1 })}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmReceive}
                disabled={isPending}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--success)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPending ? "Receiving..." : "Confirm & Update Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CANCEL
         ======================================================== */}
      {cancelModal.open && cancelModal.transfer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>
              Cancel Transfer Request
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Are you sure you want to cancel Challan{" "}
              <strong>{cancelModal.transfer.challanNumber || cancelModal.transfer.id}</strong>?
            </p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Reason for Cancellation (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Stock no longer needed, customer order cancelled"
              value={cancelModal.reason}
              onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                marginBottom: 18,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setCancelModal({ open: false, transfer: null, reason: "" })}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={confirmCancel}
                disabled={isPending}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--danger)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPending ? "Cancelling..." : "Cancel Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
