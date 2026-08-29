"use client";

import { useTransition } from "react";
import { approveAiSuggestion, rejectAiSuggestion, approvePO } from "@/actions/procurement";
import { AiSuggestion, PORow } from "@/lib/services/po-service";
import { useRouter } from "next/navigation";

export function POList({ suggestions, pos }: { suggestions: AiSuggestion[]; pos: PORow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function approve(id: string) {
    startTransition(async () => { await approveAiSuggestion(id); router.refresh(); });
  }
  function reject(id: string) {
    startTransition(async () => { await rejectAiSuggestion(id); router.refresh(); });
  }
  function approvePurchaseOrder(id: string) {
    startTransition(async () => { await approvePO(id); router.refresh(); });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>AI Reorder Suggestions</h1>

      {suggestions.length === 0 ? (
        <p style={{ color: "#888" }}>No pending suggestions — AI hasn't flagged any low-stock items.</p>
      ) : (
        suggestions.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, border: "1px solid #333", borderRadius: 10, marginBottom: 10 }}>
            <div>
              <strong>{s.productName}</strong>
              <div style={{ fontSize: 12, color: "#888" }}>{s.supplierName} · {s.branchCode} · Qty: {s.suggestedQty}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => approve(s.id)} disabled={isPending} style={{ padding: "6px 14px", background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>Approve</button>
              <button onClick={() => reject(s.id)} disabled={isPending} style={{ padding: "6px 14px", background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6 }}>Reject</button>
            </div>
          </div>
        ))
      )}

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "32px 0 20px" }}>Purchase Orders</h1>
      {pos.length === 0 ? (
        <p style={{ color: "#888" }}>No purchase orders yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Supplier</th>
              <th style={{ padding: 10 }}>Items</th>
              <th style={{ padding: 10 }}>Value</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((po) => (
              <tr key={po.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: 10 }}>{po.supplierName}</td>
                <td style={{ padding: 10 }}>{po.totalItems}</td>
                <td style={{ padding: 10 }}>₹{po.totalOrderValue.toFixed(2)}</td>
                <td style={{ padding: 10 }}>{po.status}</td>
                <td style={{ padding: 10 }}>
                  {po.status === "DRAFT" && (
                    <button onClick={() => approvePurchaseOrder(po.id)} disabled={isPending} style={{ padding: "4px 12px", background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}