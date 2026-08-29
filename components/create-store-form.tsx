"use client";

import { useState, useTransition } from "react";
import { createStore } from "@/actions/store";
import { useRouter } from "next/navigation";

export function CreateStoreForm() {
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
      const res = await createStore(payload);
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>+ Create Store</button>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 420 }}>
      <strong>Store details</strong>
      <input name="storeName" placeholder="Store name" required style={{ padding: 8 }} />
      <input name="branchCode" placeholder="Branch code" required style={{ padding: 8 }} />
      <input name="address" placeholder="Address" style={{ padding: 8 }} />
      <input name="city" placeholder="City" style={{ padding: 8 }} />
      <input name="state" placeholder="State" style={{ padding: 8 }} />
      <input name="pincode" placeholder="Pincode" style={{ padding: 8 }} />
      <strong>Manager (assigned to this store)</strong>
      <input name="managerEmpId" placeholder="Manager Employee ID" required style={{ padding: 8 }} />
      <input name="managerName" placeholder="Manager name" required style={{ padding: 8 }} />
      <input name="managerPhone" placeholder="Manager phone (10 digit)" required style={{ padding: 8 }} />
      <input name="managerEmail" type="email" placeholder="Manager email" required style={{ padding: 8 }} />
      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
          {isPending ? "Creating..." : "Create Store"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ padding: 8 }}>Cancel</button>
      </div>
      <p style={{ fontSize: 11, color: "#888" }}>Banking & license details can be added later from the store's page.</p>
    </form>
  );
}