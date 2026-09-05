"use client";

import { useState, useTransition, useMemo } from "react";
import { Modal } from "@/components/profile-menu";
import { applyProductOffer } from "@/actions/procurement";
import { QuantumPromotionProduct } from "@/lib/services/po-service";
import { CustomSelect, OptionItem } from "@/components/custom-select";
import { useRouter } from "next/navigation";

const OFFER_TYPES: OptionItem[] = [
  { value: "PERCENTAGE", label: "Flat % Discount", icon: "％" },
  { value: "FLAT_AMOUNT", label: "Flat ₹ Amount Off", icon: "₹" },
  { value: "BOGO", label: "Buy 1 Get 1 Free (Same Item)", icon: "🎁" },
  { value: "BUY_X_GET_Y", label: "Buy X Get Y Free (Same Item)", icon: "📦" },
  { value: "BUY_X_GET_Y_CROSS", label: "Buy X Get Y Free (Different Item)", icon: "🔄" },
  { value: "TIERED_QTY", label: "Tiered Discount (Buy X get Y% off)", icon: "📊" },
  { value: "BUNDLE_PRICE", label: "Fixed Bundle Price (Any X for ₹Y)", icon: "🛍️" },
  { value: "FLASH_SALE", label: "Flash Sale (Limited Time)", icon: "⚡" },
  { value: "CROSS_PRODUCT", label: "Cross-Product (Buy this, get % off that)", icon: "🔗" },
];

export function OfferCreationModal({
  product,
  allProducts,
  onClose,
}: {
  product: QuantumPromotionProduct;
  allProducts: QuantumPromotionProduct[];
  onClose: () => void;
}) {
  const [selectedType, setSelectedType] = useState<string>("PERCENTAGE");
  const [val1, setVal1] = useState<string>("10");
  const [val2, setVal2] = useState<string>("1");
  const [targetProductId, setTargetProductId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const targetProductOptions: OptionItem[] = useMemo(() => {
    return allProducts
      .filter((p) => p.productId !== product.productId)
      .map((p) => ({
        value: p.productId,
        label: `${p.name} (₹${p.price})`,
        icon: "🏷️",
      }));
  }, [allProducts, product.productId]);

  const targetProduct = allProducts.find((p) => p.productId === targetProductId);

  // Live preview calculation
  const livePreview = useMemo(() => {
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;
    const price = product.price;

    switch (selectedType) {
      case "PERCENTAGE": {
        const finalPrice = Math.max(0, price * (1 - v1 / 100));
        return {
          badge: `${v1}% OFF`,
          desc: `Customer saves ₹${(price - finalPrice).toFixed(0)}. Final Price: ₹${finalPrice.toFixed(0)}`,
        };
      }
      case "FLAT_AMOUNT": {
        const finalPrice = Math.max(0, price - v1);
        return {
          badge: `₹${v1} OFF`,
          desc: `Flat ₹${v1} discount. Customer pays ₹${finalPrice.toFixed(0)}`,
        };
      }
      case "BOGO":
        return {
          badge: "BUY 1 GET 1 FREE",
          desc: `Customer adds 2 to cart, pays for only 1 (Save ₹${price.toFixed(0)})`,
        };
      case "BUY_X_GET_Y":
        return {
          badge: `BUY ${v1 || 2} GET ${v2 || 1} FREE`,
          desc: `Customer buys ${v1 || 2} units of ${product.name} and gets ${v2 || 1} unit(s) free`,
        };
      case "BUY_X_GET_Y_CROSS":
        return {
          badge: `BUY ${v1 || 1} GET ${targetProduct?.name ?? "ITEM"} FREE`,
          desc: `Buy ${v1 || 1} ${product.name}, get ${v2 || 1} ${targetProduct?.name ?? "Target Item"} free`,
        };
      case "TIERED_QTY":
        return {
          badge: `BUY ${v1 || 3}+ GET ${v2 || 15}% OFF`,
          desc: `Bulk discount: Purchase ${v1 || 3} or more units to unlock ${v2 || 15}% off each`,
        };
      case "BUNDLE_PRICE":
        return {
          badge: `${v1 || 2} FOR ₹${v2 || price * 1.5}`,
          desc: `Bundle special: Any ${v1 || 2} units for a flat ₹${v2 || price * 1.5}`,
        };
      case "FLASH_SALE": {
        const finalPrice = Math.max(0, price * (1 - v1 / 100));
        return {
          badge: `FLASH ${v1}% OFF (${v2 || 24}h)`,
          desc: `Time-limited: ${v1}% off for the next ${v2 || 24} hours. Final: ₹${finalPrice.toFixed(0)}`,
        };
      }
      case "CROSS_PRODUCT":
        return {
          badge: `CROSS DEAL: ${v1}% OFF ${targetProduct?.name ?? "ITEM"}`,
          desc: `Purchase ${product.name} to get ${v1}% discount on ${targetProduct?.name ?? "selected item"}`,
        };
      default:
        return { badge: "PROMOTION OFFER", desc: "Special store promotion" };
    }
  }, [selectedType, val1, val2, product, targetProduct]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const payloadData: Record<string, any> = {};
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;

    if (selectedType !== "BOGO" && v1 <= 0 && selectedType !== "CROSS_PRODUCT") {
      setError("Please enter a valid primary discount or quantity value.");
      return;
    }

    if (selectedType === "BOGO") {
      payloadData.active = true;
      payloadData.buyQty = 1;
      payloadData.freeQty = 1;
    } else if (selectedType === "PERCENTAGE") {
      payloadData.discountPercent = v1;
      payloadData.value1 = v1;
    } else if (selectedType === "FLAT_AMOUNT") {
      payloadData.discountAmount = v1;
      payloadData.value1 = v1;
    } else if (selectedType === "BUY_X_GET_Y") {
      payloadData.buyQty = Math.max(1, Math.round(v1));
      payloadData.freeQty = Math.max(1, Math.round(v2 || 1));
      payloadData.value1 = payloadData.buyQty;
      payloadData.value2 = payloadData.freeQty;
    } else if (selectedType === "BUY_X_GET_Y_CROSS") {
      if (!targetProductId) {
        setError("Please select the target product to give as a free gift.");
        return;
      }
      payloadData.buyQty = Math.max(1, Math.round(v1));
      payloadData.freeQty = Math.max(1, Math.round(v2 || 1));
      payloadData.value1 = payloadData.buyQty;
      payloadData.value2 = payloadData.freeQty;
      payloadData.targetProductId = targetProductId;
      payloadData.targetProductName = targetProduct?.name ?? "Gift Item";
    } else if (selectedType === "TIERED_QTY") {
      payloadData.minQty = Math.max(2, Math.round(v1));
      payloadData.discountPercent = v2 || 10;
      payloadData.value1 = payloadData.minQty;
      payloadData.value2 = payloadData.discountPercent;
    } else if (selectedType === "BUNDLE_PRICE") {
      payloadData.bundleQty = Math.max(2, Math.round(v1));
      payloadData.bundlePrice = v2;
      payloadData.value1 = payloadData.bundleQty;
      payloadData.value2 = payloadData.bundlePrice;
    } else if (selectedType === "FLASH_SALE") {
      payloadData.discountPercent = v1;
      payloadData.durationHours = Math.max(1, Math.round(v2 || 24));
      payloadData.value1 = v1;
      payloadData.value2 = payloadData.durationHours;
    } else if (selectedType === "CROSS_PRODUCT") {
      if (!targetProductId) {
        setError("Please select the complementary product for the discount.");
        return;
      }
      payloadData.discountPercent = v1 || 20;
      payloadData.value1 = payloadData.discountPercent;
      payloadData.targetProductId = targetProductId;
      payloadData.targetProductName = targetProduct?.name ?? "Cross Product";
    }

    startTransition(async () => {
      const res = await applyProductOffer({
        productId: product.productId,
        offerType: selectedType,
        data: payloadData,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to apply offer.");
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
          width: 640,
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
                background: "color-mix(in srgb, var(--accent-orange) 15%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                border: "1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)",
              }}
            >
              🏷️
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
                Configure Quantum Offer
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                Applying offer for: <strong style={{ color: "var(--text-primary)" }}>{product.name}</strong> (Base: ₹{product.price.toFixed(2)})
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

            {/* Offer Type Dropdown */}
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
                PROMOTION / CLEARANCE ALGORITHM
              </label>
              <CustomSelect
                value={selectedType}
                onChange={(val) => {
                  setSelectedType(val);
                  if (val === "PERCENTAGE" || val === "FLASH_SALE") setVal1("20");
                  else if (val === "FLAT_AMOUNT") setVal1("10");
                  else if (val === "BUY_X_GET_Y") {
                    setVal1("2");
                    setVal2("1");
                  } else if (val === "TIERED_QTY") {
                    setVal1("3");
                    setVal2("15");
                  } else if (val === "BUNDLE_PRICE") {
                    setVal1("2");
                    setVal2(String(product.price * 1.6));
                  }
                }}
                options={OFFER_TYPES}
                prefixIcon="⚡"
              />
            </div>

            {/* Dynamic Inputs based on type */}
            {selectedType !== "BOGO" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    selectedType === "BUY_X_GET_Y" ||
                    selectedType === "BUY_X_GET_Y_CROSS" ||
                    selectedType === "TIERED_QTY" ||
                    selectedType === "BUNDLE_PRICE" ||
                    selectedType === "FLASH_SALE"
                      ? "1fr 1fr"
                      : "1fr",
                  gap: 16,
                }}
              >
                {/* Val1 */}
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
                    {selectedType === "PERCENTAGE" && "DISCOUNT PERCENTAGE (%)"}
                    {selectedType === "FLAT_AMOUNT" && "FLAT DISCOUNT AMOUNT (₹)"}
                    {(selectedType === "BUY_X_GET_Y" || selectedType === "BUY_X_GET_Y_CROSS") &&
                      "BUY QUANTITY (X)"}
                    {selectedType === "TIERED_QTY" && "MINIMUM QUANTITY (X)"}
                    {selectedType === "BUNDLE_PRICE" && "BUNDLE QUANTITY (X)"}
                    {selectedType === "FLASH_SALE" && "DISCOUNT PERCENTAGE (%)"}
                    {selectedType === "CROSS_PRODUCT" && "DISCOUNT ON TARGET ITEM (%)"}
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
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={val1}
                      onChange={(e) => setVal1(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        padding: "11px 0",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                {/* Val2 */}
                {(selectedType === "BUY_X_GET_Y" ||
                  selectedType === "BUY_X_GET_Y_CROSS" ||
                  selectedType === "TIERED_QTY" ||
                  selectedType === "BUNDLE_PRICE" ||
                  selectedType === "FLASH_SALE") && (
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
                      {(selectedType === "BUY_X_GET_Y" || selectedType === "BUY_X_GET_Y_CROSS") &&
                        "FREE QUANTITY (Y)"}
                      {selectedType === "TIERED_QTY" && "DISCOUNT PERCENT (%)"}
                      {selectedType === "BUNDLE_PRICE" && "BUNDLE PRICE (₹)"}
                      {selectedType === "FLASH_SALE" && "DURATION (HOURS)"}
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
                      <input
                        type="number"
                        step="any"
                        min="1"
                        value={val2}
                        onChange={(e) => setVal2(e.target.value)}
                        required
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          padding: "11px 0",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Target Product selector for Cross Product deals */}
            {(selectedType === "CROSS_PRODUCT" || selectedType === "BUY_X_GET_Y_CROSS") && (
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
                  TARGET PROMOTIONAL PRODUCT
                </label>
                <CustomSelect
                  value={targetProductId}
                  onChange={(val) => setTargetProductId(val)}
                  options={targetProductOptions}
                  placeholder="Select complementary item..."
                  prefixIcon="🎁"
                />
              </div>
            )}

            {/* Live Visual Preview Card */}
            <div
              style={{
                background: "color-mix(in srgb, var(--accent-orange) 8%, var(--scaffold-bg))",
                border: "1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)",
                borderRadius: 14,
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--accent-orange)",
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                }}
              >
                {livePreview.badge}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Customer Live Experience
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {livePreview.desc}
                </div>
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
                background: "var(--accent-orange)",
                border: "none",
                color: "#FFFFFF",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 2px 8px color-mix(in srgb, var(--accent-orange) 35%, transparent)",
              }}
            >
              {isPending ? "Applying..." : "✓ Activate Offer"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
