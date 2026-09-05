"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireEditAccess } from "@/lib/rbac";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

const serviceSchema = z.object({
  barcode: z.string().trim().min(1, "Service Code is required"),
  name: z.string().trim().min(1, "Service Name is required"),
  price: z.coerce.number().min(0, "Price must be greater than or equal to 0"),
  gst: z.string().default("18% GST"),
  sac: z.string().optional(),
});

const updateServiceSchema = z.object({
  barcode: z.string().trim().min(1, "Service Code is required"),
  name: z.string().trim().min(1, "Service Name is required"),
  price: z.coerce.number().min(0, "Price must be greater than or equal to 0"),
  gst: z.string().default("18% GST"),
  sac: z.string().optional(),
});

export async function addService(raw: unknown, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot add services." };
  }

  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const barcode = data.barcode.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
  const branchCode = storeId ?? branchParam ?? "HQ";
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
      unitCost: 0,
      physicalStock: 0,
      reservedStock: 0,
      addedBy: session.user?.name ?? session.user?.email ?? "Admin",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_CREATED",
      actionType: "SERVICE_CREATED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Registered service '${data.name}' (${barcode}) for branch ${branchCode}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to add service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export async function updateService(raw: unknown, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot edit services." };
  }

  const parsed = updateServiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  const barcode = data.barcode.trim().toUpperCase();
  const branchCode = storeId ?? branchParam ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    const docRef = adminDb.collection("products").doc(docId);
    const snap = await docRef.get();

    const updatePayload = {
      name: data.name.trim(),
      price: data.price,
      gst: data.gst,
      sac: data.sac?.trim() ?? "",
      searchKey: data.name.trim().toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.user?.name ?? session.user?.email ?? "Admin",
    };

    if (snap.exists) {
      await docRef.update(updatePayload);
    } else {
      const qSnap = await adminDb
        .collection("products")
        .where("itemType", "==", "SERVICE")
        .where("barcode", "==", barcode)
        .limit(1)
        .get();

      if (!qSnap.empty) {
        await qSnap.docs[0].ref.update(updatePayload);
      } else {
        await docRef.set({
          ...updatePayload,
          barcode,
          itemType: "SERVICE",
          tenantId,
          branchCode,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_UPDATED",
      actionType: "SERVICE_UPDATED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Updated service '${data.name}' (${barcode}) for branch ${branchCode}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to update service" };
  }

  revalidatePath("/service");
  return { ok: true };
}

export async function deleteService(barcode: string, branchParam?: string) {
  let session, tenantId, storeId;
  try {
    ({ session, tenantId, storeId } = await requireEditAccess(["tenant_admin", "manager"]));
  } catch {
    return { ok: false, error: "You have view-only access and cannot delete services." };
  }

  const branchCode = storeId ?? branchParam ?? "HQ";
  const docId = `${tenantId}_${branchCode}_${barcode}`;

  try {
    const docRef = adminDb.collection("products").doc(docId);
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
    } else {
      const qSnap = await adminDb
        .collection("products")
        .where("itemType", "==", "SERVICE")
        .where("barcode", "==", barcode)
        .limit(1)
        .get();
      if (!qSnap.empty) {
        await qSnap.docs[0].ref.delete();
      }
    }

    await adminDb.collection("admin_audit_logs").add({
      action: "SERVICE_DELETED",
      actionType: "SERVICE_DELETED",
      barcode,
      actorId: session.user?.email,
      tenantId,
      details: `Deleted service ${barcode} from branch ${branchCode}.`,
      severity: "WARNING",
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to delete service" };
  }

  revalidatePath("/service");
  return { ok: true };
}