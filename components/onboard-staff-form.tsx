"use client";

import { useState, useTransition } from "react";
import { onboardStaff } from "@/actions/staff";
import { useRouter } from "next/navigation";

export function OnboardStaffForm() {
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
      const res = await onboardStaff(payload);
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>+ Onboard Staff</button>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 400 }}>
      <input name="empId" placeholder="Employee ID" required style={{ padding: 8 }} />
      <select name="role" required style={{ padding: 8 }}>
        <option value="manager">Manager</option>
        <option value="cashier">Cashier</option>
        <option value="guard">Guard</option>
      </select>
      <input name="name" placeholder="Full name" required style={{ padding: 8 }} />
      <input name="phone" placeholder="10-digit phone" required style={{ padding: 8 }} />
      <input name="email" type="email" placeholder="Email (optional)" style={{ padding: 8 }} />
      <input name="branchCode" placeholder="Branch code" required style={{ padding: 8 }} />
      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
          {isPending ? "Saving..." : "Onboard"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ padding: 8 }}>Cancel</button>
      </div>
    </form>
  );
}