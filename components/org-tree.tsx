"use client";

import { useState, useTransition } from "react";
import { addCustomRole } from "@/actions/org";
import { OrgRole } from "@/lib/services/org-service";
import { useRouter } from "next/navigation";

const LEVEL_COLORS: Record<number, string> = { 1: "#EF9F27" };
function levelColor(level: number) {
  if (level === 1) return "#EF9F27";
  if (level < 5) return "#378ADD";
  return "#7F77DD";
}

export function OrgTree({ roles }: { roles: OrgRole[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const reportsTo = form.get("reportsTo") as string;
    startTransition(async () => {
      const res = await addCustomRole({
        roleName: form.get("roleName") as string,
        reportsToId: reportsTo || null,
        level: parseInt(form.get("level") as string, 10) || 99,
        tagPrefix: form.get("tagPrefix") as string,
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Organization Structure</h1>
        <button onClick={() => setOpen(!open)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>
          {open ? "Cancel" : "+ Add Role"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 380, marginBottom: 20 }}>
          <input name="roleName" placeholder="Role name (e.g. Store Head)" required style={{ padding: 8 }} />
          <select name="reportsTo" style={{ padding: 8 }}>
            <option value="">— Top level (reports to no one) —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.roleName}</option>)}
          </select>
          <input name="level" type="number" placeholder="Level (1 = top)" required style={{ padding: 8 }} />
          <input name="tagPrefix" placeholder="Tag prefix (e.g. WEALTH)" required style={{ padding: 8 }} />
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
            {isPending ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {roles.length === 0 ? (
        <p style={{ color: "#888" }}>No custom roles defined yet — using default MANAGER/CASHIER/GUARD hierarchy.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roles.map((r) => (
            <div key={r.id} style={{ marginLeft: (r.level - 1) * 24, padding: 10, border: `1px solid ${levelColor(r.level)}`, borderRadius: 8, maxWidth: 300 }}>
              <strong style={{ color: levelColor(r.level) }}>{r.roleName}</strong>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Level {r.level} · {r.tagPrefix}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}