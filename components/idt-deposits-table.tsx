"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import {
  fetchIdtDeposits,
  lookupProductByBarcode,
  markMultipleAsProcessed,
  deleteIdtItems,
  IdtItem,
} from "@/actions/idt";
import { Modal } from "@/components/profile-menu";
import { Button, Input, Select, Badge, ErrorBanner } from "@/components/ui";

const GST_SLABS = ["0", "5", "12", "18", "28"];

export function IdtDepositsTable({
  branchCode,
  canEdit = true,
}: {
  branchCode?: string | null;
  canEdit?: boolean;
}) {
  const [dbItems, setDbItems] = useState<IdtItem[]>([]);
  const [localItems, setLocalItems] = useState<IdtItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Search & Scan
  const [searchQuery, setSearchQuery] = useState("");
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Bulk Tool Inputs
  const [bulkHsn, setBulkHsn] = useState("");
  const [bulkExpiry, setBulkExpiry] = useState("");
  const [bulkGst, setBulkGst] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Dialogs
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stickerItem, setStickerItem] = useState<IdtItem | null>(null);

  // Audio chimes (synthesized Web Audio API)
  function playSound(type: "success" | "alert") {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // ignore audio context restrictions
    }
  }

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem("idt_local_draft");
      if (draft) {
        const parsed: IdtItem[] = JSON.parse(draft);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLocalItems(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load IDT draft from localStorage", e);
    }
  }, []);

  // Save draft to localStorage on changes
  function saveDraft(items: IdtItem[]) {
    try {
      localStorage.setItem("idt_local_draft", JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save IDT draft to localStorage", e);
    }
  }

  // Load verified database records
  function loadDbDeposits() {
    setIsLoading(true);
    setError("");
    startTransition(async () => {
      try {
        const res = await fetchIdtDeposits(branchCode ?? undefined);
        if (res.ok) {
          const flat: IdtItem[] = [];
          for (const rec of res.records) {
            flat.push(...rec.items);
          }
          setDbItems(flat);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load IDT deposits from server.");
      } finally {
        setIsLoading(false);
      }
    });
  }

  useEffect(() => {
    loadDbDeposits();
  }, [branchCode]);

  // Combined item list
  const allItems = [...dbItems, ...localItems];

  // Set all items selected by default for new local scans
  useEffect(() => {
    if (localItems.length > 0 && selectedIndices.size === 0) {
      const newIndices = new Set<number>();
      for (let i = 0; i < allItems.length; i++) {
        newIndices.add(i);
      }
      setSelectedIndices(newIndices);
    }
  }, [localItems.length, dbItems.length]);

  // Handle barcode scanner input
  async function handleScanSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const barcode = scanInput.trim().replace(/\s+/g, "");
    if (!barcode) {
      scanInputRef.current?.focus();
      return;
    }

    // 1. Repetitive scan check in local items
    const existingLocalIdx = localItems.findIndex((it) => it.barcode === barcode);
    if (existingLocalIdx >= 0) {
      const updated = [...localItems];
      const curQty = parseInt(String(updated[existingLocalIdx].quantity || "1"), 10) || 1;
      updated[existingLocalIdx].quantity = curQty + 1;
      setLocalItems(updated);
      saveDraft(updated);
      playSound("success");
      setScanInput("");
      scanInputRef.current?.focus();
      return;
    }

    // 2. Lookup in product master
    try {
      const res = await lookupProductByBarcode(barcode, branchCode ?? undefined);
      const p = res.product;

      const newItem: IdtItem = {
        barcode,
        name: p?.name || "",
        quantity: 1,
        price: p?.price ?? "",
        unitCost: p?.unitCost ?? "",
        physicalStock: p?.physicalStock ?? "0",
        weight: p?.weight || "1 unit",
        hsn: p?.hsn || "",
        gst: p?.gst || "0",
        expiryDate: p?.expiryDate || "",
        isLocal: true,
        _localId: Date.now(),
      };

      const nextLocals = [...localItems, newItem];
      setLocalItems(nextLocals);
      saveDraft(nextLocals);

      // Select new row
      setSelectedIndices((prev) => new Set(prev).add(dbItems.length + nextLocals.length - 1));

      if (p) {
        playSound("success");
      } else {
        playSound("alert");
      }
    } catch {
      playSound("alert");
    }

    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }

  // Update item field directly
  function updateItemField(index: number, field: keyof IdtItem, val: any) {
    if (index < dbItems.length) {
      const next = [...dbItems];
      next[index] = { ...next[index], [field]: val };
      setDbItems(next);
    } else {
      const localIdx = index - dbItems.length;
      const next = [...localItems];
      next[localIdx] = { ...next[localIdx], [field]: val };
      setLocalItems(next);
      saveDraft(next);
    }
  }

  // Auto-format MM/YYYY
  function formatExpiryInput(val: string): string {
    const digits = val.replace(/\D/g, "").slice(0, 6);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  }

  // Bulk tool update
  function applyBulkUpdate() {
    if (selectedIndices.size === 0) {
      setError("Please select at least one row to apply bulk attributes.");
      return;
    }

    const nextDb = [...dbItems];
    const nextLocal = [...localItems];

    for (const idx of selectedIndices) {
      if (idx < nextDb.length) {
        if (bulkHsn) nextDb[idx].hsn = bulkHsn;
        if (bulkExpiry) nextDb[idx].expiryDate = bulkExpiry;
        if (bulkGst) nextDb[idx].gst = bulkGst;
      } else {
        const localIdx = idx - nextDb.length;
        if (bulkHsn) nextLocal[localIdx].hsn = bulkHsn;
        if (bulkExpiry) nextLocal[localIdx].expiryDate = bulkExpiry;
        if (bulkGst) nextLocal[localIdx].gst = bulkGst;
      }
    }

    setDbItems(nextDb);
    setLocalItems(nextLocal);
    saveDraft(nextLocal);
    setSuccessToast("Bulk attributes applied to selected rows!");
    setTimeout(() => setSuccessToast(""), 3000);
  }

  // Delete single row
  async function handleDeleteRow(index: number) {
    if (index < dbItems.length) {
      const itemToDelete = dbItems[index];
      const nextDb = dbItems.filter((_, i) => i !== index);
      setDbItems(nextDb);
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      await deleteIdtItems([itemToDelete]);
    } else {
      const localIdx = index - dbItems.length;
      const nextLocal = localItems.filter((_, i) => i !== localIdx);
      setLocalItems(nextLocal);
      saveDraft(nextLocal);
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }

  // Delete all selected
  async function handleDeleteSelected() {
    if (selectedIndices.size === 0) return;
    if (!confirm(`Delete ${selectedIndices.size} selected row(s)?`)) return;

    const toDeleteDb: IdtItem[] = [];
    const remainingDb: IdtItem[] = [];
    const remainingLocal: IdtItem[] = [];

    dbItems.forEach((item, idx) => {
      if (selectedIndices.has(idx)) {
        toDeleteDb.push(item);
      } else {
        remainingDb.push(item);
      }
    });

    localItems.forEach((item, idx) => {
      const globalIdx = dbItems.length + idx;
      if (!selectedIndices.has(globalIdx)) {
        remainingLocal.push(item);
      }
    });

    setDbItems(remainingDb);
    setLocalItems(remainingLocal);
    saveDraft(remainingLocal);
    setSelectedIndices(new Set());

    if (toDeleteDb.length > 0) {
      await deleteIdtItems(toDeleteDb);
    }
  }

  // Verify & Go Live action
  async function executeGoLive() {
    if (isProcessing) return;

    const itemsToProcess: IdtItem[] = [];
    for (const idx of selectedIndices) {
      if (allItems[idx]) {
        itemsToProcess.push(allItems[idx]);
      }
    }

    if (itemsToProcess.length === 0) {
      setError("Please select items to Go Live.");
      return;
    }

    // Validation for mandatory fields
    for (const it of itemsToProcess) {
      if (!it.name?.toString().trim()) {
        setError(`Product Name is required for barcode: ${it.barcode}`);
        return;
      }
      if (!it.quantity || Number(it.quantity) <= 0) {
        setError(`Valid Quantity required for item: ${it.name}`);
        return;
      }
      if (!it.price || Number(it.price) <= 0) {
        setError(`Selling Price (₹) required for item: ${it.name}`);
        return;
      }
      if (it.unitCost === undefined || it.unitCost === null || it.unitCost === "") {
        setError(`Cost Price (Kharidi Bhav) required for item: ${it.name}`);
        return;
      }
      if (!it.weight?.toString().trim()) {
        setError(`Weight/Volume required for item: ${it.name}`);
        return;
      }
    }

    setShowConfirmModal(false);
    setIsProcessing(true);
    setError("");

    try {
      const res = await markMultipleAsProcessed(itemsToProcess, branchCode ?? undefined);
      if (!res.ok) {
        setError(res.error || "Failed to Go Live with selected items.");
        playSound("alert");
      } else {
        // Clear processed local items
        const processedLocalIds = new Set(
          itemsToProcess.filter((it) => it.isLocal).map((it) => it._localId)
        );
        const nextLocal = localItems.filter((it) => !processedLocalIds.has(it._localId));
        setLocalItems(nextLocal);
        saveDraft(nextLocal);

        // Deselect processed items
        setSelectedIndices(new Set());
        playSound("success");
        setSuccessToast(`Verified & Stock Live! ${itemsToProcess.length} items pushed to inventory ✅`);
        setTimeout(() => setSuccessToast(""), 5000);

        // Refresh DB items
        loadDbDeposits();
      }
    } catch (err: any) {
      setError(err.message || "Failed to Go Live.");
      playSound("alert");
    } finally {
      setIsProcessing(false);
    }
  }

  // Filter items by search query
  const filteredItems = allItems.filter((it) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (it.barcode || "").toLowerCase().includes(q) ||
      (it.name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* 🟦 TOP HEADER & BULK TOOL BAR */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "var(--text-primary)" }}>
              IDT Deposits
            </h2>
            <span
              title="IDT is your stock intake system. Scan barcodes to add items instantly. Enter mandatory details (Qty, Price, Cost, Wt/Vol), select the rows, and click 'Verify & Go Live' to push them to your active store inventory."
              style={{
                cursor: "help",
                fontSize: 14,
                color: "var(--text-secondary)",
                borderRadius: "50%",
                width: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border)",
              }}
            >
              ℹ️
            </span>
          </div>

          {/* Search Input */}
          <div style={{ position: "relative", width: 220 }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deposits..."
              style={{ width: "100%", height: 38, fontSize: 13, paddingLeft: 30 }}
            />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.5 }}>
              🔍
            </span>
          </div>
        </div>

        {/* BULK TOOL */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              padding: "4px 8px",
              borderRadius: 10,
              background: "var(--scaffold-bg)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
              BULK TOOL
            </span>

            <Input
              value={bulkHsn}
              onChange={(e) => setBulkHsn(e.target.value)}
              placeholder="HSN"
              style={{ width: 85, height: 32, fontSize: 12 }}
            />

            <Input
              value={bulkExpiry}
              onChange={(e) => setBulkExpiry(formatExpiryInput(e.target.value))}
              placeholder="MM/YYYY"
              style={{ width: 95, height: 32, fontSize: 12 }}
            />

            <Select
              value={bulkGst}
              onChange={(e) => setBulkGst(e.target.value)}
              style={{ width: 85, height: 32, fontSize: 12 }}
            >
              <option value="">GST</option>
              {GST_SLABS.map((s) => (
                <option key={s} value={s}>{s}%</option>
              ))}
            </Select>

            <Button
              variant="primary"
              onClick={applyBulkUpdate}
              style={{ height: 32, padding: "0 12px", fontSize: 11, fontWeight: 800 }}
            >
              APPLY
            </Button>
          </div>

          {selectedIndices.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              title="Delete Selected"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--danger)",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              🗑️
            </button>
          )}

          <button
            onClick={loadDbDeposits}
            title="Refresh"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              cursor: "pointer",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            🔄
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {successToast && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            background: "rgba(34, 197, 94, 0.12)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "var(--success)",
            fontSize: 14,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✓</span>
          <span>{successToast}</span>
        </div>
      )}

      {/* 💡 SMART INSTRUCTION BANNER (When list is empty) */}
      {allItems.length === 0 && !isLoading && (
        <div
          style={{
            padding: "18px 22px",
            borderRadius: 14,
            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 28 }}>💡</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)" }}>
              How to use IDT Deposits?
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
              Connect your barcode scanner and start scanning products below. Enter their quantity, price, and cost. Select the rows and click &ldquo;Verify &amp; Go Live&rdquo; to add them to your billing inventory.
            </div>
          </div>
        </div>
      )}

      {/* ⬜ MAIN DATA TABLE */}
      <div
        style={{
          background: "var(--card-bg)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          overflowX: "auto",
          boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--scaffold-bg)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "12px 16px", width: 40 }}>
                <input
                  type="checkbox"
                  checked={selectedIndices.size === allItems.length && allItems.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIndices(new Set(allItems.map((_, idx) => idx)));
                    } else {
                      setSelectedIndices(new Set());
                    }
                  }}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
              </th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>BARCODE</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>PRODUCT NAME *</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12, color: "var(--primary)" }}>QTY *</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>PRICE (₹) *</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }} title="Kharidi Bhav">
                COST (₹) *
              </th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12, color: "var(--text-secondary)" }} title="Already Available Stock">
                CUR. STOCK
              </th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>WT/VOL *</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>HSN</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>GST (%)</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12 }}>EXPIRY</th>
              <th style={{ padding: "12px 14px", fontWeight: 800, fontSize: 12, textAlign: "right" }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {/* Active Scanning Input Row */}
            <tr style={{ background: "color-mix(in srgb, var(--primary) 6%, transparent)", borderBottom: "2px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
              <td style={{ padding: "10px 16px" }}>
                <span style={{ fontSize: 14 }}>📷</span>
              </td>
              <td style={{ padding: "10px 14px" }}>
                <form onSubmit={handleScanSubmit} style={{ display: "inline-block", width: "100%" }}>
                  <input
                    ref={scanInputRef}
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan Barcode..."
                    autoFocus
                    className="co-input"
                    style={{
                      width: 170,
                      height: 36,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      borderColor: "var(--primary)",
                      background: "var(--card-bg)",
                    }}
                  />
                </form>
              </td>
              <td colSpan={10} style={{ padding: "10px 14px", color: "var(--text-secondary)", fontStyle: "italic", fontSize: 13 }}>
                Scan barcode or enter &amp; press Enter to add row...
              </td>
            </tr>

            {/* Render items */}
            {filteredItems.map((item, idx) => {
              const globalIdx = allItems.indexOf(item);
              const isSelected = selectedIndices.has(globalIdx);

              return (
                <tr
                  key={item._localId || `${item._docId}_${idx}`}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: isSelected
                      ? "color-mix(in srgb, var(--primary) 4%, transparent)"
                      : "transparent",
                  }}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedIndices((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(globalIdx);
                          else next.delete(globalIdx);
                          return next;
                        });
                      }}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  </td>

                  {/* BARCODE */}
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                    {item.barcode}
                  </td>

                  {/* PRODUCT NAME * */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      value={item.name || ""}
                      onChange={(e) => updateItemField(globalIdx, "name", e.target.value)}
                      placeholder="Product Name"
                      style={{ width: 220, height: 34, fontSize: 13, fontWeight: 600 }}
                    />
                  </td>

                  {/* QTY * */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity || 1}
                      onChange={(e) => updateItemField(globalIdx, "quantity", parseInt(e.target.value, 10) || 1)}
                      style={{ width: 70, height: 34, fontSize: 13, fontWeight: 700, color: "var(--primary)" }}
                    />
                  </td>

                  {/* PRICE (₹) * */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.price || ""}
                      onChange={(e) => updateItemField(globalIdx, "price", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      style={{ width: 85, height: 34, fontSize: 13, fontWeight: 700 }}
                    />
                  </td>

                  {/* COST (₹) * */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitCost || ""}
                      onChange={(e) => updateItemField(globalIdx, "unitCost", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      title="Kharidi Bhav (Unit Cost)"
                      style={{ width: 85, height: 34, fontSize: 13 }}
                    />
                  </td>

                  {/* CUR. STOCK */}
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--text-secondary)", textAlign: "center" }}>
                    {item.physicalStock ?? "0"}
                  </td>

                  {/* WT/VOL * */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      value={item.weight || ""}
                      onChange={(e) => updateItemField(globalIdx, "weight", e.target.value)}
                      placeholder="e.g. 500g"
                      style={{ width: 90, height: 34, fontSize: 12 }}
                    />
                  </td>

                  {/* HSN */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      value={item.hsn || ""}
                      onChange={(e) => updateItemField(globalIdx, "hsn", e.target.value)}
                      placeholder="HSN"
                      style={{ width: 85, height: 34, fontSize: 12 }}
                    />
                  </td>

                  {/* GST (%) */}
                  <td style={{ padding: "10px 14px" }}>
                    <Select
                      value={item.gst || "0"}
                      onChange={(e) => updateItemField(globalIdx, "gst", e.target.value)}
                      style={{ width: 85, height: 34, fontSize: 12 }}
                    >
                      {GST_SLABS.map((s) => (
                        <option key={s} value={s}>{s}%</option>
                      ))}
                    </Select>
                  </td>

                  {/* EXPIRY */}
                  <td style={{ padding: "10px 14px" }}>
                    <Input
                      value={item.expiryDate || ""}
                      onChange={(e) => updateItemField(globalIdx, "expiryDate", formatExpiryInput(e.target.value))}
                      placeholder="MM/YYYY"
                      style={{ width: 95, height: 34, fontSize: 12 }}
                    />
                  </td>

                  {/* ACTION */}
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={() => setStickerItem(item)}
                        title="Print Thermal Barcode Sticker"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 16,
                          color: "var(--text-secondary)",
                          padding: 4,
                        }}
                      >
                        🖨️
                      </button>
                      <button
                        onClick={() => handleDeleteRow(globalIdx)}
                        title="Delete Row"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 16,
                          color: "var(--danger)",
                          padding: 4,
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 🟩 STICKY FOOTER ACTION BAR */}
      {allItems.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 16,
            background: "var(--card-bg)",
            borderRadius: 14,
            border: "1px solid var(--border)",
            padding: "16px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 12px 30px rgba(0,0,0,0.15)",
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              {selectedIndices.size} of {allItems.length} Item(s) Selected
            </span>
            {localItems.length > 0 && (
              <Badge color="var(--primary)">
                {localItems.length} Scanned in Current Session
              </Badge>
            )}
          </div>

          <Button
            variant="primary"
            onClick={() => setShowConfirmModal(true)}
            disabled={selectedIndices.size === 0 || isProcessing || !canEdit}
            style={{
              padding: "12px 32px",
              fontSize: 14,
              fontWeight: 900,
              background: "var(--success)",
              color: "#000",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>🚀</span>
            <span>{isProcessing ? "Processing..." : "VERIFY & GO LIVE"}</span>
          </Button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal onClose={() => setShowConfirmModal(false)}>
          <div
            style={{
              background: "var(--card-bg)",
              padding: 24,
              borderRadius: 16,
              width: 440,
              display: "grid",
              gap: 16,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>🚀</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                Confirm Go Live
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Are you sure you want to push <strong>{selectedIndices.size} item(s)</strong> to the live store inventory? This action will immediately update stock balances and make them available for customer self-checkout and cashier billing.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={executeGoLive}
                style={{ background: "var(--success)", color: "#000", fontWeight: 800 }}
              >
                Yes, Go Live
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 50mm x 25mm Thermal Barcode Sticker Modal */}
      {stickerItem && (
        <Modal onClose={() => setStickerItem(null)}>
          <div
            style={{
              background: "#fff",
              color: "#000",
              padding: 28,
              borderRadius: 16,
              width: 360,
              display: "grid",
              gap: 18,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "#666" }}>
              THERMAL STICKER PREVIEW (50mm × 25mm)
            </div>

            {/* 50mm x 25mm box representation */}
            <div
              id="thermal-sticker-box"
              style={{
                border: "2px solid #000",
                padding: "16px 12px",
                borderRadius: 8,
                background: "#fff",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {stickerItem.name || "PRODUCT ITEM"}
              </div>

              <div style={{ fontSize: 20, fontWeight: 900 }}>
                MRP: ₹{stickerItem.price || "0"}
              </div>

              {/* Barcode representation */}
              <div style={{ padding: "6px 0" }}>
                <Barcode128Svg value={stickerItem.barcode} height={36} />
                <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "2px", marginTop: 4 }}>
                  {stickerItem.barcode}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <Button variant="secondary" onClick={() => setStickerItem(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  window.print();
                }}
                style={{ background: "#000", color: "#fff", fontWeight: 800 }}
              >
                Print Sticker
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Crisp 1D Barcode SVG Renderer for Thermal Printing
function Barcode128Svg({ value, height = 36 }: { value: string; height?: number }) {
  const bars: boolean[] = [];

  // Start pattern
  bars.push(true, true, false, true, false, false);

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    for (let bit = 0; bit < 7; bit++) {
      bars.push(((charCode >> bit) & 1) === 1);
    }
    bars.push(false);
  }

  // Stop pattern
  bars.push(true, true, false, false, true, false, true, true);

  return (
    <svg width={bars.length * 2} height={height} style={{ display: "block", margin: "0 auto" }}>
      {bars.map((isBar, idx) => (
        <rect
          key={idx}
          x={idx * 2}
          y={0}
          width={2}
          height={height}
          fill={isBar ? "#000" : "transparent"}
        />
      ))}
    </svg>
  );
}