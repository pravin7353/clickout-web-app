"use client";

import { useState, useTransition } from "react";
import {
  addSupplier,
  toggleSupplierStatus,
  deleteSupplier,
  bulkImportSuppliersAction,
  CsvSupplierRecord,
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
  const [searchQuery, setSearchQuery] = useState("");

  const [formSupplierId, setFormSupplierId] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCategories, setFormCategories] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewCount, setCsvPreviewCount] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Filtered list
  const filtered = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.supplierID.toLowerCase().includes(q) ||
      s.categories.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q)
    );
  });

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
        setSuccess("Distributor registered successfully.");
        router.refresh();
      }
    });
  }

  function handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      setCsvPreviewCount(Math.max(0, lines.length - 1)); // exclude header
    };
    reader.readAsText(file);
  }

  function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvFile) return;
    setError("");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setError("CSV file is empty or missing data rows.");
        return;
      }

      const records: CsvSupplierRecord[] = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
        if (!row[1]) continue;
        records.push({
          supplierID: row[0] || "",
          name: row[1],
          email: row[2] || "",
          phone: row[3] || "",
          categories: row[4] || "",
        });
      }

      startTransition(async () => {
        const res = await bulkImportSuppliersAction(records);
        if (!res.ok) {
          setError(res.error ?? "Import failed.");
        } else {
          setOpenCsvModal(false);
          setCsvFile(null);
          setCsvPreviewCount(null);
          setSuccess(`Successfully imported ${res.count} distributors!`);
          router.refresh();
        }
      });
    };
    reader.readAsText(csvFile);
  }

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
              <Button variant="secondary" onClick={() => setOpenCsvModal(true)}>
                Import CSV
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
          placeholder="Filter distributors by name, ID, phone, or categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Distributors Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No distributors found matching query." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", background: "var(--card-bg)" }}>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>DISTRIBUTOR</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>CODE</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>CATEGORIES</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>PHONE</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>EMAIL</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)" }}>STATUS</th>
                  <th style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--border)", opacity: s.isActive ? 1 : 0.6 }}>
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

      {/* Add Distributor Modal */}
      {openAddModal && (
        <Modal onClose={() => setOpenAddModal(false)}>
          <Card style={{ width: 440, maxWidth: "90vw", padding: 24 }}>
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
                    Contact Phone
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

      {/* CSV Bulk Import Modal */}
      {openCsvModal && (
        <Modal onClose={() => setOpenCsvModal(false)}>
          <Card style={{ width: 440, maxWidth: "90vw", padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
              Import Distributors from CSV
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
              Upload a .csv file with columns: <code>supplierID, name, email, phone, categories</code>
            </p>

            <form onSubmit={handleCsvImport} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                style={{
                  padding: 10,
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  background: "var(--card-bg)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              />

              {csvPreviewCount !== null && (
                <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>
                  ✓ Found {csvPreviewCount} distributor record(s) ready to import.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button type="button" variant="secondary" onClick={() => setOpenCsvModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !csvFile}>
                  {isPending ? "Importing..." : "Run Import"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}
    </div>
  );
}