"use client";

import { useState, useTransition } from "react";
import { updateService } from "@/actions/service";
import { ServiceRow } from "@/lib/services/service-catalog-service";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/profile-menu";
import { CustomSelect, OptionItem } from "@/components/custom-select";

const GST_OPTIONS: OptionItem[] = [
  { value: "0% GST", label: "0% GST", icon: "🧾" },
  { value: "5% GST", label: "5% GST", icon: "🧾" },
  { value: "12% GST", label: "12% GST", icon: "🧾" },
  { value: "18% GST", label: "18% GST (Standard)", icon: "🧾" },
  { value: "28% GST", label: "28% GST", icon: "🧾" },
];

function normalizeGst(rawGst?: string): string {
  if (!rawGst) return "18% GST";
  const trimmed = rawGst.trim();
  if (trimmed.includes("%")) return trimmed;
  return `${trimmed}% GST`;
}

export function EditServiceModal({
  service,
  branchCode,
  onClose,
}: {
  service: ServiceRow;
  branchCode?: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(service.name || "");
  const [price, setPrice] = useState(String(service.price ?? ""));
  const [selectedGst, setSelectedGst] = useState(normalizeGst(service.gst));
  const [sac, setSac] = useState(service.sac || "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isGstZero = selectedGst === "0% GST";

  function handleGstChange(val: string) {
    setSelectedGst(val);
    if (val === "0% GST") {
      setSac("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Service Name is required.");
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      setError("Service Price must be greater than or equal to 0.");
      return;
    }

    startTransition(async () => {
      const res = await updateService(
        {
          barcode: service.barcode,
          name: name.trim(),
          price: numericPrice,
          gst: selectedGst,
          sac: isGstZero ? "" : sac.trim(),
        },
        branchCode ?? undefined
      );

      if (!res.ok) {
        setError(res.error ?? "Failed to update service.");
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
              ✏️
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
                Edit Service Offering
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                Update service details and pricing. Service Code (ID) cannot be changed.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
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

            {/* Row 1: Primary Identity */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.6fr",
                gap: 16,
              }}
            >
              {/* Service Code (Locked) */}
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  <span>SERVICE CODE (ID)</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "var(--accent-blue)",
                      background: "var(--accent-blue-subtle)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    🔒 LOCKED
                  </span>
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "0 12px",
                    opacity: 0.85,
                  }}
                >
                  <span style={{ fontSize: 14, marginRight: 8, opacity: 0.6 }}>🪪</span>
                  <input
                    type="text"
                    value={service.barcode}
                    readOnly
                    disabled
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
                      cursor: "not-allowed",
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
                    transition: "border-color 0.15s ease",
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

            {/* Row 2: Pricing & GST & SAC */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1.3fr 1.1fr",
                gap: 16,
              }}
            >
              {/* Charge */}
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
                  value={selectedGst}
                  onChange={handleGstChange}
                  options={GST_OPTIONS}
                  prefixIcon="🧾"
                />
              </div>

              {/* SAC Code */}
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
                    placeholder={isGstZero ? "N/A for 0% GST" : "e.g. 9983"}
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
              {isPending ? "Updating..." : "✓ Update Service"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
