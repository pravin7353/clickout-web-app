"use client";

import { useState, useMemo, useTransition } from "react";
import { QuantumPromotionProduct, SupplierRow } from "@/lib/services/po-service";
import { OfferCreationModal } from "@/components/offer-creation-modal";
import { CreatePoModal } from "@/components/create-po-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { removeProductOffer, blockProductBatch } from "@/actions/procurement";
import { useRouter } from "next/navigation";

export function QuantumPromotionEngine({
  products,
  suppliers,
  branchCode,
  canEdit = false,
}: {
  products: QuantumPromotionProduct[];
  suppliers: SupplierRow[];
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState<"Trending" | "Expiry" | "Stock" | "ATL" | "Offers">("Trending");

  // Modals state
  const [selectedProductForOffer, setSelectedProductForOffer] = useState<QuantumPromotionProduct | null>(null);
  const [selectedProductForPo, setSelectedProductForPo] = useState<QuantumPromotionProduct | null>(null);
  const [productToRemoveOffer, setProductToRemoveOffer] = useState<QuantumPromotionProduct | null>(null);
  const [productToBlock, setProductToBlock] = useState<QuantumPromotionProduct | null>(null);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Sorting & Filtering
  const processedProducts = useMemo(() => {
    let list = [...products];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.clearanceType && p.clearanceType.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (selectedSort === "Trending") {
        // High sales first
        if (b.sevenDaySales !== a.sevenDaySales) return b.sevenDaySales - a.sevenDaySales;
        return a.stock - b.stock;
      }
      if (selectedSort === "ATL") {
        // Low sales first (Dead stock / slow movers to clear)
        if (a.sevenDaySales !== b.sevenDaySales) return a.sevenDaySales - b.sevenDaySales;
        return b.stock - a.stock;
      }
      if (selectedSort === "Stock") {
        return a.stock - b.stock;
      }
      if (selectedSort === "Expiry") {
        return a.daysLeft - b.daysLeft;
      }
      if (selectedSort === "Offers") {
        const aHas = a.clearanceActive ? 1 : 0;
        const bHas = b.clearanceActive ? 1 : 0;
        return bHas - aHas;
      }
      return 0;
    });

    return list;
  }, [products, searchQuery, selectedSort]);

  function handleConfirmRemoveOffer() {
    if (!productToRemoveOffer) return;
    startTransition(async () => {
      await removeProductOffer(productToRemoveOffer.productId);
      setProductToRemoveOffer(null);
      router.refresh();
    });
  }

  function handleConfirmBlockProduct() {
    if (!productToBlock) return;
    startTransition(async () => {
      await blockProductBatch(productToBlock.productId);
      setProductToBlock(null);
      router.refresh();
    });
  }

  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 24,
        border: "1px solid var(--border)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
        padding: "24px 28px",
        marginBottom: 36,
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "color-mix(in srgb, var(--accent-orange) 15%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              color: "var(--accent-orange)",
            }}
          >
            ⚛️
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  margin: 0,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                Quantum Promotion Engine 🌌
              </h3>
              <span
                title="Smart AI-driven promotion engine. Analyzes 7-day sales and expiration to recommend clearance offers and reorders."
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "1px solid var(--text-secondary)",
                  color: "var(--text-secondary)",
                  fontSize: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "help",
                }}
              >
                i
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "3px 0 0 0" }}>
              Intelligent inventory velocity, 9 offer algorithms, and instant reorder dispatch
            </p>
          </div>
        </div>

        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--danger)",
              background: "transparent",
              color: "var(--danger)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✕ Clear Filter
          </button>
        )}
      </div>

      {/* Search and Sort Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        {/* Search */}
        <div
          style={{
            flex: "1 1 300px",
            display: "flex",
            alignItems: "center",
            background: "var(--scaffold-bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "0 14px",
            height: 48,
          }}
        >
          <span style={{ fontSize: 15, color: "var(--text-secondary)", marginRight: 10 }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Product by Name or Barcode..."
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </div>

        {/* Sort Pill Buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { key: "Trending", label: "🔥 Trending" },
              { key: "ATL", label: "📉 Dead Stock (ATL)" },
              { key: "Expiry", label: "⏳ Expiry" },
              { key: "Stock", label: "📦 Low Stock" },
              { key: "Offers", label: "🏷️ Active Offers" },
            ] as const
          ).map((tab) => {
            const active = selectedSort === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedSort(tab.key)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: active ? 800 : 600,
                  background: active
                    ? "color-mix(in srgb, var(--accent-orange) 20%, var(--scaffold-bg))"
                    : "var(--scaffold-bg)",
                  color: active ? "var(--accent-orange)" : "var(--text-secondary)",
                  border: active
                    ? "1px solid var(--accent-orange)"
                    : "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Table */}
      {processedProducts.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 16px",
            background: "var(--scaffold-bg)",
            borderRadius: 16,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            {searchQuery ? `No products match "${searchQuery}"` : "Radar is Clear!"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            All inventory items are currently in balanced velocity.
          </div>
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--scaffold-bg)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                  PRODUCT/SERVICE INFO
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                  EXPIRY STATUS
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                  OFFER STATUS
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                  STOCK
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.04em", textAlign: "right" }}>
                  ACTION
                </th>
              </tr>
            </thead>
            <tbody>
              {processedProducts.map((p, idx) => {
                const isLowStock = p.stock <= 20;
                return (
                  <tr
                    key={p.productId}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: idx % 2 === 0 ? "var(--scaffold-bg)" : "var(--card-bg)",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* Product Info */}
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                          {p.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                          <span style={{ color: "var(--accent-orange)", fontWeight: 700 }}>
                            7-Day Sales: {p.sevenDaySales}
                          </span>
                          <span style={{ color: "var(--text-secondary)" }}>•</span>
                          <span style={{ color: "var(--success)", fontWeight: 700 }}>
                            Price: ₹{p.price.toFixed(0)}
                          </span>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setProductToBlock(p)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "var(--text-secondary)",
                              fontSize: 10,
                              fontStyle: "italic",
                              cursor: "pointer",
                              textAlign: "left",
                              marginTop: 2,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                          >
                            👉 Click to Block Batch
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Expiry Status */}
                    <td style={{ padding: "14px 18px" }}>
                      {p.isDead ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                            color: "var(--danger)",
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.03em",
                          }}
                        >
                          🚨 DEAD STOCK
                        </span>
                      ) : p.daysLeft <= 7 ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "color-mix(in srgb, var(--warning) 15%, transparent)",
                            color: "var(--warning)",
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.03em",
                          }}
                        >
                          ⚠️ EXPIRES: T-{p.daysLeft}d
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "color-mix(in srgb, #06b6d4 15%, transparent)",
                            color: "#06b6d4",
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.03em",
                          }}
                        >
                          ✔ SAFE
                        </span>
                      )}
                    </td>

                    {/* Offer Status (The Offer Engine!) */}
                    <td style={{ padding: "14px 18px" }}>
                      {p.clearanceActive ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "color-mix(in srgb, var(--success) 12%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)",
                            color: "var(--success)",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <span>🏷️ {p.offerDisplayName || "OFFER ACTIVE"}</span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setProductToRemoveOffer(p)}
                              title="Remove Offer"
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: "50%",
                                background: "color-mix(in srgb, var(--success) 20%, transparent)",
                                border: "none",
                                color: "var(--success)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        canEdit && (
                          <button
                            type="button"
                            onClick={() => setSelectedProductForOffer(p)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 14px",
                              borderRadius: 8,
                              background: "color-mix(in srgb, var(--accent-orange) 10%, transparent)",
                              border: "1px solid color-mix(in srgb, var(--accent-orange) 45%, transparent)",
                              color: "var(--accent-orange)",
                              fontSize: 11,
                              fontWeight: 900,
                              letterSpacing: "0.03em",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--accent-orange)";
                              e.currentTarget.style.color = "#FFFFFF";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "color-mix(in srgb, var(--accent-orange) 10%, transparent)";
                              e.currentTarget.style.color = "var(--accent-orange)";
                            }}
                          >
                            <span>🏷️</span>
                            <span>APPLY OFFER</span>
                          </button>
                        )
                      )}
                    </td>

                    {/* Stock */}
                    <td style={{ padding: "14px 18px" }}>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: isLowStock ? "var(--danger)" : "var(--text-primary)",
                        }}
                      >
                        {p.stock}
                      </span>
                    </td>

                    {/* Action: RAISE PO */}
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setSelectedProductForPo(p)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 14px",
                            borderRadius: 8,
                            background: "color-mix(in srgb, var(--success) 12%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--success) 45%, transparent)",
                            color: "var(--success)",
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--success)";
                            e.currentTarget.style.color = "#000000";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "color-mix(in srgb, var(--success) 12%, transparent)";
                            e.currentTarget.style.color = "var(--success)";
                          }}
                        >
                          <span>🛒</span>
                          <span>RAISE PO</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>View-only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Offer Creation Modal */}
      {selectedProductForOffer && (
        <OfferCreationModal
          product={selectedProductForOffer}
          allProducts={products}
          onClose={() => setSelectedProductForOffer(null)}
        />
      )}

      {/* Raise PO Modal */}
      {selectedProductForPo && (
        <CreatePoModal
          product={selectedProductForPo}
          suppliers={suppliers}
          branchCode={branchCode}
          onClose={() => setSelectedProductForPo(null)}
        />
      )}

      {/* Remove Offer In-App Confirmation (NO browser popup!) */}
      <ConfirmModal
        isOpen={!!productToRemoveOffer}
        title="Remove Offer?"
        message={`Are you sure you want to deactivate the active offer on '${productToRemoveOffer?.name}'? Customers will no longer receive this promotion.`}
        confirmLabel="Remove Offer"
        cancelLabel="Cancel"
        variant="danger"
        isPending={isPending}
        onConfirm={handleConfirmRemoveOffer}
        onCancel={() => setProductToRemoveOffer(null)}
      />

      {/* Block Item In-App Confirmation (NO browser popup!) */}
      <ConfirmModal
        isOpen={!!productToBlock}
        title="Block Product Batch?"
        message={`Are you sure you want to block '${productToBlock?.name}' from sale and inventory operations? This will prevent cashiers from scanning it.`}
        confirmLabel="Block Item"
        cancelLabel="Cancel"
        variant="danger"
        isPending={isPending}
        onConfirm={handleConfirmBlockProduct}
        onCancel={() => setProductToBlock(null)}
      />
    </div>
  );
}
