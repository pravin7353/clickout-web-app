"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function registerClient(raw: Record<string, string>) {
  const { session } = await requireRole(["super_admin", "tenant_admin"]);

  const adminEmail = raw.email?.trim().toLowerCase();
  const phoneNo = raw.phone?.trim();
  const storeName = raw.storeName?.trim();
  const ownerName = raw.ownerName?.trim();

  if (!adminEmail || !phoneNo || !storeName || !ownerName) {
    return { ok: false, error: "Required fields missing (Company Name, Owner Name, Email, Phone)." };
  }

  const staffQuery = await adminDb.collection("staff").where("email", "==", adminEmail).get();
  if (!staffQuery.empty) {
    return { ok: false, error: "An account with this administrator email is already registered." };
  }

  const tenantQuery = await adminDb.collection("tenants").where("contact.phone", "==", phoneNo).get();
  if (!tenantQuery.empty) {
    return { ok: false, error: "A client organization with this phone number already exists." };
  }

  const prefix = storeName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "CLNT";
  const tenantId = `${prefix}_${Date.now()}`;
  const defaultBranchCode = `${prefix}_MAIN`;

  const licenses: { type: string; number: string }[] = [];
  if (raw.pan?.trim()) {
    licenses.push({ type: "PAN", number: raw.pan.trim().toUpperCase() });
  }
  if (raw.gst?.trim()) {
    licenses.push({ type: "GSTIN", number: raw.gst.trim().toUpperCase() });
  }

  try {
    const batch = adminDb.batch();

    // 1. Tenant Document
    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    batch.set(tenantRef, {
      tenantId,
      companyName: storeName,
      ownerName,
      gstins: raw.gst?.trim() ? [raw.gst.trim().toUpperCase()] : [],
      establishedYear: parseInt(raw.year, 10) || new Date().getFullYear(),
      industries: [raw.businessType || "RETAIL"],
      goods_or_services: [],
      contact: {
        email: adminEmail,
        phone: phoneNo,
        recoveryEmail: "",
        recoveryPhone: "",
      },
      location: {
        address: raw.address || "",
        city: raw.city || "",
        state: raw.state || "",
        pincode: raw.pincode || "",
      },
      licenses,
      bankDetails: {
        accountName: raw.accountName || "",
        accountNo: raw.accountNo || "",
        ifsc: (raw.ifsc || "").toUpperCase(),
        upi: raw.upi || "",
        bankName: "",
        isCustom: false,
      },
      legal: {
        tcAccepted: raw.tcAccepted === "on" || raw.tcAccepted === "true",
        dataConsent: raw.dataConsent === "on" || raw.dataConsent === "true",
        settlementAgreed: raw.settlementAgreed === "on" || raw.settlementAgreed === "true",
      },
      subscriptionPlan: "PRO",
      maxUsers: 4,
      maxStores: 3,
      isActive: true,
      isOnboardingComplete: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Initial Default Store Location
    const storeRef = adminDb.collection("stores").doc();
    batch.set(storeRef, {
      storeName: `${storeName} (Main Branch)`,
      branchCode: defaultBranchCode,
      tenantId,
      city: raw.city || "Headquarters",
      address: raw.address || "",
      phone: phoneNo,
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 3. Initial Staff (Tenant Admin Account)
    const staffRef = adminDb.collection("staff").doc();
    batch.set(staffRef, {
      docId: staffRef.id,
      tenantId,
      branchCode: "ALL",
      name: ownerName,
      email: adminEmail,
      phone: phoneNo,
      role: "TENANT_ADMIN",
      isActive: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 4. Audit Log
    const auditRef = adminDb.collection("admin_audit_logs").doc();
    batch.set(auditRef, {
      action: "CLIENT_REGISTERED",
      tenantId,
      companyName: storeName,
      adminId: session.user?.email,
      adminEmail: session.user?.email,
      adminName: session.user?.name || "Admin",
      timestamp: FieldValue.serverTimestamp(),
      defaultBranchCode,
    });

    await batch.commit();
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Registration failed" };
  }

  revalidatePath("/register-client");
  revalidatePath("/tenant-admin");
  revalidatePath("/super-admin");
  return { ok: true, tenantId, defaultBranchCode };
}