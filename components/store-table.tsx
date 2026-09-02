"use client";

import { useState } from "react";
import Link from "next/link";
import { StoreRow } from "@/lib/services/store-service";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { EditStoreForm } from "@/components/edit-store-form";
import { Modal } from "@/components/profile-menu";
import { Card, Button } from "@/components/ui";

export function StoreTable({ stores }: { stores: StoreRow[] }) {
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
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
      // Toggle logic uses current status to determine new status
      await toggleStoreSuspension(storeId, type === "pause" ? "ACTIVE" : "SUSPENDED");
    }
    
    setLoadingId(null);
  };

  return (
    <div style={{ overflowX: "auto", background: "var(--card-bg)", borderRadius: 8, border: "1px solid var(--border)", position: "relative" }}>
      <table className="co-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)" }}>
            <th style={{ padding: 12 }}>Store Name</th>
            <th style={{ padding: 12 }}>Branch Code</th>
            <th style={{ padding: 12 }}>City</th>
            <th style={{ padding: 12 }}>Status</th>
            <th style={{ padding: 12 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 12, fontWeight: 600 }}>{s.storeName}</td>
              <td style={{ padding: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.branchCode}</td>
              <td style={{ padding: 12, color: "var(--text-secondary)" }}>{s.city}</td>
              <td style={{ padding: 12 }}>
                <span className="co-badge" style={{ background: s.isActive ? "var(--success)" : "var(--warning)", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>
                  {s.status}
                </span>
              </td>
              <td style={{ padding: 12, display: "flex", gap: 20, alignItems: "center" }}>
                <Link href={`/dashboard?store=${s.branchCode}`} title="Enter Store" style={{ color: "var(--text-primary)", display: "flex", opacity: 0.8 }} onMouseEnter={e => e.currentTarget.style.opacity="1"} onMouseLeave={e => e.currentTarget.style.opacity="0.8"}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                </Link>
                <button onClick={() => setEditingStoreId(s.id)} disabled={loadingId === s.id} title="Edit Store" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
                <button onClick={() => openConfirm(s.isActive ? "pause" : "resume", s.id, s.storeName)} disabled={loadingId === s.id} title={s.isActive ? "Pause Store" : "Resume Store"} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                  {s.isActive ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><rect x="9" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/><rect x="13" y="7" width="2" height="10" fill="#1A1A1A" rx="1"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#FACC15"><circle cx="12" cy="12" r="12"/><polygon points="10 7 16 12 10 17" fill="#1A1A1A"/></svg>
                  )}
                </button>
                <button onClick={() => openConfirm("delete", s.id, s.storeName)} disabled={loadingId === s.id} title="Delete Store" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Store Modal */}
      {editingStoreId && <EditStoreForm storeId={editingStoreId} onClose={() => setEditingStoreId(null)} />}

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
              Are you sure you want to {confirmDialog.type} operations for "{confirmDialog.storeName}"?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button type="button" onClick={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })}>Cancel</Button>
              <button onClick={executeAction} className={confirmDialog.type === "delete" ? "co-btn co-btn-danger" : "co-btn co-btn-primary"}>
                Confirm
              </button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}