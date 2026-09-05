"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/profile-menu";
import { SupplierRow } from "@/lib/services/po-service";
import { createSupplier } from "@/actions/procurement";
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.categories && s.categories.toLowerCase().includes(search.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase()))
  );

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Distributor name is required.");
      return;
    }

    startTransition(async () => {
      const res = await createSupplier({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        categories: categories.trim(),
      });

      if (!res.ok) {
        setError(res.error ?? "Failed to add distributor.");
      } else {
        setShowAdd(false);
        setName("");
        setEmail("");
        setPhone("");
        setCategories("");
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
          maxHeight: "85vh",
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

        {/* Action toolbar */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name or category..."
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--scaffold-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />

          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              fontSize: 13,
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

        {/* Add Vendor Form */}
        {showAdd && (
          <form
            onSubmit={handleAddSubmit}
            style={{
              padding: "18px 24px",
              background: "color-mix(in srgb, var(--cta-bg) 5%, var(--scaffold-bg))",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {error && (
              <div style={{ gridColumn: "1 / -1", color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>
                🚨 {error}
              </div>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vendor Name *"
              required
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
            <input
              type="text"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="Categories (e.g. Grocery, Dairy)"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  background: "var(--cta-bg)",
                  color: "var(--cta-text)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isPending ? "Saving..." : "Save Distributor"}
              </button>
            </div>
          </form>
        )}

        {/* Vendors List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
              No distributors found. Click "+ Add Vendor" to register one.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "var(--scaffold-bg)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {s.categories && <span>📦 {s.categories} • </span>}
                      {s.email && <span>✉️ {s.email} • </span>}
                      {s.phone && <span>📞 {s.phone}</span>}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "color-mix(in srgb, var(--success) 12%, transparent)",
                      color: "var(--success)",
                    }}
                  >
                    ACTIVE VENDOR
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
