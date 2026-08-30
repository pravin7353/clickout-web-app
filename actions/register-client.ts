"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function registerClient(raw: Record<string, string>) {
  await requireRole(["super_admin", "tenant_admin"]);

  const adminEmail = raw.email?.trim();
  const phoneNo = raw.phone?.trim();
  if (!adminEmail || !phoneNo || !raw.storeName || !raw.ownerName) {
    return { ok: false, error: "Required fields missing." };
  }

  const staffQuery = await adminDb.collection("staff").where("email", "==", adminEmail).get();
  if (!staffQuery.empty) return { ok: false, error: "This email is already registered." };

  const tenantQuery = await adminDb.collection("tenants").where("contact.phone", "==", phoneNo).get();
  if (!tenantQuery.empty) return { ok: false, error: "A client with this phone number already exists." };

  const prefix = raw.storeName.replace(/ /g, "").toUpperCase().slice(0, 3);
  const tenantId = `${prefix}_${Date.now()}`;

  const licenses: { type: string; number: string }[] = [{ type: "PAN", number: raw.pan.trim().toUpperCase() }];
  if (raw.gst?.trim()) licenses.push({ type: "GSTIN", number: raw.gst.trim().toUpperCase() });

  try {
    const batch = adminDb.batch();

    batch.set(adminDb.collection("tenants").doc(tenantId), {
      tenantId,
      companyName: raw.storeName.trim(),
      ownerName: raw.ownerName.trim(),
      establishedYear: parseInt(raw.year, 10) || new Date().getFullYear(),
      industries: [raw.businessType ?? "RETAIL"],
      goods_or_services: [],
      contact: { email: adminEmail, phone: phoneNo, recoveryEmail: "", recoveryPhone: "" },
      location: { address: raw.address ?? "", city: raw.city ?? "", state: raw.state ?? "", pincode: raw.pincode ?? "" },
      licenses,
      bankDetails: { accountName: raw.accountName ?? "", accountNo: raw.accountNo ?? "", ifsc: (raw.ifsc ?? "").toUpperCase(), upi: raw.upi ?? "", bankName: "", isCustom: false },
      legal: { tcAccepted: raw.tcAccepted === "on", dataConsent: raw.dataConsent === "on", settlementAgreed: raw.settlementAgreed === "on" },
      isActive: true,
      isOnboardingComplete: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const staffRef = adminDb.collection("staff").doc();
    batch.set(staffRef, {
      docId: staffRef.id,
      tenantId,
      branchCode: "ALL",
      name: raw.ownerName.trim(),
      email: adminEmail,
      phone: phoneNo,
      role: "TENANT_ADMIN",
      isActive: true,
      isDeleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Registration failed" };
  }

  revalidatePath("/register-client");
  return { ok: true, tenantId };
}