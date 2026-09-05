"use client";

import { useState, useTransition } from "react";
import { updateProduct } from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { LedgerRow } from "@/lib/services/inventory-service";
import { CustomSelect, OptionItem } from "@/components/custom-select";

const GST_OPTIONS: OptionItem[] = [
  { value: "0", label: "0% GST", icon: "📊" },
  { value: "5", label: "5% GST", icon: "📊" },
  { value: "12", label: "12% GST", icon: "📊" },
  { value: "18", label: "18% GST", icon: "📊" },
  { value: "28", label: "28% GST", icon: "📊" },
];

export function EditProductModal({
  product,
  onClose,
}: {
  product: LedgerRow;
  onClose: () => void;
}) {
  const [name, setName] = useState(product.name || "");
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [unitCost, setUnitCost] = useState(String(product.unitCost ?? ""));
  const [gst, setGst] = useState(product.gst || "0");
  const [weight, setWeight] = useState(product.weight || "");
  const [physicalStock, setPhysicalStock] = useState(String(product.physicalStock ?? product.closingStock ?? ""));
  const [expiryDate, setExpiryDate] = useState(product.expiryDate || "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Product Name is required.");
      return;
    }

    startTransition(async () => {
      const res = await updateProduct({
        productId: product.productId,
        barcode: product.barcode,
        name: name.trim(),
        price: parseFloat(price) || 0,
        unitCost: parseFloat(unitCost) || 0,
        gst,
        weight: weight.trim(),
        physicalStock: parseInt(physicalStock) || 0,
        expiryDate: expiryDate || null,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to update product.");
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal onClose={onClose}>
      <div
        style={{
          width: 720,
          maxWidth: "94vw",
          background: "var(--card-bg)",
          borderRadius: 24,
          border: "1px solid var(--border)",
          boxShadow: "0 28px 70px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
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
            background: "color-mix(in srgb, var(--card-bg) 94%, var(--scaffold-bg))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "color-mix(in srgb, var(--cta-bg-accent) 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                color: "var(--cta-bg-accent)",
                flexShrink: 0,
              }}
            >
              📝
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                Edit Master SKU
              </h3>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Update inventory specifications & pricing.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 18,
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {/* Barcode (Locked in Edit Mode) */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Barcode (Primary Key)
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "color-mix(in srgb, var(--card-bg) 60%, var(--scaffold-bg))",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                  opacity: 0.75,
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>🪪</span>
                <input
                  value={product.barcode}
                  disabled
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    cursor: "not-allowed",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>🔒 Locked</span>
              </div>
            </div>

            {/* Product Name */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Product Name *
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>📦</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Example: Tata Salt 1kg"
                  required
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                />
              </div>
            </div>

            {/* Selling Price */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Selling Price (₹) *
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>🏷️</span>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            {/* Unit Cost */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Unit Cost (₹) (APKA KHARIDI BHAV) *
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>🧾</span>
                <input
                  type="number"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            {/* Included GST Slab */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Included GST Slab
              </label>
              <CustomSelect
                value={gst}
                onChange={setGst}
                options={GST_OPTIONS}
                prefixIcon="📊"
              />
            </div>

            {/* Weight / Volume */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Weight / Volume
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>⚖️</span>
                <input
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="500g / 1L"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            {/* Physical Stock */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Physical Stock *
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>📦</span>
                <input
                  type="number"
                  value={physicalStock}
                  onChange={(e) => setPhysicalStock(e.target.value)}
                  placeholder="Units"
                  required
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "13px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            {/* Expiry Date */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                Expiry Date
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "0 14px",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--text-secondary)", marginRight: 10 }}>📅</span>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "12px 0",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🚨 {error}
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 14,
              marginTop: 6,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: "10px 18px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                background: "var(--cta-bg-accent)",
                color: "#000000",
                border: "none",
                borderRadius: 12,
                padding: "13px 32px",
                fontSize: 14,
                fontWeight: 900,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 3px 12px color-mix(in srgb, var(--cta-bg-accent) 35%, transparent)",
                transition: "all 0.15s ease",
              }}
            >
              <span>✓</span>
              <span>{isPending ? "Updating..." : "Update Master SKU"}</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
