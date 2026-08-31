"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { applyOffers, ProductOffer } from "@/lib/services/offer-engine";

export async function searchProductByBarcode(barcode: string) {
  const { tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = storeId ?? "HQ";

  const snap = await adminDb.collection("products")
    .where("barcode", "==", barcode.trim())
    .where("tenantId", "==", tenantId)
    .where("branchCode", "==", branchCode)
    .limit(1)
    .get();

  if (snap.empty) return { ok: false, error: "Product not found" };
  const data = snap.docs[0].data();
  return {
    ok: true,
    product: {
      barcode: data.barcode, name: data.name, price: data.price,
      gst: data.gst ?? "0", weight: data.weight ?? "0", availableStock: data.physicalStock ?? 0,
    },
  };
}

type CartItem = { barcode: string; name: string; price: number; gst: string; weight: string; quantity: number };

export async function createPosOrder(params: { items: CartItem[]; paymentMode: string; customerPhone?: string }) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = storeId ?? "HQ";
  if (params.items.length === 0) return { ok: false, error: "Cart is empty" };

  // ---- fetch active offers + live stock for pricing ----
  const offersSnap = await adminDb.collection("products")
    .where("tenantId", "==", tenantId)
    .where("clearanceActive", "==", true)
    .limit(200)
    .get();
  const activeOffers: ProductOffer[] = offersSnap.docs.map((d) => d.data() as ProductOffer);

  const liveStock: Record<string, number> = {};
  for (const item of params.items) {
    const pSnap = await adminDb.collection("products")
      .where("barcode", "==", item.barcode).where("tenantId", "==", tenantId).where("branchCode", "==", branchCode)
      .limit(1).get();
    if (!pSnap.empty) liveStock[item.barcode] = pSnap.docs[0].data().physicalStock ?? 0;
  }

  const priced = applyOffers(
    params.items.map((i) => ({ barcode: i.barcode, name: i.name, originalPrice: i.price, quantity: i.quantity })),
    activeOffers,
    liveStock
  );

  let gstTotal = 0, taxableValue = 0, totalWeight = 0;
  for (const line of priced.lines) {
    const cartItem = params.items.find((i) => i.barcode === line.barcode);
    const gst = cartItem ? cartItem.gst : "0";
    const lineTotal = line.finalUnitPrice * line.quantity;
    const gstRate = parseFloat(gst.toString().replace(/[^0-9.]/g, "")) || 0;
    gstTotal += lineTotal - lineTotal / (1 + gstRate / 100);
    taxableValue += lineTotal / (1 + gstRate / 100);
    if (cartItem) totalWeight += (parseFloat(cartItem.weight) || 0) * line.quantity;
  }
  const totalAmount = priced.grandTotal;

  try {
    let companyName = "Retail Store";
    let invoicePrefix = "INV/";
    if (tenantId) {
      const tDoc = await adminDb.collection("tenants").doc(tenantId).get();
      companyName = tDoc.data()?.companyName ?? companyName;
      let prefix = (tDoc.data()?.invoiceConfig?.invoicePrefix ?? "").toString().trim();
      prefix = prefix.replace(/\d{2}-\d{2}[/-]?/g, "");
      if (prefix) invoicePrefix = prefix.endsWith("/") || prefix.endsWith("-") ? prefix : prefix + "/";
    }

    const now = new Date();
    const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStr = `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const counterRef = adminDb.collection("daily_invoice_counters").doc(`${branchCode}_${todayKey}`);
    const seq = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists) { tx.set(counterRef, { count: 1 }); return 1; }
      const newCount = (snap.data()!.count ?? 0) + 1;
      tx.update(counterRef, { count: newCount });
      return newCount;
    });

    const invoiceNo = `${invoicePrefix}${fyStr}/${dateStr}-${String(seq).padStart(2, "0")}`;
    const orderRef = adminDb.collection("orders").doc();

    const batch = adminDb.batch();
    batch.set(orderRef, {
      orderType: "DIRECT_POS",
      invoiceNo,
      cashierId: session.user?.email,
      cashierName: session.user?.name ?? "Manager",
      customerPhone: params.customerPhone ?? null,
      items: priced.lines.map((l) => ({ barcode: l.barcode, name: l.name, price: l.finalUnitPrice, originalPrice: l.originalPrice, quantity: l.quantity, offerType: l.offerType })),
      offerDiscount: priced.totalDiscount,
      freeItemsGiven: priced.totalFreeItems,
      taxableValue, subtotal: totalAmount - gstTotal, gstTotal, totalAmount, totalWeight,
      paymentMode: params.paymentMode,
      status: "completed", paymentStatus: "PAID", exitStatus: "APPROVED",
      generatedBy: "CASHIER", qrConsumed: true,
      timestamp: FieldValue.serverTimestamp(),
      paymentCompletedAt: FieldValue.serverTimestamp(),
      exitTimestamp: FieldValue.serverTimestamp(),
      wasEverRejected: false, riskLevel: "LOW", guardRecommendation: "APPROVE",
      tenantId, storeId: branchCode, branchCode, isDeleted: false, companyName,
    });

    // stock deduction: paid lines by their real barcode, free lines deduct from base barcode too
    for (const line of priced.lines) {
      const baseBarcode = line.barcode.replace("_FREE", "");
      const pSnap = await adminDb.collection("products")
        .where("barcode", "==", baseBarcode).where("tenantId", "==", tenantId).where("branchCode", "==", branchCode)
        .limit(1).get();
      if (!pSnap.empty) {
        batch.update(pSnap.docs[0].ref, {
          physicalStock: FieldValue.increment(-line.quantity),
          soldStock: FieldValue.increment(line.quantity),
          lastSoldAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    revalidatePath("/cashier");
    let storeAddress = "N/A", storePhone = "N/A", storeGstin = "N/A";
    const storeSnap = await adminDb.collection("stores").where("branchCode", "==", branchCode).limit(1).get();
    if (!storeSnap.empty) {
      const sd = storeSnap.docs[0].data();
      storeAddress = [sd.location?.address, sd.location?.city].filter(Boolean).join(", ") || "N/A";
      storePhone = sd.managerPhone ?? sd.contactNumbers?.[0] ?? "N/A";
      storeGstin = (sd.licenses ?? []).find((l: any) => l.type === "GSTIN")?.number ?? "N/A";
    }

    return {
      ok: true, invoiceNo, orderId: orderRef.id,
      discountApplied: priced.totalDiscount, freeItems: priced.totalFreeItems,
      receipt: {
        invoiceNo, storeName: companyName, address: storeAddress, phone: storePhone, gstin: storeGstin,
        items: priced.lines.filter((l) => !l.isFreeLine || l.quantity > 0).map((l) => ({ name: l.name, quantity: l.quantity, price: l.finalUnitPrice, originalPrice: l.originalPrice })),
        taxableValue, gstTotal, discount: priced.totalDiscount, totalWeight, grandTotal: totalAmount,
        terms: ["1. Exchange within 7 days with original receipt.", "2. Goods once sold will not be refunded."],
        timestamp: new Date().toLocaleString(),
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Checkout failed" };
  }
}