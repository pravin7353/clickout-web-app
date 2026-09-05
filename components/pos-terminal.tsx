"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import {
  searchProductByBarcode,
  searchProductsCatalog,
  fetchActivePosOffers,
  createPosOrder,
  CartItem,
  PosProduct,
} from "@/actions/pos";
import {
  applyOffers,
  buildCartGroups,
  ProductOffer,
  CartGroup,
} from "@/lib/services/offer-engine";
import { PrintReceipt, ReceiptData } from "@/components/print-receipt";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Input, Badge, ErrorBanner } from "@/components/ui";
import { FlashSaleCountdown } from "@/components/flash-sale-countdown";

export function PosTerminal({
  branchCode,
  canEdit = false,
}: {
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<PosProduct[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  const [activeOffers, setActiveOffers] = useState<ProductOffer[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [cart, setCart] = useState<CartItem[]>([]);
  const [instantDiscount, setInstantDiscount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Restore cart from localStorage on mount / branch switch (Parity with Flutter SharedPreferences)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const bKey = branchCode || "default";
      const savedCart = localStorage.getItem(`clickout_pos_cart_${bKey}`);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
      const savedDiscount = localStorage.getItem(`clickout_pos_discount_${bKey}`);
      if (savedDiscount) {
        setInstantDiscount(Number(savedDiscount) || 0);
      }
      const savedPhone = localStorage.getItem(`clickout_pos_phone_${bKey}`);
      if (savedPhone) {
        setCustomerPhone(savedPhone);
      }
    } catch (e) {
      console.error("Failed to restore POS cart from storage:", e);
    } finally {
      setIsStorageLoaded(true);
    }
  }, [branchCode]);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    if (!isStorageLoaded || typeof window === "undefined") return;
    const bKey = branchCode || "default";
    if (cart.length === 0) {
      localStorage.removeItem(`clickout_pos_cart_${bKey}`);
    } else {
      localStorage.setItem(`clickout_pos_cart_${bKey}`, JSON.stringify(cart));
    }
  }, [cart, isStorageLoaded, branchCode]);

  useEffect(() => {
    if (!isStorageLoaded || typeof window === "undefined") return;
    const bKey = branchCode || "default";
    if (instantDiscount === 0) {
      localStorage.removeItem(`clickout_pos_discount_${bKey}`);
    } else {
      localStorage.setItem(`clickout_pos_discount_${bKey}`, String(instantDiscount));
    }
  }, [instantDiscount, isStorageLoaded, branchCode]);

  useEffect(() => {
    if (!isStorageLoaded || typeof window === "undefined") return;
    const bKey = branchCode || "default";
    if (!customerPhone) {
      localStorage.removeItem(`clickout_pos_phone_${bKey}`);
    } else {
      localStorage.setItem(`clickout_pos_phone_${bKey}`, customerPhone);
    }
  }, [customerPhone, isStorageLoaded, branchCode]);

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Load active promotion engine offers whenever branch changes
  useEffect(() => {
    let cancelled = false;
    async function loadOffers() {
      try {
        const res = await fetchActivePosOffers(branchCode ?? undefined);
        if (!cancelled && res.ok && res.offers) {
          setActiveOffers(res.offers);
          if (res.stockMap) {
            setStockMap((prev) => ({ ...res.stockMap, ...prev }));
          }
        }
      } catch (e) {
        console.error("Failed to load active POS offers:", e);
      }
    }
    loadOffers();
    return () => {
      cancelled = true;
    };
  }, [branchCode]);

  // Load quick catalog items on mount or query change
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCatalog(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchProductsCatalog(catalogQuery, branchCode ?? undefined);
        if (!cancelled && res.ok) {
          setCatalogItems(res.products ?? []);
          // Populate stock map for offer engine stock guard
          setStockMap((prev) => {
            const next = { ...prev };
            for (const p of res.products ?? []) {
              if (p.barcode) next[p.barcode] = p.availableStock;
            }
            return next;
          });
        }
      } catch {
        // quiet error
      } finally {
        if (!cancelled) setIsLoadingCatalog(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [catalogQuery, branchCode]);

  function addToCart(p: PosProduct | { barcode: string; name: string; price: number; gst?: string; weight?: string }) {
    setError("");
    setCart((prev) => {
      const existing = prev.find((i) => i.barcode === p.barcode);
      if (existing) {
        return prev.map((i) =>
          i.barcode === p.barcode ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          barcode: p.barcode,
          name: p.name,
          price: p.price,
          originalPrice: (p as any).originalPrice ?? p.price,
          gst: p.gst ?? "0",
          weight: p.weight ?? "0",
          quantity: 1,
        },
      ];
    });
  }

  function handleScanBarcode(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    setError("");

    startTransition(async () => {
      const res = await searchProductByBarcode(barcodeInput.trim(), branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Product not found");
      } else if (res.product) {
        addToCart(res.product);
        if (res.product.barcode) {
          setStockMap((prev) => ({
            ...prev,
            [res.product.barcode]: res.product.availableStock,
          }));
        }
        setBarcodeInput("");
      }
    });
  }

  function updateQty(barcode: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.barcode === barcode ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  function removeItem(barcode: string) {
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));
  }

  function clearCart() {
    setCart([]);
    setInstantDiscount(0);
    setCustomerPhone("");
    setShowClearModal(false);
    if (typeof window !== "undefined") {
      const b = branchCode || "default";
      localStorage.removeItem(`clickout_pos_cart_${b}`);
      localStorage.removeItem(`clickout_pos_discount_${b}`);
      localStorage.removeItem(`clickout_pos_phone_${b}`);
    }
  }

  // ── DYNAMIC OFFER ENGINE CALCULATION (Real-time parity with Flutter & Customer App) ──
  const offerCalculation = useMemo(() => {
    if (cart.length === 0) {
      return {
        lines: [],
        updatedCartItems: {},
        totalRetailValue: 0,
        paidItemsSubtotal: 0,
        freeItemsWorth: 0,
        cashDiscount: 0,
        totalAppliedDiscount: 0,
        totalDiscount: 0,
        newGrandTotal: 0,
        grandTotal: 0,
        totalFreeItems: 0,
      };
    }
    return applyOffers(
      cart.map((i) => ({
        barcode: i.barcode,
        name: i.name,
        originalPrice: i.price,
        quantity: i.quantity,
        gst: i.gst,
        weight: i.weight,
      })),
      activeOffers,
      stockMap
    );
  }, [cart, activeOffers, stockMap]);

  // Group items by base barcode for consolidated display with free bonus badges & hints
  const cartGroups = useMemo(() => {
    return buildCartGroups(offerCalculation.lines);
  }, [offerCalculation.lines]);

  // Financial Breakdown with 100% mathematical consistency
  const totalRetailValue = offerCalculation.totalRetailValue;
  const paidItemsSubtotal = offerCalculation.paidItemsSubtotal;
  const freeItemsWorth = offerCalculation.freeItemsWorth;
  const cashDiscount = offerCalculation.cashDiscount;
  const engineDiscount = offerCalculation.totalAppliedDiscount;
  const afterEngineTotal = offerCalculation.newGrandTotal;
  const instantDiscountAmount = afterEngineTotal * (instantDiscount / 100);
  const netEstimatedTotal = Math.max(0, afterEngineTotal - instantDiscountAmount);
  const totalItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const freeItemsCount = offerCalculation.totalFreeItems;
  const totalSavings = engineDiscount + instantDiscountAmount;

  function handleCheckout() {
    if (cart.length === 0) return;
    setError("");
    setSuccess("");

    startTransition(async () => {
      const res = await createPosOrder({
        items: cart,
        paymentMode,
        customerPhone: customerPhone ? customerPhone.trim() : undefined,
        instantDiscountPercent: instantDiscount,
        targetBranchCode: branchCode ?? undefined,
      });

      if (!res.ok) {
        setError(res.error ?? "Checkout failed.");
      } else {
        const discountMsg = res.discountApplied && res.discountApplied > 0
          ? ` · Saved ₹${res.discountApplied.toFixed(0)}`
          : "";
        const freeMsg = res.freeItems && res.freeItems > 0
          ? ` · ${res.freeItems} free bonus item(s)!`
          : "";

        setSuccess(`✅ Sale complete! Invoice: ${res.invoiceNo}${discountMsg}${freeMsg}`);
        setCart([]);
        setInstantDiscount(0);
        setCustomerPhone("");
        if (typeof window !== "undefined") {
          const b = branchCode || "default";
          localStorage.removeItem(`clickout_pos_cart_${b}`);
          localStorage.removeItem(`clickout_pos_discount_${b}`);
          localStorage.removeItem(`clickout_pos_phone_${b}`);
        }
        if (res.receipt) {
          setReceipt(res.receipt as ReceiptData);
        }
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Scope banner if applicable */}
      {branchCode && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Active POS Location:</span>
          <Badge color="var(--primary)">{branchCode}</Badge>
        </div>
      )}

      {error && <ErrorBanner message={error} />}
      {success && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {/* Main Two-Column POS Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN: Barcode Entry & Product Catalog */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Quick Barcode Scanner Box */}
          <Card style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
              Barcode Scanner / Manual Code
            </h3>
            <form onSubmit={handleScanBarcode} style={{ display: "flex", gap: 8 }}>
              <Input
                placeholder="Scan barcode or enter digits..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
              />
              <Button type="submit" disabled={isPending || !barcodeInput.trim()}>
                {isPending ? "Adding..." : "Add"}
              </Button>
            </form>
          </Card>

          {/* Catalog Search & Fast-Tap Grid */}
          <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Product Catalog
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Tap item to add to bill
                </span>
              </div>
              <Input
                placeholder="Search by product name, barcode, or category..."
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
              />
            </div>

            {isLoadingCatalog ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Searching inventory...
              </div>
            ) : catalogItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                No products found matching &ldquo;{catalogQuery}&rdquo;.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 10,
                  maxHeight: 460,
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {catalogItems.map((p) => (
                  <div
                    key={p.barcode}
                    onClick={() => addToCart(p)}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "border-color 0.15s, transform 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          marginBottom: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={p.name}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {p.barcode}
                      </div>
                      {(p.offerDisplayName || (p.flashExpiry && p.flashExpiry > 0)) && (
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {p.offerDisplayName && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                                border: "1px solid rgba(245, 158, 11, 0.35)",
                                display: "inline-block",
                              }}
                            >
                              🏷️ {p.offerDisplayName}
                            </span>
                          )}
                          {p.flashExpiry && p.flashExpiry > 0 ? (
                            <FlashSaleCountdown expiryMs={p.flashExpiry} size="sm" />
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--success)" }}>
                        ₹{p.price.toFixed(0)}
                      </span>
                      <span style={{ fontSize: 11, color: p.availableStock < 5 ? "var(--warning)" : "var(--text-secondary)" }}>
                        {p.availableStock} in stock
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Current Bill & Checkout */}
        <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cart Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Current Cart
                </h2>
                {cartGroups.some((g) => g.flashExpiry && g.flashExpiry > 0) && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: "rgba(239, 68, 68, 0.12)",
                      color: "var(--danger, #EF4444)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: 12,
                      padding: "2px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ⚡ Flash Deal Active
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {totalItemCount} item{totalItemCount === 1 ? "" : "s"}
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Items List */}
          {cart.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: 14,
                border: "1px dashed var(--border)",
                borderRadius: 8,
              }}
            >
              Cart is empty — scan a barcode or click items to start billing.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
              {cartGroups.map((group) => {
                const isDiscounted = group.hasOffer && group.effectiveUnitPrice < group.originalPrice;
                return (
                  <div
                    key={group.baseKey}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: group.hasOffer ? "rgba(34, 197, 94, 0.03)" : "rgba(255, 255, 255, 0.02)",
                      border: group.hasOffer
                        ? "1px solid rgba(34, 197, 94, 0.3)"
                        : "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={group.name}
                        >
                          {group.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                          {isDiscounted && (
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "line-through" }}>
                              ₹{group.originalPrice.toFixed(2)}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: isDiscounted ? 700 : 400,
                              color: isDiscounted ? "var(--success)" : "var(--text-secondary)",
                            }}
                          >
                            ₹{group.effectiveUnitPrice.toFixed(2)} each
                          </span>
                          {group.offerType && group.hasOffer && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                background: "rgba(34, 197, 94, 0.15)",
                                color: "var(--success)",
                                border: "1px solid rgba(34, 197, 94, 0.3)",
                                borderRadius: 4,
                                padding: "1px 5px",
                              }}
                            >
                              {group.offerType}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => updateQty(group.baseKey, -1)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--card-bg)",
                            color: "var(--text-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 700, width: 24, textAlign: "center" }}>
                          {group.paidQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(group.baseKey, 1)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--card-bg)",
                            color: "var(--text-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          +
                        </button>
                      </div>

                      {/* Item Total */}
                      <div style={{ width: 85, textAlign: "right", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                        ₹{group.totalLinePrice.toFixed(2)}
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(group.baseKey)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          padding: "4px 8px",
                          marginLeft: 4,
                          fontSize: 14,
                        }}
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Dynamic Hint Banner (if partial offer) */}
                    {group.hint && (
                      <div
                        style={{
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          color: "#f59e0b",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>✨</span>
                        <span>{group.hint}</span>
                      </div>
                    )}

                    {/* Flash Sale Countdown Timer Badge */}
                    {group.flashExpiry && group.flashExpiry > 0 ? (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <FlashSaleCountdown
                          expiryMs={group.flashExpiry}
                          onExpire={() => {
                            setCart((prev) => [...prev]);
                          }}
                        />
                      </div>
                    ) : null}

                    {/* Free Promotional Item Badge */}
                    {group.freeItem && group.freeItem.quantity > 0 && (
                      <div
                        style={{
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: "rgba(34, 197, 94, 0.12)",
                          border: "1px solid rgba(34, 197, 94, 0.3)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--success)" }}>
                          <span>🎁</span>
                          <span>Promotional Bonus Item</span>
                        </div>
                        <span
                          style={{
                            background: "var(--success)",
                            color: "#000",
                            fontSize: 10,
                            fontWeight: 900,
                            padding: "2px 8px",
                            borderRadius: 12,
                          }}
                        >
                          +{group.freeItem.quantity} FREE
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pricing Controls & Settlement (Only when cart has items) */}
          {cart.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              {/* Customer Phone */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Customer Mobile (Optional)
                </label>
                <Input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              {/* Instant Offer Dropdown (Flutter Parity) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--warning)" }}>
                  Instant Manager Offer
                </span>
                <select
                  value={instantDiscount}
                  onChange={(e) => setInstantDiscount(Number(e.target.value))}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--warning)",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <option value={0}>No Discount</option>
                  <option value={5}>5% OFF</option>
                  <option value={10}>10% OFF</option>
                  <option value={15}>15% OFF</option>
                  <option value={20}>20% OFF</option>
                  <option value={25}>25% OFF</option>
                  <option value={30}>30% OFF</option>
                  <option value={40}>40% OFF</option>
                  <option value={50}>50% OFF</option>
                </select>
              </div>

              {/* Financial Breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(255, 255, 255, 0.02)", padding: 14, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" }}>
                  <span>Total Retail Value (MRP)</span>
                  <span>₹{totalRetailValue.toFixed(2)}</span>
                </div>

                {engineDiscount > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--success)", fontWeight: 700 }}>
                      <span>Promotion Discount (Offers)</span>
                      <span>- ₹{engineDiscount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(34, 197, 94, 0.8)", paddingLeft: 6 }}>
                      <span>
                        {freeItemsCount > 0 && `• ${freeItemsCount} Free Bonus Item(s) (₹${freeItemsWorth.toFixed(2)})`}
                        {freeItemsCount > 0 && cashDiscount > 0 && " + "}
                        {cashDiscount > 0 && `• Offer Price Drop (₹${cashDiscount.toFixed(2)})`}
                      </span>
                      <span>Applied</span>
                    </div>
                  </div>
                )}

                {instantDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--warning)", fontWeight: 600 }}>
                    <span>Instant Manager Offer ({instantDiscount}%)</span>
                    <span>- ₹{instantDiscountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 18,
                    fontWeight: 900,
                    color: "var(--text-primary)",
                    borderTop: "1px solid var(--border)",
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <span>GRAND TOTAL</span>
                  <span style={{ color: "var(--success)" }}>₹{netEstimatedTotal.toFixed(2)}</span>
                </div>

                {totalSavings > 0 && (
                  <div
                    style={{
                      marginTop: 2,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.25)",
                      color: "var(--success)",
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    🎉 Total Savings on this Bill: ₹{totalSavings.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Payment Method
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["CASH", "UPI", "CARD"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      style={{
                        padding: "10px 0",
                        borderRadius: 6,
                        border: paymentMode === mode ? "2px solid var(--primary)" : "1px solid var(--border)",
                        background: paymentMode === mode ? "rgba(59, 130, 246, 0.15)" : "var(--card-bg)",
                        color: paymentMode === mode ? "var(--primary)" : "var(--text-secondary)",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkout CTA */}
              <Button
                onClick={handleCheckout}
                disabled={isPending || !canEdit}
                style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800 }}
              >
                {!canEdit
                  ? "View-Only Mode (Checkouts Disabled)"
                  : isPending
                  ? "Processing Sale..."
                  : `Complete Sale (₹${netEstimatedTotal.toFixed(2)})`}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Clear Cart Confirmation Modal */}
      {showClearModal && (
        <Modal onClose={() => setShowClearModal(false)}>
          <Card style={{ width: 380, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
              Clear Entire Cart?
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Are you sure you want to remove all {totalItemCount} items from the current bill?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowClearModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={clearCart}
                style={{ background: "var(--danger)", color: "#fff", border: "none" }}
              >
                Clear All
              </Button>
            </div>
          </Card>
        </Modal>
      )}

      {/* Thermal Receipt Print Section */}
      {receipt && (
        <Card style={{ padding: 24, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Tax Invoice & Thermal Receipt ({receipt.invoiceNo})
            </h3>
            <Button variant="secondary" onClick={() => setReceipt(null)}>
              Close Receipt
            </Button>
          </div>
          <PrintReceipt data={receipt} />
        </Card>
      )}
    </div>
  );
}