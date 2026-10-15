"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { createStoreSchema } from "@/lib/schemas/store-schema";
import { PLAN_LIMITS } from "@/lib/subscription/feature-flag-matrix";
import { checkAndAutoDowngradeExpiredTrial } from "@/lib/services/trial-service";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

export async function createStore(raw: unknown) {
  const { session, tenantId } = await requireRole(["super_admin", "tenant_admin"]);

  // Strip untouched default empty rows as a safety net
  let sanitizedRaw = raw;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, any>;
    const licenses = Array.isArray(r.licenses)
      ? r.licenses.filter((lic: any) => lic && typeof lic.number === "string" && lic.number.trim() !== "")
      : r.licenses;

    const bankAccounts = Array.isArray(r.bankAccounts)
      ? r.bankAccounts.filter((bank: any) => {
          if (!bank || typeof bank !== "object") return false;
          const name = typeof bank.accountName === "string" ? bank.accountName.trim() : "";
          const no = typeof bank.accountNo === "string" ? bank.accountNo.trim() : "";
          const ifsc = typeof bank.ifsc === "string" ? bank.ifsc.trim() : "";
          return name !== "" || no !== "" || ifsc !== "";
        })
      : r.bankAccounts;

    sanitizedRaw = {
      ...r,
      licenses,
      bankAccounts,
    };
  }

  const parsed = createStoreSchema.safeParse(sanitizedRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;
  const effectiveTenantId = tenantId ?? (sanitizedRaw as any).tenantId;
  if (!effectiveTenantId) return { ok: false, error: "Tenant Identity missing!" };

  const branchCode = data.branchCode.toUpperCase();
  const hasManager = !!data.managerEmail;
  const managerEmail = hasManager ? data.managerEmail!.toLowerCase() : "";

  let currentStoreCount = 0;
  let isExtraStore = false;

  // Step 3: Subscription store creation validation
  if (effectiveTenantId) {
    const [tDoc, existingStoresSnap] = await Promise.all([
      adminDb.collection("tenants").doc(effectiveTenantId).get(),
      adminDb.collection("stores").where("tenantId", "==", effectiveTenantId).get(),
    ]);

    let tData = tDoc.data() || {};
    tData = await checkAndAutoDowngradeExpiredTrial(effectiveTenantId, tData);

    const planKey = (tData.subscriptionPlan || tData.plan || "spark_lite").toLowerCase();
    const limits = PLAN_LIMITS[planKey] ?? PLAN_LIMITS["spark_lite"];

    const activeStores = existingStoresSnap.docs.filter((d) => d.data().isDeleted !== true);
    currentStoreCount = activeStores.length;

    // Count extra stores already purchased (stores where isExtraStore === true OR storeIndex > 0)
    const extraStoresOnDocs = activeStores.filter((d) => {
      const sData = d.data();
      return sData.isExtraStore === true || (sData.storeIndex ?? 0) > 0 || sData.isExtraPaid === true;
    }).length;
    const extraStoresPurchased = Math.max(
      Number(tData.extraStoresPurchased ?? 0),
      extraStoresOnDocs
    );

    const maxStores = limits.maxStores;
    const maxExtraStores = limits.maxExtraStores;
    const totalStoresAllowed = maxStores + extraStoresPurchased;

    if (currentStoreCount >= maxStores + maxExtraStores) {
      return {
        ok: false,
        error: "STORE_LIMIT_REACHED",
        message: "You've reached the maximum stores for your plan. Please upgrade to add more stores.",
        upgradeRequired: true,
      };
    }

    if (currentStoreCount >= totalStoresAllowed) {
      return {
        ok: false,
        error: "EXTRA_STORE_PAYMENT_REQUIRED",
        message: `Adding an extra store requires ₹${limits.extraStorePrice}/month. Please complete payment to add this store.`,
        extraStorePrice: limits.extraStorePrice,
        paymentRequired: true,
      };
    }

    isExtraStore = currentStoreCount >= maxStores;
  }

  try {
    // 1. Check Branch Code Uniqueness within Tenant
    const existingBranch = await adminDb.collection("stores").where("tenantId", "==", effectiveTenantId).where("branchCode", "==", branchCode).get();
    if (!existingBranch.empty) {
      return { ok: false, error: `Branch Code ${branchCode} already exists in your company.` };
    }

    const batch = adminDb.batch();
    const storeRef = adminDb.collection("stores").doc();

    // 2. Optional Manager Creation
    if (hasManager) {
      if (managerEmail === session.user?.email) {
        return { ok: false, error: "You cannot assign yourself as a manager. As Tenant Admin, you already have access." };
      }
      const existingManager = await adminDb.collection("staff").where("email", "==", managerEmail).where("isDeleted", "==", false).get();
      if (!existingManager.empty) {
        return { ok: false, error: "This email is already assigned to an active operational account." };
      }

      const staffRef = adminDb.collection("staff").doc();
      batch.set(staffRef, {
        docId: staffRef.id,
        empId: data.managerEmpId?.trim() ?? "",
        email: managerEmail,
        name: data.managerName?.trim() ?? "",
        phone: data.managerPhone?.trim() ?? "",
        role: "MANAGER",
        tenantId: effectiveTenantId,
        storeId: storeRef.id,
        branchCode,
        isActive: true,
        isDeleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(storeRef, {
      storeId: storeRef.id,
      tenantId: effectiveTenantId,
      storeName: data.storeName.trim(),
      branchCode,
      gstin: data.gstin?.trim() ?? "",
      gstNumber: data.gstin?.trim() ?? "",
      managerEmail: hasManager ? managerEmail : null,
      managerEmpId: data.managerEmpId?.trim() ?? null,
      managerName: data.managerName?.trim() ?? null,
      managerPhone: data.managerPhone?.trim() ?? null,
      contactNumbers: [data.storePhone?.trim() || data.managerPhone?.trim() || ""].filter(Boolean),
      location: {
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        pincode: data.pincode ?? "",
      },
      geoLatitude: data.geoLatitude ?? null,
      geoLongitude: data.geoLongitude ?? null,
      geoRadiusMeters: data.geoRadiusMeters ?? 100,
      licenses: data.licenses ?? [],
      bankAccounts: data.bankAccounts ?? [],
      bankDetailsPending: !data.bankAccounts?.length,
      status: "ACTIVE",
      isActive: true,
      isDeleted: false,
      isExtraStore,
      storeIndex: currentStoreCount,
      isExtraPaid: isExtraStore,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    await adminDb.collection("audit_logs").add({
      tenantId: effectiveTenantId,
      timestamp: FieldValue.serverTimestamp(),
      actorId: session.user?.email,
      actorEmail: session.user?.email,
      actionType: "STORE_CREATED",
      targetCollection: "stores",
      targetId: storeRef.id,
      details: `Created store ${data.storeName} (${branchCode}) with manager ${data.managerName}.`,
      severity: "INFO",
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Store creation failed" };
  }

  revalidatePath("/tenant-admin");
  revalidatePath("/usage");
  return { ok: true };
}

export async function toggleStoreSuspension(storeId: string, currentStatus: string) {
  await requireRole(["super_admin", "tenant_admin"]);
  const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  await adminDb.collection("stores").doc(storeId).update({ status: newStatus, isActive: newStatus === "ACTIVE" });
  revalidatePath("/tenant-admin");
  revalidatePath("/usage");
}

export async function removeStore(storeId: string) {
  await requireRole(["super_admin", "tenant_admin"]);
  await adminDb.collection("stores").doc(storeId).delete();
  revalidatePath("/tenant-admin");
  revalidatePath("/usage");
}

export async function getStoreForEdit(storeId: string) {
  await requireRole(["super_admin", "tenant_admin", "manager"]);
  let doc = await adminDb.collection("stores").doc(storeId).get();
  if (!doc.exists) {
    const qSnap = await adminDb.collection("stores").where("branchCode", "==", storeId).limit(1).get();
    if (!qSnap.empty) {
      doc = qSnap.docs[0];
    }
  }
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    storeId: doc.id,
    storeName: data.storeName || data.name || "",
    gstin: data.gstin || data.gstNumber || "",
    address: data.location?.address || "",
    city: data.location?.city || "",
    state: data.location?.state || "",
    pincode: data.location?.pincode || "",
    geoLatitude: data.geoLatitude ?? data.location?.geoLatitude ?? null,
    geoLongitude: data.geoLongitude ?? data.location?.geoLongitude ?? null,
    geoRadiusMeters: data.geoRadiusMeters ?? data.location?.geoRadiusMeters ?? 100,
    licenses: data.licenses || [],
    bankAccounts: data.bankAccounts || [],
    managerEmpId: data.managerEmpId || "",
    managerName: data.managerName || "",
    managerPhone: data.managerPhone || "",
    managerEmail: data.managerEmail || "",
  };
}

export async function updateStoreProfile(params: { 
  storeId: string;
  storeName: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoRadiusMeters?: number | null;
  licenses: any[];
  bankAccounts: any[];
  managerEmpId?: string;
  managerName?: string;
  managerPhone?: string;
  managerEmail?: string;
}) {
  try {
    await requireRole(["super_admin", "tenant_admin", "manager"]);
    let docRef = adminDb.collection("stores").doc(params.storeId);
    const snap = await docRef.get();
    if (!snap.exists) {
      const qSnap = await adminDb.collection("stores").where("branchCode", "==", params.storeId).limit(1).get();
      if (!qSnap.empty) {
        docRef = qSnap.docs[0].ref;
      }
    }

    const updatePayload: Record<string, any> = {
      storeName: params.storeName.trim(),
      gstin: params.gstin.trim(),
      gstNumber: params.gstin.trim(),
      "location.address": params.address.trim(),
      "location.city": params.city.trim(),
      "location.state": params.state.trim(),
      "location.pincode": params.pincode.trim(),
      licenses: params.licenses,
      bankAccounts: params.bankAccounts,
      bankDetailsPending: !params.bankAccounts?.length,
    };

    if (params.geoLatitude !== undefined) {
      updatePayload.geoLatitude = params.geoLatitude;
    }
    if (params.geoLongitude !== undefined) {
      updatePayload.geoLongitude = params.geoLongitude;
    }
    if (params.geoRadiusMeters !== undefined) {
      updatePayload.geoRadiusMeters = params.geoRadiusMeters;
    }

    if (params.managerEmpId !== undefined) {
      updatePayload.managerEmpId = params.managerEmpId ? params.managerEmpId.trim() : null;
    }
    if (params.managerName !== undefined) {
      updatePayload.managerName = params.managerName ? params.managerName.trim() : null;
    }
    if (params.managerPhone !== undefined) {
      updatePayload.managerPhone = params.managerPhone ? params.managerPhone.trim() : null;
    }
    if (params.managerEmail !== undefined) {
      updatePayload.managerEmail = params.managerEmail ? params.managerEmail.trim().toLowerCase() : null;
    }

    await docRef.update(updatePayload);
    revalidatePath("/tenant-admin");
    revalidatePath("/dashboard");
    revalidatePath("/usage");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Failed to update profile" };
  }
}

export async function updateStoreMilestoneTargetAction(params: {
  storeIdOrBranchCode: string;
  monthlyTargetRevenue: number;
  monthlyManagerBonus: number;
  milestoneNotes?: string;
}): Promise<{ ok: boolean; success: boolean; message?: string; error?: string }> {
  try {
    const { session, role, tenantId } = await requireRole(["super_admin", "tenant_admin"]);

    let docRef = adminDb.collection("stores").doc(params.storeIdOrBranchCode);
    let snap = await docRef.get();
    if (!snap.exists) {
      const qSnap = await adminDb
        .collection("stores")
        .where("branchCode", "==", params.storeIdOrBranchCode)
        .limit(1)
        .get();
      if (!qSnap.empty) {
        docRef = qSnap.docs[0].ref;
        snap = qSnap.docs[0];
      } else {
        return { ok: false, success: false, error: "Store not found" };
      }
    }

    const storeData = snap.data() || {};
    if (role !== "super_admin" && tenantId && storeData.tenantId) {
      if (tenantId !== storeData.tenantId) {
        return { ok: false, success: false, error: "Unauthorized tenant scope." };
      }
    }

    const targetRevenue = Math.max(0, Number(params.monthlyTargetRevenue) || 0);
    const bonusAmount = Math.max(0, Number(params.monthlyManagerBonus) || 0);
    const notes = params.milestoneNotes?.trim() || "";

    await docRef.update({
      monthlyTargetRevenue: targetRevenue,
      monthlyManagerBonus: bonusAmount,
      milestoneNotes: notes,
      milestoneUpdatedAt: FieldValue.serverTimestamp(),
      milestoneUpdatedBy: session.user?.email || "Tenant Admin",
    });

    const actorEmail = session.user?.email || "Admin";
    await adminDb.collection("admin_audit_logs").add({
      action: "STORE_MANAGER_MILESTONE_UPDATED",
      actionType: "STORE_MANAGER_MILESTONE_UPDATED",
      actor: actorEmail,
      actorId: actorEmail,
      tenantId: storeData.tenantId || tenantId || null,
      target: `stores/${docRef.id}`,
      details: `Updated monthly milestone for branch ${storeData.branchCode || params.storeIdOrBranchCode} (${storeData.storeName || "Store"}): Target Revenue = ₹${targetRevenue.toLocaleString("en-IN")}, Milestone Bonus = ₹${bonusAmount.toLocaleString("en-IN")}.`,
      severity: "INFO",
      timestamp: FieldValue.serverTimestamp(),
    });

    revalidatePath("/tenant-admin");
    revalidatePath("/manager");
    revalidatePath("/employee");

    return {
      ok: true,
      success: true,
      message: `Store manager milestone target updated: Target ₹${targetRevenue.toLocaleString("en-IN")} • Bonus ₹${bonusAmount.toLocaleString("en-IN")}`,
    };
  } catch (err: any) {
    console.error("Error updating store milestone target:", err);
    return { ok: false, success: false, error: err?.message || "Failed to update milestone target." };
  }
}