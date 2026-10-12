import { adminDb } from "@/lib/firebase-admin";

export type PosCounter = {
  id: string;
  name: string;
  pin?: string; // Omited when sending to client
  assignedStaffId?: string;
  assignedStaffName?: string;
  isActive: boolean;
  branchCode?: string;
  createdAt?: any;
  createdBy?: string;
  failedAttempts?: number;
  lockedUntil?: any;
};

export type PosShift = {
  id: string;
  counterId: string;
  counterName: string;
  openedBy: string;
  openedByName: string;
  openedAt: any;
  closedAt: any | null;
  closedBy: string | null;
  status: "OPEN" | "CLOSED";
  shiftTotalAmount: number;
  transactionCount: number;
  openingCash: number;
  closingCash: number | null;
  branchCode?: string;
};

export type PosCounterWithShift = PosCounter & {
  activeShift?: PosShift | null;
  todayTotalAmount: number;
  todayTransactionCount: number;
  isLocked?: boolean;
};

/**
 * Fetch all counters with active shifts and today's shift totals
 */
export async function getPosCountersWithStatus(
  tenantId: string,
  branchCode?: string | null
): Promise<PosCounterWithShift[]> {
  try {
    const countersRef = adminDb.collection("tenants").doc(tenantId).collection("posCounters");
    const shiftsRef = adminDb.collection("tenants").doc(tenantId).collection("posShifts");

    const [countersSnap, openShiftsSnap] = await Promise.all([
      countersRef.orderBy("createdAt", "asc").get(),
      shiftsRef.where("status", "==", "OPEN").get(),
    ]);

    const openShiftsMap: Record<string, PosShift> = {};
    openShiftsSnap.docs.forEach((doc) => {
      const data = doc.data();
      openShiftsMap[data.counterId] = {
        id: doc.id,
        counterId: data.counterId,
        counterName: data.counterName || "",
        openedBy: data.openedBy || "",
        openedByName: data.openedByName || "",
        openedAt: data.openedAt?.toDate?.() ? data.openedAt.toDate().toISOString() : data.openedAt,
        closedAt: data.closedAt?.toDate?.() ? data.closedAt.toDate().toISOString() : data.closedAt,
        closedBy: data.closedBy || null,
        status: data.status || "OPEN",
        shiftTotalAmount: Number(data.shiftTotalAmount || 0),
        transactionCount: Number(data.transactionCount || 0),
        openingCash: Number(data.openingCash || 0),
        closingCash: data.closingCash !== null && data.closingCash !== undefined ? Number(data.closingCash) : null,
        branchCode: data.branchCode,
      };
    });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch today's shifts for calculating today's running counters
    const todayShiftsSnap = await shiftsRef
      .where("openedAt", ">=", startOfDay)
      .get()
      .catch(() => ({ docs: [] }));

    const todayTotalsByCounter: Record<string, { total: number; count: number }> = {};
    todayShiftsSnap.docs.forEach((doc) => {
      const d = doc.data();
      const cId = d.counterId;
      if (!todayTotalsByCounter[cId]) {
        todayTotalsByCounter[cId] = { total: 0, count: 0 };
      }
      todayTotalsByCounter[cId].total += Number(d.shiftTotalAmount || 0);
      todayTotalsByCounter[cId].count += Number(d.transactionCount || 0);
    });

    const counters: PosCounterWithShift[] = [];

    countersSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (branchCode && d.branchCode && d.branchCode !== branchCode) {
        return;
      }

      const activeShift = openShiftsMap[doc.id] || null;
      const todayTotal = todayTotalsByCounter[doc.id]?.total ?? (activeShift?.shiftTotalAmount ?? 0);
      const todayCount = todayTotalsByCounter[doc.id]?.count ?? (activeShift?.transactionCount ?? 0);

      const lockedUntilDate = d.lockedUntil?.toDate ? d.lockedUntil.toDate() : d.lockedUntil ? new Date(d.lockedUntil) : null;
      const isLocked = lockedUntilDate ? lockedUntilDate.getTime() > Date.now() : false;

      counters.push({
        id: doc.id,
        name: d.name || "Counter",
        assignedStaffId: d.assignedStaffId || "",
        assignedStaffName: d.assignedStaffName || "",
        isActive: d.isActive !== false,
        branchCode: d.branchCode || "HQ",
        createdAt: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : d.createdAt,
        createdBy: d.createdBy || "",
        activeShift,
        todayTotalAmount: todayTotal,
        todayTransactionCount: todayCount,
        isLocked,
      });
    });

    return counters;
  } catch (err) {
    console.error("Error fetching POS counters:", err);
    return [];
  }
}

/**
 * Get a single active shift by ID
 */
export async function getActiveShiftById(tenantId: string, shiftId: string): Promise<PosShift | null> {
  try {
    const doc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("posShifts")
      .doc(shiftId)
      .get();

    if (!doc.exists) return null;
    const data = doc.data()!;

    return {
      id: doc.id,
      counterId: data.counterId,
      counterName: data.counterName || "",
      openedBy: data.openedBy || "",
      openedByName: data.openedByName || "",
      openedAt: data.openedAt?.toDate?.() ? data.openedAt.toDate().toISOString() : data.openedAt,
      closedAt: data.closedAt?.toDate?.() ? data.closedAt.toDate().toISOString() : data.closedAt,
      closedBy: data.closedBy || null,
      status: data.status || "OPEN",
      shiftTotalAmount: Number(data.shiftTotalAmount || 0),
      transactionCount: Number(data.transactionCount || 0),
      openingCash: Number(data.openingCash || 0),
      closingCash: data.closingCash !== null && data.closingCash !== undefined ? Number(data.closingCash) : null,
      branchCode: data.branchCode,
    };
  } catch {
    return null;
  }
}
