"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function getTenantOnboardingStatus(tenantId: string | null) {
  if (!tenantId) return { isOnboardingComplete: true, tenant: null };
  const doc = await adminDb.collection("tenants").doc(tenantId).get();
  const data = doc.data();
  return { isOnboardingComplete: data?.isOnboardingComplete === true, tenant: data ?? null };
}

export async function completeTenantOnboarding(params: {
  companyName: string; hoAddress: string; hoCity: string; hoState: string; hoPincode: string;
  gstins: string; contactName: string; contactPhone: string; industryType: string;
}) {
  const { tenantId } = await requireRole(["tenant_admin", "super_admin"]);
  if (!tenantId) return { ok: false, error: "Tenant ID missing — please re-login." };

  const validGstins = params.gstins.split(",").map((g) => g.trim().toUpperCase()).filter(Boolean);

  await adminDb.collection("tenants").doc(tenantId).set({
    isOnboardingComplete: true,
    companyName: params.companyName.trim(),
    hoAddress: params.hoAddress.trim(),
    hoPincode: params.hoPincode.trim(),
    hoCity: params.hoCity.trim(),
    hoState: params.hoState.trim(),
    gstins: validGstins,
    primaryContact: { name: params.contactName.trim(), phone: params.contactPhone.trim() },
    industryType: params.industryType,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  revalidatePath("/tenant-admin");
  return { ok: true };
}