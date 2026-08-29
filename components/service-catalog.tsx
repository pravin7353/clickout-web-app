"use client";

import { useState, useTransition } from "react";
import { addService, deleteService } from "@/actions/service";
import { ServiceRow } from "@/lib/services/service-catalog-service";
import { useRouter } from "next/navigation";

export function ServiceCatalog({ services }: { services: ServiceRow[] }) {
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
      const res = await addService(payload);
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Service Catalog</h1>
        <button onClick={() => setOpen(!open)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>
          {open ? "Cancel" : "+ Add Service"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 380, marginBottom: 20 }}>
          <input name="barcode" placeholder="Service code" required style={{ padding: 8 }} />
          <input name="name" placeholder="Service name" required style={{ padding: 8 }} />
          <input name="price" type="number" step="0.01" placeholder="Price" required style={{ padding: 8 }} />
          <input name="sac" placeholder="SAC code (optional)" style={{ padding: 8 }} />
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
            {isPending ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {services.length === 0 ? (
        <p style={{ color: "#888" }}>No services yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Name</th>
              <th style={{ padding: 10 }}>Price</th>
              <th style={{ padding: 10 }}>GST</th>
              <th style={{ padding: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #222" }}>
                <td style={{ padding: 10 }}>{s.name}</td>
                <td style={{ padding: 10 }}>₹{s.price}</td>
                <td style={{ padding: 10 }}>{s.gst}%</td>
                <td style={{ padding: 10 }}>
                  <button onClick={() => startTransition(async () => { await deleteService(s.barcode); router.refresh(); })} style={{ color: "#ef4444" }}>
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