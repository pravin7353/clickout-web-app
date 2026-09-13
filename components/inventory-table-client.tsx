"use client";

import { useState, useTransition } from "react";
import { LedgerRow } from "@/lib/services/inventory-service";
import { ProductRow } from "@/components/product-row";
import { bulkDeleteProducts, bulkBlockBatches } from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

interface InventoryTableClientProps {
  paginatedLedger: LedgerRow[];
  canEdit: boolean;
}

export function InventoryTableClient({
  paginatedLedger,
  canEdit,
}: InventoryTableClientProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const currentPageIds = paginatedLedger.map((r) => r.productId);
  const isAllSelected =
    paginatedLedger.length > 0 &&
    currentPageIds.every((id) => selectedIds.includes(id));

  function handleToggleAll() {
    if (isAllSelected) {
      // Unselect only the items on the current page
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      // Select all items on the current page
      const nextSet = new Set(selectedIds);
      currentPageIds.forEach((id) => nextSet.add(id));
      setSelectedIds(Array.from(nextSet));
    }
  }

  function handleToggleRow(productId: string) {
    setSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }

  function handleClear() {
    setSelectedIds([]);
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (
      confirm(
        `Delete ${selectedIds.length} products? This cannot be undone.`
      )
    ) {
      startTransition(async () => {
        const res = await bulkDeleteProducts(selectedIds);
        if (!res.ok && res.errors.length > 0) {
          alert(`Bulk delete encountered issues:\n${res.errors.join("\n")}`);
        }
        setSelectedIds([]);
        router.refresh();
      });
    }
  }

  function handleBulkBlock() {
    if (selectedIds.length === 0) return;
    if (
      confirm(
        `Block batch for ${selectedIds.length} selected products?`
      )
    ) {
      startTransition(async () => {
        const res = await bulkBlockBatches(selectedIds);
        if (!res.ok && res.errors.length > 0) {
          alert(`Bulk block encountered issues:\n${res.errors.join("\n")}`);
        }
        setSelectedIds([]);
        router.refresh();
      });
    }
  }

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  background: "var(--card-bg)",
                }}
              >
                {canEdit && (
                  <th
                    style={{
                      padding: "12px 16px",
                      width: 40,
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleAll}
                      aria-label="Select all on this page"
                      style={{
                        cursor: "pointer",
                        width: 16,
                        height: 16,
                        accentColor: "var(--cta-bg-accent, #F9A826)",
                      }}
                    />
                  </th>
                )}
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>BARCODE</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PRODUCT NAME</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PRICE</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>UNIT COST</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>OPENING</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>PURCHASED</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>SOLD</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>CLOSING</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>STATUS</th>
                <th style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLedger.map((row) => (
                <ProductRow
                  key={row.productId}
                  row={row}
                  canEdit={canEdit}
                  isSelected={selectedIds.includes(row.productId)}
                  onToggleSelect={() => handleToggleRow(row.productId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Bulk Action Bar */}
      {canEdit && selectedIds.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.45)",
            borderRadius: 16,
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            zIndex: 90,
            backdropFilter: "blur(16px)",
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                background: "var(--cta-bg-accent, #F9A826)",
                color: "#0A0A0A",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {selectedIds.length}
            </span>
            selected
          </span>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={handleBulkBlock}
            style={{
              background: "color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)",
              color: "var(--warning, #f59e0b)",
              border: "1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent)",
              borderRadius: 10,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🛡️ Block Batch
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={handleBulkDelete}
            style={{
              background: "color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)",
              color: "var(--danger, #ef4444)",
              border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)",
              borderRadius: 10,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🗑️ Delete
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={handleClear}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              padding: "4px 8px",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}
