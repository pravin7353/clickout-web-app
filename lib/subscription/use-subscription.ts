"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getTenantSubscriptionInfo, TenantSubscriptionInfo } from "@/actions/subscription";
import { SubscriptionPlan } from "./plan";
import { isTrialActive } from "./access-engine";

let cachedInfo: TenantSubscriptionInfo | null = null;
let cachedTenantId: string | null = null;

export function useTenantSubscription() {
  const { data: session, status } = useSession();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;

  const [info, setInfo] = useState<TenantSubscriptionInfo | null>(
    cachedTenantId === tenantId ? cachedInfo : null
  );
  const [loading, setLoading] = useState(!info && status === "authenticated");

  useEffect(() => {
    if (status !== "authenticated" || !tenantId) {
      setLoading(false);
      return;
    }

    if (cachedTenantId === tenantId && cachedInfo) {
      setInfo(cachedInfo);
      setLoading(false);
      return;
    }

    let isMounted = true;
    getTenantSubscriptionInfo().then((res) => {
      if (isMounted) {
        cachedInfo = res;
        cachedTenantId = tenantId;
        setInfo(res);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [status, tenantId]);

  const trialEndsAtDate = info?.trialEndsAt ? new Date(info.trialEndsAt) : null;
  const trialActive = isTrialActive(trialEndsAtDate);

  return {
    plan: info?.plan ?? ("mini" as SubscriptionPlan),
    billingStatus: info?.billingStatus ?? "active",
    trialEndsAt: trialEndsAtDate,
    isTrialActive: trialActive,
    extraStoresPurchased: info?.extraStoresPurchased ?? 0,
    currentTransactions: info?.currentTransactions ?? 0,
    currentStaffCount: info?.currentStaffCount ?? 0,
    currentStoreCount: info?.currentStoreCount ?? 0,
    loading,
    refresh: () => {
      if (tenantId) {
        setLoading(true);
        getTenantSubscriptionInfo().then((res) => {
          cachedInfo = res;
          cachedTenantId = tenantId;
          setInfo(res);
          setLoading(false);
        });
      }
    },
  };
}
