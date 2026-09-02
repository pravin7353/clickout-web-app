"use client";

import { useState } from "react";
import Link from "next/link";
import { StoreRow } from "@/lib/services/store-service";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { EditStoreForm } from "@/components/edit-store-form";

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
              <td style={{ padding: 12, display: "flex", gap: 8 }}>
                <Link href={`/dashboard?store=${s.branchCode}`} className="co-btn-primary" style={{ padding: "6px 12px", textDecoration: "none", fontSize: 12, borderRadius: 4 }}>
                  🚪 Enter
                </Link>
                <button 
                  onClick={() => setEditingStoreId(s.id)} 
                  disabled={loadingId === s.id} 
                  className="co-btn-secondary" 
                  style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "transparent" }}
                >
                  ✏️
                </button>
                <button 
                  onClick={() => openConfirm(s.isActive ? "pause" : "resume", s.id, s.storeName)} 
                  disabled={loadingId === s.id} 
                  className="co-btn-secondary" 
                  style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "transparent" }}
                >
                  {s.isActive ? "⏸️" : "▶️"}
                </button>
                <button 
                  onClick={() => openConfirm("delete", s.id, s.storeName)} 
                  disabled={loadingId === s.id} 
                  className="co-btn-danger" 
                  style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--danger)", color: "var(--danger)", background: "transparent" }}
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Store Modal */}
      {editingStoreId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
           <div style={{ background: "var(--card-bg)", padding: 24, borderRadius: 8, minWidth: 400 }}>
             <EditStoreForm storeId={editingStoreId} onClose={() => setEditingStoreId(null)} />
           </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
          <div className="co-card" style={{ width: 340, padding: 24, textAlign: "center", border: "1px solid var(--border)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>
              {confirmDialog.type === "delete" ? "🗑️" : confirmDialog.type === "pause" ? "⏸️" : "▶️"}
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "var(--text-primary)" }}>
              {confirmDialog.type === "delete" ? "Delete Store?" : confirmDialog.type === "pause" ? "Pause Store?" : "Resume Store?"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.5 }}>
              {confirmDialog.type === "delete" 
                ? `Are you sure you want to permanently delete "${confirmDialog.storeName}"? This action cannot be undone.` 
                : `Are you sure you want to ${confirmDialog.type} operations for "${confirmDialog.storeName}"?`}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button 
                type="button" 
                onClick={() => setConfirmDialog({ isOpen: false, type: null, storeId: null, storeName: "" })} 
                className="co-btn co-btn-ghost"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={executeAction} 
                className={confirmDialog.type === "delete" ? "co-btn co-btn-danger" : "co-btn co-btn-primary"}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}