"use client";

import { useState, useTransition } from "react";
import { generateErpApiKey, configurePartnerMode, resendWebhookDelivery } from "@/actions/integrations";

type PartnerMode = { enabled: boolean; webhookUrl: string; webhookSecret: string | null };
type FailedDelivery = { id: string; eventType: string; error: string; httpStatus: number | null };

export function IntegrationsPanel({ existingKey, partnerMode, failedDeliveries }: { existingKey: string | null; partnerMode: PartnerMode; failedDeliveries: FailedDelivery[] }) {
  const [key, setKey] = useState(existingKey);
  const [enabled, setEnabled] = useState(partnerMode.enabled);
  const [url, setUrl] = useState(partnerMode.webhookUrl);
  const [secret, setSecret] = useState(partnerMode.webhookSecret);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const [isPending, startTransition] = useTransition();

  function generateKey() {
    setError("");
    startTransition(async () => {
      const res = await generateErpApiKey();
      if (!res.ok) setError(res.error!);
      else setKey(res.apiKey!);
    });
  }

  function savePartnerMode() {
    setWebhookError("");
    startTransition(async () => {
      const res = await configurePartnerMode(enabled, url);
      if (!res.ok) setWebhookError(res.error!);
      else { setSecret(res.webhookSecret!); setShowSecret(true); }
    });
  }

  function resend(id: string) {
    startTransition(async () => { await resendWebhookDelivery(id); });
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Integrations — ERP / Tally / Busy</h1>
      <p style={{ color: "#888" }}>Generate a read-only API key to pull your audit feed into external accounting tools.</p>

      {key && (
        <div style={{ marginTop: 20, padding: 16, border: "1px solid #333", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: "#888" }}>Your API Key</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <code style={{ flex: 1, padding: 8, background: "#111", borderRadius: 6, wordBreak: "break-all" }}>{key}</code>
            <button onClick={() => navigator.clipboard.writeText(key)}>Copy</button>
          </div>
        </div>
      )}
      {error && <p style={{ color: "#ef4444", marginTop: 12 }}>🚨 {error}</p>}
      <button onClick={generateKey} disabled={isPending} style={{ marginTop: 16, padding: "10px 20px", background: "#22c55e", color: "#000", border: "none", borderRadius: 8, fontWeight: 700 }}>
        {isPending ? "..." : key ? "Regenerate Key" : "Generate API Key"}
      </button>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>Partner Mode (Webhooks)</h2>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable Partner Mode
      </label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/webhook" style={{ width: "100%", padding: 8, marginTop: 8 }} />
      {webhookError && <p style={{ color: "#ef4444", fontSize: 13 }}>{webhookError}</p>}
      <button onClick={savePartnerMode} disabled={isPending} style={{ marginTop: 12, padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8 }}>
        Save & Enable
      </button>

      {secret && showSecret && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f97316", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#f97316" }}>Webhook Secret (save this, shown once)</div>
          <code style={{ wordBreak: "break-all" }}>{secret}</code>
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32 }}>Failed Webhook Deliveries</h2>
      {failedDeliveries.length === 0 ? (
        <p style={{ color: "#888" }}>Koi failed delivery nahi hai 🎉</p>
      ) : (
        failedDeliveries.map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: 10, borderBottom: "1px solid #222" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.eventType}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{d.error}</div>
            </div>
            <button onClick={() => resend(d.id)} disabled={isPending}>Resend</button>
          </div>
        ))
      )}
    </div>
  );
}