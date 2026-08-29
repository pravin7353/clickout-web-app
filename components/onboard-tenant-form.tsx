"use client";

import { useState, useTransition } from "react";
import { onboardTenant } from "@/actions/tenant";
import { useRouter } from "next/navigation";

export function OnboardTenantForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setSuccess("");
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await onboardTenant({
        companyName: form.get("companyName") as string,
        plan: form.get("plan") as "BASIC" | "PRO" | "ENTERPRISE",
        adminName: form.get("adminName") as string,
        adminPhone: form.get("adminPhone") as string,
        adminEmail: form.get("adminEmail") as string,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else { setSuccess(`Onboarded! Tenant ID: ${res.tenantId}`); router.refresh(); }
    });
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>+ Onboard New Client</button>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 420 }}>
      <input name="companyName" placeholder="Company name (e.g. Reliance Fresh)" required style={{ padding: 8 }} />
      <select name="plan" defaultValue="PRO" style={{ padding: 8 }}>
        <option value="BASIC">Basic</option>
        <option value="PRO">Pro</option>
        <option value="ENTERPRISE">Enterprise</option>
      </select>
      <input name="adminName" placeholder="Admin name" required style={{ padding: 8 }} />
      <input name="adminPhone" placeholder="Admin phone" required style={{ padding: 8 }} />
      <input name="adminEmail" type="email" placeholder="Admin email" required style={{ padding: 8 }} />
      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>🚨 {error}</p>}
      {success && <p style={{ color: "#22c55e", fontSize: 13 }}>🚀 {success}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
          {isPending ? "Creating..." : "Onboard Client"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ padding: 8 }}>Cancel</button>
      </div>
    </form>
  );
}