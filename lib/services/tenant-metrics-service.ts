import { adminDb } from "@/lib/firebase-admin";

export type TenantMetrics = {
  totalStores: number;
  totalStaff: number;
  activeToday: number;
  pendingAlerts: number;
};

function startOfTodayIST(): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - istOffsetMs);
}

export async function getTenantMetrics(tenantId: string, storeCount: number): Promise<TenantMetrics> {
  const [staffSnap, alertsSnap] = await Promise.all([
    adminDb.collection("staff").where("tenantId", "==", tenantId).where("isDeleted", "==", false).get(),
    adminDb
      .collection("admin_audit_logs")
      .where("tenantId", "==", tenantId)
      .where("severity", "==", "CRITICAL")
      .where("timestamp", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get(),
  ]);

  const todayStart = startOfTodayIST();
  let activeToday = 0;
  staffSnap.docs.forEach((doc) => {
    const data = doc.data();
    const role = (data.role ?? "").toString().toUpperCase();
    if (role !== "CASHIER" && role !== "GUARD") return;
    const lastLoginAt = data.lastLoginAt?.toDate?.();
    if (lastLoginAt && lastLoginAt >= todayStart) activeToday += 1;
  });

  return {
    totalStores: storeCount,
    totalStaff: staffSnap.size,
    activeToday,
    pendingAlerts: alertsSnap.size,
  };
}

export type BranchRevenueSnapshot = {
  branchCode: string;
  branchName: string;
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  monthOrders: number;
  avgOrderValue: number;
  activeStaff: number;
  lastActivityAt: number | null; // ms timestamp
  rank: number; // 1 = highest monthly revenue
};

export type ConsolidatedOwnerMetrics = {
  totalBranches: number;
  chainTodayRevenue: number;
  chainTodayOrders: number;
  chainMonthRevenue: number;
  chainMonthOrders: number;
  chainAvgOrderValue: number;
  branches: BranchRevenueSnapshot[];
  topBranch: BranchRevenueSnapshot | null;
  bottomBranch: BranchRevenueSnapshot | null;
  generatedAt: number; // Date.now()
};

export async function getConsolidatedOwnerMetrics(
  tenantId: string,
  stores: { branchCode: string; name: string }[]
): Promise<ConsolidatedOwnerMetrics> {
  // 1. Current IST Date formatting
  const now = new Date();
  const ISToffset = 5.5 * 60 * 60 * 1000;
  const ISTnow = new Date(now.getTime() + ISToffset);
  const todayStr = ISTnow.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7); // YYYY-MM

  // 2. Query daily_store_stats for current month (one single query for all branches)
  const startOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const [statsSnap, staffSnap, liveOrdersSnap] = await Promise.all([
    adminDb
      .collection("daily_store_stats")
      .where("tenantId", "==", tenantId)
      .where("date", ">=", `${monthStr}-01`)
      .get(),
    adminDb
      .collection("staff")
      .where("tenantId", "==", tenantId)
      .where("isDeleted", "==", false)
      .get(),
    // Query live orders for the month as fallback / live supplement
    adminDb
      .collection("orders")
      .where("tenantId", "==", tenantId)
      .where("timestamp", ">=", startOfMonthDate)
      .limit(2000)
      .get(),
  ]);

  // Group daily_store_stats by branchCode
  const statsByBranch: Record<string, any[]> = {};
  statsSnap.docs.forEach((doc) => {
    const data = doc.data();
    const branch = data.branchCode || "HQ";
    if (!statsByBranch[branch]) statsByBranch[branch] = [];
    statsByBranch[branch].push(data);
  });

  // Group live orders by branchCode
  const ordersByBranch: Record<string, any[]> = {};
  liveOrdersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const branch = data.branchCode || data.storeId || "HQ";
    if (!ordersByBranch[branch]) ordersByBranch[branch] = [];

    const ts = data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp ? new Date(data.timestamp) : new Date();
    const tsMs = ts.getTime();
    const orderIST = new Date(tsMs + ISToffset);
    const orderDateStr = orderIST.toISOString().slice(0, 10);

    ordersByBranch[branch].push({
      totalAmount: Number(data.totalAmount ?? data.amount ?? 0),
      timestampMs: tsMs,
      dateStr: orderDateStr,
    });
  });

  // 4. Group activeStaff by branchCode
  const todayStart = startOfTodayIST();
  const activeStaffByBranch: Record<string, number> = {};
  staffSnap.docs.forEach((doc) => {
    const data = doc.data();
    const branch = data.branchCode || "HQ";
    const lastLoginAt = data.lastLoginAt?.toDate?.() || (data.lastLoginAt ? new Date(data.lastLoginAt) : null);
    if (lastLoginAt && lastLoginAt >= todayStart) {
      activeStaffByBranch[branch] = (activeStaffByBranch[branch] || 0) + 1;
    }
  });

  // 3. Calculate metrics per branch
  const snapshots: BranchRevenueSnapshot[] = stores.map((s) => {
    const branchCode = s.branchCode;
    const branchName = s.name || s.branchCode;

    const bStats = statsByBranch[branchCode] || [];
    const todayStat = bStats.find((d) => d.date === todayStr);

    const bOrders = ordersByBranch[branchCode] || [];
    const todayOrdersDocs = bOrders.filter((o) => o.dateStr === todayStr);

    // Today revenue & orders
    const todayRevenue =
      todayStat?.totalRevenue ??
      todayStat?.revenue ??
      todayOrdersDocs.reduce((sum, o) => sum + o.totalAmount, 0);
    const todayOrders = todayStat?.totalOrders ?? todayOrdersDocs.length;

    // Month revenue & orders
    let monthRevenue = bStats.reduce((sum, d) => sum + Number(d.totalRevenue ?? d.revenue ?? 0), 0);
    let monthOrders = bStats.reduce((sum, d) => sum + Number(d.totalOrders ?? 0), 0);

    if (monthOrders === 0 && bOrders.length > 0) {
      monthRevenue = bOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      monthOrders = bOrders.length;
    } else if (todayStat === undefined && todayOrdersDocs.length > 0) {
      monthRevenue += todayOrdersDocs.reduce((sum, o) => sum + o.totalAmount, 0);
      monthOrders += todayOrdersDocs.length;
    }

    const avgOrderValue = monthOrders > 0 ? monthRevenue / monthOrders : 0;
    const activeStaff = activeStaffByBranch[branchCode] || 0;

    let lastActivityAt: number | null = null;
    if (bOrders.length > 0) {
      lastActivityAt = Math.max(...bOrders.map((o) => o.timestampMs));
    }

    return {
      branchCode,
      branchName,
      todayRevenue,
      todayOrders,
      monthRevenue,
      monthOrders,
      avgOrderValue,
      activeStaff,
      lastActivityAt,
      rank: 0,
    };
  });

  // 5. Sort branches by monthRevenue descending, assign rank 1, 2, 3...
  snapshots.sort((a, b) => b.monthRevenue - a.monthRevenue || b.todayRevenue - a.todayRevenue);
  snapshots.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  // 6. Chain totals
  const chainTodayRevenue = snapshots.reduce((acc, b) => acc + b.todayRevenue, 0);
  const chainTodayOrders = snapshots.reduce((acc, b) => acc + b.todayOrders, 0);
  const chainMonthRevenue = snapshots.reduce((acc, b) => acc + b.monthRevenue, 0);
  const chainMonthOrders = snapshots.reduce((acc, b) => acc + b.monthOrders, 0);
  const chainAvgOrderValue = chainMonthOrders > 0 ? chainMonthRevenue / chainMonthOrders : 0;

  const topBranch = snapshots.length > 0 ? snapshots[0] : null;
  const bottomBranch = snapshots.length > 1 ? snapshots[snapshots.length - 1] : null;

  return {
    totalBranches: stores.length,
    chainTodayRevenue,
    chainTodayOrders,
    chainMonthRevenue,
    chainMonthOrders,
    chainAvgOrderValue,
    branches: snapshots,
    topBranch,
    bottomBranch,
    generatedAt: Date.now(),
  };
}