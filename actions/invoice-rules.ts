"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";

export async function getInvoiceRules() {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) return { invoicePrefix: "INV/", hsnCode: "", terms: "" };

  const doc = await adminDb.collection("tenants").doc(tenantId).get();
  const config = doc.data()?.invoiceConfig ?? {};

  let prefix = (config.invoicePrefix ?? "").toString().trim();
  prefix = prefix.replace(/\d{2}-\d{2}[/-]?/g, "");

  return {
    invoicePrefix: prefix || "INV/",
    hsnCode: config.hsnCode ?? "",
    terms: config.terms ?? "1. Exchange within 7 days with original receipt.\n2. Goods once sold will not be refunded.",
  };
}

export async function saveInvoiceRules(params: { invoicePrefix: string; hsnCode: string; terms: string }) {
  const { tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
  if (!tenantId) return { ok: false, error: "Open a specific store to save rules." };

  await adminDb.collection("tenants").doc(tenantId).set({
    invoiceConfig: {
      invoicePrefix: params.invoicePrefix.trim(),
      hsnCode: params.hsnCode.trim(),
      terms: params.terms.trim(),
    },
  }, { merge: true });

  return { ok: true };
}