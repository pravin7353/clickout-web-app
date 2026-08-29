"use client";

import { useState, useTransition } from "react";
import { addProduct } from "@/actions/inventory";
import { useRouter } from "next/navigation";

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
      if (!res.ok) {
        setError(res.error ?? "Failed to add product");
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>+ Add Product</button>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 400 }}>
      <input name="barcode" placeholder="Barcode" required style={{ padding: 8 }} />
      <input name="name" placeholder="Product name" required style={{ padding: 8 }} />
      <input name="price" type="number" step="0.01" placeholder="Price" required style={{ padding: 8 }} />
      <input name="unitCost" type="number" step="0.01" placeholder="Unit cost" style={{ padding: 8 }} />
      <input name="physicalStock" type="number" placeholder="Opening stock" required style={{ padding: 8 }} />
      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ padding: 8 }}>Cancel</button>
      </div>
    </form>
  );
}