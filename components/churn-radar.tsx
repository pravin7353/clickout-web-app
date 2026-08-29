"use client";

import { useState, useTransition } from "react";
import { sendWinbackOffer } from "@/actions/growth";
import { VipCustomer } from "@/lib/services/churn-service";
import { useRouter } from "next/navigation";

const RISK_COLORS: Record<string, string> = { HIGH: "#ef4444", MEDIUM: "#f97316", SAFE: "#22c55e" };

export function ChurnRadar({ customers }: { customers: VipCustomer[] }) {
  const [isPending, startTransition] = useTransition();
  const [sentId, setSentId] = useState<string | null>(null);
  const router = useRouter();

  function sendOffer(c: VipCustomer) {
    startTransition(async () => {
      const res = await sendWinbackOffer({ targetUserId: c.id, branchCode: c.branchCode, discountPercent: 15, expiryDays: 3 });
      if (res.ok) { setSentId(c.id); router.refresh(); }
    });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Growth Radar — At-Risk VIP Customers</h1>
      <p style={{ color: "#888" }}>Customers above the VIP spend threshold who are overdue for a visit.</p>

      {customers.length === 0 ? (
        <p style={{ marginTop: 20, color: "#888" }}>No at-risk VIPs right now.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 20 }}>
          {customers.map((c) => (
            <div key={c.id} style={{ padding: 16, border: `1px solid ${RISK_COLORS[c.riskLevel]}55`, borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{c.name}</strong>
                <span style={{ fontSize: 11, fontWeight: 700, color: RISK_COLORS[c.riskLevel] }}>{c.riskLevel}</span>
              </div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{c.phone} · {c.branchCode}</div>
              <div style={{ marginTop: 8, fontSize: 13 }}>Spent: ₹{c.totalSpent.toFixed(0)} · {c.totalVisits} visits</div>
              <div style={{ fontSize: 12, color: "#888" }}>Last visit: {new Date(c.lastVisitMs).toLocaleDateString()}</div>
              <button
                disabled={isPending || sentId === c.id}
                onClick={() => sendOffer(c)}
                style={{ marginTop: 12, width: "100%", padding: 8, background: sentId === c.id ? "#333" : "#22c55e", color: sentId === c.id ? "#888" : "#000", border: "none", borderRadius: 6 }}
              >
                {sentId === c.id ? "Offer Sent ✓" : "Send Winback Offer (15% off)"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}