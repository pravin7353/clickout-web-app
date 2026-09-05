"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";

export type HourlyData = {
  timeLabel: string;
  hourlySales: number;
  hourlyCash: number;
  hourlyUpi: number;
  hourlyLeakage: number;
  hourlyRefunds: number;
};

export async function getHourlyAnalytics(targetTenantId?: string, targetBranchCode?: string): Promise<HourlyData[]> {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  
  const effectiveTenantId = role === "super_admin" ? targetTenantId : tenantId;
  const effectiveBranchCode = role === "manager" ? storeId : targetBranchCode;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let query = adminDb.collection("orders").where("timestamp", ">=", startOfDay).limit(5000);

  if (effectiveTenantId) query = query.where("tenantId", "==", effectiveTenantId);
  if (effectiveBranchCode) query = query.where("branchCode", "==", effectiveBranchCode);

  const snap = await query.get();
  
  const hours = Array.from({ length: 14 }, (_, i) => i + 9); // 9 AM to 22 (10 PM)
  const dataMap: Record<number, HourlyData> = {};
  
  hours.forEach(h => {
    const displayHour = h > 12 ? h - 12 : h;
    const amPm = h >= 12 ? "PM" : "AM";
    dataMap[h] = { timeLabel: `${String(displayHour).padStart(2, '0')} ${amPm}`, hourlySales: 0, hourlyCash: 0, hourlyUpi: 0, hourlyLeakage: 0, hourlyRefunds: 0 };
  });

  snap.docs.forEach(doc => {
    const data = doc.data();
    if (!data.timestamp) return;
    
    const date = data.timestamp.toDate();
    const hour = date.getHours();
    
    if (hour < 9 || hour > 22) return; // Operating hours ke bahar ignore karo
    
    const amt = Number(data.totalAmount || 0);
    const mode = data.paymentMode || "";
    const pStatus = data.paymentStatus || "";
    const eStatus = data.exitStatus || "";

    const isRefund = pStatus === "REFUNDED";
    const isExited = eStatus === "EXITED" || eStatus === "APPROVED";
    const isPending = eStatus === "PENDING" || eStatus === "EXPIRED_BY_SYSTEM" || eStatus === "";

    if (isRefund) {
      dataMap[hour].hourlyRefunds += amt;
    } else if (pStatus === "PAID" || pStatus === "SUCCESS") {
      if (isExited) {
        dataMap[hour].hourlySales += amt;
        if (mode === "CASH") dataMap[hour].hourlyCash += amt;
        else dataMap[hour].hourlyUpi += amt;
      } else if (isPending) {
        dataMap[hour].hourlyLeakage += amt;
      }
    }
  });

  return hours.map(h => dataMap[h]);
}

export async function fetchStaffingForecastAction(targetStoreId?: string): Promise<{ ok: boolean; forecast?: import("@/lib/services/manpower-service").ForecastResult; error?: string }> {
  try {
    const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
    const effectiveTenantId = role === "super_admin" ? undefined : tenantId;
    const effectiveBranchCode = role === "manager" ? storeId : targetStoreId;
    const { getStaffingForecast } = await import("@/lib/services/manpower-service");
    const forecast = await getStaffingForecast(effectiveTenantId ?? null, effectiveBranchCode ?? null);
    return { ok: true, forecast };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to load staffing forecast." };
  }
}