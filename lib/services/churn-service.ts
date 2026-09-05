import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export type VipCustomer = {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  totalVisits: number;
  lastVisitMs: number;
  riskLevel: "SAFE" | "MEDIUM" | "HIGH";
  branchCode: string;
  winbackActive?: boolean;
};

export type LiveShopper = {
  userId: string;
  userName: string;
  phone: string;
  itemCount: number;
  totalValue: number;
  minutesActive: number;
  isStuck: boolean;
  branchCode: string;
};

export type GhostVisitor = {
  userId: string;
  userName: string;
  phone: string;
  activeSinceMs: number;
  minutesInStore: number;
  branchCode: string;
};

export type GrowthConfig = {
  vipThreshold: number;
  expectedCycleDays: number;
  churnMultiplierMedium: number;
  churnMultiplierHigh: number;
  businessType?: string;
  branchCode?: string;
};

export async function getGrowthConfig(
  tenantId: string | null,
  branchCode: string | null
): Promise<GrowthConfig> {
  const defaultConfig: GrowthConfig = {
    vipThreshold: 1000,
    expectedCycleDays: 15,
    churnMultiplierMedium: 1.2,
    churnMultiplierHigh: 2.1,
    businessType: "General Retail",
    branchCode: branchCode ?? "UNKNOWN",
  };

  if (!tenantId) return defaultConfig;

  try {
    const docId = branchCode ? `${tenantId}_${branchCode}` : tenantId;
    let snap = await adminDb.collection("growth_configs").doc(docId).get();

    if (!snap.exists && branchCode) {
      snap = await adminDb.collection("growth_configs").doc(tenantId).get();
    }

    if (snap.exists) {
      const d = snap.data()!;
      return {
        vipThreshold: Number(d.vipThreshold ?? defaultConfig.vipThreshold),
        expectedCycleDays: Number(d.expectedCycleDays ?? defaultConfig.expectedCycleDays),
        churnMultiplierMedium: Number(d.churnMultiplierMedium ?? defaultConfig.churnMultiplierMedium),
        churnMultiplierHigh: Number(d.churnMultiplierHigh ?? defaultConfig.churnMultiplierHigh),
        businessType: d.businessType ?? defaultConfig.businessType,
        branchCode: branchCode ?? d.branchCode ?? "UNKNOWN",
      };
    }
  } catch {}

  return defaultConfig;
}

export async function scanForChurn(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<VipCustomer[]> {
  if (!tenantId && role !== "super_admin") return [];

  const config = await getGrowthConfig(tenantId, branchCode);
  const now = Date.now();

  let usersQuery: FirebaseFirestore.Query = adminDb.collection("users");
  if (role !== "super_admin" && tenantId) {
    usersQuery = usersQuery.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    usersQuery = usersQuery.where("branchCode", "==", branchCode);
  }

  const snap = await usersQuery.limit(150).get();
  const atRisk: VipCustomer[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const storeVisitData = tenantId ? data.storeVisits?.[tenantId] : null;
    const userBranchCode = storeVisitData?.branchCode ?? data.branchCode ?? branchCode ?? "HQ";

    let totalSpent = parseFloat(data.totalSpent?.toString() ?? "0") || 0;
    let totalVisits = Number(data.totalVisits ?? 0);
    if (storeVisitData) {
      totalSpent = parseFloat(storeVisitData.totalSpent?.toString() ?? "0") || totalSpent;
      totalVisits = Number(storeVisitData.totalVisits ?? totalVisits);
    }

    if (totalSpent < config.vipThreshold) continue;

    const lastVisitTs: Timestamp | undefined = storeVisitData?.lastVisit ?? data.lastVisit;
    const lastVisitMs = lastVisitTs ? lastVisitTs.toMillis() : now - 45 * 24 * 60 * 60 * 1000;
    const daysSinceLastVisit = (now - lastVisitMs) / (1000 * 60 * 60 * 24);

    let risk: "SAFE" | "MEDIUM" | "HIGH" = "SAFE";
    if (daysSinceLastVisit > config.expectedCycleDays * config.churnMultiplierHigh) {
      risk = "HIGH";
    } else if (daysSinceLastVisit > config.expectedCycleDays * config.churnMultiplierMedium) {
      risk = "MEDIUM";
    }

    atRisk.push({
      id: doc.id,
      name: data.name ?? data.displayName ?? "VIP Shopper",
      phone: data.phone ?? data.phoneNumber ?? "N/A",
      totalSpent,
      totalVisits,
      lastVisitMs,
      riskLevel: risk,
      branchCode: userBranchCode,
      winbackActive: data.winbackActive === true,
    });
  }

  // Sort by highest risk first, then by total spent
  const riskRank = { HIGH: 0, MEDIUM: 1, SAFE: 2 };
  atRisk.sort((a, b) => {
    if (riskRank[a.riskLevel] !== riskRank[b.riskLevel]) {
      return riskRank[a.riskLevel] - riskRank[b.riskLevel];
    }
    return b.totalSpent - a.totalSpent;
  });

  return atRisk;
}

export async function getLiveShoppers(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<LiveShopper[]> {
  if (!tenantId && role !== "super_admin") return [];

  let query: FirebaseFirestore.Query = adminDb.collection("carts");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  const snap = await query.limit(100).get();
  const now = Date.now();
  const shoppers: LiveShopper[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const items = (data.items as any[]) ?? [];
    if (items.length === 0) continue;

    const ts = (data.lastUpdated as Timestamp | undefined) ?? (data.createdAt as Timestamp | undefined);
    const lastMs = ts ? ts.toMillis() : now;
    const minutesActive = Math.max(1, Math.round((now - lastMs) / (60 * 1000)));

    let userName = data.customerName ?? data.userName;
    let phone = data.customerPhone ?? "N/A";

    if (!userName) {
      try {
        const userDoc = await adminDb.collection("users").doc(doc.id).get();
        if (userDoc.exists) {
          const ud = userDoc.data();
          userName = ud?.name ?? ud?.displayName ?? "Shopper";
          phone = ud?.phone ?? ud?.phoneNumber ?? phone;
        }
      } catch {}
    }

    const totalValue = items.reduce((sum, i) => sum + (Number(i.price ?? 0) * Number(i.quantity ?? 1)), 0);

    shoppers.push({
      userId: doc.id,
      userName: userName ?? "Active Shopper",
      phone,
      itemCount: items.reduce((sum, i) => sum + Number(i.quantity ?? 1), 0),
      totalValue,
      minutesActive,
      isStuck: minutesActive >= 120,
      branchCode: data.branchCode ?? branchCode ?? "HQ",
    });
  }

  return shoppers;
}

export async function getGhostVisitors(
  role: string,
  tenantId: string | null,
  branchCode: string | null
): Promise<GhostVisitor[]> {
  if (!tenantId && role !== "super_admin") return [];

  let query: FirebaseFirestore.Query = adminDb.collection("users");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }

  // Filter users who have an active session
  query = query.where("activeSessionId", "!=", null).limit(80);

  const snap = await query.get();
  const now = Date.now();
  const ghosts: GhostVisitor[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();

    // Check if cart has items
    try {
      const cartDoc = await adminDb.collection("carts").doc(doc.id).get();
      if (cartDoc.exists) {
        const cartItems = cartDoc.data()?.items as any[] | undefined;
        if (cartItems && cartItems.length > 0) {
          // Has items, not a ghost
          continue;
        }
      }
    } catch {}

    const sessionTs = (data.sessionStartedAt as Timestamp | undefined) ?? (data.lastVisit as Timestamp | undefined);
    const startMs = sessionTs ? sessionTs.toMillis() : now - 15 * 60 * 1000;
    const minutesInStore = Math.max(1, Math.round((now - startMs) / (60 * 1000)));

    ghosts.push({
      userId: doc.id,
      userName: data.name ?? data.displayName ?? "Walk-in Guest",
      phone: data.phone ?? data.phoneNumber ?? "N/A",
      activeSinceMs: startMs,
      minutesInStore,
      branchCode: data.branchCode ?? branchCode ?? "HQ",
    });
  }

  return ghosts;
}