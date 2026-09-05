"use server";

import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export type BrandInfo = {
  ok: boolean;
  tenantId?: string;
  companyName?: string;
  companyLogoUrl?: string | null;
  storeName?: string | null;
  storeLogoUrl?: string | null;
  branchCode?: string | null;
  storeDocId?: string | null;
  error?: string;
};

export async function getBrandInfo(storeCode?: string | null): Promise<BrandInfo> {
  try {
    const { session, tenantId } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
      "auditor",
      "cashier",
      "guard",
    ]);

    const effectiveTenantId = tenantId ?? (session.user as any)?.tenantId;
    if (!effectiveTenantId) {
      return { ok: false, error: "Tenant ID missing" };
    }

    // 1. Fetch Tenant Profile
    const tenantDoc = await adminDb.collection("tenants").doc(effectiveTenantId).get();
    const tData = tenantDoc.data() || {};
    const companyName = tData.companyName || tData.name || "Your Company";
    const companyLogoUrl = tData.companyLogoUrl || null;
    let storeLogoUrl = tData.storeLogoUrl || null;

    // 2. Fetch Active Store if storeCode or session storeId is provided
    let storeName: string | null = null;
    let branchCode: string | null = null;
    let storeDocId: string | null = null;

    const targetStore = storeCode || (session.user as any)?.branchCode || (session.user as any)?.storeId;

    if (targetStore) {
      // Check by doc ID first
      let sDoc = await adminDb.collection("stores").doc(targetStore).get();
      if (!sDoc.exists) {
        // Fallback: Query by branchCode
        const qSnap = await adminDb
          .collection("stores")
          .where("tenantId", "==", effectiveTenantId)
          .where("branchCode", "==", targetStore)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          sDoc = qSnap.docs[0];
        }
      }

      if (sDoc.exists) {
        const sData = sDoc.data() || {};
        storeDocId = sDoc.id;
        branchCode = sData.branchCode || targetStore;
        storeName = sData.storeName || sData.name || branchCode;
        if (sData.storeLogoUrl) {
          storeLogoUrl = sData.storeLogoUrl;
        }
      }
    }

    return {
      ok: true,
      tenantId: effectiveTenantId,
      companyName,
      companyLogoUrl,
      storeName,
      storeLogoUrl: storeLogoUrl || companyLogoUrl, // Graceful fallback
      branchCode,
      storeDocId,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to fetch brand info" };
  }
}

export async function uploadBrandLogo(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const { session, tenantId } = await requireRole(["super_admin", "tenant_admin", "manager"]);
    const effectiveTenantId = tenantId ?? (session.user as any)?.tenantId;

    if (!effectiveTenantId) {
      return { ok: false, error: "Tenant not authenticated" };
    }

    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "company"; // 'company' | 'store'
    const branchCode = (formData.get("branchCode") as string) || (session.user as any)?.branchCode || null;

    if (!file || file.size === 0) {
      return { ok: false, error: "No image file provided" };
    }

    // Maximum 5MB size limit
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, error: "Image file too large. Max 5MB allowed." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const token = randomUUID();
    const fileName = type === "store" ? "store_logo.png" : "company_logo.png";
    const storagePath = `logos/${effectiveTenantId}/${fileName}`;

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || "image/png",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      storagePath
    )}?alt=media&token=${token}`;

    // Update Firestore records
    if (type === "company") {
      await adminDb.collection("tenants").doc(effectiveTenantId).set(
        { companyLogoUrl: downloadUrl },
        { merge: true }
      );
    } else {
      // Store logo: update tenant default and specific store document
      await adminDb.collection("tenants").doc(effectiveTenantId).set(
        { storeLogoUrl: downloadUrl },
        { merge: true }
      );

      if (branchCode) {
        const storeQuery = await adminDb
          .collection("stores")
          .where("tenantId", "==", effectiveTenantId)
          .where("branchCode", "==", branchCode)
          .limit(1)
          .get();

        if (!storeQuery.empty) {
          await storeQuery.docs[0].ref.update({ storeLogoUrl: downloadUrl });
        } else {
          // Check if branchCode was actually a doc ID
          const storeDoc = await adminDb.collection("stores").doc(branchCode).get();
          if (storeDoc.exists) {
            await storeDoc.ref.update({ storeLogoUrl: downloadUrl });
          }
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/tenant-admin");
    revalidatePath("/dashboard");
    revalidatePath("/procurement");

    return { ok: true, url: downloadUrl };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to upload logo" };
  }
}

export type UserProfileInfo = {
  ok: boolean;
  name: string;
  email: string;
  phone: string;
  empId: string;
  role: string;
  tenantId: string;
  companyName: string;
  storeName: string;
  branchCode: string;
  status: string;
  avatarUrl: string | null;
  error?: string;
};

export async function getCurrentUserProfile(storeCode?: string | null): Promise<UserProfileInfo> {
  try {
    const { session, tenantId, role } = await requireRole([
      "super_admin",
      "tenant_admin",
      "manager",
      "auditor",
      "cashier",
      "guard",
    ]);

    const email = session.user?.email || "";
    let staffData: any = null;
    let staffDocId = "";

    if (email) {
      const staffSnap = await adminDb
        .collection("staff")
        .where("email", "==", email)
        .where("isActive", "==", true)
        .limit(1)
        .get();
      if (!staffSnap.empty) {
        staffDocId = staffSnap.docs[0].id;
        staffData = staffSnap.docs[0].data();
      }
    }

    const effectiveTenantId = tenantId || staffData?.tenantId || (session.user as any)?.tenantId;
    let tenantData: any = {};
    if (effectiveTenantId) {
      const tSnap = await adminDb.collection("tenants").doc(effectiveTenantId).get();
      if (tSnap.exists) tenantData = tSnap.data();
    }

    // Resolve store name
    let storeName = "";
    let branchCode = "";
    const targetStore = storeCode || staffData?.branchCode || (session.user as any)?.branchCode || (session.user as any)?.storeId;
    if (targetStore) {
      let sSnap = await adminDb.collection("stores").doc(targetStore).get();
      if (!sSnap.exists && effectiveTenantId) {
        const qSnap = await adminDb
          .collection("stores")
          .where("tenantId", "==", effectiveTenantId)
          .where("branchCode", "==", targetStore)
          .limit(1)
          .get();
        if (!qSnap.empty) sSnap = qSnap.docs[0];
      }
      if (sSnap.exists) {
        const sData = sSnap.data() || {};
        storeName = sData.storeName || sData.name || "";
        branchCode = sData.branchCode || targetStore;
      }
    }

    const name = staffData?.name || tenantData.ownerName || session.user?.name || email.split("@")[0];
    const phone = staffData?.phone || tenantData.contact?.phone || "";
    const empId = staffData?.empId || (role === "tenant_admin" ? effectiveTenantId : staffDocId) || "";
    const companyName = tenantData.companyName || tenantData.name || "ClickOut Enterprise";
    const status = staffData?.status || (staffData?.isActive ? "Active" : "Active");
    const avatarUrl = tenantData.storeLogoUrl || tenantData.companyLogoUrl || null;

    return {
      ok: true,
      name,
      email,
      phone,
      empId,
      role: role.toUpperCase(),
      tenantId: effectiveTenantId || "",
      companyName,
      storeName,
      branchCode,
      status,
      avatarUrl,
    };
  } catch (err: any) {
    return {
      ok: false,
      name: "",
      email: "",
      phone: "",
      empId: "",
      role: "",
      tenantId: "",
      companyName: "",
      storeName: "",
      branchCode: "",
      status: "",
      avatarUrl: null,
      error: err.message || "Failed to fetch profile",
    };
  }
}

