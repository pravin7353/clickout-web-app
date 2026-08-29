"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

const serviceSchema = z.object({
  barcode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.coerce.number().min(0),
  gst: z.string().default("0"),
  sac: z.string().optional(),
});

export async function addService(raw: unknown) {
  const { session, tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  const data = parsed.data;

  const barcode = data.barcode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const branchCode = storeId ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    await adminDb.collection("products").doc(docId).set({
      barcode,
      name: data.name,
      price: data.price,
      gst: data.gst,
      sac: data.sac ?? "",
      itemType: "SERVICE",
      searchKey: data.name.toLowerCase(),
      tenantId,
      branchCode,
      addedBy: session.user?.name ?? "Admin",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to add service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export async function deleteService(barcode: string) {
  const { tenantId, storeId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const branchCode = storeId ?? "HQ";
  await adminDb.collection("products").doc(`${tenantId}_${branchCode}_${barcode}`).delete();
  revalidatePath("/service");
}