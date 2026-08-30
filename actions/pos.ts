"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

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
      barcode: data.barcode,
      name: data.name,
      price: data.price,
      gst: data.gst ?? "0",
      weight: data.weight ?? "0",
      availableStock: data.physicalStock ?? 0,
    },
  };
}

type CartItem = { barcode: string; name: string; price: number; gst: string; weight: string; quantity: number };

export async function createPosOrder(params: { items: CartItem[]; paymentMode: string; customerPhone?: string }) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = storeId ?? "HQ";
  if (params.items.length === 0) return { ok: false, error: "Cart is empty" };

  let gstTotal = 0, subtotal = 0, taxableValue = 0, totalWeight = 0;
  for (const item of params.items) {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    const gstRate = parseFloat(item.gst.toString().replace(/[^0-9.]/g, "")) || 0;
    const itemGst = itemTotal - itemTotal / (1 + gstRate / 100);
    gstTotal += itemGst;
    taxableValue += itemTotal / (1 + gstRate / 100);
    totalWeight += (parseFloat(item.weight) || 0) * item.quantity;
  }
  const totalAmount = subtotal;

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
      items: params.items,
      taxableValue,
      subtotal: totalAmount - gstTotal,
      gstTotal,
      totalAmount,
      totalWeight,
      paymentMode: params.paymentMode,
      status: "completed",
      paymentStatus: "PAID",
      exitStatus: "APPROVED",
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
    });

    for (const item of params.items) {
      if (!item.barcode) continue;
      const pSnap = await adminDb.collection("products")
        .where("barcode", "==", item.barcode)
        .where("tenantId", "==", tenantId)
        .where("branchCode", "==", branchCode)
        .limit(1)
        .get();

      if (!pSnap.empty) {
        batch.update(pSnap.docs[0].ref, {
          physicalStock: FieldValue.increment(-item.quantity),
          soldStock: FieldValue.increment(item.quantity),
          lastSoldAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    revalidatePath("/cashier");
    return { ok: true, invoiceNo, orderId: orderRef.id };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Checkout failed" };
  }
}