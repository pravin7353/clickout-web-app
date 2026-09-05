"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/profile-menu";
import { createManualPO } from "@/actions/procurement";
import { QuantumPromotionProduct, SupplierRow } from "@/lib/services/po-service";
import { CustomSelect, OptionItem } from "@/components/custom-select";
import { useRouter } from "next/navigation";

export function CreatePoModal({
  product,
  suppliers,
  branchCode,
  onClose,
}: {
  product: QuantumPromotionProduct;
  suppliers: SupplierRow[];
  branchCode?: string | null;
  onClose: () => void;
}) {
  const [qty, setQty] = useState<string>("100");
  const [supplierId, setSupplierId] = useState<string>(
    suppliers.length > 0 ? suppliers[0].id : "DEFAULT_SUPPLIER"
  );
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const supplierOptions: OptionItem[] = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
    icon: "🏢",
    badge: s.categories || undefined,
  }));

  if (supplierOptions.length === 0) {
    supplierOptions.push({
      value: "DEFAULT_SUPPLIER",
      label: "General Wholesale Distributor",
      icon: "🏢",
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const orderQty = parseInt(qty, 10);
    if (isNaN(orderQty) || orderQty <= 0) {
      setError("Please specify a valid order quantity (> 0).");
      return;
    }

    startTransition(async () => {
      const res = await createManualPO(
        product.productId,
        orderQty,
        supplierId,
        branchCode ?? undefined
      );

      if (!res.ok) {
        setError(res.error ?? "Failed to create Purchase Order.");
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  const estCost = (parseFloat(qty) || 0) * (product.unitCost || product.price * 0.7);

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 540,
          maxWidth: "94vw",
          background: "var(--card-bg)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          boxShadow: "0 28px 70px rgba(0, 0, 0, 0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "color-mix(in srgb, var(--success) 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
              }}
            >
              🛒
            </div>
            <div>
              <h3
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  margin: "0 0 3px 0",
                  color: "var(--text-primary)",
                }}
              >
                Raise Purchase Order
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                Replenishing: <strong style={{ color: "var(--text-primary)" }}>{product.name}</strong> (Stock: {product.stock})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🚨 {error}
              </div>
            )}

            {/* Quantity */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                PURCHASE QUANTITY (UNITS) *
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 12px",
                }}
              >
                <span style={{ fontSize: 14, marginRight: 8 }}>📦</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: "11px 0",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Supplier Selection */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                PREFERRED DISTRIBUTOR / VENDOR
              </label>
              <CustomSelect
                value={supplierId}
                onChange={(val) => setSupplierId(val)}
                options={supplierOptions}
                prefixIcon="🏢"
              />
            </div>

            {/* Cost Breakdown */}
            <div
              style={{
                background: "color-mix(in srgb, var(--success) 8%, var(--scaffold-bg))",
                border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Estimated Order Value:
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Based on unit procurement cost (~₹{(product.unitCost || product.price * 0.7).toFixed(2)})
                </div>
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: "var(--success)",
                }}
              >
                ₹{estCost.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "18px 28px",
              borderTop: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
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
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 800,
                background: "var(--success)",
                border: "none",
                color: "#000000",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 8px color-mix(in srgb, var(--success) 35%, transparent)",
              }}
            >
              {isPending ? "Generating..." : "✓ Generate Purchase Order"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
