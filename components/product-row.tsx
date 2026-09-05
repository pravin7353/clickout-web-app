"use client";

import { useState, useTransition } from "react";
import { LedgerRow } from "@/lib/services/inventory-service";
import { Badge } from "@/components/ui";
import { BlockBatchButton } from "@/components/block-batch-button";
import { EditProductModal } from "@/components/edit-product-modal";
import { deleteProduct } from "@/actions/inventory";
import { useRouter } from "next/navigation";

export function ProductRow({
  row,
  canEdit,
}: {
  row: LedgerRow;
  canEdit: boolean;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (confirm(`Are you sure you want to delete product "${row.name}" (${row.barcode})?`)) {
      startTransition(async () => {
        const res = await deleteProduct(row.productId);
        if (!res.ok) alert(res.error);
        else router.refresh();
      });
    }
  }

  return (
    <tr
        style={{
          borderBottom: "1px solid var(--border)",
          opacity: row.isBlocked ? 0.5 : 1,
          background: row.isBlocked
            ? "color-mix(in srgb, var(--danger) 5%, transparent)"
            : "transparent",
          transition: "background 0.12s ease",
        }}
      >
        {/* BARCODE */}
        <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "var(--text-primary)", fontWeight: 700 }}>
          {row.barcode || "N/A"}
        </td>

        {/* PRODUCT NAME */}
        <td style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
          {row.name}
          {row.weight && (
            <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-secondary)", fontWeight: 400 }}>
              ({row.weight})
            </span>
          )}
        </td>

        {/* PRICE */}
        <td style={{ padding: "14px 16px", color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>
          ₹{row.price.toFixed(2)}
        </td>

        {/* UNIT COST */}
        <td style={{ padding: "14px 16px", color: "var(--success)", fontWeight: 600, fontSize: 13 }}>
          ₹{row.unitCost.toFixed(2)}
        </td>

        {/* OPENING */}
        <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 13 }}>
          {row.openingStock}
        </td>

        {/* PURCHASED */}
        <td style={{ padding: "14px 16px", color: "var(--success)", fontWeight: 600, fontSize: 13 }}>
          +{row.purchasedStock}
        </td>

        {/* SOLD */}
        <td style={{ padding: "14px 16px", color: "var(--text-primary)", fontWeight: 600, fontSize: 13 }}>
          -{row.soldStock}
        </td>

        {/* CLOSING */}
        <td
          style={{
            padding: "14px 16px",
            fontWeight: 800,
            fontSize: 13,
            color: row.closingStock < 10 ? "var(--danger)" : "var(--text-primary)",
          }}
        >
          {row.closingStock} Units
        </td>

        {/* STATUS */}
        <td style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {row.isBlocked && <Badge color="var(--danger)">BLOCKED</Badge>}
            {row.isDeadStock && <Badge color="var(--warning)">DEAD STOCK</Badge>}
            {!row.isBlocked && !row.isDeadStock && (
              <Badge color={row.closingStock < 10 ? "var(--warning)" : "var(--success)"}>
                {row.closingStock < 10 ? "LOW STOCK" : "ACTIVE"}
              </Badge>
            )}
          </div>
        </td>

        {/* ACTIONS */}
        <td style={{ padding: "14px 16px" }}>
          {canEdit ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Prominent Edit Button */}
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                disabled={isPending}
                style={{
                  background: "color-mix(in srgb, var(--cta-bg-accent) 14%, transparent)",
                  color: "var(--cta-bg-accent)",
                  border: "1px solid color-mix(in srgb, var(--cta-bg-accent) 35%, transparent)",
                  padding: "5px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s ease",
                }}
                title="Edit Master SKU"
              >
                <span>✏️</span>
                <span>Edit</span>
              </button>

              {/* Block/Unblock Button */}
              <BlockBatchButton productId={row.productId} isBlocked={row.isBlocked} />

              {/* Delete Button */}
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                style={{
                  background: "transparent",
                  color: "var(--danger)",
                  border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                  padding: "5px 9px",
                  borderRadius: 10,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="Delete Product"
              >
                🗑️
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>View-only</span>
          )}

          {/* Edit Product Modal */}
          {showEdit && (
            <EditProductModal product={row} onClose={() => setShowEdit(false)} />
          )}
        </td>
      </tr>
  );
}
