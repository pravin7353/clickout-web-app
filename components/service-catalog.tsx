"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import {
  addService,
  deleteService,
  bulkDeleteServices,
  validateBulkServiceImport,
  commitBulkServiceImport,
  ValidateBulkServiceReport,
} from "@/actions/service";
import { ServiceRow } from "@/lib/services/service-catalog-service";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/profile-menu";
import { EditServiceModal } from "@/components/edit-service-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { CustomSelect, OptionItem } from "@/components/custom-select";
import { Button, Card } from "@/components/ui";

const GST_OPTIONS: OptionItem[] = [
  { value: "0% GST", label: "0% GST", icon: "🧾" },
  { value: "5% GST", label: "5% GST", icon: "🧾" },
  { value: "12% GST", label: "12% GST", icon: "🧾" },
  { value: "18% GST", label: "18% GST (Standard)", icon: "🧾" },
  { value: "28% GST", label: "28% GST", icon: "🧾" },
];

const SERVICE_TEMPLATE_COLUMNS = "code, name, price, gst, sac";
const SERVICE_TEMPLATE_EXAMPLE = "SRV-01, Standard Garment Alteration, 350, 18% GST, 9983";

function formatGstDisplay(rawGst?: string): string {
  if (!rawGst) return "18% GST";
  const trimmed = rawGst.trim();
  if (trimmed.includes("%")) return trimmed;
  return `${trimmed}% GST`;
}

export function ServiceCatalog({
  services,
  canEdit = false,
  branchCode,
  totalCount,
  currentPage = 1,
  totalPages = 1,
}: {
  services: ServiceRow[];
  canEdit?: boolean;
  branchCode?: string | null;
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Selection state for bulk operations
  const [selectedBarcodes, setSelectedBarcodes] = useState<string[]>([]);

  // Add Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [gst, setGst] = useState("18% GST");
  const [sac, setSac] = useState("");

  const isGstZero = gst === "0% GST";

  function handleGstChange(val: string) {
    setGst(val);
    if (val === "0% GST") {
      setSac("");
    }
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!code.trim()) {
      setError("Service Code / Barcode is required.");
      return;
    }
    if (!name.trim()) {
      setError("Service Name is required.");
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      setError("Please enter a valid price (>= 0).");
      return;
    }

    startTransition(async () => {
      const res = await addService(
        {
          barcode: code.trim().toUpperCase(),
          name: name.trim(),
          price: numericPrice,
          gst,
          sac: isGstZero ? "" : sac.trim(),
        },
        branchCode ?? undefined
      );

      if (!res.ok) {
        setError(res.error ?? "Failed to add service.");
      } else {
        setOpenAdd(false);
        setCode("");
        setName("");
        setPrice("");
        setGst("18% GST");
        setSac("");
        router.refresh();
      }
    });
  }

  const [serviceToDelete, setServiceToDelete] = useState<{ barcode: string; name: string } | null>(null);

  function handleConfirmDelete() {
    if (!serviceToDelete) return;
    startTransition(async () => {
      const res = await deleteService(serviceToDelete.barcode, branchCode ?? undefined);
      if (res.ok) {
        setServiceToDelete(null);
        setSelectedBarcodes((prev) => prev.filter((b) => b !== serviceToDelete.barcode));
        router.refresh();
      } else {
        setError(res.error ?? "Failed to delete service.");
        setServiceToDelete(null);
      }
    });
  }

  // Bulk Selection Handlers
  const currentPageBarcodes = useMemo(() => services.map((s) => s.barcode), [services]);
  const isAllSelected =
    services.length > 0 &&
    currentPageBarcodes.every((bc) => selectedBarcodes.includes(bc));

  function handleToggleAll() {
    if (isAllSelected) {
      setSelectedBarcodes((prev) => prev.filter((bc) => !currentPageBarcodes.includes(bc)));
    } else {
      const nextSet = new Set(selectedBarcodes);
      currentPageBarcodes.forEach((bc) => nextSet.add(bc));
      setSelectedBarcodes(Array.from(nextSet));
    }
  }

  function handleToggleRow(barcode: string) {
    setSelectedBarcodes((prev) =>
      prev.includes(barcode) ? prev.filter((bc) => bc !== barcode) : [...prev, barcode]
    );
  }

  function handleBulkDelete() {
    if (selectedBarcodes.length === 0) return;
    if (confirm(`Delete ${selectedBarcodes.length} selected services? This cannot be undone.`)) {
      startTransition(async () => {
        const res = await bulkDeleteServices(selectedBarcodes, branchCode ?? undefined);
        if (!res.ok && res.errors.length > 0) {
          alert(`Bulk delete encountered issues:\n${res.errors.join("\n")}`);
        }
        setSelectedBarcodes([]);
        router.refresh();
      });
    }
  }

  // Bulk Import State
  const [importText, setImportText] = useState("");
  const [validationReport, setValidationReport] = useState<ValidateBulkServiceReport | null>(null);
  const [commitResults, setCommitResults] = useState<{
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  const [importGeneralError, setImportGeneralError] = useState("");
  const [importFilter, setImportFilter] = useState<"all" | "valid" | "error">("all");
  const [importPage, setImportPage] = useState(1);
  const importPageSize = 8;
  const importFileInputRef = useRef<HTMLInputElement>(null);

  function handleImportReset() {
    setImportText("");
    setValidationReport(null);
    setCommitResults(null);
    setImportGeneralError("");
    setImportFilter("all");
    setImportPage(1);
  }

  function handleImportTextChange(val: string) {
    setImportText(val);
    if (validationReport) setValidationReport(null);
    if (commitResults) setCommitResults(null);
    if (importGeneralError) setImportGeneralError("");
    setImportPage(1);
  }

  function handleImportFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || "";
      handleImportTextChange(content);
    };
    reader.readAsText(file);
    if (importFileInputRef.current) importFileInputRef.current.value = "";
  }

  function handleValidateImport() {
    if (!importText.trim()) return;
    setImportGeneralError("");
    startTransition(async () => {
      try {
        const rep = await validateBulkServiceImport(importText, branchCode ?? undefined);
        if (!rep.ok) {
          setImportGeneralError(rep.error ?? "Validation failed.");
        } else {
          setValidationReport(rep);
          setCommitResults(null);
          setImportFilter("all");
          setImportPage(1);
        }
      } catch (e: any) {
        setImportGeneralError(e.message ?? "Failed to validate service catalog data.");
      }
    });
  }

  function handleCommitImport() {
    if (!validationReport || validationReport.validCount === 0) return;
    const validRows = validationReport.rows.filter((r) => r.status === "valid");
    setImportGeneralError("");
    startTransition(async () => {
      try {
        const res = await commitBulkServiceImport(validRows, branchCode ?? undefined);
        if (res.ok) {
          setCommitResults({
            successCount: res.successCount ?? res.count ?? 0,
            failCount: res.failCount ?? 0,
            errors: res.errors ?? [],
          });
          router.refresh();
        } else {
          setImportGeneralError(res.error ?? "Failed to commit services.");
        }
      } catch (e: any) {
        setImportGeneralError(e.message ?? "Error occurred during service commit.");
      }
    });
  }

  function copyServiceTemplate() {
    navigator.clipboard.writeText(`${SERVICE_TEMPLATE_COLUMNS}\n${SERVICE_TEMPLATE_EXAMPLE}`);
  }

  // Filtered import rows
  const filteredImportRows = useMemo(() => {
    if (!validationReport) return [];
    if (importFilter === "valid") return validationReport.rows.filter((r) => r.status === "valid");
    if (importFilter === "error") return validationReport.rows.filter((r) => r.status === "error");
    return validationReport.rows;
  }, [validationReport, importFilter]);

  const totalImportPages = Math.max(1, Math.ceil(filteredImportRows.length / importPageSize));
  const displayedImportRows = useMemo(() => {
    const start = (importPage - 1) * importPageSize;
    return filteredImportRows.slice(start, start + importPageSize);
  }, [filteredImportRows, importPage, importPageSize]);

  // Search filtering
  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) return services;
    const q = searchQuery.toLowerCase().trim();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.barcode.toLowerCase().includes(q) ||
        (s.sac && s.sac.toLowerCase().includes(q))
    );
  }, [services, searchQuery]);

  function getPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (branchCode) params.set("store", branchCode);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/service?${qs}` : "/service";
  }

  const effectiveTotal = totalCount ?? services.length;

  return (
    <>
      {/* Top Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Service Catalog Offerings ✂️
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--accent-blue-subtle)",
                color: "var(--accent-blue)",
                border: "1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)",
              }}
            >
              {searchQuery ? `${filteredServices.length} Matching` : `${effectiveTotal} ${effectiveTotal === 1 ? "Service" : "Services"}`}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            {branchCode ? `Active services configured for store: ${branchCode}` : "All tenant services"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Search bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "0 12px",
              width: 260,
              transition: "border-color 0.15s ease",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--text-secondary)", marginRight: 8 }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Service Name..."
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "9px 0",
                fontSize: 13,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 2,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {canEdit && (
            <>
              {/* Import CSV Trigger Button */}
              <button
                type="button"
                onClick={() => {
                  setOpenImport(true);
                  handleImportReset();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📥</span>
                <span>Import CSV</span>
              </button>

              {/* Add Service Button */}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setOpenAdd(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  background: "var(--accent-blue)",
                  border: "none",
                  color: "#FFFFFF",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 2px 8px color-mix(in srgb, var(--accent-blue) 35%, transparent)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                <span>Add Service</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table Container */}
      {filteredServices.length === 0 ? (
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            padding: "60px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
            {searchQuery ? "No matching services found" : "No services registered in this catalog yet"}
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            {searchQuery
              ? `No services match "${searchQuery}". Try clearing your search.`
              : "Register fixed-price labor or non-inventory offerings like salon services, repair, or gift wrapping."}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: "var(--card-bg)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 750 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                    background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                  }}
                >
                  {canEdit && (
                    <th style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleAll}
                        aria-label="Select all on this page"
                        style={{
                          cursor: "pointer",
                          width: 16,
                          height: 16,
                          accentColor: "var(--accent-blue, #2563EB)",
                        }}
                      />
                    </th>
                  )}
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    SERVICE CODE
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    SERVICE NAME
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    CHARGE
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    GST
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    SAC CODE
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
                    STATUS
                  </th>
                  <th style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textAlign: "right" }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((s) => (
                  <tr
                    key={s.id || s.barcode}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s ease",
                      background: selectedBarcodes.includes(s.barcode)
                        ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedBarcodes.includes(s.barcode)) {
                        e.currentTarget.style.background = "color-mix(in srgb, var(--text-primary) 3%, transparent)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedBarcodes.includes(s.barcode)) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {/* Checkbox column */}
                    {canEdit && (
                      <td style={{ padding: "14px 18px", width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedBarcodes.includes(s.barcode)}
                          onChange={() => handleToggleRow(s.barcode)}
                          aria-label={`Select ${s.name}`}
                          style={{
                            cursor: "pointer",
                            width: 16,
                            height: 16,
                            accentColor: "var(--accent-blue, #2563EB)",
                          }}
                        />
                      </td>
                    )}

                    {/* Service Code */}
                    <td
                      style={{
                        padding: "14px 18px",
                        fontFamily: "monospace",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {s.barcode}
                    </td>

                    {/* Service Name */}
                    <td
                      style={{
                        padding: "14px 18px",
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text-primary)",
                      }}
                    >
                      {s.name}
                    </td>

                    {/* Charge */}
                    <td
                      style={{
                        padding: "14px 18px",
                        fontWeight: 800,
                        fontSize: 14,
                        color: "var(--accent-blue)",
                      }}
                    >
                      ₹{s.price.toFixed(2)}
                    </td>

                    {/* GST */}
                    <td style={{ padding: "14px 18px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "var(--accent-blue-subtle)",
                          color: "var(--accent-blue)",
                        }}
                      >
                        {formatGstDisplay(s.gst)}
                      </span>
                    </td>

                    {/* SAC Code */}
                    <td
                      style={{
                        padding: "14px 18px",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        fontFamily: s.sac ? "monospace" : "inherit",
                      }}
                    >
                      {s.sac || "—"}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 18px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "color-mix(in srgb, var(--accent-blue) 12%, transparent)",
                          color: "var(--accent-blue)",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "0.03em",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--accent-blue)",
                          }}
                        />
                        ACTIVE
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      {canEdit ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "flex-end",
                          }}
                        >
                          {/* ✏️ EDIT BUTTON */}
                          <button
                            type="button"
                            onClick={() => setEditingService(s)}
                            title={`Edit ${s.name}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              background: "var(--accent-blue-subtle)",
                              color: "var(--accent-blue)",
                              border: "1px solid color-mix(in srgb, var(--accent-blue) 35%, transparent)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--accent-blue)";
                              e.currentTarget.style.color = "#FFFFFF";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "var(--accent-blue-subtle)";
                              e.currentTarget.style.color = "var(--accent-blue)";
                            }}
                          >
                            <span>✏️</span>
                            <span>Edit</span>
                          </button>

                          {/* 🗑️ DELETE BUTTON */}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setServiceToDelete({ barcode: s.barcode, name: s.name })}
                            title={`Delete ${s.name}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                              color: "var(--danger)",
                              border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                              cursor: isPending ? "not-allowed" : "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!isPending) {
                                e.currentTarget.style.background = "var(--danger)";
                                e.currentTarget.style.color = "#FFFFFF";
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "color-mix(in srgb, var(--danger) 10%, transparent)";
                              e.currentTarget.style.color = "var(--danger)";
                            }}
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>View-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
            Showing {(currentPage - 1) * 25 + 1} – {Math.min(currentPage * 25, effectiveTotal)} of {effectiveTotal} services
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {currentPage > 1 ? (
              <Link
                href={getPageUrl(currentPage - 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ← Previous
              </Link>
            ) : (
              <span
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  opacity: 0.35,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "not-allowed",
                  userSelect: "none",
                }}
              >
                ← Previous
              </span>
            )}

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

            {currentPage < totalPages ? (
              <Link
                href={getPageUrl(currentPage + 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--scaffold-bg)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Next →
              </Link>
            ) : (
              <span
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  opacity: 0.35,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "not-allowed",
                  userSelect: "none",
                }}
              >
                Next →
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {canEdit && selectedBarcodes.length > 0 && (
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
                background: "var(--accent-blue)",
                color: "#FFFFFF",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {selectedBarcodes.length}
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
            🗑️ Delete Selected
          </button>

          <button
            type="button"
            onClick={() => setSelectedBarcodes([])}
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Two-Step Bulk Import Modal */}
      {openImport && (
        <Modal onClose={() => setOpenImport(false)}>
          <div
            style={{
              width: 820,
              maxWidth: "95vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              overflow: "hidden",
              boxShadow: "0 28px 70px rgba(0, 0, 0, 0.45)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "92vh",
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
                <span style={{ fontSize: 24 }}>✂️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                    Bulk Service Catalog Ingestion
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Auto-detects Comma, Tab (Excel), or Semicolon delimiters with pre-validation
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenImport(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div
              style={{
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                overflowY: "auto",
                flex: 1,
              }}
            >
              {/* Instructions format card */}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Expected Columns:</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={copyServiceTemplate}
                      style={{
                        background: "transparent",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 11,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      📋 Copy Template
                    </button>
                    <input
                      type="file"
                      ref={importFileInputRef}
                      onChange={handleImportFileUpload}
                      accept=".csv,.tsv,.txt"
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => importFileInputRef.current?.click()}
                      style={{
                        background: "transparent",
                        border: "1px dashed var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 11,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      📎 Choose File (.csv, .tsv, .txt)
                    </button>
                  </div>
                </div>
                <code style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                  {SERVICE_TEMPLATE_COLUMNS}
                </code>
                <div style={{ marginTop: 6, opacity: 0.85, fontSize: 11 }}>
                  e.g.: <code>{SERVICE_TEMPLATE_EXAMPLE}</code>
                </div>
                {branchCode && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "var(--accent-blue)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span>🔒</span>
                    <span>Targeting Store Branch: {branchCode}</span>
                  </div>
                )}
              </div>

              {/* General Error Banner */}
              {importGeneralError && (
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
                  ⚠️ {importGeneralError}
                </div>
              )}

              {/* Input Area */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                    Paste CSV or Excel Data:
                  </label>
                  {importText && (
                    <button
                      type="button"
                      onClick={handleImportReset}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: 11,
                        color: "var(--danger)",
                        cursor: "pointer",
                      }}
                    >
                      Clear text
                    </button>
                  )}
                </div>
                <textarea
                  rows={validationReport ? 4 : 7}
                  value={importText}
                  onChange={(e) => handleImportTextChange(e.target.value)}
                  placeholder={`Paste CSV / Excel rows here...\n${SERVICE_TEMPLATE_COLUMNS}\n${SERVICE_TEMPLATE_EXAMPLE}`}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--scaffold-bg)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Validation Action Button (Step 1) */}
              {!validationReport && !commitResults && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={handleValidateImport}
                    disabled={isPending || !importText.trim()}
                    style={{
                      background: "var(--accent-blue)",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 24px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: isPending || !importText.trim() ? "not-allowed" : "pointer",
                      opacity: isPending || !importText.trim() ? 0.6 : 1,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {isPending ? "Validating Services..." : "🔍 Validate Services (Step 1)"}
                  </button>
                </div>
              )}

              {/* Validation Report Table (Zero Writes) */}
              {validationReport && !commitResults && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    padding: 16,
                    background: "var(--scaffold-bg)",
                  }}
                >
                  {/* Summary Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: "color-mix(in srgb, var(--success) 15%, transparent)",
                          color: "var(--success)",
                          border: "1px solid var(--success)",
                        }}
                      >
                        ✓ {validationReport.validCount} Valid
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background:
                            validationReport.errorCount > 0
                              ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                              : "transparent",
                          color: validationReport.errorCount > 0 ? "var(--danger)" : "var(--text-secondary)",
                          border: `1px solid ${
                            validationReport.errorCount > 0 ? "var(--danger)" : "var(--border)"
                          }`,
                        }}
                      >
                        {validationReport.errorCount > 0
                          ? `🚨 ${validationReport.errorCount} Issues`
                          : "0 Issues"}
                      </span>
                      {validationReport.delimiter && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            background: "var(--card-bg)",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                          }}
                        >
                          Delimiter:{" "}
                          {validationReport.delimiter === "\t"
                            ? "Tab (Excel)"
                            : validationReport.delimiter === ";"
                            ? "Semicolon (;)"
                            : "Comma (,)"}
                        </span>
                      )}
                    </div>

                    {/* Filter Tabs */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["all", "valid", "error"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            setImportFilter(f);
                            setImportPage(1);
                          }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: importFilter === f ? "var(--text-primary)" : "transparent",
                            color: importFilter === f ? "var(--scaffold-bg)" : "var(--text-secondary)",
                            border: `1px solid ${importFilter === f ? "var(--text-primary)" : "var(--border)"}`,
                          }}
                        >
                          {f === "all"
                            ? `All (${validationReport.rows.length})`
                            : f === "valid"
                            ? `Valid (${validationReport.validCount})`
                            : `Errors (${validationReport.errorCount})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rows Table */}
                  <div
                    style={{
                      overflowX: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      background: "var(--card-bg)",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--scaffold-bg)" }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 45 }}>#</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 80 }}>Status</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Service Code</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Service Name</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", width: 80 }}>Charge</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 80 }}>GST</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", width: 75 }}>SAC</th>
                          <th style={{ padding: "8px 10px", textAlign: "left" }}>Pre-Check Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedImportRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>
                              No rows match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          displayedImportRows.map((r) => (
                            <tr
                              key={r.lineNumber}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                background:
                                  r.status === "error"
                                    ? "color-mix(in srgb, var(--danger) 5%, transparent)"
                                    : "transparent",
                              }}
                            >
                              <td style={{ padding: "8px 10px", fontFamily: "monospace", opacity: 0.7 }}>
                                {r.lineNumber}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {r.status === "valid" ? (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "var(--success)",
                                      background: "color-mix(in srgb, var(--success) 12%, transparent)",
                                      padding: "2px 6px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    ✓ Valid
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "var(--danger)",
                                      background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                                      padding: "2px 6px",
                                      borderRadius: 6,
                                    }}
                                  >
                                    ✕ Issue
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 700, fontFamily: "monospace" }}>
                                {r.barcode}
                              </td>
                              <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                                ₹{r.price.toFixed(2)}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {r.gst}
                              </td>
                              <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                                {r.sac || "—"}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {r.status === "valid" ? (
                                  <span style={{ color: "var(--success)", fontSize: 11 }}>Ready to commit</span>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {r.errors.map((err, eIdx) => (
                                      <span key={eIdx} style={{ color: "var(--danger)", fontSize: 11 }}>
                                        • {err}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls inside Report */}
                  {totalImportPages > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>
                        Showing {Math.min((importPage - 1) * importPageSize + 1, filteredImportRows.length)} -{" "}
                        {Math.min(importPage * importPageSize, filteredImportRows.length)} of {filteredImportRows.length} rows
                      </span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={importPage === 1}
                          onClick={() => setImportPage((p) => Math.max(1, p - 1))}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: 11,
                            cursor: importPage === 1 ? "not-allowed" : "pointer",
                            opacity: importPage === 1 ? 0.4 : 1,
                          }}
                        >
                          Previous
                        </button>
                        <span style={{ fontSize: 11 }}>
                          Page {importPage} of {totalImportPages}
                        </span>
                        <button
                          type="button"
                          disabled={importPage >= totalImportPages}
                          onClick={() => setImportPage((p) => Math.min(totalImportPages, p + 1))}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "var(--card-bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: 11,
                            cursor: importPage >= totalImportPages ? "not-allowed" : "pointer",
                            opacity: importPage >= totalImportPages ? 0.4 : 1,
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation / Action Step */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 4,
                      paddingTop: 12,
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleValidateImport}
                      disabled={isPending}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        cursor: isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      🔄 Re-validate Text
                    </button>

                    {validationReport.validCount > 0 ? (
                      <button
                        type="button"
                        onClick={handleCommitImport}
                        disabled={isPending}
                        style={{
                          background: "var(--accent-blue)",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 12,
                          padding: "10px 24px",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: isPending ? "not-allowed" : "pointer",
                          opacity: isPending ? 0.6 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {isPending
                          ? "Committing Valid Services..."
                          : `🚀 Confirm Import (${validationReport.validCount} valid services)`}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                        All rows have issues. Fix errors in text and re-validate before importing.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Commit Final Results (Step 2 Complete) */}
              {commitResults && (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: 16,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>🎉</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                        Import Batch Completed
                      </h4>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        Services have been committed to the store service catalog.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    <div
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        background: "color-mix(in srgb, var(--success) 15%, transparent)",
                        border: "1px solid var(--success)",
                        color: "var(--success)",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      ✅ {commitResults.successCount} Services Imported Successfully
                    </div>
                    {commitResults.failCount > 0 && (
                      <div
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                          border: "1px solid var(--danger)",
                          color: "var(--danger)",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        🚨 {commitResults.failCount} Failed During Write
                      </div>
                    )}
                  </div>

                  {commitResults.errors.length > 0 && (
                    <div
                      style={{
                        maxHeight: 120,
                        overflowY: "auto",
                        fontSize: 11,
                        color: "var(--danger)",
                        padding: 10,
                        borderRadius: 8,
                        background: "var(--card-bg)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {commitResults.errors.map((err, idx) => (
                        <div key={idx}>• {err}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleImportReset}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      Import Another Batch
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenImport(false)}
                      style={{
                        background: "var(--accent-blue)",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: 10,
                        padding: "8px 18px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              {!commitResults && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                    marginTop: 6,
                    paddingTop: 14,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenImport(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "8px 16px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Add Service Modal */}
      {openAdd && (
        <Modal onClose={() => setOpenAdd(false)}>
          <div
            style={{
              width: 740,
              maxWidth: "94vw",
              background: "var(--card-bg)",
              borderRadius: 24,
              border: "1px solid var(--border)",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
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
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--accent-blue-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    border: "1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)",
                  }}
                >
                  ✂️
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      margin: "0 0 4px 0",
                      color: "var(--text-primary)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Add New Service
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      margin: 0,
                    }}
                  >
                    Register a non-physical service (e.g. Hair Spa, Alterations, Repairs, Consultation).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpenAdd(false)}
                title="Close"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--scaffold-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddSubmit}>
              <div style={{ padding: "26px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
                {error && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                      border: "1px solid var(--danger)",
                      color: "var(--danger)",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 600,
                    }}
                  >
                    🚨 {error}
                  </div>
                )}

                {/* Row 1: Identity */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.6fr",
                    gap: 16,
                  }}
                >
                  {/* Service Code */}
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
                      SERVICE CODE (ID) *
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
                      <span style={{ fontSize: 14, marginRight: 8 }}>🪪</span>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g. SRV-01"
                        required
                        autoFocus
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          padding: "11px 0",
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Service Name */}
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
                      SERVICE NAME *
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
                      <span style={{ fontSize: 14, marginRight: 8 }}>🏷️</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Standard Garment Alteration"
                        required
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          padding: "11px 0",
                          fontSize: 13,
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Pricing & Compliance */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.1fr 1.3fr 1.1fr",
                    gap: 16,
                  }}
                >
                  {/* Price */}
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
                      SERVICE CHARGE (₹) *
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
                      <span style={{ fontSize: 14, marginRight: 6, fontWeight: 700, color: "var(--accent-blue)" }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
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

                  {/* GST */}
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
                      INCLUDED GST SLAB
                    </label>
                    <CustomSelect
                      value={gst}
                      onChange={handleGstChange}
                      options={GST_OPTIONS}
                      prefixIcon="🧾"
                    />
                  </div>

                  {/* SAC */}
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
                      SAC CODE (SERVICE)
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: "var(--scaffold-bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "0 12px",
                        opacity: isGstZero ? 0.6 : 1,
                      }}
                    >
                      <span style={{ fontSize: 14, marginRight: 8 }}>🏛️</span>
                      <input
                        type="text"
                        value={sac}
                        onChange={(e) => setSac(e.target.value)}
                        disabled={isGstZero}
                        placeholder={isGstZero ? "N/A for 0% GST" : "e.g. 9983 (optional)"}
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          padding: "11px 0",
                          fontSize: 13,
                          color: "var(--text-primary)",
                          outline: "none",
                          cursor: isGstZero ? "not-allowed" : "text",
                        }}
                      />
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
                  onClick={() => setOpenAdd(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
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
                    background: "var(--accent-blue)",
                    border: "none",
                    color: "#FFFFFF",
                    cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s ease",
                    boxShadow: "0 2px 8px color-mix(in srgb, var(--accent-blue) 35%, transparent)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isPending) e.currentTarget.style.filter = "brightness(1.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = "none";
                  }}
                >
                  {isPending ? "Saving..." : "✓ Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <EditServiceModal
          service={editingService}
          branchCode={branchCode}
          onClose={() => setEditingService(null)}
        />
      )}

      {/* Delete Service In-App Confirmation (No browser popup!) */}
      <ConfirmModal
        isOpen={!!serviceToDelete}
        title="Delete Service? ✂️"
        message={`Are you sure you want to remove '${serviceToDelete?.name}' from the service catalog?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isPending={isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setServiceToDelete(null)}
      />
    </>
  );
}