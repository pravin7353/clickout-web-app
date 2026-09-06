"use server";

import { adminDb, adminAuth } from "@/lib/firebase-admin";

const ALLOWED_ROLES = ["super_admin", "tenant_admin", "manager", "auditor"];

export async function sendMagicLink(email: string, origin: string) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { ok: false, error: "Email is required." };

  const snap = await adminDb.collection("staff").where("email", "==", cleanEmail).get();

  if (!snap.empty) {
    const activeDoc = snap.docs.find((d) => d.data().isActive !== false && d.data().isDeleted !== true);
    if (!activeDoc) {
      return { ok: false, error: "Account Suspended: Please contact support." };
    }
    const data = activeDoc.data();
    const role = (data.role ?? "").toString().toLowerCase();
    if (!ALLOWED_ROLES.includes(role)) {
      return { ok: false, error: "Access Denied: You do not have Command Center privileges." };
    }
    try {
      const userRecord = await adminAuth.getUserByEmail(cleanEmail);
      await adminAuth.setCustomUserClaims(userRecord.uid, {
        role, tenantId: data.tenantId ?? null, branchCode: data.branchCode ?? "",
      });
    } catch {
      // Auth record doesn't exist yet — fine, gets created on first sign-in
    }
  }
  // snap empty = brand new email = self-signup allowed (matches lib/auth.ts)

  try {
    const link = await adminAuth.generateSignInWithEmailLink(cleanEmail, {
      url: `${origin}/login`,
      handleCodeInApp: true,
    });

    await adminDb.collection("mail").add({
      to: cleanEmail,
      message: {
        subject: "Your ClickOut Command Center Login Link",
        html: `<p>Click below to securely sign in:</p><p><a href="${link}">Sign in to ClickOut</a></p><p>This link expires in 1 hour and works once.</p>`,
      },
    });
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Failed to send link." };
  }

  return { ok: true };
}