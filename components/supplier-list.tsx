"use client";

import { useState, useTransition } from "react";
import { addSupplier, toggleSupplierStatus, deleteSupplier } from "@/actions/supplier";
import { SupplierRow } from "@/lib/services/supplier-service";
import { useRouter } from "next/navigation";

export function SupplierList({ suppliers }: { suppliers: SupplierRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addSupplier({
        supplierID: form.get("supplierID") as string,
        name: form.get("name") as string,
        email: form.get("email") as string,
        phone: form.get("phone") as string,
        categories: form.get("categories") as string,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Distributors / Suppliers</h1>
        <button onClick={() => setOpen(!open)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>
          {open ? "Cancel" : "+ Add Distributor"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 380, marginBottom: 20 }}>
          <input name="supplierID" placeholder="Supplier ID (optional)" style={{ padding: 8 }} />
          <input name="name" placeholder="Distributor name" required style={{ padding: 8 }} />
          <input name="email" type="email" placeholder="Email" style={{ padding: 8 }} />
          <input name="phone" placeholder="Phone" style={{ padding: 8 }} />
          <input name="categories" placeholder="Categories (e.g. Dairy, Snacks)" style={{ padding: 8 }} />
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
            {isPending ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {suppliers.length === 0 ? (
        <p style={{ color: "#888" }}>No distributors yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Name</th>
              <th style={{ padding: 10 }}>Categories</th>
              <th style={{ padding: 10 }}>Phone</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #222", opacity: s.isActive ? 1 : 0.5 }}>
                <td style={{ padding: 10 }}>{s.name}</td>
                <td style={{ padding: 10 }}>{s.categories}</td>
                <td style={{ padding: 10 }}>{s.phone}</td>
                <td style={{ padding: 10 }}>{s.isActive ? "Active" : "Inactive"}</td>
                <td style={{ padding: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => startTransition(async () => { await toggleSupplierStatus(s.id, s.isActive); router.refresh(); })}>
                    {s.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => startTransition(async () => { await deleteSupplier(s.id); router.refresh(); })} style={{ color: "#ef4444" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}