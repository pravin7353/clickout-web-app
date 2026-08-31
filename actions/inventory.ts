"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole, requireEditAccess, resolveStoreScope } from "@/lib/rbac";
import { addProductSchema, updateProductSchema } from "@/lib/schemas/product-schema";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function addProduct(raw: unknown) {
  let session, role, tenantId, storeId;
  try {
    ({ session, role, tenantId, storeId } = await requireEditAccess(["super_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add products." };
  }
  const parsed = addProductSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const branchCode = storeId ?? "HQ";
  const effectiveTenantId = role === "super_admin" ? (raw as any).tenantId ?? tenantId : tenantId;
  const docId = `${effectiveTenantId}_${branchCode}_${data.barcode}`;
  const docRef = adminDb.collection("products").doc(docId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) throw new Error(`Barcode ${data.barcode} already exists in your store!`);

      tx.set(docRef, {
        barcode: data.barcode,
        name: data.name,
        itemType: "PRODUCT",
        price: data.price,
        unitCost: data.unitCost,
        gst: data.gst,
        physicalStock: data.physicalStock,
        openingStock: data.physicalStock,
        purchasedStock: 0,
        soldStock: 0,
        damagedStock: 0,
        expiredStock: 0,
        reservedStock: 0,
        weight: data.weight ?? "",
        expiryDate: data.expiryDate ? Timestamp.fromDate(new Date(data.expiryDate)) : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        searchKey: data.name.toLowerCase(),
        tenantId: effectiveTenantId,
        branchCode,
        addedBy: session.user?.name ?? "Unknown Manager",
        addedByEmail: session.user?.email ?? "Unknown Email",
      });

      tx.set(adminDb.collection("admin_audit_logs").doc(), {
        action: "NEW_MASTER_PRODUCT_ADDED",
        barcode: data.barcode,
        adminId: session.user?.email,
        timestamp: FieldValue.serverTimestamp(),
        tenantId: effectiveTenantId,
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "FRAUD ALERT: Barcode already exists in your store!" };
  }

  revalidatePath("/inventory");
  return { ok: true };
}

export async function markDamagedOrExpired(productId: string, quantity: number, reason: "EXPIRED" | "DAMAGED") {
  let session, tenantId;
  try {
    ({ session, tenantId } = await requireEditAccess(["super_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot update stock." };
  }
  if (quantity <= 0) return { ok: false, error: "Quantity must be positive" };

  const docRef = adminDb.collection("products").doc(productId);
  const field = reason === "EXPIRED" ? "expiredStock" : "damagedStock";

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new Error("Product missing!");
      const data = snap.data()!;

      tx.update(docRef, {
        [field]: (data[field] ?? 0) + quantity,
        physicalStock: (data.physicalStock ?? 0) - quantity,
      });

      tx.set(adminDb.collection("audit_logs").doc(), {
        productId,
        quantity,
        reason,
        timestamp: FieldValue.serverTimestamp(),
        reportedBy: session.user?.email ?? "Admin",
        tenantId,
      });
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Update failed" };
  }

  revalidatePath("/inventory");
  return { ok: true };
}