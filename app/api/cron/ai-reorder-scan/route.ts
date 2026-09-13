import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAllTenants } from "@/lib/services/tenant-service";

export const dynamic = "force-dynamic";

/**
 * AI Purchase Order Suggestion Batch Generator (Daily Cron)
 *
 * Scans sales velocity, current physical stock, and supplier lead times
 * to compute deterministic reorder suggestions for low-inventory products.
 *
 * Safeguards:
 * 1. Bounded 30-day window on orders: capped at 5000 orders per branch.
 * 2. In-memory aggregation: sums item quantities per barcode/productId from the bounded query.
 * 3. Bounded products scan: capped at 300 active products per branch per run to avoid runaway billing.
 * 4. Branch-level idempotency pre-query: verifies whether a PENDING suggestion already exists
 *    before writing, preventing duplicate suggestions.
 */
async function handleScan(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await getAllTenants();
  let tenantsScanned = 0;
  let branchesScanned = 0;
  let suggestionsCreated = 0;
  let suggestionsSkippedDuplicate = 0;
  let suggestionsSkippedNoVelocity = 0;

  const now = Date.now();
  const windowDays = 30;
  const cutoffDate = new Date(now - windowDays * 24 * 60 * 60 * 1000);

  for (const tenant of tenants) {
    if (!tenant.isActive) continue;
    tenantsScanned++;

    // Read per-tenant configuration if present; fallback to sensible defaults (lead: 7 days, safety: 3 days)
    let leadTimeDays = 7;
    let safetyStockDays = 3;
    try {
      const tenantDoc = await adminDb.collection("tenants").doc(tenant.id).get();
      if (tenantDoc.exists) {
        const tData = tenantDoc.data();
        if (typeof tData?.leadTimeDays === "number" && tData.leadTimeDays > 0) {
          leadTimeDays = tData.leadTimeDays;
        }
        if (typeof tData?.safetyStockDays === "number" && tData.safetyStockDays >= 0) {
          safetyStockDays = tData.safetyStockDays;
        }
      }
    } catch {
      // Use defaults if tenant doc read fails
    }

    // Discover branches for this tenant
    const branchSet = new Set<string>();
    try {
      const storesSnap = await adminDb
        .collection("stores")
        .where("tenantId", "==", tenant.id)
        .get();

      storesSnap.docs.forEach((doc) => {
        const s = doc.data();
        if (s.isActive !== false && s.status !== "INACTIVE") {
          const code = s.branchCode || doc.id;
          if (code) branchSet.add(code);
        }
      });
    } catch {}

    // If no explicit stores configured, check products for distinct branchCodes or default to "HQ"
    if (branchSet.size === 0) {
      try {
        const sampleProducts = await adminDb
          .collection("products")
          .where("tenantId", "==", tenant.id)
          .limit(20)
          .get();

        sampleProducts.docs.forEach((p) => {
          const bc = p.data().branchCode;
          if (bc) branchSet.add(bc);
        });
      } catch {}
    }

    if (branchSet.size === 0) {
      branchSet.add("HQ");
    }

    // Process each branch
    for (const branchCode of Array.from(branchSet)) {
      branchesScanned++;

      // 1. BILLING SAFEGUARD: Bounded query for orders in last 30 days (max 5000)
      const salesMap = new Map<string, number>();
      try {
        const ordersSnap = await adminDb
          .collection("orders")
          .where("branchCode", "==", branchCode)
          .where("timestamp", ">=", Timestamp.fromDate(cutoffDate))
          .limit(5000)
          .get();

        ordersSnap.docs.forEach((doc) => {
          const o = doc.data();
          // Tenant-level safety check
          if (o.tenantId && o.tenantId !== tenant.id) return;
          // Skip cancelled or refunded orders
          if (
            o.isRefunded === true ||
            o.status === "REFUNDED" ||
            o.exitStatus === "CANCELLED_AND_REFUNDED"
          ) {
            return;
          }

          const items = Array.isArray(o.items)
            ? o.items
            : Array.isArray(o.cartItems)
            ? o.cartItems
            : [];

          for (const item of items) {
            const qty = Number(item.quantity ?? item.qty ?? 1);
            if (qty <= 0) continue;
            if (item.barcode) {
              const bKey = String(item.barcode).trim();
              salesMap.set(bKey, (salesMap.get(bKey) || 0) + qty);
            }
            if (item.productId) {
              const pKey = String(item.productId).trim();
              salesMap.set(pKey, (salesMap.get(pKey) || 0) + qty);
            }
          }
        });
      } catch (err) {
        console.error(`[ai-reorder-scan] Failed querying orders for branch ${branchCode}:`, err);
      }

      // 2. IDEMPOTENCY: Fetch pending suggestions once per branch up front
      const pendingProductIds = new Set<string>();
      try {
        const existingPendingSnap = await adminDb
          .collection("ai_po_suggestions")
          .where("tenantId", "==", tenant.id)
          .where("branchCode", "==", branchCode)
          .where("status", "==", "PENDING")
          .get();

        existingPendingSnap.docs.forEach((d) => {
          const pid = d.data().productId;
          if (pid) pendingProductIds.add(String(pid));
        });
      } catch (err) {
        console.error(`[ai-reorder-scan] Failed querying pending suggestions for branch ${branchCode}:`, err);
      }

      // 3. BILLING SAFEGUARD: Cap active products at 300 per branch per run
      // If a branch has >300 products, unhandled products can be scanned on next day's run.
      let productsSnap: FirebaseFirestore.QuerySnapshot;
      try {
        productsSnap = await adminDb
          .collection("products")
          .where("tenantId", "==", tenant.id)
          .where("branchCode", "==", branchCode)
          .limit(300)
          .get();
      } catch (err) {
        console.error(`[ai-reorder-scan] Failed querying products for branch ${branchCode}:`, err);
        continue;
      }

      // 4. Core calculation per product
      for (const pDoc of productsSnap.docs) {
        const p = pDoc.data();
        // Skip blocked or soft-deleted products
        if (p.isBlocked === true || p.isDeleted === true) continue;

        const productId = pDoc.id;
        const barcode = p.barcode ? String(p.barcode).trim() : "";

        // Aggregate units sold in the 30-day window
        const totalQtySold =
          (barcode && salesMap.get(barcode)) || salesMap.get(productId) || 0;

        // Daily sales velocity
        const velocity = totalQtySold / windowDays;

        // Skip dead stock / zero velocity (don't suggest reordering inactive inventory)
        if (velocity <= 0) {
          suggestionsSkippedNoVelocity++;
          continue;
        }

        // Reorder point = (velocity * leadTimeDays) + (velocity * safetyStockDays)
        const reorderPoint = velocity * leadTimeDays + velocity * safetyStockDays;
        const physicalStock = Number(p.physicalStock ?? p.stock ?? 0);

        if (physicalStock <= reorderPoint) {
          // Suggested quantity covers lead time + safety buffer + 7 days runway after restock
          const runwayTargetDays = leadTimeDays + safetyStockDays + 7;
          const suggestedQty = Math.ceil(velocity * runwayTargetDays) - physicalStock;

          // Skip zero or negative suggested quantity
          if (suggestedQty <= 0) {
            continue;
          }

          // Idempotency check: avoid duplicate pending suggestion for same product & branch
          if (pendingProductIds.has(productId)) {
            suggestionsSkippedDuplicate++;
            continue;
          }

          try {
            const suggestionRef = adminDb.collection("ai_po_suggestions").doc();
            await suggestionRef.set({
              id: suggestionRef.id,
              productId,
              tenantId: tenant.id,
              branchCode,
              supplierId: p.preferredSupplierId ?? p.supplierId ?? "DEFAULT_SUPPLIER",
              suggestedQty,
              velocity: Number(velocity.toFixed(2)),
              reorderPoint: Math.ceil(reorderPoint),
              status: "PENDING",
              createdAt: FieldValue.serverTimestamp(),
            });

            pendingProductIds.add(productId);
            suggestionsCreated++;
          } catch (err) {
            console.error(`[ai-reorder-scan] Failed to write suggestion for ${productId}:`, err);
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsScanned,
    branchesScanned,
    suggestionsCreated,
    suggestionsSkippedDuplicate,
    suggestionsSkippedNoVelocity,
  });
}

export async function GET(request: NextRequest) {
  return handleScan(request);
}

export async function POST(request: NextRequest) {
  return handleScan(request);
}
