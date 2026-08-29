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
};

export async function scanForChurn(role: string, tenantId: string | null, branchCode: string | null): Promise<VipCustomer[]> {
  if (!tenantId && role !== "super_admin") return [];
  const isManager = role === "manager" || role === "cashier" || role === "guard";

  let configQuery: FirebaseFirestore.Query = adminDb.collection("growth_configs").where("tenantId", "==", tenantId);
  if (isManager && branchCode) configQuery = configQuery.where("branchCode", "==", branchCode);
  const configsSnap = await configQuery.get();

  const storeConfigs: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const doc of configsSnap.docs) {
    const c = doc.data();
    storeConfigs[c.branchCode ?? "UNKNOWN"] = c;
  }

  let usersQuery: FirebaseFirestore.Query = adminDb.collection("users").where("tenantId", "==", tenantId);
  if (isManager && branchCode) usersQuery = usersQuery.where("branchCode", "==", branchCode);

  const snap = await usersQuery.limit(200).get();
  const now = Date.now();
  const atRisk: VipCustomer[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const storeVisitData = data.storeVisits?.[tenantId as string];
    const userBranchCode = storeVisitData?.branchCode ?? data.branchCode ?? "UNKNOWN";
    const config = storeConfigs[userBranchCode] ?? {};

    const vipThreshold = config.vipThreshold ?? 2000;
    const expectedCycle = config.expectedCycleDays ?? 30;
    const highMult = config.churnMultiplierHigh ?? 3.0;
    const medMult = config.churnMultiplierMedium ?? 2.0;

    let totalSpent = parseFloat(data.totalSpent?.toString() ?? "0") || 0;
    let totalVisits = data.totalVisits ?? 0;
    if (storeVisitData) {
      totalSpent = parseFloat(storeVisitData.totalSpent?.toString() ?? "0") || totalSpent;
      totalVisits = storeVisitData.totalVisits ?? totalVisits;
    }

    if (totalSpent < vipThreshold) continue;

    const lastVisitTs: Timestamp | undefined = storeVisitData?.lastVisit ?? data.lastVisit;
    const lastVisitMs = lastVisitTs ? lastVisitTs.toMillis() : now - 90 * 24 * 60 * 60 * 1000;
    const daysSinceLastVisit = (now - lastVisitMs) / (1000 * 60 * 60 * 24);

    let risk: "SAFE" | "MEDIUM" | "HIGH" = "SAFE";
    if (daysSinceLastVisit > expectedCycle * highMult) risk = "HIGH";
    else if (daysSinceLastVisit > expectedCycle * medMult) risk = "MEDIUM";

    if (data.winbackActive !== true) {
      atRisk.push({
        id: doc.id,
        name: data.name ?? "VIP User",
        phone: data.phone ?? "N/A",
        totalSpent, totalVisits, lastVisitMs, riskLevel: risk, branchCode: userBranchCode,
      });
    }
    if (atRisk.length >= 100) break;
  }

  return atRisk;
}