"use client";

import { useState, useTransition, useMemo } from "react";
import { addService, deleteService } from "@/actions/service";
import { ServiceRow } from "@/lib/services/service-catalog-service";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { EditServiceModal } from "@/components/edit-service-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { CustomSelect, OptionItem } from "@/components/custom-select";

const GST_OPTIONS: OptionItem[] = [
  { value: "0% GST", label: "0% GST", icon: "🧾" },
  { value: "5% GST", label: "5% GST", icon: "🧾" },
  { value: "12% GST", label: "12% GST", icon: "🧾" },
  { value: "18% GST", label: "18% GST (Standard)", icon: "🧾" },
  { value: "28% GST", label: "28% GST", icon: "🧾" },
];

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
}: {
  services: ServiceRow[];
  canEdit?: boolean;
  branchCode?: string | null;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
        router.refresh();
      } else {
        setError(res.error ?? "Failed to delete service.");
        setServiceToDelete(null);
      }
    });
  }

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
              {filteredServices.length} {filteredServices.length === 1 ? "Service" : "Services"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            {branchCode ? `Active services configured for store: ${branchCode}` : "All tenant services"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Search bar matching Flutter */}
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                    background: "color-mix(in srgb, var(--card-bg) 95%, var(--scaffold-bg))",
                  }}
                >
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
                    key={s.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--text-primary) 3%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
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