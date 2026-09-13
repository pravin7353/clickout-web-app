"use client";

import { useState, useMemo, useTransition } from "react";
import {
  AiSuggestion,
  PORow,
  PromotionMetrics,
  QuantumPromotionProduct,
  SupplierRow,
} from "@/lib/services/po-service";
import { QuantumMetrics } from "@/components/quantum-metrics";
import { OfferCreationModal } from "@/components/offer-creation-modal";
import { CreatePoModal } from "@/components/create-po-modal";
import { VendorDirectoryModal } from "@/components/vendor-directory-modal";
import { ImportCsvModal } from "@/components/import-csv-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  removeProductOffer,
  blockProductBatch,
  approveAiSuggestion,
  rejectAiSuggestion,
  approvePO,
  deletePO,
  receivePoStock,
  createManualPO,
  bulkApplyProductOffers,
  bulkApprovePOs,
  bulkDeletePOs,
  bulkApproveAiSuggestions,
  bulkRejectAiSuggestions,
} from "@/actions/procurement";
import { useRouter } from "next/navigation";

export function ProcurementHub({
  metrics,
  products,
  suppliers,
  suggestions,
  pos,
  branchCode,
  canEdit = false,
}: {
  metrics: PromotionMetrics;
  products: QuantumPromotionProduct[];
  suppliers: SupplierRow[];
  suggestions: AiSuggestion[];
  pos: PORow[];
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Top Level Navigation Tabs
  const [activeTab, setActiveTab] = useState<"PROMOTIONS" | "PO_PIPELINE" | "AI_SUGGESTIONS">("PROMOTIONS");

  // Independent Pagination State for each section (pageSize = 20)
  const [promoPage, setPromoPage] = useState(1);
  const promoPageSize = 20;
  const [poPage, setPoPage] = useState(1);
  const poPageSize = 20;
  const [aiPage, setAiPage] = useState(1);
  const aiPageSize = 20;

  // Independent Selection & Bulk Modal States
  const [selectedPromoProductIds, setSelectedPromoProductIds] = useState<string[]>([]);
  const [showBulkOfferModal, setShowBulkOfferModal] = useState(false);

  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [showBulkApprovePoModal, setShowBulkApprovePoModal] = useState(false);
  const [showBulkDeletePoModal, setShowBulkDeletePoModal] = useState(false);

  const [selectedAiSuggestionIds, setSelectedAiSuggestionIds] = useState<string[]>([]);
  const [showBulkApproveAiModal, setShowBulkApproveAiModal] = useState(false);
  const [showBulkRejectAiModal, setShowBulkRejectAiModal] = useState(false);

  // Search & Filter state for Promotions
  const [promoSearch, setPromoSearch] = useState("");
  const [promoSort, setPromoSort] = useState<"Trending" | "Expiry" | "Stock" | "ATL" | "Offers">("Trending");

  // Filter state for POs
  const [poFilter, setPoFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "DELIVERED">("ALL");

  // Modals state
  const [showVendorDirectory, setShowVendorDirectory] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [selectedProductForOffer, setSelectedProductForOffer] = useState<QuantumPromotionProduct | null>(null);
  const [selectedProductForPo, setSelectedProductForPo] = useState<QuantumPromotionProduct | null>(null);
  const [showManualPoModal, setShowManualPoModal] = useState(false);

  // Confirmation Modals
  const [productToRemoveOffer, setProductToRemoveOffer] = useState<QuantumPromotionProduct | null>(null);
  const [productToBlock, setProductToBlock] = useState<QuantumPromotionProduct | null>(null);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [poToReceive, setPoToReceive] = useState<string | null>(null);

  // Manual PO Form State (for generic product entry)
  const [manualProdInput, setManualProdInput] = useState("");
  const [manualQtyInput, setManualQtyInput] = useState("50");
  const [manualSupplierId, setManualSupplierId] = useState(suppliers[0]?.id || "DEFAULT_SUPPLIER");
  const [manualError, setManualError] = useState("");

  // PO counts & values
  const pendingPos = useMemo(() => pos.filter((p) => p.status === "DRAFT" || p.status === "PENDING"), [pos]);
  const approvedPos = useMemo(() => pos.filter((p) => p.status === "APPROVED"), [pos]);
  const deliveredPos = useMemo(() => pos.filter((p) => p.status === "DELIVERED"), [pos]);

  const totalPendingValue = useMemo(() => pendingPos.reduce((s, p) => s + p.totalOrderValue, 0), [pendingPos]);
  const totalCompletedValue = useMemo(
    () => pos.filter((p) => p.status === "APPROVED" || p.status === "DELIVERED").reduce((s, p) => s + p.totalOrderValue, 0),
    [pos]
  );

  // Filtered & Sorted Products for Promotions Tab
  const processedProducts = useMemo(() => {
    let list = [...products];

    if (promoSearch.trim()) {
      const q = promoSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.clearanceType && p.clearanceType.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (promoSort === "Trending") {
        if (b.sevenDaySales !== a.sevenDaySales) return b.sevenDaySales - a.sevenDaySales;
        return a.stock - b.stock;
      }
      if (promoSort === "ATL") {
        if (a.sevenDaySales !== b.sevenDaySales) return a.sevenDaySales - b.sevenDaySales;
        return b.stock - a.stock;
      }
      if (promoSort === "Stock") {
        return a.stock - b.stock;
      }
      if (promoSort === "Expiry") {
        return a.daysLeft - b.daysLeft;
      }
      if (promoSort === "Offers") {
        const aHas = a.clearanceActive ? 1 : 0;
        const bHas = b.clearanceActive ? 1 : 0;
        return bHas - aHas;
      }
      return 0;
    });

    return list;
  }, [products, promoSearch, promoSort]);

  // Filtered POs for PO Pipeline Tab
  const filteredPos = useMemo(() => {
    if (poFilter === "PENDING") return pendingPos;
    if (poFilter === "APPROVED") return approvedPos;
    if (poFilter === "DELIVERED") return deliveredPos;
    return pos;
  }, [pos, poFilter, pendingPos, approvedPos, deliveredPos]);

  // Paginated Promotions
  const totalPromoPages = Math.max(1, Math.ceil(processedProducts.length / promoPageSize));
  const currentPromoPage = Math.min(promoPage, totalPromoPages);
  const paginatedPromoProducts = useMemo(() => {
    const start = (currentPromoPage - 1) * promoPageSize;
    return processedProducts.slice(start, start + promoPageSize);
  }, [processedProducts, currentPromoPage, promoPageSize]);

  const currentPromoPageIds = useMemo(() => paginatedPromoProducts.map((p) => p.productId), [paginatedPromoProducts]);
  const isAllPromoSelected =
    paginatedPromoProducts.length > 0 &&
    currentPromoPageIds.every((id) => selectedPromoProductIds.includes(id));

  function handleToggleAllPromo() {
    if (isAllPromoSelected) {
      setSelectedPromoProductIds((prev) => prev.filter((id) => !currentPromoPageIds.includes(id)));
    } else {
      const next = new Set(selectedPromoProductIds);
      currentPromoPageIds.forEach((id) => next.add(id));
      setSelectedPromoProductIds(Array.from(next));
    }
  }

  function handleTogglePromoRow(productId: string) {
    setSelectedPromoProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  // Paginated POs
  const totalPoPages = Math.max(1, Math.ceil(filteredPos.length / poPageSize));
  const currentPoPage = Math.min(poPage, totalPoPages);
  const paginatedPos = useMemo(() => {
    const start = (currentPoPage - 1) * poPageSize;
    return filteredPos.slice(start, start + poPageSize);
  }, [filteredPos, currentPoPage, poPageSize]);

  const currentPoPageIds = useMemo(() => paginatedPos.map((p) => p.id), [paginatedPos]);
  const isAllPoSelected =
    paginatedPos.length > 0 &&
    currentPoPageIds.every((id) => selectedPoIds.includes(id));

  function handleToggleAllPo() {
    if (isAllPoSelected) {
      setSelectedPoIds((prev) => prev.filter((id) => !currentPoPageIds.includes(id)));
    } else {
      const next = new Set(selectedPoIds);
      currentPoPageIds.forEach((id) => next.add(id));
      setSelectedPoIds(Array.from(next));
    }
  }

  function handleTogglePoRow(id: string) {
    setSelectedPoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Paginated AI Suggestions
  const totalAiPages = Math.max(1, Math.ceil(suggestions.length / aiPageSize));
  const currentAiPage = Math.min(aiPage, totalAiPages);
  const paginatedAiSuggestions = useMemo(() => {
    const start = (currentAiPage - 1) * aiPageSize;
    return suggestions.slice(start, start + aiPageSize);
  }, [suggestions, currentAiPage, aiPageSize]);

  const currentAiPageIds = useMemo(() => paginatedAiSuggestions.map((s) => s.id), [paginatedAiSuggestions]);
  const isAllAiSelected =
    paginatedAiSuggestions.length > 0 &&
    currentAiPageIds.every((id) => selectedAiSuggestionIds.includes(id));

  function handleToggleAllAi() {
    if (isAllAiSelected) {
      setSelectedAiSuggestionIds((prev) => prev.filter((id) => !currentAiPageIds.includes(id)));
    } else {
      const next = new Set(selectedAiSuggestionIds);
      currentAiPageIds.forEach((id) => next.add(id));
      setSelectedAiSuggestionIds(Array.from(next));
    }
  }

  function handleToggleAiRow(id: string) {
    setSelectedAiSuggestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleConfirmBulkApprovePOs() {
    if (selectedPoIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkApprovePOs(selectedPoIds);
      if (!res.ok && res.errors.length > 0) {
        alert(`Bulk approve encountered issues:\n${res.errors.join("\n")}`);
      }
      setSelectedPoIds([]);
      setShowBulkApprovePoModal(false);
      router.refresh();
    });
  }

  function handleConfirmBulkDeletePOs() {
    if (selectedPoIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkDeletePOs(selectedPoIds);
      if (!res.ok && res.errors.length > 0) {
        alert(`Bulk discard encountered issues:\n${res.errors.join("\n")}`);
      }
      setSelectedPoIds([]);
      setShowBulkDeletePoModal(false);
      router.refresh();
    });
  }

  function handleConfirmBulkApproveAi() {
    if (selectedAiSuggestionIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkApproveAiSuggestions(selectedAiSuggestionIds, branchCode ?? undefined);
      if (!res.ok && res.errors.length > 0) {
        alert(`Bulk approve encountered issues:\n${res.errors.join("\n")}`);
      }
      setSelectedAiSuggestionIds([]);
      setShowBulkApproveAiModal(false);
      router.refresh();
    });
  }

  function handleConfirmBulkRejectAi() {
    if (selectedAiSuggestionIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkRejectAiSuggestions(selectedAiSuggestionIds);
      if (!res.ok && res.errors.length > 0) {
        alert(`Bulk reject encountered issues:\n${res.errors.join("\n")}`);
      }
      setSelectedAiSuggestionIds([]);
      setShowBulkRejectAiModal(false);
      router.refresh();
    });
  }

  // Handlers
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

  function handleConfirmDeletePo() {
    if (!poToDelete) return;
    startTransition(async () => {
      await deletePO(poToDelete);
      setPoToDelete(null);
      router.refresh();
    });
  }

  function handleConfirmReceiveStock() {
    if (!poToReceive) return;
    startTransition(async () => {
      await receivePoStock(poToReceive);
      setPoToReceive(null);
      router.refresh();
    });
  }

  function handleApprovePo(id: string) {
    startTransition(async () => {
      await approvePO(id);
      router.refresh();
    });
  }

  function handleApproveSuggestion(id: string) {
    startTransition(async () => {
      await approveAiSuggestion(id, branchCode ?? undefined);
      router.refresh();
    });
  }

  function handleRejectSuggestion(id: string) {
    startTransition(async () => {
      await rejectAiSuggestion(id);
      router.refresh();
    });
  }

  function handleCreateManualPo(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(manualQtyInput, 10);
    if (!manualProdInput.trim()) {
      setManualError("Product ID or barcode is required.");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setManualError("Quantity must be at least 1.");
      return;
    }

    setManualError("");
    startTransition(async () => {
      const res = await createManualPO(
        manualProdInput.trim(),
        qty,
        manualSupplierId,
        branchCode ?? undefined
      );
      if (!res.ok) {
        setManualError(res.error ?? "Failed to create PO.");
      } else {
        setShowManualPoModal(false);
        setManualProdInput("");
        setManualQtyInput("50");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 1. Sleek Command Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(255, 109, 0, 0.12)",
                border: "1px solid rgba(255, 109, 0, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}
            >
              🧰
            </div>
            <div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: "var(--text-primary)",
                  margin: 0,
                  letterSpacing: "-0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                Procurement & Supply Chain
                <span
                  style={{
                    display: "inline-block",
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "var(--success)",
                    boxShadow: "0 0 10px var(--success)",
                  }}
                />
              </h1>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginTop: 2,
                }}
              >
                Store: <strong style={{ color: "var(--text-primary)" }}>{branchCode || "HQ (All Stores)"}</strong> ·{" "}
                {products.length} Products Monitored · {suppliers.length} Vendors Active
              </div>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowImportCsv(true)}
              style={{
                padding: "9px 16px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-orange)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <span style={{ color: "var(--accent-orange)" }}>☁️</span>
              <span>Import CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowVendorDirectory(true)}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span>👥</span>
            <span>Vendor Directory ({suppliers.length})</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => setShowManualPoModal(true)}
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                border: "none",
                background: "var(--cta-bg)",
                color: "var(--cta-text)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 4px 12px rgba(0, 210, 106, 0.25)",
              }}
            >
              <span>+</span>
              <span>Create Manual PO</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Segmented Navigation Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: 6,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab("PROMOTIONS")}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: activeTab === "PROMOTIONS" ? "var(--card-bg)" : "transparent",
              color: activeTab === "PROMOTIONS" ? "var(--accent-orange)" : "var(--text-secondary)",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: activeTab === "PROMOTIONS" ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              borderBottom: activeTab === "PROMOTIONS" ? "2px solid var(--accent-orange)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>🏷️ Promotion Engine</span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 10,
                background: activeTab === "PROMOTIONS" ? "rgba(255, 109, 0, 0.15)" : "rgba(255,255,255,0.05)",
                color: activeTab === "PROMOTIONS" ? "var(--accent-orange)" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("PO_PIPELINE")}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: activeTab === "PO_PIPELINE" ? "var(--card-bg)" : "transparent",
              color: activeTab === "PO_PIPELINE" ? "var(--success)" : "var(--text-secondary)",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: activeTab === "PO_PIPELINE" ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              borderBottom: activeTab === "PO_PIPELINE" ? "2px solid var(--success)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>🛒 Purchase Orders</span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 10,
                background: activeTab === "PO_PIPELINE" ? "rgba(0, 210, 106, 0.15)" : "rgba(255,255,255,0.05)",
                color: activeTab === "PO_PIPELINE" ? "var(--success)" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {pos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("AI_SUGGESTIONS")}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: activeTab === "AI_SUGGESTIONS" ? "var(--card-bg)" : "transparent",
              color: activeTab === "AI_SUGGESTIONS" ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: activeTab === "AI_SUGGESTIONS" ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              borderBottom: activeTab === "AI_SUGGESTIONS" ? "2px solid var(--primary, #00D26A)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <span>🤖 AI Reorder Engine</span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 10,
                background: activeTab === "AI_SUGGESTIONS" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                color: activeTab === "AI_SUGGESTIONS" ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {suggestions.length}
            </span>
          </button>
        </div>

        {/* Security Indicator */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--success)",
            padding: "4px 12px",
            borderRadius: 20,
            background: "rgba(0, 210, 106, 0.08)",
            border: "1px solid rgba(0, 210, 106, 0.2)",
          }}
        >
          <span>🟢</span>
          <span>Security Verified</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: PROMOTION & CLEARANCE ENGINE */}
      {/* ========================================================= */}
      {activeTab === "PROMOTIONS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Top KPI Insight Cards */}
          <QuantumMetrics metrics={metrics} />

          {/* Search & Sort Pills */}
          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {/* Search Input */}
            <div style={{ position: "relative", width: 280, maxWidth: "100%" }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                }}
              >
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by name or barcode..."
                value={promoSearch}
                onChange={(e) => {
                  setPromoSearch(e.target.value);
                  setPromoPage(1);
                }}
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 36px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {promoSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setPromoSearch("");
                    setPromoPage(1);
                  }}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Filters */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(
                [
                  { key: "Trending", label: "🔥 Trending" },
                  { key: "Expiry", label: "⏳ Expiry Alert" },
                  { key: "Stock", label: "📦 Low Stock" },
                  { key: "ATL", label: "📉 Dead Stock (ATL)" },
                  { key: "Offers", label: "🏷️ Active Offers" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setPromoSort(f.key);
                    setPromoPage(1);
                  }}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: promoSort === f.key ? "var(--accent-orange)" : "var(--border)",
                    background: promoSort === f.key ? "rgba(255, 109, 0, 0.12)" : "transparent",
                    color: promoSort === f.key ? "var(--accent-orange)" : "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Products Promotion Table */}
          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid var(--border)" }}>
                    {canEdit && (
                      <th style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isAllPromoSelected}
                          onChange={handleToggleAllPromo}
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
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      PRODUCT / ITEM
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      EXPIRY STATUS
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      OFFER ENGINE STATUS
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      STOCK LEVEL
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      ACTION
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {processedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} style={{ padding: "48px 18px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>No Products Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing your search query or switching sort filter.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPromoProducts.map((p) => {
                      const isLowStock = p.stock <= 20;

                      return (
                        <tr
                          key={p.productId}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            transition: "background 0.1s ease",
                            background: selectedPromoProductIds.includes(p.productId)
                              ? "rgba(255, 109, 0, 0.06)"
                              : "transparent",
                          }}
                        >
                          {canEdit && (
                            <td style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedPromoProductIds.includes(p.productId)}
                                onChange={() => handleTogglePromoRow(p.productId)}
                                aria-label={`Select ${p.name}`}
                                style={{
                                  cursor: "pointer",
                                  width: 16,
                                  height: 16,
                                  accentColor: "var(--cta-bg-accent, #F9A826)",
                                }}
                              />
                            </td>
                          )}
                          {/* Product Info */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>
                              {p.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-orange)" }}>
                                7-Day Sales: {p.sevenDaySales}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>·</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                                ₹{p.price.toFixed(0)}
                              </span>
                              {p.barcode && (
                                <>
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>·</span>
                                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{p.barcode}</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Expiry Status */}
                          <td style={{ padding: "14px 18px" }}>
                            {p.isDead ? (
                              <span
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "rgba(239, 68, 68, 0.15)",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  color: "var(--danger)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                💀 DEAD STOCK
                              </span>
                            ) : p.daysLeft < 30 ? (
                              <span
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "rgba(255, 109, 0, 0.15)",
                                  border: "1px solid rgba(255, 109, 0, 0.3)",
                                  color: "var(--accent-orange)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                ⏳ {p.daysLeft}d LEFT
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "rgba(0, 210, 106, 0.12)",
                                  border: "1px solid rgba(0, 210, 106, 0.25)",
                                  color: "var(--success)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                ✓ SAFE
                              </span>
                            )}
                          </td>

                          {/* Offer Engine Status */}
                          <td style={{ padding: "14px 18px" }}>
                            {p.clearanceActive ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "4px 10px",
                                  borderRadius: 10,
                                  background: "rgba(0, 210, 106, 0.12)",
                                  border: "1px solid rgba(0, 210, 106, 0.3)",
                                }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--success)" }}>
                                  🏷️ {p.offerDisplayName || "OFFER ACTIVE"}
                                </span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => setProductToRemoveOffer(p)}
                                    title="Remove this offer"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "var(--danger)",
                                      cursor: "pointer",
                                      fontSize: 12,
                                      fontWeight: 900,
                                      padding: 0,
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProductForOffer(p)}
                                    style={{
                                      padding: "5px 12px",
                                      borderRadius: 8,
                                      border: "1px solid rgba(255, 109, 0, 0.4)",
                                      background: "rgba(255, 109, 0, 0.08)",
                                      color: "var(--accent-orange)",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    🏷️ APPLY OFFER
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>No active offer</span>
                                )}
                              </>
                            )}
                          </td>

                          {/* Stock Level */}
                          <td style={{ padding: "14px 18px" }}>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 900,
                                color: isLowStock ? "var(--danger)" : "var(--text-primary)",
                              }}
                            >
                              {p.stock}
                            </span>
                            {isLowStock && (
                              <span style={{ fontSize: 11, color: "var(--danger)", marginLeft: 6, fontWeight: 700 }}>
                                (Low)
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td style={{ padding: "14px 18px", textAlign: "right" }}>
                            {canEdit && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForPo(p)}
                                  style={{
                                    padding: "6px 14px",
                                    borderRadius: 8,
                                    border: "1px solid rgba(0, 210, 106, 0.4)",
                                    background: "rgba(0, 210, 106, 0.08)",
                                    color: "var(--success)",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--success)";
                                    e.currentTarget.style.color = "#000";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "rgba(0, 210, 106, 0.08)";
                                    e.currentTarget.style.color = "var(--success)";
                                  }}
                                >
                                  <span>🛒</span>
                                  <span>RAISE PO</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Promotions Pagination Controls */}
          {processedProducts.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                Showing {(currentPromoPage - 1) * promoPageSize + 1} –{" "}
                {Math.min(currentPromoPage * promoPageSize, processedProducts.length)} of {processedProducts.length} products
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={currentPromoPage === 1}
                  onClick={() => setPromoPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentPromoPage === 1 ? "transparent" : "var(--scaffold-bg)",
                    color: currentPromoPage === 1 ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentPromoPage === 1 ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentPromoPage === 1 ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  ← Previous
                </button>

                <span
                  style={{
                    padding: "4px 12px",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  Page {currentPromoPage} of {totalPromoPages}
                </span>

                <button
                  type="button"
                  disabled={currentPromoPage >= totalPromoPages}
                  onClick={() => setPromoPage((p) => Math.min(totalPromoPages, p + 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentPromoPage >= totalPromoPages ? "transparent" : "var(--scaffold-bg)",
                    color: currentPromoPage >= totalPromoPages ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentPromoPage >= totalPromoPages ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentPromoPage >= totalPromoPages ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PURCHASE ORDERS PIPELINE */}
      {/* ========================================================= */}
      {activeTab === "PO_PIPELINE" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Quick Metrics Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 16,
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                Pending PO Approvals
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent-orange)" }}>
                {pendingPos.length}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Estimated Value: <strong style={{ color: "var(--text-primary)" }}>₹{totalPendingValue.toLocaleString("en-IN")}</strong>
              </div>
            </div>

            <div
              style={{
                padding: "18px 20px",
                borderRadius: 16,
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                Orders In-Transit & Delivered
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--success)" }}>
                {approvedPos.length + deliveredPos.length}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Total Order Pipeline: <strong style={{ color: "var(--text-primary)" }}>₹{totalCompletedValue.toLocaleString("en-IN")}</strong>
              </div>
            </div>
          </div>

          {/* Sub-Filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                { key: "ALL", label: `All Orders (${pos.length})` },
                { key: "PENDING", label: `Pending Approvals (${pendingPos.length})` },
                { key: "APPROVED", label: `Approved / In-Transit (${approvedPos.length})` },
                { key: "DELIVERED", label: `Delivered (${deliveredPos.length})` },
              ] as const
            ).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  setPoFilter(filter.key);
                  setPoPage(1);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: poFilter === filter.key ? "var(--primary, #00D26A)" : "var(--border)",
                  background: poFilter === filter.key ? "rgba(0, 210, 106, 0.12)" : "var(--card-bg)",
                  color: poFilter === filter.key ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* PO Pipeline Table */}
          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid var(--border)" }}>
                    {canEdit && (
                      <th style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isAllPoSelected}
                          onChange={handleToggleAllPo}
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
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      PO NUMBER
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      SUPPLIER
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      ITEMS
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      TOTAL VALUE
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      STATUS
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      ACTIONS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPos.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} style={{ padding: "48px 18px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>No Purchase Orders Found</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>You can create a manual purchase order or wait for AI replenishment alerts.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPos.map((order) => {
                      const isPendingState = order.status === "DRAFT" || order.status === "PENDING";
                      const isApproved = order.status === "APPROVED";
                      const isDelivered = order.status === "DELIVERED";

                      return (
                        <tr
                          key={order.id}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: selectedPoIds.includes(order.id)
                              ? "rgba(0, 210, 106, 0.06)"
                              : "transparent",
                          }}
                        >
                          {canEdit && (
                            <td style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedPoIds.includes(order.id)}
                                onChange={() => handleTogglePoRow(order.id)}
                                aria-label={`Select PO ${order.poId}`}
                                style={{
                                  cursor: "pointer",
                                  width: 16,
                                  height: 16,
                                  accentColor: "var(--cta-bg-accent, #F9A826)",
                                }}
                              />
                            </td>
                          )}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 13, fontFamily: "monospace" }}>
                              #{order.poId}
                            </span>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              {new Date(order.createdAtMs).toLocaleDateString("en-IN")}
                            </div>
                          </td>

                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>
                              {order.supplierName}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Branch: {order.branchCode}</div>
                          </td>

                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                              {order.items.length > 0 ? (
                                <span>
                                  • {order.items[0].name} ({order.items[0].orderQty} units)
                                  {order.items.length > 1 && (
                                    <span style={{ color: "var(--text-secondary)", marginLeft: 4 }}>
                                      +{order.items.length - 1} more
                                    </span>
                                  )}
                                </span>
                              ) : (
                                `${order.totalItems} items`
                              )}
                            </div>
                          </td>

                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontWeight: 900, color: "var(--success)", fontSize: 14 }}>
                              ₹{order.totalOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </td>

                          <td style={{ padding: "14px 18px" }}>
                            {isApproved ? (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 20,
                                  background: "rgba(0, 210, 106, 0.12)",
                                  border: "1px solid rgba(0, 210, 106, 0.25)",
                                  color: "var(--success)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                • APPROVED
                              </span>
                            ) : isDelivered ? (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 20,
                                  background: "rgba(255, 255, 255, 0.08)",
                                  color: "var(--text-secondary)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                ✓ DELIVERED
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 20,
                                  background: "rgba(255, 109, 0, 0.15)",
                                  border: "1px solid rgba(255, 109, 0, 0.3)",
                                  color: "var(--accent-orange)",
                                  fontSize: 11,
                                  fontWeight: 800,
                                }}
                              >
                                • PENDING
                              </span>
                            )}
                          </td>

                          <td style={{ padding: "14px 18px", textAlign: "right" }}>
                            {canEdit && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                {isApproved && (
                                  <button
                                    type="button"
                                    onClick={() => setPoToReceive(order.id)}
                                    style={{
                                      padding: "6px 14px",
                                      borderRadius: 8,
                                      border: "none",
                                      background: "var(--cta-bg)",
                                      color: "var(--cta-text)",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Receive Delivery
                                  </button>
                                )}

                                {isPendingState && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApprovePo(order.id)}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        border: "1px solid var(--border)",
                                        background: "transparent",
                                        color: "var(--success)",
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPoToDelete(order.id)}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(239, 68, 68, 0.3)",
                                        background: "transparent",
                                        color: "var(--danger)",
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Discard
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Purchase Orders Pagination Controls */}
          {filteredPos.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                Showing {(currentPoPage - 1) * poPageSize + 1} –{" "}
                {Math.min(currentPoPage * poPageSize, filteredPos.length)} of {filteredPos.length} orders
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={currentPoPage === 1}
                  onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentPoPage === 1 ? "transparent" : "var(--scaffold-bg)",
                    color: currentPoPage === 1 ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentPoPage === 1 ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentPoPage === 1 ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  ← Previous
                </button>

                <span
                  style={{
                    padding: "4px 12px",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  Page {currentPoPage} of {totalPoPages}
                </span>

                <button
                  type="button"
                  disabled={currentPoPage >= totalPoPages}
                  onClick={() => setPoPage((p) => Math.min(totalPoPages, p + 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentPoPage >= totalPoPages ? "transparent" : "var(--scaffold-bg)",
                    color: currentPoPage >= totalPoPages ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentPoPage >= totalPoPages ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentPoPage >= totalPoPages ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: AI REORDER ENGINE SUGGESTIONS */}
      {/* ========================================================= */}
      {activeTab === "AI_SUGGESTIONS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Info Banner */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "rgba(0, 210, 106, 0.06)",
              border: "1px solid rgba(0, 210, 106, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>🤖</span>
            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
              <strong>AI Inventory Replenishment:</strong> AI scans sales velocity and stock levels daily to recommend purchase orders before stockouts occur.
            </div>
          </div>

          {/* Suggestions List */}
          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid var(--border)" }}>
                    {canEdit && (
                      <th style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isAllAiSelected}
                          onChange={handleToggleAllAi}
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
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      PRODUCT TO REORDER
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      SUGGESTED QUANTITY
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      RECOMMENDED SUPPLIER
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5 }}>
                      ESTIMATED COST
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: 0.5, textAlign: "right" }}>
                      DECISION
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {suggestions.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} style={{ padding: "48px 18px", textAlign: "center", color: "var(--text-secondary)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Stock Levels Healthy</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>No automated replenishment alerts required at this time.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAiSuggestions.map((s) => (
                      <tr
                        key={s.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: selectedAiSuggestionIds.includes(s.id)
                            ? "rgba(0, 210, 106, 0.06)"
                            : "transparent",
                        }}
                      >
                        {canEdit && (
                          <td style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={selectedAiSuggestionIds.includes(s.id)}
                              onChange={() => handleToggleAiRow(s.id)}
                              aria-label={`Select suggestion for ${s.productName}`}
                              style={{
                                cursor: "pointer",
                                width: 16,
                                height: 16,
                                accentColor: "var(--cta-bg-accent, #F9A826)",
                              }}
                            />
                          </td>
                        )}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>
                            {s.productName}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                            Branch: {s.branchCode}
                          </div>
                        </td>

                        <td style={{ padding: "14px 18px" }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--accent-orange)" }}>
                            {s.suggestedQty} units
                          </span>
                        </td>

                        <td style={{ padding: "14px 18px" }}>
                          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
                            {s.supplierName}
                          </span>
                        </td>

                        <td style={{ padding: "14px 18px" }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--success)" }}>
                            ₹{s.estimatedCost.toFixed(2)}
                          </span>
                        </td>

                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          {canEdit && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleApproveSuggestion(s.id)}
                                style={{
                                  padding: "6px 14px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: "var(--cta-bg)",
                                  color: "var(--cta-text)",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                ✓ Approve & Order
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectSuggestion(s.id)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: "var(--text-secondary)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Discard
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Suggestions Pagination Controls */}
          {suggestions.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 6,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                Showing {(currentAiPage - 1) * aiPageSize + 1} –{" "}
                {Math.min(currentAiPage * aiPageSize, suggestions.length)} of {suggestions.length} suggestions
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  disabled={currentAiPage === 1}
                  onClick={() => setAiPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentAiPage === 1 ? "transparent" : "var(--scaffold-bg)",
                    color: currentAiPage === 1 ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentAiPage === 1 ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentAiPage === 1 ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  ← Previous
                </button>

                <span
                  style={{
                    padding: "4px 12px",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  Page {currentAiPage} of {totalAiPages}
                </span>

                <button
                  type="button"
                  disabled={currentAiPage >= totalAiPages}
                  onClick={() => setAiPage((p) => Math.min(totalAiPages, p + 1))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: currentAiPage >= totalAiPages ? "transparent" : "var(--scaffold-bg)",
                    color: currentAiPage >= totalAiPages ? "var(--text-secondary)" : "var(--text-primary)",
                    opacity: currentAiPage >= totalAiPages ? 0.35 : 1,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: currentAiPage >= totalAiPages ? "not-allowed" : "pointer",
                    userSelect: "none",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 9-in-1 Offer Creation Dialog */}
      {selectedProductForOffer && (
        <OfferCreationModal
          product={selectedProductForOffer}
          allProducts={products}
          onClose={() => setSelectedProductForOffer(null)}
        />
      )}

      {/* Bulk Offer Creation Dialog */}
      {showBulkOfferModal && selectedPromoProductIds.length > 0 && (
        <OfferCreationModal
          selectedProducts={products.filter((p) => selectedPromoProductIds.includes(p.productId))}
          allProducts={products}
          onClose={() => setShowBulkOfferModal(false)}
          onSuccess={() => setSelectedPromoProductIds([])}
        />
      )}

      {/* Pre-filled Product PO Creation Dialog */}
      {selectedProductForPo && (
        <CreatePoModal
          product={selectedProductForPo}
          suppliers={suppliers}
          branchCode={branchCode}
          onClose={() => setSelectedProductForPo(null)}
        />
      )}

      {/* Generic Manual PO Modal */}
      {showManualPoModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setShowManualPoModal(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--card-bg)",
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: 24,
              boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Create Manual Purchase Order
              </h2>
              <button
                type="button"
                onClick={() => setShowManualPoModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualPo} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {manualError && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239, 68, 68, 0.12)", color: "var(--danger)", fontSize: 12 }}>
                  {manualError}
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  Product ID or Barcode
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8901234567890 or doc ID"
                  value={manualProdInput}
                  onChange={(e) => setManualProdInput(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  Order Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={manualQtyInput}
                  onChange={(e) => setManualQtyInput(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  Supplier / Vendor
                </label>
                <select
                  value={manualSupplierId}
                  onChange={(e) => setManualSupplierId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                  }}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="DEFAULT_SUPPLIER">General Wholesale Distributor</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowManualPoModal(false)}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--cta-bg)", color: "var(--cta-text)", fontWeight: 800 }}
                >
                  {isPending ? "Generating..." : "Generate PO"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Directory Modal */}
      {showVendorDirectory && (
        <VendorDirectoryModal
          suppliers={suppliers}
          onClose={() => setShowVendorDirectory(false)}
        />
      )}

      {/* Import CSV Modal */}
      {showImportCsv && (
        <ImportCsvModal onClose={() => setShowImportCsv(false)} />
      )}

      {/* In-DOM Confirm Modals */}
      {productToRemoveOffer && (
        <ConfirmModal
          isOpen={Boolean(productToRemoveOffer)}
          isPending={isPending}
          title="Remove Clearance Offer"
          message={`Are you sure you want to remove the active clearance promotion from "${productToRemoveOffer.name}"? Regular pricing will be restored immediately.`}
          confirmLabel="Remove Offer"
          variant="danger"
          onConfirm={handleConfirmRemoveOffer}
          onCancel={() => setProductToRemoveOffer(null)}
        />
      )}

      {productToBlock && (
        <ConfirmModal
          isOpen={Boolean(productToBlock)}
          isPending={isPending}
          title="Block Product Batch"
          message={`Are you sure you want to block "${productToBlock.name}"? This item will be flagged as quarantine/expired and hidden from active sales.`}
          confirmLabel="Block Item"
          variant="danger"
          onConfirm={handleConfirmBlockProduct}
          onCancel={() => setProductToBlock(null)}
        />
      )}

      {poToDelete && (
        <ConfirmModal
          isOpen={Boolean(poToDelete)}
          isPending={isPending}
          title="Discard Purchase Order"
          message="Are you sure you want to discard this purchase order? This action will cancel and remove the order from the pipeline."
          confirmLabel="Discard PO"
          variant="danger"
          onConfirm={handleConfirmDeletePo}
          onCancel={() => setPoToDelete(null)}
        />
      )}

      {poToReceive && (
        <ConfirmModal
          isOpen={Boolean(poToReceive)}
          isPending={isPending}
          title="Confirm Delivery Receipt"
          message="Mark this purchase order as delivered? Inventory physical stock will be automatically incremented for the ordered quantities."
          confirmLabel="Receive Stock"
          variant="primary"
          onConfirm={handleConfirmReceiveStock}
          onCancel={() => setPoToReceive(null)}
        />
      )}

      {/* Bulk Confirm Modals */}
      {showBulkApprovePoModal && (
        <ConfirmModal
          isOpen={showBulkApprovePoModal}
          isPending={isPending}
          title="Approve Purchase Orders"
          message={`Are you sure you want to approve ${selectedPoIds.length} selected purchase order(s)?`}
          confirmLabel="Approve All Selected"
          variant="primary"
          onConfirm={handleConfirmBulkApprovePOs}
          onCancel={() => setShowBulkApprovePoModal(false)}
        />
      )}

      {showBulkDeletePoModal && (
        <ConfirmModal
          isOpen={showBulkDeletePoModal}
          isPending={isPending}
          title="Discard Purchase Orders"
          message={`Are you sure you want to discard ${selectedPoIds.length} selected purchase order(s)? This action cannot be undone.`}
          confirmLabel="Discard All Selected"
          variant="danger"
          onConfirm={handleConfirmBulkDeletePOs}
          onCancel={() => setShowBulkDeletePoModal(false)}
        />
      )}

      {showBulkApproveAiModal && (
        <ConfirmModal
          isOpen={showBulkApproveAiModal}
          isPending={isPending}
          title="Approve AI Reorder Suggestions"
          message={`Are you sure you want to approve ${selectedAiSuggestionIds.length} AI suggestion(s) and generate purchase orders?`}
          confirmLabel="Approve & Order All"
          variant="primary"
          onConfirm={handleConfirmBulkApproveAi}
          onCancel={() => setShowBulkApproveAiModal(false)}
        />
      )}

      {showBulkRejectAiModal && (
        <ConfirmModal
          isOpen={showBulkRejectAiModal}
          isPending={isPending}
          title="Reject AI Reorder Suggestions"
          message={`Are you sure you want to reject and remove ${selectedAiSuggestionIds.length} AI reorder suggestion(s)?`}
          confirmLabel="Reject All Selected"
          variant="danger"
          onConfirm={handleConfirmBulkRejectAi}
          onCancel={() => setShowBulkRejectAiModal(false)}
        />
      )}

      {/* Floating Bulk Action Bar - Promotion Engine */}
      {canEdit && activeTab === "PROMOTIONS" && selectedPromoProductIds.length > 0 && (
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
              {selectedPromoProductIds.length}
            </span>
            selected
          </span>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBulkOfferModal(true)}
            style={{
              background: "color-mix(in srgb, var(--accent-orange) 15%, transparent)",
              color: "var(--accent-orange)",
              border: "1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)",
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
            🏷️ Apply Offer to {selectedPromoProductIds.length} Selected
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setSelectedPromoProductIds([])}
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

      {/* Floating Bulk Action Bar - Purchase Orders */}
      {canEdit && activeTab === "PO_PIPELINE" && selectedPoIds.length > 0 && (
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
              {selectedPoIds.length}
            </span>
            selected
          </span>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBulkApprovePoModal(true)}
            style={{
              background: "color-mix(in srgb, var(--success, #00D26A) 15%, transparent)",
              color: "var(--success, #00D26A)",
              border: "1px solid color-mix(in srgb, var(--success, #00D26A) 30%, transparent)",
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
            ✓ Approve {selectedPoIds.length} Selected
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBulkDeletePoModal(true)}
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
            🗑️ Discard {selectedPoIds.length} Selected
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setSelectedPoIds([])}
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

      {/* Floating Bulk Action Bar - AI Reorder Engine */}
      {canEdit && activeTab === "AI_SUGGESTIONS" && selectedAiSuggestionIds.length > 0 && (
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
              {selectedAiSuggestionIds.length}
            </span>
            selected
          </span>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBulkApproveAiModal(true)}
            style={{
              background: "color-mix(in srgb, var(--success, #00D26A) 15%, transparent)",
              color: "var(--success, #00D26A)",
              border: "1px solid color-mix(in srgb, var(--success, #00D26A) 30%, transparent)",
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
            ✓ Approve {selectedAiSuggestionIds.length} Selected
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowBulkRejectAiModal(true)}
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
            ✕ Reject {selectedAiSuggestionIds.length} Selected
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setSelectedAiSuggestionIds([])}
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
    </div>
  );
}
