import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getTenants } from "@/lib/services/tenant-service";
import { scanForChurn, getGrowthConfig } from "@/lib/services/churn-service";
import { createSystemWinbackCampaign } from "@/lib/services/campaign-service";

export const dynamic = "force-dynamic";

async function handleScan(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await getTenants();
  let tenantsScanned = 0;
  let triggered = 0;
  let skippedCooldown = 0;

  const now = Date.now();

  for (const tenant of tenants) {
    if (!tenant.isActive) continue;
    tenantsScanned++;

    const vips = await scanForChurn("tenant_admin", tenant.id, null);
    const highRiskVips = vips.filter((v) => v.riskLevel === "HIGH");

    for (const vip of highRiskVips) {
      const config = await getGrowthConfig(tenant.id, vip.branchCode);
      const cooldownMultiplier = config.winbackCooldownMultiplier ?? 2;
      const cooldownWindowMs = config.expectedCycleDays * cooldownMultiplier * 86400000;

      const inCooldown =
        vip.winbackActive === true &&
        typeof vip.winbackLastTriggeredMs === "number" &&
        now - vip.winbackLastTriggeredMs < cooldownWindowMs;

      if (inCooldown) {
        const triggerRef = adminDb.collection("winback_triggers").doc();
        await triggerRef.set({
          id: triggerRef.id,
          userId: vip.id,
          tenantId: tenant.id,
          branchCode: vip.branchCode,
          riskLevel: "HIGH",
          status: "SKIPPED_COOLDOWN",
          triggeredAtMs: now,
        });

        await adminDb.collection("users").doc(vip.id).set(
          { latestWinbackStatus: "SKIPPED_COOLDOWN" },
          { merge: true }
        );

        skippedCooldown++;
      } else {
        const rewardValue = config.winbackRewardValue ?? "20% OFF";
        const campaignId = await createSystemWinbackCampaign(
          tenant.id,
          vip.branchCode,
          rewardValue
        );

        const triggerRef = adminDb.collection("winback_triggers").doc();
        await triggerRef.set({
          id: triggerRef.id,
          userId: vip.id,
          tenantId: tenant.id,
          branchCode: vip.branchCode,
          riskLevel: "HIGH",
          status: "TRIGGERED",
          campaignId,
          triggeredAtMs: now,
        });

        const msgRef = adminDb.collection("outbound_messages").doc();
        await msgRef.set({
          id: msgRef.id,
          channel: "whatsapp",
          phone: vip.phone,
          templateName: "winback_offer_v1",
          variables: {
            name: vip.name,
            rewardValue,
            expiryDate: new Date(now + 7 * 86400000).toISOString(),
          },
          tenantId: tenant.id,
          branchCode: vip.branchCode,
          status: "PENDING",
          createdAtMs: now,
        });

        await adminDb.collection("users").doc(vip.id).set(
          {
            winbackActive: true,
            winbackLastTriggeredMs: now,
            latestWinbackStatus: "TRIGGERED",
          },
          { merge: true }
        );

        triggered++;
      }
    }
  }

  return NextResponse.json({
    tenantsScanned,
    triggered,
    skippedCooldown,
  });
}

export async function GET(request: NextRequest) {
  return handleScan(request);
}

export async function POST(request: NextRequest) {
  return handleScan(request);
}
