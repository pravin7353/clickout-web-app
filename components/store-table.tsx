"use client";

import { useState } from "react";
import Link from "next/link";
import { StoreRow } from "@/lib/services/store-service";
import { toggleStoreSuspension, removeStore } from "@/actions/store";
import { EditStoreForm } from "@/components/edit-store-form";

export function StoreTable({ stores }: { stores: StoreRow[] }) {
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggle = async (id: string, status: string) => {
    if (confirm(`Are you sure you want to ${status === "ACTIVE" ? "pause" : "resume"} this store?`)) {
      setLoadingId(id);
      await toggleStoreSuspension(id, status);
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this store? This action cannot be undone.")) {
      setLoadingId(id);
      await removeStore(id);
      setLoadingId(null);
    }
  };

  return (
    <div style={{ overflowX: "auto", background: "var(--card-bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
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
                <button onClick={() => setEditingStoreId(s.id)} disabled={loadingId === s.id} className="co-btn-secondary" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "transparent" }}>✏️</button>
                <button onClick={() => handleToggle(s.id, s.status)} disabled={loadingId === s.id} className="co-btn-secondary" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "transparent" }}>
                  {s.isActive ? "⏸️" : "▶️"}
                </button>
                <button onClick={() => handleDelete(s.id)} disabled={loadingId === s.id} className="co-btn-danger" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--danger)", color: "var(--danger)", background: "transparent" }}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingStoreId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
           <div style={{ background: "var(--card-bg)", padding: 24, borderRadius: 8, minWidth: 400 }}>
             <EditStoreForm storeId={editingStoreId} onClose={() => setEditingStoreId(null)} />
           </div>
        </div>
      )}
    </div>
  );
}