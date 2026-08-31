"use client";

import { useState, useTransition } from "react";
import { addProduct } from "@/actions/inventory";
import { useRouter } from "next/navigation";
import { Card, Button, Input, ErrorBanner } from "@/components/ui";

const GST_SLABS = ["0", "5", "12", "18", "28"];

export function AddProductForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    startTransition(async () => {
      const res = await addProduct(payload);
      if (!res.ok) setError(res.error ?? "Failed to add product.");
      else { setOpen(false); router.refresh(); }
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Add Product</Button>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <Card style={{ width: 600 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Add New Master SKU</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>Register a new product into the enterprise inventory.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Barcode (Primary Key)</label>
              <Input name="barcode" placeholder="Scan or enter" required style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Product Name</label>
              <Input name="name" placeholder="Example: Tata Salt 1kg" required style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Selling Price (₹)</label>
              <Input name="price" type="number" step="0.01" placeholder="0.00" required style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Unit Cost (₹) (your buy price)</label>
              <Input name="unitCost" type="number" step="0.01" placeholder="0.00" style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Included GST Slab</label>
              <select name="gst" defaultValue="0" style={{ width: "100%", marginTop: 4, padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}>
                {GST_SLABS.map((g) => <option key={g} value={g}>{g}% GST</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Weight / Volume</label>
              <Input name="weight" placeholder="500g / 1L" style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Physical Stock</label>
              <Input name="physicalStock" type="number" placeholder="Units" required style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Expiry Date</label>
              <Input name="expiryDate" type="date" style={{ width: "100%", marginTop: 4 }} />
            </div>
          </div>

          {error && <div style={{ marginTop: 16 }}><ErrorBanner message={error} /></div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Registering..." : "✓ Register Master SKU"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}