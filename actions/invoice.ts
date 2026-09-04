"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { buildInvoiceData } from "@/lib/services/invoice-service";
import { InvoiceDocument } from "@/components/invoice-pdf";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

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
      const storeSnap = await adminDb.collection("stores").where("branchCode", "==", order.branchCode).limit(1).get();
      if (!storeSnap.empty) store = storeSnap.docs[0].data();
    }

    // 3. Fetch Tenant Invoice Config (for Prefix, Terms)
    let config = {};
    if (order.tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(order.tenantId).get();
      if (tenantSnap.exists) config = tenantSnap.data()?.invoiceConfig || {};
    }

    // 4. Build data & Render PDF
    const invoiceData = buildInvoiceData({ id: orderSnap.id, ...order }, store, config);
    const pdfBuffer = await renderToBuffer(React.createElement(InvoiceDocument, { data: invoiceData }));
    
    return { 
      ok: true, 
      data: pdfBuffer.toString("base64"), 
      filename: `Invoice_${invoiceData.invoiceNo}.pdf` 
    };
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to generate invoice" };
  }
}