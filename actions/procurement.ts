"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function approveAiSuggestion(suggestionId: string) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  const adminEmail = session.user?.email ?? "Unknown";

  const suggestionRef = adminDb.collection("ai_po_suggestions").doc(suggestionId);

  try {
    const suggestionSnap = await suggestionRef.get();
    if (!suggestionSnap.exists) return { ok: false, error: "Suggestion no longer exists." };
    const s = suggestionSnap.data()!;

    const productId = s.productId;
    const supplierId = s.supplierId ?? "DEFAULT_SUPPLIER";
    const branchCode = s.branchCode ?? "HQ";
    const orderQty = s.suggestedQty ?? s.orderQty ?? 50;

    const productDoc = await adminDb.collection("products").doc(productId).get();
    const productName = productDoc.data()?.name ?? "Unknown Product";
    let unitCost = parseFloat(productDoc.data()?.unitCost ?? "0") || 0;
    if (unitCost <= 0) unitCost = (parseFloat(productDoc.data()?.price ?? "0") || 0) * 0.7;
    const totalItemCost = unitCost * orderQty;

    const poRef = adminDb.collection("purchase_orders").doc();
    await poRef.set({
      poId: poRef.id,
      supplierId,
      status: "APPROVED",
      branchCode,
      expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      totalItems: 1,
      totalOrderValue: totalItemCost,
      createdAt: FieldValue.serverTimestamp(),
      approvedBy: `AI_engine_CONFIRMED_BY_${adminEmail}`,
      approvedAt: FieldValue.serverTimestamp(),
      tenantId,
      items: [{ productId, name: productName, orderQty, unitCost, totalItemCost }],
    });

    await adminDb.collection("mail").add({
      to: `orders@${supplierId.toString().toLowerCase()}.com`,
      message: {
        subject: `Automated PO: #${poRef.id} from ClickOut Command Center`,
        html: `<h2>Automated Purchase Order</h2><p>Please deliver <b>${orderQty} Units</b> of <b>${productName}</b> to ${branchCode}.</p><p><i>This PO was generated predictively by ClickOut AI.</i></p>`,
      },
    });

    await suggestionRef.delete();
  } catch (e: any) {
    return { ok: false, error: e.message ?? "AI Approval Failed" };
  }

  revalidatePath("/procurement");
  return { ok: true };
}

export async function rejectAiSuggestion(suggestionId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("ai_po_suggestions").doc(suggestionId).delete();
  revalidatePath("/procurement");
}

export async function approvePO(poId: string) {
  const { session } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  await adminDb.collection("purchase_orders").doc(poId).update({
    status: "APPROVED",
    approvedBy: session.user?.email ?? "Admin",
    approvedAt: FieldValue.serverTimestamp(),
  });
  revalidatePath("/procurement");
}