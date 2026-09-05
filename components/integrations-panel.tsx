"use client";

import { useState, useTransition } from "react";
import { generateErpApiKey, configurePartnerMode, resendWebhookDelivery } from "@/actions/integrations";
import { Card, Button, Input, Badge, EmptyState, ErrorBanner } from "@/components/ui";

type PartnerMode = { enabled: boolean; webhookUrl: string; webhookSecret: string | null };
type FailedDelivery = { id: string; eventType: string; error: string; httpStatus: number | null };

export function IntegrationsPanel({
  existingKey,
  partnerMode,
  failedDeliveries,
}: {
  existingKey: string | null;
  partnerMode: PartnerMode;
  failedDeliveries: FailedDelivery[];
}) {
  const [key, setKey] = useState(existingKey);
  const [enabled, setEnabled] = useState(partnerMode.enabled);
  const [url, setUrl] = useState(partnerMode.webhookUrl);
  const [secret, setSecret] = useState(partnerMode.webhookSecret);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [error, setError] = useState("");
  const [webhookSuccess, setWebhookSuccess] = useState("");
  const [webhookError, setWebhookError] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
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
    setWebhookSuccess("");
    startTransition(async () => {
      const res = await configurePartnerMode(enabled, url);
      if (!res.ok) {
        setWebhookError(res.error!);
      } else {
        setSecret(res.webhookSecret!);
        setShowSecret(true);
        setWebhookSuccess("Partner Mode webhook configuration updated.");
      }
    });
  }

  function resend(id: string) {
    setResendingId(id);
    startTransition(async () => {
      await resendWebhookDelivery(id);
      setResendingId(null);
    });
  }

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 960 }}>
      {/* ERP & Accounting Feed Card */}
      <Card style={{ display: "grid", gap: 16, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 24 }}>🔌</span>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                ERP & Accounting Feed (Tally / Busy / SAP)
              </h2>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Issue read-only REST API keys to securely ingest completed sales registers, SAC itemization, and GST audits into your financial ledger.
            </p>
          </div>
          {key && <Badge color="var(--success)">KEY ACTIVE</Badge>}
        </div>

        {key ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "color-mix(in srgb, var(--card-bg) 60%, transparent)",
              border: "1px solid var(--border)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Active REST API Access Token:
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <code
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  fontFamily: "monospace",
                  fontSize: 13,
                  color: "var(--primary)",
                  wordBreak: "break-all",
                }}
              >
                {key}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(key);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
              >
                {copiedKey ? "Copied!" : "Copy Token"}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            No active API key generated for this tenant. Generate one below to connect your external accounting software.
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        <div>
          <Button variant="primary" onClick={generateKey} disabled={isPending}>
            {isPending ? "Generating..." : key ? "Regenerate API Key" : "Generate API Key"}
          </Button>
        </div>
      </Card>

      {/* Partner Mode Webhooks Card */}
      <Card style={{ display: "grid", gap: 16, padding: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Partner Mode — Real-time Event Webhooks
            </h2>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Receive instantaneous signed HMAC-SHA256 HTTP POST notifications whenever an order is paid, exited, or refunded.
          </p>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Enable Real-time Webhook Dispatch</span>
        </label>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Target Webhook Endpoint URL (HTTPS only) *
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yourbrand.com/webhooks/clickout"
          />
        </div>

        {webhookError && <ErrorBanner message={webhookError} />}
        {webhookSuccess && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "var(--success)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✓ {webhookSuccess}
          </div>
        )}

        <div>
          <Button variant="primary" onClick={savePartnerMode} disabled={isPending}>
            {isPending ? "Saving..." : "Save Webhook Configuration"}
          </Button>
        </div>

        {secret && (showSecret || partnerMode.webhookSecret) && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "rgba(249, 115, 22, 0.08)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>
              Webhook HMAC Signature Secret:
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <code style={{ flex: 1, fontFamily: "monospace", fontSize: 13, color: "var(--text-primary)", wordBreak: "break-all" }}>
                {secret}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  setCopiedSecret(true);
                  setTimeout(() => setCopiedSecret(false), 2000);
                }}
              >
                {copiedSecret ? "Copied!" : "Copy Secret"}
              </Button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Use this secret to verify the <code>X-ClickOut-Signature</code> header on incoming requests.
            </div>
          </div>
        )}
      </Card>

      {/* Failed Deliveries Card */}
      <Card style={{ display: "grid", gap: 14, padding: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Failed Webhook Deliveries & Retry Queue
          </h2>
          <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            Automatically captures undeliverable HTTP notifications. Trigger manual re-attempts below.
          </p>
        </div>

        {failedDeliveries.length === 0 ? (
          <EmptyState
            icon="✨"
            message="No failed webhook deliveries! All notifications dispatched cleanly."
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {failedDeliveries.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "var(--scaffold-bg)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{d.eventType}</span>
                    <Badge color="var(--danger)">
                      {d.httpStatus ? `HTTP ${d.httpStatus}` : "Network Error"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                    {d.error}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => resend(d.id)}
                  disabled={isPending || resendingId === d.id}
                >
                  {resendingId === d.id ? "Retrying..." : "Resend Payload"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}