"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { StoreRow } from "@/lib/services/store-service";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { EditStoreForm } from "@/components/edit-store-form";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Badge } from "@/components/ui";

export function StoreTable({ stores, tenantId }: { stores: StoreRow[]; tenantId?: string }) {
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [qrStore, setQrStore] = useState<StoreRow | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Custom confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: "pause" | "resume" | "delete" | null;
    storeId: string | null;
    storeName: string;
  }>({ isOpen: false, type: null, storeId: null, storeName: "" });

  const openConfirm = (type: "pause" | "resume" | "delete", id: string, name: string) => {
    setConfirmDialog({ isOpen: true, type, storeId: id, storeName: name });
  };

  const executeAction = async () => {
    const { type, storeId } = confirmDialog;
    if (!storeId || !type) return;

    setLoadingId(storeId);
    setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" });

    if (type === "delete") {
      await removeStore(storeId);
    } else {
      await toggleStoreSuspension(storeId, type === "pause" ? "ACTIVE" : "SUSPENDED");
    }
    
    setLoadingId(null);
  };

  return (
    <div style={{ overflowX: "auto", background: "var(--card-bg)", borderRadius: 12, border: "1px solid var(--border)", position: "relative" }}>
      <table className="co-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)" }}>
            <th style={{ padding: "14px 16px" }}>Store Name</th>
            <th style={{ padding: "14px 16px" }}>Branch Code</th>
            <th style={{ padding: "14px 16px" }}>City</th>
            <th style={{ padding: "14px 16px" }}>Status</th>
            <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text-primary)" }}>{s.storeName}</td>
              <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.branchCode}</td>
              <td style={{ padding: "14px 16px", color: "var(--text-secondary)" }}>{s.city || "—"}</td>
              <td style={{ padding: "14px 16px" }}>
                <span
                  style={{
                    background: s.isActive ? "color-mix(in srgb, var(--success) 15%, transparent)" : "color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)",
                    color: s.isActive ? "var(--success)" : "var(--warning, #f59e0b)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {s.status}
                </span>
              </td>
              <td style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
                  {/* Enter Store */}
                  <Link
                    href={`/dashboard?store=${s.branchCode}`}
                    title="Enter Store Session"
                    style={{ color: "var(--text-primary)", display: "flex", opacity: 0.8 }}
                    onMouseEnter={e => e.currentTarget.style.opacity="1"}
                    onMouseLeave={e => e.currentTarget.style.opacity="0.8"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                  </Link>

                  {/* QR Entry Modal Button */}
                  <button
                    onClick={() => setQrStore(s)}
                    title="View In-Store Entry QR"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "var(--primary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  </button>

                  {/* Edit Store Profile */}
                  <button
                    onClick={() => setEditingStoreId(s.id)}
                    disabled={loadingId === s.id}
                    title="Edit Store Profile"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#3B82F6" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>

                  {/* Pause / Resume */}
                  <button
                    onClick={() => openConfirm(s.isActive ? "pause" : "resume", s.id, s.storeName)}
                    disabled={loadingId === s.id}
                    title={s.isActive ? "Pause Store" : "Resume Store"}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                  >
                    {s.isActive ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><rect x="9" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/><rect x="13" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><polygon points="10 7 16 12 10 17" fill="#1A1A1A"/></svg>
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => openConfirm("delete", s.id, s.storeName)}
                    disabled={loadingId === s.id}
                    title="Delete Store"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#EF4444" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Store Modal */}
      {editingStoreId && <EditStoreForm storeId={editingStoreId} onClose={() => setEditingStoreId(null)} />}

      {/* Store Entrance QR Modal */}
      {qrStore && (
        <Modal onClose={() => setQrStore(null)}>
          <Card style={{ width: 360, textAlign: "center", display: "grid", gap: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                {qrStore.storeName}
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                BRANCH CODE: {qrStore.branchCode}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "center", padding: 16, background: "#fff", borderRadius: 12 }}>
              <QRCodeSVG
                value={`https://app.clickout.com/entry?t=${tenantId || ""}&b=${qrStore.branchCode}&s=${qrStore.branchCode}`}
                size={180}
              />
            </div>

            <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
              Display or print this QR at shop entrance. Shoppers scan with ClickOut app to activate self-checkout.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <Button variant="secondary" onClick={() => setQrStore(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                Print QR Standee
              </Button>
            </div>
          </Card>
        </Modal>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog.isOpen && (
        <Modal onClose={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })}>
          <Card style={{ width: 340, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>
              {confirmDialog.type === "delete" ? "🗑️" : confirmDialog.type === "pause" ? "⏸️" : "▶️"}
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "var(--text-primary)" }}>
              {confirmDialog.type === "delete" ? "Delete Store?" : confirmDialog.type === "pause" ? "Pause Store?" : "Resume Store?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
              Are you sure you want to {confirmDialog.type} operations for &ldquo;{confirmDialog.storeName}&rdquo;?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button variant="secondary" type="button" onClick={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })}>
                Cancel
              </Button>
              <Button
                variant={confirmDialog.type === "delete" ? "danger" : "primary"}
                onClick={executeAction}
              >
                Confirm
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}