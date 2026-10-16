"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { applyOffers, ProductOffer, parseExpiryMs } from "@/lib/services/offer-engine";
import { getEffectiveTxnLimit } from "@/lib/subscription/feature-flag-matrix";
import { checkAndAutoDowngradeExpiredTrial } from "@/lib/services/trial-service";
import { incrementTransactionUsage, usageRef } from "@/lib/services/usage-service";
import { postSalesVoucher } from "@/lib/services/finance-service";
import { getActivePosTerminalSessions } from "@/lib/services/pos-session-service";
import { getMaxPosCounters, checkPlanLimit } from "@/lib/plan-limits";
import { generateUpiLink, generateUpiQrDataUrl } from "@/lib/utils/upi-link";

export type PosProduct = {
  id?: string;
  barcode: string;
  name: string;
  price: number;
  originalPrice?: number;
  gst: string;
  weight: string;
  availableStock: number;
  category?: string;
  clearanceActive?: boolean;
  clearanceType?: string;
  offerDisplayName?: string;
  discountPercent?: number;
  discountAmount?: number;
  buyQty?: number;
  freeQty?: number;
  expiresAt?: string | number | null;
  flashExpiry?: number;
};

function resolveOfferTag(data: Record<string, any>, price: number): string {
  if (!data.clearanceActive) return "";
  const type = (data.clearanceType ?? "").toString().toUpperCase();
  if (type === "BOGO" || type === "B1G1") return "B1G1";
  if (type === "BUY_X_GET_Y") {
    const bx = data.buyQty ?? data.value1 ?? 1;
    const gy = data.freeQty ?? data.value2 ?? 1;
    return `B${bx}G${gy}`;
  }
  if (type === "BUY_X_GET_Y_CROSS") {
    const bx = data.buyQty ?? data.value1 ?? 1;
    return `B${bx} + GIFT`;
  }
  if (type === "PERCENTAGE") {
    const pct = Number(data.discountPercent ?? data.value1 ?? 0);
    return pct > 0 ? `${pct}% OFF` : "% OFF";
  }
  if (type === "FLAT_AMOUNT") {
    const flat = Number(data.discountAmount ?? data.value1 ?? 0);
    return flat > 0 ? `₹${flat} OFF` : "FLAT OFF";
  }
  if (type === "TIERED_QTY") {
    const minQ = data.minQty ?? data.value1 ?? 2;
    const disc = data.discountPercent ?? data.value2 ?? 10;
    return `Buy ${minQ}+: ${disc}%`;
  }
  if (type === "BUNDLE_PRICE") {
    const bq = data.bundleQty ?? data.value1 ?? 2;
    const bp = data.bundlePrice ?? data.value2 ?? price;
    return `${bq} for ₹${bp}`;
  }
  if (type === "FLASH_SALE") {
    const pct = Number(data.discountPercent ?? data.value1 ?? 0);
    return `FLASH ${pct}%`;
  }
  if (type === "CROSS_PRODUCT") {
    return "COMBO DEAL";
  }
  return data.clearanceType ?? "OFFER";
}

function mapDocToPosProduct(doc: FirebaseFirestore.DocumentSnapshot): PosProduct {
  const data = doc.data() || {};
  const price = Number(data.price ?? data.mrp ?? 0);
  return {
    id: doc.id,
    barcode: data.barcode ?? doc.id,
    name: data.name ?? "Unnamed",
    price,
    originalPrice: Number(data.mrp ?? data.price ?? 0),
    gst: data.gst ? String(data.gst) : "0",
    weight: data.weight ? String(data.weight) : "0",
    availableStock: Number(data.physicalStock ?? 0),
    category: data.category ?? "General",
    clearanceActive: data.clearanceActive === true,
    clearanceType: data.clearanceType,
    offerDisplayName: resolveOfferTag(data, price),
    discountPercent: data.discountPercent,
    discountAmount: data.discountAmount,
    buyQty: data.buyQty,
    freeQty: data.freeQty,
    expiresAt: data.expiresAt
      ? typeof data.expiresAt.toDate === "function"
        ? data.expiresAt.toDate().toISOString()
        : data.expiresAt
      : null,
    flashExpiry: parseExpiryMs(data.expiresAt),
  } as PosProduct;
}

export async function searchProductByBarcode(barcode: string, targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager", "cashier"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode) ?? "HQ";

  const cleanInput = barcode.trim();
  if (!cleanInput) return { ok: false, error: "Please enter a barcode" };

  let query: FirebaseFirestore.Query = adminDb.collection("products");
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }
  if (branchCode) {
    query = query.where("branchCode", "==", branchCode);
  }
  query = query.where("barcode", "==", cleanInput).limit(1);

  const snap = await query.get();
  if (snap.empty) {
    return { ok: false, error: `Product with barcode "${cleanInput}" not found in store inventory.` };
  }

  return {
    ok: true,
    product: mapDocToPosProduct(snap.docs[0]),
  };
}

export async function searchProductsCatalog(query: string, targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager", "cashier"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode);

  const cleanInput = (query || "").trim();
  const q = cleanInput.toLowerCase();

  function buildScopedQuery(): FirebaseFirestore.Query {
    let qRef: FirebaseFirestore.Query = adminDb.collection("products");
    if (role !== "super_admin" && tenantId) {
      qRef = qRef.where("tenantId", "==", tenantId);
    }
    if (branchCode) {
      qRef = qRef.where("branchCode", "==", branchCode);
    }
    return qRef;
  }

  // 3. Keep current behavior for empty query (no search text): fetch limit(15) for the default browsing grid
  if (!q) {
    const emptySnap = await buildScopedQuery().limit(15).get();
    return { ok: true, products: emptySnap.docs.map(mapDocToPosProduct) };
  }

  // 1. For barcode-looking input (all digits, length 8+): do a direct exact-match query first:
  // .where("barcode","==",q) scoped to tenantId/branchCode, limit(1) — barcode scans should be exact and fast, not a substring search.
  const isBarcode = /^\d{8,}$/.test(cleanInput);
  if (isBarcode) {
    const barcodeSnap = await buildScopedQuery()
      .where("barcode", "==", cleanInput)
      .limit(1)
      .get();

    if (!barcodeSnap.empty) {
      return { ok: true, products: barcodeSnap.docs.map(mapDocToPosProduct) };
    }
  }

  // 2. For name/category text search: use the existing searchKey field
  // (already set at write-time as lowercased name) with a Firestore prefix-range query:
  // .where("searchKey", ">=", q).where("searchKey", "<", q + '\uf8ff')
  // scoped to tenantId/branchCode, limit(15) — this searches the FULL catalog for a name-prefix match,
  // not just an arbitrary 60-doc window.
  //
  // NOTE: This only matches PREFIX of the name (not mid-string substring) — this is a Firestore
  // limitation; full substring search would need a dedicated search service (Algolia/Typesense)
  // as a future upgrade, out of scope here.
  //
  // KNOWN LIMITATION: searchKey is populated at write-time. If any legacy products predate this field,
  // this search will not find them until they are re-saved.
  try {
    const prefixSnap = await buildScopedQuery()
      .where("searchKey", ">=", q)
      .where("searchKey", "<", q + "\uf8ff")
      .limit(15)
      .get();

    if (!prefixSnap.empty) {
      return { ok: true, products: prefixSnap.docs.map(mapDocToPosProduct) };
    }
  } catch (err: any) {
    console.warn("searchProductsCatalog prefix range query fallback:", err?.message);
  }

  // Fallback: If cleanInput is a custom / alphanumeric barcode (e.g. "SKU-999", "SRV-01") or shorter barcode
  const exactBarcodeSnap = await buildScopedQuery()
    .where("barcode", "==", cleanInput)
    .limit(1)
    .get();

  if (!exactBarcodeSnap.empty) {
    return { ok: true, products: exactBarcodeSnap.docs.map(mapDocToPosProduct) };
  }

  return { ok: true, products: [] };
}

export async function fetchActivePosOffers(targetBranchCode?: string) {
  const { role, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager", "cashier"]);
  const branchCode = resolveStoreScope(role, storeId, targetBranchCode);

  let query: FirebaseFirestore.Query = adminDb.collection("products").where("clearanceActive", "==", true);
  if (role !== "super_admin" && tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  const snap = await query.limit(200).get();
  const matchedDocs = snap.docs.filter((d) => {
    const data = d.data();
    if (!branchCode) return true;
    return !data.branchCode || data.branchCode === branchCode;
  });

  const offers: ProductOffer[] = matchedDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      productId: d.id,
      barcode: data.barcode ?? d.id,
      name: data.name ?? "",
      productName: data.name ?? "",
      clearanceActive: data.clearanceActive === true,
      clearanceType: data.clearanceType ?? "",
      clearanceTag: data.clearanceTag ?? "",
      buyQty: data.buyQty ?? data.value1,
      freeQty: data.freeQty ?? data.value2,
      discountPercent: data.discountPercent ?? data.value1,
      discountAmount: data.discountAmount ?? data.value1,
      minQty: data.minQty ?? data.value1,
      bundleQty: data.bundleQty ?? data.value1,
      bundlePrice: data.bundlePrice ?? data.value2,
      offerPrice: data.offerPrice,
      targetProductId: data.targetProductId,
      targetProductName: data.targetProductName,
      expiresAt: data.expiresAt ? (typeof data.expiresAt.toDate === "function" ? data.expiresAt.toDate().toISOString() : data.expiresAt) : null,
      stock: Number(data.physicalStock ?? 999),
      physicalStock: Number(data.physicalStock ?? 999),
    };
  });

  const stockMap: Record<string, number> = {};
  for (const o of offers) {
    if (o.barcode) stockMap[o.barcode] = o.physicalStock ?? 999;
    if (o.productId) stockMap[o.productId] = o.physicalStock ?? 999;
  }

  return { ok: true, offers, stockMap };
}

export type CartItem = {
  barcode: string;
  name: string;
  price: number;
  originalPrice?: number;
  gst: string;
  weight: string;
  quantity: number;
};

export async function createPosOrder(params: {
  items: CartItem[];
  paymentMode: string;
  customerPhone?: string;
  instantDiscountPercent?: number;
  targetBranchCode?: string;
  shiftId?: string;
  counterId?: string;
  counterName?: string;
}) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireRole(["tenant_admin", "manager", "cashier"]));
  } catch {
    return { ok: false as const, error: "You do not have access to process checkout orders." };
  }

  const branchCode = resolveStoreScope(role, storeId, params.targetBranchCode) ?? "HQ";
  if (!params.items || params.items.length === 0) {
    return { ok: false as const, error: "Cart is empty" };
  }

  let isTxnLimitExceeded = false;
  let txnWarningMessage = "";
  let effectiveLimit = 0;
  let currentMonthTxns = 0;

  // Check Subscription Transaction Quota (Soft-cap) & POS Terminal Limits
  if (tenantId) {
    const [tDoc, uDoc] = await Promise.all([
      adminDb.collection("tenants").doc(tenantId).get(),
      usageRef(tenantId).get(),
    ]);
    let tData = tDoc.data() || {};
    tData = await checkAndAutoDowngradeExpiredTrial(tenantId, tData);
    const uData = uDoc.data() || {};

    const planKey = (tData.subscriptionPlan || tData.plan || "spark_lite").toLowerCase();
    const extraStores = Number(tData.extraStoresPurchased ?? 0);
    effectiveLimit = getEffectiveTxnLimit(planKey, extraStores);
    currentMonthTxns = Number(tData.monthlyScans ?? uData.transactionCount ?? tData.currentTransactions ?? 0);

    const scanCheck = await checkPlanLimit(tenantId, "maxScansPerMonth", currentMonthTxns);
    if (!scanCheck.allowed) {
      return { ok: false as const, error: "Monthly scan limit reached. Upgrade your plan to continue." };
    }

    // Soft Check: warn and flag tenant, do NOT hard block live POS checkout
    if (currentMonthTxns >= effectiveLimit) {
      isTxnLimitExceeded = true;
      txnWarningMessage = "Monthly transaction limit reached. Additional transactions may be charged or your account upgraded.";
    }

    // Check Concurrent Active POS Terminal Limit Hard Block
    const extraPosCounters = Number(tData.extraPosCountersPurchased ?? 0);
    const maxAllowedCounters = getMaxPosCounters(planKey, extraPosCounters);
    const activeSessions = await getActivePosTerminalSessions(tenantId);

    const staffId = (session.user as any)?.staffId || (session.user as any)?.id || session.user?.email || "";
    const staffEmail = session.user?.email || "";

    const hasActiveSession = activeSessions.some(
      (s) => (staffId && s.staffId === staffId) || (staffEmail && s.staffEmail === staffEmail)
    );

    if (!hasActiveSession && activeSessions.length >= maxAllowedCounters) {
      return {
        ok: false as const,
        success: false as const,
        reason: "pos_terminal_limit_reached",
        error: `Active POS Terminal limit reached (${activeSessions.length}/${maxAllowedCounters}). Your ${planKey.toUpperCase()} plan allows maximum ${maxAllowedCounters} simultaneous billing counter(s). Extra counters can be added for ₹199/counter/month.`,
        message: `Active POS Terminal limit reached (${activeSessions.length}/${maxAllowedCounters}). Your ${planKey.toUpperCase()} plan allows maximum ${maxAllowedCounters} simultaneous billing counter(s). Extra counters can be added for ₹199/counter/month.`,
      };
    }
  }

  // ---- fetch active offers + live stock for pricing ----
  let offersQuery: FirebaseFirestore.Query = adminDb.collection("products").where("clearanceActive", "==", true);
  if (tenantId) {
    offersQuery = offersQuery.where("tenantId", "==", tenantId);
  }
  const offersSnap = await offersQuery.limit(200).get();
  const activeOffers: ProductOffer[] = offersSnap.docs
    .filter((d) => {
      const data = d.data();
      if (!branchCode) return true;
      return !data.branchCode || data.branchCode === branchCode;
    })
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        productId: d.id,
        barcode: data.barcode ?? d.id,
        ...data,
      } as ProductOffer;
    });

  const liveStock: Record<string, number> = {};
  for (const item of params.items) {
    let pQuery = adminDb
      .collection("products")
      .where("barcode", "==", item.barcode);
    if (tenantId) {
      pQuery = pQuery.where("tenantId", "==", tenantId);
    }
    const pSnap = await pQuery.limit(5).get();
    if (!pSnap.empty) {
      const match =
        pSnap.docs.find(
          (d) =>
            !branchCode ||
            !d.data().branchCode ||
            d.data().branchCode === branchCode
        ) ?? pSnap.docs[0];
      liveStock[item.barcode] = Number(match.data().physicalStock ?? 999);
    }
  }

  const priced = applyOffers(
    params.items.map((i) => ({
      barcode: i.barcode,
      name: i.name,
      originalPrice: i.price,
      quantity: i.quantity,
    })),
    activeOffers,
    liveStock
  );

  // Apply instant offer discount if provided
  const instantDiscountPercent = Math.min(50, Math.max(0, params.instantDiscountPercent ?? 0));
  const discountFactor = 1.0 - instantDiscountPercent / 100.0;

  let gstTotal = 0;
  let taxableValue = 0;
  let totalWeight = 0;

  for (const line of priced.lines) {
    const cartItem = params.items.find((i) => i.barcode === line.barcode);
    const gst = cartItem ? cartItem.gst : "0";
    const lineTotal = line.finalUnitPrice * line.quantity * discountFactor;
    const gstRate = parseFloat(gst.toString().replace(/[^0-9.]/g, "")) || 0;
    gstTotal += lineTotal - lineTotal / (1 + gstRate / 100);
    taxableValue += lineTotal / (1 + gstRate / 100);
    if (cartItem) {
      totalWeight += (parseFloat(cartItem.weight) || 0) * line.quantity;
    }
  }

  const baseGrandTotal = priced.grandTotal;
  const instantDiscountAmount = baseGrandTotal * (instantDiscountPercent / 100);
  const totalAmount = baseGrandTotal * discountFactor;
  const totalDiscount = priced.totalDiscount + instantDiscountAmount;

  try {
    let companyName = "Retail Store";
    let storeName = companyName;
    let companyLogoUrl = "";
    let storeLogoUrl = "";
    let invoicePrefix = "INV/";

    if (tenantId) {
      const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
      if (tDoc.exists) {
        const tData = tDoc.data();
        companyName = tData?.companyName ?? companyName;
        companyLogoUrl = tData?.companyLogoUrl ?? "";
        let prefix = (tData?.invoiceConfig?.invoicePrefix ?? "").toString().trim();
        prefix = prefix.replace(/\d{2}-\d{2}[/-]?/g, "");
        if (prefix) {
          invoicePrefix = prefix.endsWith("/") || prefix.endsWith("-") ? prefix : prefix + "/";
        }
      }
    }

    if (branchCode) {
      const sSnap = await adminDb
        .collection("stores")
        .where("branchCode", "==", branchCode)
        .limit(1)
        .get();
      if (!sSnap.empty) {
        const sData = sSnap.docs[0].data();
        storeName = sData.storeName ?? companyName;
        storeLogoUrl = sData.storeLogoUrl ?? sData.companyLogoUrl ?? "";
      }
    }

    const now = new Date();
    const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStr = `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const tenantPrefix = tenantId && tenantId !== "ALL" ? tenantId : "GLOBAL";
    const counterDocId = `${tenantPrefix}_${branchCode}_${todayKey}`;
    const counterRef = adminDb.collection("daily_invoice_counters").doc(counterDocId);

    const seq = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists) {
        const legacyRef = adminDb.collection("daily_invoice_counters").doc(`${branchCode}_${todayKey}`);
        const legSnap = await tx.get(legacyRef);
        const startCount = legSnap.exists ? (legSnap.data()!.count ?? 0) + 1 : 1;
        tx.set(counterRef, { count: startCount });
        return startCount;
      }
      const newCount = (snap.data()!.count ?? 0) + 1;
      tx.update(counterRef, { count: newCount });
      return newCount;
    });

    const invoiceNo = `${invoicePrefix}${fyStr}/${dateStr}-${String(seq).padStart(2, "0")}`;
    const orderRef = adminDb.collection("orders").doc();

    let upiDirectLink: string | null = null;
    let upiQrUrl: string | null = null;
    const isUpiDirect = params.paymentMode === "UPI_DIRECT";

    if (isUpiDirect && tenantId) {
      const tSnap = await adminDb.collection("tenants").doc(tenantId).get();
      const pSettings = tSnap.data()?.paymentSettings || {};
      if (pSettings.upiId) {
        upiDirectLink = generateUpiLink({
          upiId: pSettings.upiId,
          upiName: pSettings.upiName || storeName || companyName || "ClickOut Store",
          amount: totalAmount,
          invoiceNo,
          storeName: storeName || companyName || "ClickOut Store",
        });
        upiQrUrl = generateUpiQrDataUrl(upiDirectLink);
      }
    }

    const batch = adminDb.batch();
    batch.set(orderRef, {
      id: orderRef.id,
      orderType: "DIRECT_POS",
      invoiceNo,
      cashierId: (session.user as any)?.staffId || (session.user as any)?.id || session.user?.email,
      cashierStaffId: (session.user as any)?.staffId || (session.user as any)?.id || "",
      cashierName: session.user?.name ?? "Cashier Staff",
      cashierEmail: session.user?.email || "",
      billedBy: session.user?.name ?? "Cashier Staff",
      billedByName: session.user?.name ?? "Cashier Staff",
      customerPhone: params.customerPhone ? `+91${params.customerPhone.replace(/\D/g, "")}` : null,
      items: priced.lines.map((l) => {
        const cartItem = params.items.find((i) => i.barcode === l.barcode);
        return {
          barcode: l.barcode,
          name: l.name,
          price: l.finalUnitPrice * discountFactor,
          originalPrice: l.originalPrice,
          quantity: l.quantity,
          gst: cartItem?.gst ?? "0",
          weight: cartItem?.weight ?? "",
          offerType: l.offerType,
          isFreeLine: l.isFreeLine ?? false,
        };
      }),
      offerDiscount: totalDiscount,
      totalSavings: totalDiscount,
      instantDiscountPercent,
      instantDiscountAmount,
      freeItemsGiven: priced.totalFreeItems,
      taxableValue,
      subtotal: totalAmount - gstTotal,
      gstTotal,
      totalAmount,
      totalWeight,
      totalExpectedWeight: totalWeight,
      weightVerifiedAtGate: true,
      weightMismatchFlag: false,
      paymentMode: params.paymentMode,
      status: isUpiDirect ? "pending_upi" : "completed",
      paymentStatus: isUpiDirect ? "PENDING" : "PAID",
      exitStatus: isUpiDirect ? "PENDING" : "APPROVED",
      upiDirectLink: upiDirectLink || null,
      upiDirectStatus: isUpiDirect ? "pending" : null,
      generatedBy: "CASHIER",
      qrConsumed: true,
      timestamp: FieldValue.serverTimestamp(),
      paymentCompletedAt: FieldValue.serverTimestamp(),
      exitTimestamp: FieldValue.serverTimestamp(),
      wasEverRejected: false,
      riskLevel: "LOW",
      guardRecommendation: "APPROVE",
      tenantId,
      storeId: branchCode,
      branchCode,
      isDeleted: false,
      companyName,
      storeName,
      companyLogoUrl,
      storeLogoUrl,
      shiftId: params.shiftId || null,
      counterId: params.counterId || null,
      counterName: params.counterName || "POS Terminal 1 - Ground Floor",
      terminalName: params.counterName || "POS Terminal 1 - Ground Floor",
    });

    // Update active POS shift totals if checkout is tied to a counter shift
    if (params.shiftId && tenantId) {
      const shiftDocRef = adminDb.collection("tenants").doc(tenantId).collection("posShifts").doc(params.shiftId);
      batch.update(shiftDocRef, {
        shiftTotalAmount: FieldValue.increment(totalAmount),
        transactionCount: FieldValue.increment(1),
        lastOrderAt: FieldValue.serverTimestamp(),
      });
    }

    // Deduct stock
    for (const line of priced.lines) {
      const baseBarcode = line.barcode.replace("_FREE", "");
      const pSnap = await adminDb
        .collection("products")
        .where("barcode", "==", baseBarcode)
        .where("tenantId", "==", tenantId)
        .where("branchCode", "==", branchCode)
        .limit(1)
        .get();

      if (!pSnap.empty) {
        batch.update(pSnap.docs[0].ref, {
          physicalStock: FieldValue.increment(-line.quantity),
          soldStock: FieldValue.increment(line.quantity),
          lastSoldAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Write audit log
    const cashierDisplayName = session.user?.name ?? "Cashier Staff";

    batch.set(adminDb.collection("admin_audit_logs").doc(), {
      action: "POS_ORDER_CREATED",
      actionType: "POS_ORDER_CREATED",
      actorId: session.user?.email,
      actorName: cashierDisplayName,
      tenantId,
      branchCode,
      orderId: orderRef.id,
      invoiceNo,
      totalAmount,
      cashierName: cashierDisplayName,
      paymentMode: params.paymentMode,
      details: `POS Order ${invoiceNo} (₹${totalAmount.toFixed(2)}) billed by ${cashierDisplayName} via ${params.paymentMode}`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    if (isTxnLimitExceeded && tenantId) {
      batch.set(
        adminDb.collection("tenants").doc(tenantId),
        {
          txnLimitExceeded: true,
          txnLimitExceededAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      batch.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "TXN_LIMIT_EXCEEDED",
        actionType: "TXN_LIMIT_EXCEEDED",
        tenantId,
        branchCode,
        details: `Monthly transaction limit reached (${currentMonthTxns + 1}/${effectiveLimit}). Logged soft-warning.`,
        timestamp: FieldValue.serverTimestamp(),
        severity: "WARNING",
      });
    }

    await batch.commit();
    if (tenantId) {
      await incrementTransactionUsage(tenantId);
      postSalesVoucher(tenantId, orderRef.id).catch((err) => {
        console.warn("[Finance AutoPost] POS sales voucher posting failed for order:", orderRef.id, err?.message);
      });
    }
    revalidatePath("/cashier");
    revalidatePath("/usage");

    let storeAddress = "N/A";
    let storePhone = "N/A";
    let storeGstin = "N/A";
    const storeSnap = await adminDb.collection("stores").where("branchCode", "==", branchCode).limit(1).get();
    if (!storeSnap.empty) {
      const sd = storeSnap.docs[0].data();
      storeAddress = [sd.location?.address, sd.location?.city].filter(Boolean).join(", ") || "N/A";
      storePhone = sd.managerPhone ?? sd.contactNumbers?.[0] ?? "N/A";
      storeGstin = (sd.licenses ?? []).find((l: any) => l.type === "GSTIN")?.number ?? "N/A";
    }

    return {
      ok: true as const,
      invoiceNo,
      orderId: orderRef.id,
      upiDirectLink: upiDirectLink || undefined,
      upiQrUrl: upiQrUrl || undefined,
      totalAmount,
      ...(isTxnLimitExceeded
        ? {
            warning: "TXN_LIMIT_WARNING",
            message: txnWarningMessage,
          }
        : {}),
      discountApplied: totalDiscount,
      freeItems: priced.totalFreeItems,
      receipt: {
        invoiceNo,
        storeName: companyName,
        cashierName: cashierDisplayName,
        address: storeAddress,
        phone: storePhone,
        gstin: storeGstin,
        items: priced.lines
          .filter((l) => !l.isFreeLine || l.quantity > 0)
          .map((l) => ({
            name: l.name,
            quantity: l.quantity,
            price: l.finalUnitPrice * discountFactor,
            originalPrice: l.originalPrice,
          })),
        taxableValue,
        gstTotal,
        discount: totalDiscount,
        totalWeight,
        grandTotal: totalAmount,
        terms: [
          "1. Exchange within 7 days with original receipt.",
          "2. Goods once sold will not be refunded.",
          "3. Staff assisted direct checkout.",
        ],
        timestamp: new Date().toLocaleString(),
      },
    };
  } catch (e: any) {
    return { ok: false as const, error: e.message ?? "Checkout failed" };
  }
}

export async function markUpiPaid(orderId: string) {
  try {
    const { session, role, tenantId } = await requireRole([
      "tenant_admin",
      "manager",
      "cashier",
      "super_admin",
    ]);

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return { ok: false, error: "Order not found." };
    }

    const oData = orderSnap.data() || {};
    if (role !== "super_admin" && tenantId && oData.tenantId && oData.tenantId !== tenantId) {
      return { ok: false, error: "Unauthorized access to order." };
    }

    const actorEmail = session.user?.email || "Cashier Staff";
    await orderRef.update({
      upiDirectStatus: "confirmed",
      paymentStatus: "PAID",
      status: "completed",
      exitStatus: "APPROVED",
      paymentConfirmedBy: actorEmail,
      paymentConfirmedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "POS_UPI_PAYMENT_CONFIRMED",
      actionType: "POS_UPI_PAYMENT_CONFIRMED",
      orderId,
      invoiceNo: oData.invoiceNo || orderId,
      tenantId: oData.tenantId || tenantId,
      actor: actorEmail,
      actorId: actorEmail,
      details: `Cashier confirmed direct UPI payment for order ${oData.invoiceNo || orderId} (₹${oData.totalAmount || 0})`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/cashier");
    return { ok: true, orderId, invoiceNo: oData.invoiceNo };
  } catch (err: any) {
    console.error("Error marking UPI order paid:", err);
    return { ok: false, error: err?.message || "Failed to confirm payment." };
  }
}

export async function getStorePaymentSettings(branchCode?: string) {
  try {
    const { tenantId } = await requireRole(["tenant_admin", "manager", "cashier", "super_admin"]);
    if (!tenantId) return { ok: true, hasUpi: false, upiId: "", upiName: "" };

    const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
    const raw = tDoc.data()?.paymentSettings || {};
    return {
      ok: true,
      hasUpi: Boolean(raw.acceptsUpi && raw.upiId),
      upiId: raw.upiId || "",
      upiName: raw.upiName || "",
    };
  } catch {
    return { ok: true, hasUpi: false, upiId: "", upiName: "" };
  }
}