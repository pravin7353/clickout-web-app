"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import {
  addSupplier,
  updateSupplier,
  toggleSupplierStatus,
  deleteSupplier,
  bulkDeleteSuppliers,
  validateBulkSupplierImport,
  commitBulkSupplierImport,
  ValidateBulkSupplierReport,
} from "@/actions/supplier";
import { SupplierRow } from "@/lib/services/supplier-service";
import { Modal } from "@/components/profile-menu";
import { Card, Button, Input, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function SupplierList({
  suppliers,
  canEdit = false,
}: {
  suppliers: SupplierRow[];
  canEdit?: boolean;
}) {
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openCsvModal, setOpenCsvModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Bulk row selection state (independent)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Add Form State
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCategories, setFormCategories] = useState("");
  const [formGstin, setFormGstin] = useState("");

  // Edit Form State
  const [editFormSupplierId, setEditFormSupplierId] = useState("");
  const [editFormName, setEditFormName] = useState("");
  const [editFormEmail, setEditFormEmail] = useState("");
  const [editFormPhone, setEditFormPhone] = useState("");
  const [editFormCategories, setEditFormCategories] = useState("");
  const [editFormGstin, setEditFormGstin] = useState("");

  // Two-step Bulk Import State
  const [csvText, setCsvText] = useState("");
  const [validationReport, setValidationReport] = useState<ValidateBulkSupplierReport | null>(null);
  const [validationFilter, setValidationFilter] = useState<"all" | "valid" | "error">("all");
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 8;
  const [commitSuccessCount, setCommitSuccessCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Filtered list based on search query
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.supplierID.toLowerCase().includes(q) ||
        s.categories.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  // Main list pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Selection toggle logic (current page)
  const currentPageIds = useMemo(() => paginatedSuppliers.map((s) => s.id), [paginatedSuppliers]);
  const isAllSelected =
    paginatedSuppliers.length > 0 &&
    currentPageIds.every((id) => selectedIds.includes(id));

  function handleToggleAll() {
    if (isAllSelected) {
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

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (confirm(`Delete ${selectedIds.length} selected distributor(s)? This action cannot be undone.`)) {
      startTransition(async () => {
        const res = await bulkDeleteSuppliers(selectedIds);
        if (!res.ok && res.errors.length > 0) {
          setError(`Issues deleting distributors:\n${res.errors.join("\n")}`);
        } else {
          setSuccess(`Successfully deleted ${res.successCount} distributor(s).`);
        }
        setSelectedIds([]);
        router.refresh();
      });
    }
  }

  // Add Distributor Handler
  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      setError("Distributor name is required.");
      return;
    }
    setError("");

    startTransition(async () => {
      const res = await addSupplier({
        supplierID: formSupplierId.trim() || undefined,
        name: formName.trim(),
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        categories: formCategories.trim() || undefined,
        gstin: formGstin.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to save distributor.");
      } else {
        setOpenAddModal(false);
        setFormSupplierId("");
        setFormName("");
        setFormEmail("");
        setFormPhone("");
        setFormCategories("");
        setFormGstin("");
        setSuccess("Distributor registered successfully.");
        router.refresh();
      }
    });
  }

  // Edit Distributor Handlers
  function handleOpenEdit(s: SupplierRow) {
    setEditingSupplier(s);
    setEditFormSupplierId(s.supplierID);
    setEditFormName(s.name);
    setEditFormEmail(s.email || "");
    setEditFormPhone(s.phone || "");
    setEditFormCategories(s.categories || "");
    setEditFormGstin(s.gstin || "");
    setError("");
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSupplier) return;
    if (!editFormName.trim()) {
      setError("Distributor name is required.");
      return;
    }
    setError("");

    startTransition(async () => {
      const res = await updateSupplier(editingSupplier.id, {
        supplierID: editFormSupplierId.trim() || undefined,
        name: editFormName.trim(),
        email: editFormEmail.trim() || undefined,
        phone: editFormPhone.trim() || undefined,
        categories: editFormCategories.trim() || undefined,
        gstin: editFormGstin.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to update distributor.");
      } else {
        setEditingSupplier(null);
        setSuccess(`Distributor "${editFormName.trim()}" updated successfully.`);
        router.refresh();
      }
    });
  }

  // Two-Step CSV Import Handlers
  function handleResetCsvModal() {
    setCsvText("");
    setValidationReport(null);
    setValidationFilter("all");
    setPreviewPage(1);
    setCommitSuccessCount(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || "";
      setCsvText(text);
      if (validationReport) setValidationReport(null);
      if (commitSuccessCount !== null) setCommitSuccessCount(null);
      setPreviewPage(1);
    };
    reader.readAsText(file);
  }

  function handleValidateCsv() {
    if (!csvText.trim()) {
      setError("Please paste or upload CSV content to validate.");
      return;
    }
    setError("");

    startTransition(async () => {
      const rep = await validateBulkSupplierImport(csvText);
      setValidationReport(rep);
      setValidationFilter("all");
      setPreviewPage(1);
    });
  }

  function handleCommitCsv() {
    if (!validationReport || validationReport.validCount === 0) return;
    const validRows = validationReport.rows
      .filter((r) => r.status === "valid")
      .map((r) => ({
        supplierID: r.supplierID,
        name: r.name,
        email: r.email,
        phone: r.phone,
        categories: r.categories,
        gstin: r.gstin,
      }));

    startTransition(async () => {
      const res = await commitBulkSupplierImport(validRows);
      if (!res.ok) {
        setError(res.error ?? "Commit failed.");
      } else {
        setCommitSuccessCount(res.successCount ?? 0);
        setSuccess(`Successfully imported ${res.successCount} distributor(s)!`);
        setTimeout(() => {
          setOpenCsvModal(false);
          handleResetCsvModal();
          router.refresh();
        }, 1200);
      }
    });
  }

  // Filtered rows for CSV validation preview
  const filteredPreviewRows = useMemo(() => {
    if (!validationReport) return [];
    if (validationFilter === "valid") return validationReport.rows.filter((r) => r.status === "valid");
    if (validationFilter === "error") return validationReport.rows.filter((r) => r.status === "error");
    return validationReport.rows;
  }, [validationReport, validationFilter]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / previewPageSize));
  const currentPreviewPage = Math.min(previewPage, totalPreviewPages);
  const displayedPreviewRows = useMemo(() => {
    const start = (currentPreviewPage - 1) * previewPageSize;
    return filteredPreviewRows.slice(start, start + previewPageSize);
  }, [filteredPreviewRows, currentPreviewPage, previewPageSize]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Header & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/procurement" style={{ textDecoration: "none", fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>
            ← Back to Procurement Pipeline
          </Link>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {canEdit && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  handleResetCsvModal();
                  setOpenCsvModal(true);
                }}
              >
                📥 Import CSV
              </Button>
              <Button onClick={() => setOpenAddModal(true)}>
                + Add Distributor
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {success && (
        <div
          style={{
            padding: "10px 16px",
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

      {/* Stats and Search */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Total Registered Distributors
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>
            {suppliers.length}
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            Active Vendor Network
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>
            {suppliers.filter((s) => s.isActive).length}
          </div>
        </Card>
      </div>

      {/* Search Filter Input */}
      <div>
        <Input
          placeholder="Filter distributors by name, code, phone, GSTIN, or categories..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Distributors Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No distributors found matching query." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                  {canEdit && (
                    <th style={{ padding: "12px 16px", width: 40, textAlign: "center" }}>
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
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>DISTRIBUTOR</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>CODE</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>CATEGORIES</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>PHONE</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>EMAIL</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>GSTIN</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>STATUS</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSuppliers.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: s.isActive ? 1 : 0.6,
                      background: selectedIds.includes(s.id) ? "rgba(249, 168, 38, 0.06)" : "transparent",
                    }}
                  >
                    {canEdit && (
                      <td style={{ padding: "12px 16px", width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={() => handleToggleRow(s.id)}
                          aria-label={`Select ${s.name}`}
                          style={{
                            cursor: "pointer",
                            width: 16,
                            height: 16,
                            accentColor: "var(--cta-bg-accent, #F9A826)",
                          }}
                        />
                      </td>
                    )}
                    <td style={{ padding: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                      {s.name}
                    </td>
                    <td style={{ padding: 12, fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                      {s.supplierID}
                    </td>
                    <td style={{ padding: 12 }}>
                      {s.categories ? (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {s.categories.split(",").map((c, i) => (
                            <Badge key={i} color="var(--primary)">{c.trim()}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>General</span>
                      )}
                    </td>
                    <td style={{ padding: 12, fontSize: 13, color: "var(--text-primary)" }}>
                      {s.phone || "—"}
                    </td>
                    <td style={{ padding: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                      {s.email || "—"}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                      {s.gstin || "—"}
                    </td>
                    <td style={{ padding: 12 }}>
                      <Badge color={s.isActive ? "var(--success)" : "var(--warning)"}>
                        {s.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </td>
                    <td style={{ padding: 12, textAlign: "right" }}>
                      {canEdit && (
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <Button
                            variant="secondary"
                            onClick={() => handleOpenEdit(s)}
                            disabled={isPending}
                            style={{ fontSize: 12, padding: "4px 10px" }}
                          >
                            ✏️ Edit
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => startTransition(async () => {
                              await toggleSupplierStatus(s.id, s.isActive);
                              router.refresh();
                            })}
                            disabled={isPending}
                            style={{ fontSize: 12, padding: "4px 8px" }}
                          >
                            {s.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete distributor "${s.name}"?`)) {
                                startTransition(async () => {
                                  await deleteSupplier(s.id);
                                  router.refresh();
                                });
                              }
                            }}
                            disabled={isPending}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--danger)",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Main List Pagination Controls */}
      {filtered.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
            Showing {(currentPage - 1) * pageSize + 1} –{" "}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} distributors
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "6px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: currentPage === 1 ? "transparent" : "var(--scaffold-bg)",
                color: currentPage === 1 ? "var(--text-secondary)" : "var(--text-primary)",
                opacity: currentPage === 1 ? 0.35 : 1,
                fontWeight: 700,
                fontSize: 12,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
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
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "6px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: currentPage >= totalPages ? "transparent" : "var(--scaffold-bg)",
                color: currentPage >= totalPages ? "var(--text-secondary)" : "var(--text-primary)",
                opacity: currentPage >= totalPages ? 0.35 : 1,
                fontWeight: 700,
                fontSize: 12,
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                userSelect: "none",
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

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
            🗑️ Delete {selectedIds.length} Selected
          </button>

          <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setSelectedIds([])}
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

      {/* Add Distributor Modal */}
      {openAddModal && (
        <Modal onClose={() => setOpenAddModal(false)}>
          <Card style={{ width: 480, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
              Register Distributor
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Add a new supplier or vendor to issue purchase orders and track goods.
            </p>

            <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Distributor Name *
                </label>
                <Input
                  placeholder="e.g. Amul Dairy Logistics"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Supplier Code / ID (Optional)
                </label>
                <Input
                  placeholder="e.g. SUP-AMUL-01"
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Categories
                </label>
                <Input
                  placeholder="e.g. Dairy, Beverages, Ice Cream"
                  value={formCategories}
                  onChange={(e) => setFormCategories(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Contact Phone (10 digits)
                  </label>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="orders@amul.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  GSTIN (Optional, 15 chars)
                </label>
                <Input
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  value={formGstin}
                  onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setOpenAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Distributor"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Edit Distributor Modal */}
      {editingSupplier && (
        <Modal onClose={() => setEditingSupplier(null)}>
          <Card style={{ width: 480, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
              Edit Distributor
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Update distributor profile, contact details, or tax registration.
            </p>

            <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Distributor Name *
                </label>
                <Input
                  placeholder="e.g. Amul Dairy Logistics"
                  value={editFormName}
                  onChange={(e) => setEditFormName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Supplier Code / ID
                </label>
                <Input
                  placeholder="e.g. SUP-AMUL-01"
                  value={editFormSupplierId}
                  onChange={(e) => setEditFormSupplierId(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Categories
                </label>
                <Input
                  placeholder="e.g. Dairy, Beverages, Ice Cream"
                  value={editFormCategories}
                  onChange={(e) => setEditFormCategories(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Contact Phone (10 digits)
                  </label>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={editFormPhone}
                    onChange={(e) => setEditFormPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="orders@amul.com"
                    value={editFormEmail}
                    onChange={(e) => setEditFormEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  GSTIN (Optional, 15 chars)
                </label>
                <Input
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  value={editFormGstin}
                  onChange={(e) => setEditFormGstin(e.target.value.toUpperCase())}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setEditingSupplier(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Two-Step CSV Bulk Import Modal (Validate → Confirm Flow) */}
      {openCsvModal && (
        <Modal onClose={() => setOpenCsvModal(false)}>
          <div
            style={{
              width: 760,
              maxWidth: "95vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.45)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "90vh",
            }}
          >
            {/* Modal Header */}
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
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                  Import Distributors via CSV / Excel
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  Two-stage import: Validate formatting and duplicate prevention before committing to Firestore.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenCsvModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
              {commitSuccessCount !== null ? (
                <div
                  style={{
                    padding: "32px 20px",
                    textAlign: "center",
                    background: "rgba(0, 210, 106, 0.08)",
                    borderRadius: 16,
                    border: "1px solid rgba(0, 210, 106, 0.25)",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--success)" }}>
                    Successfully Imported {commitSuccessCount} Distributor(s)!
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                    Your distributor directory has been updated.
                  </div>
                </div>
              ) : !validationReport ? (
                /* STEP 1: Input & File Upload */
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                      Upload CSV File or Paste Raw Tabular Content
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".csv, text/csv, .txt, .tsv"
                      onChange={handleCsvFileSelect}
                      style={{ fontSize: 12, color: "var(--text-secondary)" }}
                    />
                  </div>

                  <div style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--scaffold-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    Expected columns: <code>supplierID, name, email, phone, categories, gstin</code>. Automatically detects commas, tabs, and semicolons.
                  </div>

                  <textarea
                    rows={10}
                    placeholder={`supplierID,name,email,phone,categories,gstin\nSUP-101,Reliance Wholesale,supply@reliance.com,9876543210,Groceries,27ABCDE1234F1Z5\nSUP-102,Tata Consumer Products,dist@tata.com,9811223344,FMCG & Salt,29ABCDE5678G2Z1`}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--scaffold-bg)",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontFamily: "monospace",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ) : (
                /* STEP 2: Validation Results & Confirmation View */
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Summary Metric Chips */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div style={{ padding: "12px 16px", borderRadius: 12, background: "var(--scaffold-bg)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>TOTAL ROWS</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)" }}>
                        {validationReport.rows.length}
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(0, 210, 106, 0.08)", border: "1px solid rgba(0, 210, 106, 0.25)" }}>
                      <div style={{ fontSize: 11, color: "var(--success)", fontWeight: 700 }}>READY TO COMMIT</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--success)" }}>
                        {validationReport.validCount}
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                      <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700 }}>ROWS WITH ERRORS</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--danger)" }}>
                        {validationReport.errorCount}
                      </div>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div style={{ display: "flex", gap: 8 }}>
                    {(
                      [
                        { key: "all", label: `All (${validationReport.rows.length})` },
                        { key: "valid", label: `✓ Valid (${validationReport.validCount})` },
                        { key: "error", label: `⚠️ Errors (${validationReport.errorCount})` },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setValidationFilter(t.key);
                          setPreviewPage(1);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: "1px solid",
                          borderColor: validationFilter === t.key ? "var(--primary)" : "var(--border)",
                          background: validationFilter === t.key ? "rgba(0, 210, 106, 0.12)" : "transparent",
                          color: validationFilter === t.key ? "var(--text-primary)" : "var(--text-secondary)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Preview Table */}
                  <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                        <thead>
                          <tr style={{ background: "var(--scaffold-bg)", borderBottom: "1px solid var(--border)" }}>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)", width: 50 }}>LINE</th>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>NAME</th>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>PHONE</th>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>GSTIN</th>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>STATUS</th>
                            <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>VALIDATION DETAILS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedPreviewRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>
                                No rows matching filter.
                              </td>
                            </tr>
                          ) : (
                            displayedPreviewRows.map((r) => (
                              <tr
                                key={r.lineNumber}
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                  background: r.status === "error" ? "rgba(239, 68, 68, 0.04)" : "transparent",
                                }}
                              >
                                <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                  #{r.lineNumber}
                                </td>
                                <td style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text-primary)" }}>
                                  {r.name}
                                </td>
                                <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                                  {r.phone || "—"}
                                </td>
                                <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                  {r.gstin || "—"}
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  {r.status === "valid" ? (
                                    <span style={{ color: "var(--success)", fontWeight: 800, fontSize: 11 }}>
                                      ✓ VALID
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--danger)", fontWeight: 800, fontSize: 11 }}>
                                      ⚠️ ERROR
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "8px 12px", color: r.status === "error" ? "var(--danger)" : "var(--text-secondary)" }}>
                                  {r.errors.length > 0 ? r.errors.join("; ") : "Ready for commit"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Preview Pagination */}
                  {filteredPreviewRows.length > previewPageSize && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Page {currentPreviewPage} of {totalPreviewPages} ({filteredPreviewRows.length} total)
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          variant="secondary"
                          disabled={currentPreviewPage === 1}
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          ← Prev
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={currentPreviewPage >= totalPreviewPages}
                          onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
              }}
            >
              {validationReport && commitSuccessCount === null ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setValidationReport(null);
                      setPreviewPage(1);
                    }}
                    disabled={isPending}
                  >
                    ← Back to Edit CSV
                  </Button>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Button type="button" variant="secondary" onClick={() => setOpenCsvModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={isPending || validationReport.validCount === 0}
                      onClick={handleCommitCsv}
                      style={{
                        background: "var(--success)",
                        color: "#000",
                        fontWeight: 800,
                      }}
                    >
                      {isPending
                        ? "Committing..."
                        : `✓ Commit ${validationReport.validCount} Valid Distributors`}
                    </Button>
                  </div>
                </>
              ) : commitSuccessCount !== null ? (
                <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
                  <Button type="button" onClick={() => setOpenCsvModal(false)}>
                    Close
                  </Button>
                </div>
              ) : (
                <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button type="button" variant="secondary" onClick={() => setOpenCsvModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending || !csvText.trim()}
                    onClick={handleValidateCsv}
                    style={{
                      background: "var(--primary)",
                      color: "#000",
                      fontWeight: 800,
                    }}
                  >
                    {isPending ? "Validating..." : "🔍 Validate CSV Content"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}