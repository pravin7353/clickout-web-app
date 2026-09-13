import { adminDb } from "@/lib/firebase-admin";

export type TenantRow = {
  id: string;
  companyName: string;
  subscriptionPlan: string;
  billingStatus: string;
  isActive: boolean;
};

export type PaginatedTenantsResult = {
  tenants: TenantRow[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
};

/**
 * Fetch tenants with defensive .limit(500) safety cap.
 * Supports optional pagination for UI display.
 */
export async function getTenants(options: {
  page: number;
  pageSize?: number;
}): Promise<PaginatedTenantsResult>;
export async function getTenants(options?: {
  page?: undefined;
  pageSize?: number;
}): Promise<TenantRow[]>;
export async function getTenants(options?: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedTenantsResult | TenantRow[]> {
  const pageSize = options?.pageSize ?? (options?.page ? 25 : 500);

  // Immediate defensive safety cap: max 500
  const snap = await adminDb
    .collection("tenants")
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  const mapped: TenantRow[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyName: data.companyName ?? "",
      subscriptionPlan: data.subscriptionPlan ?? "",
      billingStatus: data.billingStatus ?? "",
      isActive: data.isActive !== false,
    };
  });

  if (options?.page) {
    const totalCount = mapped.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(Math.max(1, options.page), totalPages);
    const start = (currentPage - 1) * pageSize;
    const tenants = mapped.slice(start, start + pageSize);
    return {
      tenants,
      totalCount,
      totalPages,
      currentPage,
    };
  }

  return mapped;
}

/**
 * Iterative fetch for background cron jobs (e.g. winback-scan, ai-reorder-scan).
 * Bounded to 500 records per Firestore query using startAfter cursor,
 * looping until all tenants across multiple pages are exhausted.
 */
export async function getAllTenants(): Promise<TenantRow[]> {
  const BATCH_SIZE = 500;
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  const allTenants: TenantRow[] = [];

  while (true) {
    let query: FirebaseFirestore.Query = adminDb
      .collection("tenants")
      .orderBy("createdAt", "desc")
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      allTenants.push({
        id: doc.id,
        companyName: data.companyName ?? "",
        subscriptionPlan: data.subscriptionPlan ?? "",
        billingStatus: data.billingStatus ?? "",
        isActive: data.isActive !== false,
      });
    }

    if (snap.docs.length < BATCH_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return allTenants;
}

export async function getTenantById(tenantId: string) {
  const doc = await adminDb.collection("tenants").doc(tenantId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    companyName: data.companyName ?? "ClickOut Partner",
    ownerName: data.ownerName ?? "",
    subscriptionPlan: (data.subscriptionPlan ?? "PRO").toString().toUpperCase(),
    billingStatus: data.billingStatus ?? "ACTIVE",
    isActive: data.isActive !== false,
    contact: {
      phone: data.contact?.phone ?? "",
      email: data.contact?.email ?? "",
      recoveryEmail: data.contact?.recoveryEmail ?? "",
      recoveryPhone: data.contact?.recoveryPhone ?? "",
    },
  };
}