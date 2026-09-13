"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Modal } from "@/components/profile-menu";
import { SupplierRow } from "@/lib/services/po-service";
import {
  addSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers,
  getSuppliersAction,
} from "@/actions/supplier";
import { ImportCsvModal } from "@/components/import-csv-modal";
import { useRouter } from "next/navigation";

export function VendorDirectoryModal({
  suppliers,
  onClose,
}: {
  suppliers: SupplierRow[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);

  // Add Vendor Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState("");
  const [gstin, setGstin] = useState("");

  // Edit Vendor Form State
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCategories, setEditCategories] = useState("");
  const [editGstin, setEditGstin] = useState("");

  // Feedback State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Selection State for Bulk Operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Suppliers state & Pagination (pageSize = 10 for compact modal)
  const [suppliersList, setSuppliersList] = useState<SupplierRow[]>(suppliers);
  const [totalCount, setTotalCount] = useState<number>(
    (suppliers as any).totalCount ?? suppliers.length
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const router = useRouter();

  // Sync with prop when parent revalidates
  useEffect(() => {
    setSuppliersList(suppliers);
    setTotalCount((suppliers as any).totalCount ?? suppliers.length);
  }, [suppliers]);

  // Request current page from Firestore via server action instead of full-array client slice
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      const res = await getSuppliersAction({ page, pageSize });
      if (res.ok && active) {
        setSuppliersList(res.suppliers);
        setTotalCount(res.totalCount);
      }
    });
    return () => {
      active = false;
    };
  }, [page]);

  // Filter vendors
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return suppliersList;
    return suppliersList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.categories && s.categories.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.supplierID && s.supplierID.toLowerCase().includes(q)) ||
        (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [suppliersList, search]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedSuppliers = filtered;

  // Checkbox handlers
  const currentPageIds = useMemo(() => paginatedSuppliers.map((s) => s.id), [paginatedSuppliers]);
  const isAllCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

  function handleToggleSelectAll() {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      const next = new Set(selectedIds);
      currentPageIds.forEach((id) => next.add(id));
      setSelectedIds(Array.from(next));
    }
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Bulk Delete
  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.length} selected distributor(s)? This action cannot be undone.`
      )
    ) {
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await bulkDeleteSuppliers(selectedIds);
      if (!res.ok && res.errors && res.errors.length > 0) {
        setError(`Failed to delete some distributors:\n${res.errors.join("; ")}`);
      } else {
        setSuccess(`Successfully deleted ${res.successCount} distributor(s).`);
      }
      setSelectedIds([]);
      router.refresh();
    });
  }

  // Single Delete
  function handleDeleteSingle(id: string, sName: string) {
    if (!confirm(`Delete distributor "${sName}"? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteSupplier(id);
      if (!res.ok) {
        setError(res.error ?? "Failed to delete distributor.");
      } else {
        setSuccess(`Distributor "${sName}" deleted successfully.`);
        setSelectedIds((prev) => prev.filter((item) => item !== id));
        router.refresh();
      }
    });
  }

  // Add Vendor Submit
  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Distributor name is required.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await addSupplier({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        categories: categories.trim() || undefined,
        gstin: gstin.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to add distributor.");
      } else {
        setShowAdd(false);
        setName("");
        setEmail("");
        setPhone("");
        setCategories("");
        setGstin("");
        setSuccess(`Distributor "${name.trim()}" registered successfully.`);
        router.refresh();
      }
    });
  }

  // Open Edit Modal
  function handleOpenEdit(s: SupplierRow) {
    setEditingSupplier(s);
    setEditName(s.name || "");
    setEditEmail(s.email || "");
    setEditPhone(s.phone || "");
    setEditCategories(s.categories || "");
    setEditGstin(s.gstin || "");
    setError(null);
  }

  // Edit Vendor Submit
  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSupplier) return;
    if (!editName.trim()) {
      setError("Distributor name is required.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await updateSupplier(editingSupplier.id, {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        categories: editCategories.trim() || undefined,
        gstin: editGstin.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to update distributor.");
      } else {
        setEditingSupplier(null);
        setSuccess(`Distributor "${editName.trim()}" updated successfully.`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Modal onClose={onClose}>
        <div
          style={{
            width: 780,
            maxWidth: "94vw",
            maxHeight: "88vh",
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
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "color-mix(in srgb, var(--text-primary) 10%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                }}
              >
                🏢
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px 0", color: "var(--text-primary)" }}>
                  Vendor Directory & Suppliers
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  {suppliers.length} Registered Supply Chain Partners
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
              }}
            >
              ✕
            </button>
          </div>

          {/* Action Toolbar */}
          <div
            style={{
              padding: "14px 24px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {/* Search */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors by name, category, phone, GSTIN..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Import CSV button */}
              <button
                type="button"
                onClick={() => setShowImportCsv(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📥</span>
                <span>Import CSV</span>
              </button>

              {/* Add Vendor button */}
              <button
                type="button"
                onClick={() => setShowAdd(!showAdd)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  background: showAdd ? "var(--border)" : "var(--cta-bg)",
                  color: showAdd ? "var(--text-primary)" : "var(--cta-text)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {showAdd ? "Close Form" : "+ Add Vendor"}
              </button>
            </div>
          </div>

          {/* Banner Messages */}
          {error && (
            <div
              style={{
                margin: "12px 24px 0 24px",
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "var(--danger)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              🚨 {error}
            </div>
          )}

          {success && (
            <div
              style={{
                margin: "12px 24px 0 24px",
                padding: "10px 14px",
                borderRadius: 8,
                background: "color-mix(in srgb, var(--success) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                color: "var(--success)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              ✅ {success}
            </div>
          )}

          {/* Add Vendor Form (Expandable) */}
          {showAdd && (
            <form
              onSubmit={handleAddSubmit}
              style={{
                padding: "16px 24px",
                background: "color-mix(in srgb, var(--cta-bg) 5%, var(--scaffold-bg))",
                borderBottom: "1px solid var(--border)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
                Register New Distributor
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vendor / Distributor Name *"
                required
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
              <input
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="Categories (e.g. FMCG, Dairy, Beverages)"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (10 digits)"
                maxLength={10}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              />
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="GSTIN (15 characters, optional)"
                maxLength={15}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  textTransform: "uppercase",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
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
                    padding: "8px 18px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    border: "none",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Saving..." : "Save Distributor"}
                </button>
              </div>
            </form>
          )}

          {/* Bulk Selection Action Bar */}
          {selectedIds.length > 0 && (
            <div
              style={{
                padding: "10px 24px",
                background: "color-mix(in srgb, var(--primary) 10%, var(--card-bg))",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--primary)",
                    background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 6,
                  }}
                >
                  {selectedIds.length} Selected
                </span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  (across current and other pages)
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkDelete}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--danger)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Deleting..." : `🗑️ Delete ${selectedIds.length} Selected`}
                </button>
              </div>
            </div>
          )}

          {/* Select All Sub-header for Current Page */}
          <div
            style={{
              padding: "8px 24px",
              background: "var(--scaffold-bg)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={isAllCurrentPageSelected}
                onChange={handleToggleSelectAll}
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              <span style={{ fontWeight: 700 }}>Select All (Page {currentPage})</span>
            </label>

            <span>
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} vendors
            </span>
          </div>

          {/* Vendors List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 24px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                No distributors found. Click &quot;+ Add Vendor&quot; or &quot;Import CSV&quot; to register one.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {paginatedSuppliers.map((s) => {
                  const isSelected = selectedIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: 12,
                        background: isSelected
                          ? "color-mix(in srgb, var(--primary) 6%, var(--scaffold-bg))"
                          : "var(--scaffold-bg)",
                        border: isSelected
                          ? "1px solid var(--primary)"
                          : "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        transition: "border 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(s.id)}
                          style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                              {s.name}
                            </span>
                            {s.supplierID && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: "monospace",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  background: "var(--card-bg)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {s.supplierID}
                              </span>
                            )}
                            {s.gstin && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontFamily: "monospace",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  background: "rgba(59, 130, 246, 0.08)",
                                  border: "1px solid rgba(59, 130, 246, 0.25)",
                                  color: "#3b82f6",
                                }}
                              >
                                GSTIN: {s.gstin}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              marginTop: 3,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {s.categories && <span>📦 {s.categories}</span>}
                            {s.email && <span>✉️ {s.email}</span>}
                            {s.phone && <span>📞 {s.phone}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: 6,
                            background: "color-mix(in srgb, var(--success) 12%, transparent)",
                            color: "var(--success)",
                          }}
                        >
                          ACTIVE
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(s)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(s.id, s.name)}
                          disabled={isPending}
                          style={{
                            padding: "5px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            background: "transparent",
                            border: "1px solid var(--border)",
                            color: "var(--danger)",
                            cursor: "pointer",
                          }}
                          title="Delete distributor"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with Compact Pagination Controls */}
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Showing{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>
              {" "}–{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {Math.min(currentPage * pageSize, totalCount)}
              </strong>
              {" "}of{" "}
              <strong style={{ color: "var(--text-primary)" }}>{totalCount}</strong>
              {" "}distributors
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: currentPage <= 1 ? "transparent" : "var(--scaffold-bg)",
                  color: currentPage <= 1 ? "var(--text-secondary)" : "var(--text-primary)",
                  opacity: currentPage <= 1 ? 0.35 : 1,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  userSelect: "none",
                }}
              >
                ← Previous
              </button>

              <span
                style={{
                  padding: "3px 10px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontSize: 11,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: currentPage >= totalPages ? "transparent" : "var(--scaffold-bg)",
                  color: currentPage >= totalPages ? "var(--text-secondary)" : "var(--text-primary)",
                  opacity: currentPage >= totalPages ? 0.35 : 1,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  userSelect: "none",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Distributor Sub-Modal */}
      {editingSupplier && (
        <Modal onClose={() => setEditingSupplier(null)}>
          <div
            style={{
              width: 520,
              maxWidth: "94vw",
              background: "var(--card-bg)",
              borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.55)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                  ✏️ Edit Distributor Details
                </h4>
                <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
                  ID: {editingSupplier.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSupplier(null)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit}>
              <div style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    DISTRIBUTOR NAME *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
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
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    CATEGORIES (COMMA-SEPARATED)
                  </label>
                  <input
                    type="text"
                    value={editCategories}
                    onChange={(e) => setEditCategories(e.target.value)}
                    placeholder="e.g. FMCG, Dairy, Beverages"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        marginBottom: 4,
                      }}
                    >
                      PHONE (10 DIGITS)
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      maxLength={10}
                      placeholder="10-digit number"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
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
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        marginBottom: 4,
                      }}
                    >
                      GSTIN (15 CHARS)
                    </label>
                    <input
                      type="text"
                      value={editGstin}
                      onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                      maxLength={15}
                      placeholder="27ABCDE1234F1Z5"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--scaffold-bg)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        textTransform: "uppercase",
                        fontFamily: "monospace",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="distributor@example.com"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border)",
                  background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingSupplier(null)}
                  disabled={isPending}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
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
                    padding: "8px 18px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    background: "var(--cta-bg)",
                    color: "var(--cta-text)",
                    border: "none",
                    cursor: isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* CSV Import Modal (reuses validateBulkSupplierImport and commitBulkSupplierImport) */}
      {showImportCsv && (
        <ImportCsvModal
          onClose={() => {
            setShowImportCsv(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
