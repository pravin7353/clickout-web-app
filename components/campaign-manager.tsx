"use client";

import { useState, useTransition } from "react";
import { createCampaign, deleteCampaign, toggleCampaign } from "@/actions/campaign";
import { Campaign } from "@/lib/services/campaign-service";
import { useRouter } from "next/navigation";

export function CampaignManager({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCampaign({
        branchCode: form.get("branchCode") as string,
        type: form.get("type") as string,
        rewardValue: form.get("rewardValue") as string,
        sponsorTenantId: (form.get("sponsorTenantId") as string) ?? "",
        isActive: form.get("isActive") === "on",
      });
      if (!res.ok) setError(res.error ?? "Failed");
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Campaign Manager</h1>
        <button onClick={() => setOpen(!open)} style={{ padding: "10px 16px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none" }}>
          {open ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #333", borderRadius: 12, maxWidth: 380, marginBottom: 20 }}>
          <input name="branchCode" placeholder="Branch code" required style={{ padding: 8 }} />
          <select name="type" required style={{ padding: 8 }}>
            <option value="DISCOUNT">Discount</option>
            <option value="CASHBACK">Cashback</option>
            <option value="LOYALTY_POINTS">Loyalty Points</option>
            <option value="SPONSORED">Sponsored</option>
          </select>
          <input name="rewardValue" placeholder="Reward value (e.g. 10% off)" required style={{ padding: 8 }} />
          <input name="sponsorTenantId" placeholder="Sponsor tenant ID (optional)" style={{ padding: 8 }} />
          <label style={{ fontSize: 13 }}><input type="checkbox" name="isActive" defaultChecked /> Make active immediately</label>
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={isPending} style={{ padding: 8, background: "#22c55e", color: "#000", border: "none", borderRadius: 6 }}>
            {isPending ? "Saving..." : "Launch Campaign"}
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <p style={{ color: "#888" }}>No campaigns yet.</p>
      ) : (
        campaigns.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, border: "1px solid #333", borderRadius: 10, marginBottom: 10, opacity: c.isActive ? 1 : 0.5 }}>
            <div>
              <strong>{c.type}</strong> — {c.rewardValue}
              <div style={{ fontSize: 12, color: "#888" }}>{c.branchCode} {c.isActive && "· LIVE on Customer App"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => startTransition(async () => { await toggleCampaign(c.id, c.isActive); router.refresh(); })}>
                {c.isActive ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => startTransition(async () => { await deleteCampaign(c.id); router.refresh(); })} style={{ color: "#ef4444" }}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}