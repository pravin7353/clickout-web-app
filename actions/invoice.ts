"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { buildInvoiceData } from "@/lib/services/invoice-service";
import { InvoiceDocument } from "@/components/invoice-pdf";
import { renderToBuffer } from "@react-pdf/renderer";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import React from "react";

export type RefundPolicyType = "NON_REFUNDABLE" | "REFUNDABLE_WINDOW";

export type InvoiceConfig = {
  invoicePrefix: string;
  hsnCode: string;
  terms: string;
  refundPolicyType?: RefundPolicyType;
  returnWindowDays?: number;
};

export async function generateInvoicePdf(orderId: string) {
  try {
    const session = await requireRole(["super_admin", "tenant_admin", "manager"]);

    // 1. Fetch Order
    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) return { ok: false, error: "Order not found" };
    const order = orderSnap.data()!;

    // Security: Tenant isolation
    if (session.role !== "super_admin" && order.tenantId !== session.tenantId) {
      return { ok: false, error: "Unauthorized: Tenant mismatch" };
    }

    // Security: Manager store isolation
    if (session.role === "manager" && order.branchCode !== session.storeId) {
      return { ok: false, error: "Unauthorized: Store mismatch" };
    }

    // 2. Fetch Store Profile (for GSTIN, Bank, Address)
    let store = null;
    if (order.branchCode) {
      const storeSnap = await adminDb
        .collection("stores")
        .where("branchCode", "==", order.branchCode)
        .limit(1)
        .get();
      if (!storeSnap.empty) store = storeSnap.docs[0].data();
    }

    // 3. Fetch Tenant Invoice Config (for Prefix, Terms)
    let config = {};
    if (order.tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(order.tenantId).get();
      if (tenantSnap.exists) config = tenantSnap.data()?.invoiceConfig || {};
    }

    // 4. Check if refund document exists in refunds collection
    let refundData = null;
    const refDoc = await adminDb.collection("refunds").doc(`ref_${orderId}`).get();
    if (refDoc.exists) {
      refundData = refDoc.data();
    }

    // 5. Build data & Render PDF
    const invoiceData = buildInvoiceData(
      { id: orderSnap.id, ...order, refundDocData: refundData },
      store,
      config
    );
    const pdfBuffer = await renderToBuffer(React.createElement(InvoiceDocument, { data: invoiceData }) as any);

    return {
      ok: true,
      data: pdfBuffer.toString("base64"),
      filename: `Invoice_${invoiceData.invoiceNo}.pdf`,
    };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to generate invoice" };
  }
}

export async function getInvoiceSettings(branchCode?: string | null): Promise<{
  ok: boolean;
  config?: InvoiceConfig;
  error?: string;
}> {
  try {
    const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
    const effectiveTenantId = tenantId ?? (session.user as any)?.tenantId;

    if (!effectiveTenantId) {
      return { ok: false, error: "Tenant ID missing" };
    }

    const tenantDoc = await adminDb.collection("tenants").doc(effectiveTenantId).get();
    const tData = tenantDoc.data() || {};
    const config = (tData.invoiceConfig as Partial<InvoiceConfig>) || {};

    let savedPrefix = (config.invoicePrefix || "").trim();
    // Auto-clean year patterns if present
    savedPrefix = savedPrefix.replace(/\d{2}-\d{2}[/-]?/g, "");
    if (!savedPrefix) savedPrefix = "INV/";

    const refundPolicyType: RefundPolicyType = config.refundPolicyType || "REFUNDABLE_WINDOW";
    const returnWindowDays: number = typeof config.returnWindowDays === "number" ? config.returnWindowDays : 7;

    return {
      ok: true,
      config: {
        invoicePrefix: savedPrefix,
        hsnCode: config.hsnCode || "",
        terms:
          config.terms ||
          "1. Goods may be returned or refunded within 7 days with original receipt.\n2. Items must be unused with tags intact.",
        refundPolicyType,
        returnWindowDays,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to load invoice settings" };
  }
}

export async function updateInvoiceSettings(params: {
  invoicePrefix: string;
  hsnCode: string;
  terms: string;
  refundPolicyType?: RefundPolicyType;
  returnWindowDays?: number;
  branchCode?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
    const effectiveTenantId = tenantId ?? (session.user as any)?.tenantId;

    if (!effectiveTenantId) {
      return { ok: false, error: "Tenant not authenticated" };
    }

    const invoiceConfig: InvoiceConfig = {
      invoicePrefix: params.invoicePrefix.trim() || "INV/",
      hsnCode: params.hsnCode.trim(),
      terms: params.terms.trim(),
      refundPolicyType: params.refundPolicyType || "REFUNDABLE_WINDOW",
      returnWindowDays: typeof params.returnWindowDays === "number" ? params.returnWindowDays : 7,
    };

    // Update in tenant document
    await adminDb.collection("tenants").doc(effectiveTenantId).set(
      {
        invoiceConfig,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // If branchCode provided, also merge into store document
    if (params.branchCode) {
      const storeSnap = await adminDb
        .collection("stores")
        .where("branchCode", "==", params.branchCode)
        .limit(1)
        .get();
      if (!storeSnap.empty) {
        await storeSnap.docs[0].ref.set(
          {
            invoiceConfig,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    // Audit log
    await adminDb.collection("admin_audit_logs").add({
      action: "INVOICE_CONFIG_UPDATED",
      actionType: "INVOICE_CONFIG_UPDATED",
      actorId: session.user?.email || "Admin",
      tenantId: effectiveTenantId,
      details: `Updated invoice rules. Prefix: ${invoiceConfig.invoicePrefix}, HSN: ${invoiceConfig.hsnCode}, Policy: ${invoiceConfig.refundPolicyType} (${invoiceConfig.returnWindowDays}d)`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/");
    revalidatePath("/tenant-admin");
    revalidatePath("/cashier");
    revalidatePath("/refund");
    revalidatePath("/auditor");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to save invoice settings" };
  }
}