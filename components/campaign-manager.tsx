"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCampaign, deleteCampaign, toggleCampaign } from "@/actions/campaign";
import { Campaign } from "@/lib/services/campaign-service";
import { Card, Button, Input, Select, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { Modal } from "@/components/profile-menu";

interface CampaignManagerProps {
  campaigns: Campaign[];
  initialStoreId?: string | null;
  canEdit?: boolean;
}

export function CampaignManager({
  campaigns,
  initialStoreId = null,
  canEdit = true,
}: CampaignManagerProps) {
  const [openModal, setOpenModal] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCampaign({
        branchCode: (form.get("branchCode") as string) || initialStoreId || "ALL",
        type: form.get("type") as string,
        rewardValue: form.get("rewardValue") as string,
        sponsorTenantId: (form.get("sponsorTenantId") as string) || undefined,
        isActive: form.get("isActive") === "on",
      });
      if (!res.ok) {
        setError(res.error || "Failed to create campaign.");
      } else {
        setOpenModal(false);
        router.refresh();
      }
    });
  }

  function handleToggle(c: Campaign) {
    setError("");
    startTransition(async () => {
      await toggleCampaign(c.id, c.isActive);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to permanently delete this campaign?")) return;
    setError("");
    startTransition(async () => {
      await deleteCampaign(id);
      router.refresh();
    });
  }

  const activeCount = campaigns.filter((c) => c.isActive).length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Header bar */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>📢</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                In-Store Engagement Campaigns
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                Broadcast instant cart discounts, brand sponsorships, and reward loyalty to in-store mobile shoppers.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge color={activeCount > 0 ? "var(--success)" : "var(--text-secondary)"}>
            {activeCount} Live on Customer App
          </Badge>
          <Button
            variant="primary"
            onClick={() => setOpenModal(true)}
            disabled={!canEdit}
          >
            + New Campaign
          </Button>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon="📢"
          message="No active marketing campaigns deployed. Launch a new offer or discount to drive in-store basket size."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {campaigns.map((c) => {
            let typeColor = "#3b82f6";
            if (c.type === "CASHBACK") typeColor = "var(--success)";
            if (c.type === "LOYALTY_POINTS") typeColor = "#a855f7";
            if (c.type === "SPONSORED") typeColor = "#f97316";

            return (
              <Card
                key={c.id}
                style={{
                  display: "grid",
                  gap: 14,
                  padding: 20,
                  opacity: c.isActive ? 1 : 0.65,
                  borderLeft: `5px solid ${c.isActive ? typeColor : "var(--border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
                        color: typeColor,
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {c.type}
                    </span>
                    <Badge color="var(--text-secondary)">
                      Store: {c.branchCode}
                    </Badge>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: c.isActive ? "var(--success)" : "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: c.isActive ? "var(--success)" : "var(--text-secondary)",
                      }}
                    />
                    {c.isActive ? "LIVE" : "PAUSED"}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>
                    {c.rewardValue}
                  </div>
                  {c.sponsorTenantId && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                      Sponsor: {c.sponsorTenantId}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <Button
                    variant="secondary"
                    onClick={() => handleToggle(c)}
                    disabled={isPending || !canEdit}
                  >
                    {c.isActive ? "Pause" : "Activate"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(c.id)}
                    disabled={isPending || !canEdit}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      {openModal && (
        <Modal onClose={() => setOpenModal(false)}>
          <Card style={{ width: 440, display: "grid", gap: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                Launch New Customer Campaign
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                Campaign will display live in the customer mobile checkout drawer.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Target Store Branch Code *
                </label>
                <Input
                  name="branchCode"
                  defaultValue={initialStoreId || "ALL"}
                  placeholder="e.g. DEL_MAIN or ALL"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Campaign Type *
                </label>
                <Select name="type" required>
                  <option value="DISCOUNT">Discount (% or ₹ off)</option>
                  <option value="CASHBACK">Instant Wallet Cashback</option>
                  <option value="LOYALTY_POINTS">Loyalty Multiplier (Points)</option>
                  <option value="SPONSORED">Brand Sponsored Banner</option>
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Reward Banner Text *
                </label>
                <Input
                  name="rewardValue"
                  placeholder="e.g. 15% Instant Off on ₹499+"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Brand Sponsor Tenant ID (Optional)
                </label>
                <Input
                  name="sponsorTenantId"
                  placeholder="e.g. COCA_COLA_HQ"
                />
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <input type="checkbox" name="isActive" defaultChecked />
                <span>Deploy live immediately on customer app</span>
              </label>

              {error && <ErrorBanner message={error} />}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                <Button variant="secondary" type="button" onClick={() => setOpenModal(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  {isPending ? "Deploying..." : "Launch Campaign"}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}
    </div>
  );
}