import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { adminDb, adminAuth } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { handleLoginFingerprint, checkDeviceLock } from "@/lib/services/trust-service";

const ALLOWED_WEB_ROLES = ["super_admin", "tenant_admin", "manager", "auditor"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { idToken: {}, fingerprint: {}, ipAddress: {}, deviceId: {}, deviceLabel: {} },
      async authorize(credentials) {
        const idToken = credentials?.idToken as string;
        const deviceFingerprint = (credentials?.fingerprint as string) || ((credentials as any)?.deviceFingerprint as string) || "";
        const ipAddress = (credentials?.ipAddress as string) || "";
        const submittedDeviceId = (credentials?.deviceId as string) || "";
        const submittedDeviceLabel = (credentials?.deviceLabel as string) || "";
        if (!idToken) return null;

        let decoded: any;
        try {
          decoded = await adminAuth.verifyIdToken(idToken, true);
        } catch {
          return null;
        }

        const uid = decoded.uid;
        const staffIdClaim = (decoded as any).staffId;
        const phoneNumber = decoded.phone_number;

        // Staff Phone / OTP login path
        if (staffIdClaim || (!decoded.email && phoneNumber)) {
          let staffDoc: FirebaseFirestore.DocumentSnapshot | null = null;
          if (staffIdClaim) {
            staffDoc = await adminDb.collection("staff").doc(staffIdClaim).get();
          }
          if (!staffDoc || !staffDoc.exists) {
            const q = await adminDb.collection("staff").where("authUid", "==", uid).where("isActive", "==", true).limit(1).get();
            if (!q.empty) staffDoc = q.docs[0];
          }

          if (!staffDoc || !staffDoc.exists) {
            return null;
          }

          const sData = staffDoc.data()!;

          // Must satisfy staffDoc.authUid === decoded.uid
          if (sData.authUid !== uid || sData.isActive === false || sData.isDeleted === true) {
            return null;
          }

          // 🛡️ Soft Device Binding check in authorize
          if (sData.boundDeviceId && submittedDeviceId && sData.boundDeviceId !== submittedDeviceId) {
            return null;
          }

          const sRole = (sData.role ?? (decoded as any).role ?? "").toString().toLowerCase();
          const effectiveTenantId = sData.tenantId ?? (decoded as any).tenantId ?? null;

          return {
            id: staffDoc.id,
            staffId: staffDoc.id,
            authUid: uid,
            email: sData.email || `${phoneNumber || staffDoc.id}@staff.clickout.internal`,
            name: sData.name ?? sData.phone ?? "Staff",
            role: sRole,
            tenantId: effectiveTenantId,
            storeId: sData.branchCode ?? (decoded as any).branchCode ?? null,
            canEdit: sRole === "manager" || sRole === "tenant_admin",
            accessibleTenants: [],
            fingerprint: deviceFingerprint || null,
            deviceId: sData.boundDeviceId || submittedDeviceId || null,
            deviceLabel: sData.boundDeviceLabel || submittedDeviceLabel || null,
            authMethod: "otp",
          };
        }

        const email = decoded.email!;

        let staffSnap = await adminDb.collection("staff").where("email", "==", email).where("isActive", "==", true).get();
        let staffRef: FirebaseFirestore.DocumentReference;
        let data: FirebaseFirestore.DocumentData;
        const accessibleTenants: { tenantId: string; companyName: string; branchCode: string }[] = [];

        if (staffSnap.empty) {
          // check recovery-email match on an existing tenant (both flat and nested contact.recoveryEmail)
          const recoveryRoot = await adminDb.collection("tenants").where("recoveryEmail", "==", email).limit(1).get();
          const recoveryNested = await adminDb.collection("tenants").where("contact.recoveryEmail", "==", email).limit(1).get();
          const existingTenant = !recoveryRoot.empty ? recoveryRoot.docs[0] : !recoveryNested.empty ? recoveryNested.docs[0] : null;

          staffRef = adminDb.collection("staff").doc(uid);

          if (existingTenant) {
            data = {
              uid, email, role: "TENANT_ADMIN", tenantId: existingTenant.id,
              name: email.split("@")[0], isActive: true, isDeleted: false,
              createdAt: FieldValue.serverTimestamp(),
            };
            await staffRef.set(data);
          } else {
            // self-signup: brand new tenant, this user becomes TENANT_ADMIN
            const rawName = email.split("@")[0].toUpperCase();
            const prefix = rawName.length >= 3 ? rawName.substring(0, 3) : rawName;
            const newTenantId = `${prefix}_${Date.now()}`;

            const batch = adminDb.batch();
            batch.set(adminDb.collection("tenants").doc(newTenantId), {
              tenantId: newTenantId,
              companyName: `${email.split("@")[0].toUpperCase()} ENTERPRISES`,
              ownerName: email.split("@")[0],
              establishedYear: new Date().getFullYear(),
              isOnboardingComplete: true,
              status: "ACTIVE",
              subscriptionPlan: "trial",
              billingStatus: "active",
              trialStartAt: FieldValue.serverTimestamp(),
              activeStores: 0,
              industries: [], goods_or_services: [], licenses: [],
              contact: { email, phone: "", recoveryEmail: "", recoveryPhone: "" },
              location: { address: "", city: "", state: "", pincode: "" },
              bankDetails: { accountName: "", accountNo: "", ifsc: "", upi: "", bankName: "", isCustom: false },
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            data = {
              uid, email, role: "TENANT_ADMIN", tenantId: newTenantId,
              name: email.split("@")[0], isActive: true, isDeleted: false,
              createdAt: FieldValue.serverTimestamp(),
            };
            batch.set(staffRef, data);
            await batch.commit();
          }
        } else {
          // Universal Auditor: Can have multiple staff records across different tenant companies
          const auditorDocs = staffSnap.docs.filter(
            (d) => (d.data().role ?? "").toString().toUpperCase() === "AUDITOR" && d.data().isDeleted !== true
          );

          if (auditorDocs.length > 0) {
            staffRef = auditorDocs[0].ref;
            data = auditorDocs[0].data();

            for (const doc of auditorDocs) {
              const tId = doc.data().tenantId;
              const bCode = doc.data().branchCode || "HQ";
              if (tId && !accessibleTenants.some((t) => t.tenantId === tId)) {
                try {
                  const tDoc = await adminDb.collection("tenants").doc(tId).get();
                  const companyName = tDoc.exists ? (tDoc.data()?.companyName || tId) : tId;
                  accessibleTenants.push({
                    tenantId: tId,
                    companyName,
                    branchCode: bCode,
                  });
                } catch {
                  accessibleTenants.push({ tenantId: tId, companyName: tId, branchCode: bCode });
                }
              }
            }
          } else {
            staffRef = staffSnap.docs[0].ref;
            data = staffSnap.docs[0].data();
          }
        }

        const role = (data.role ?? "").toString().toLowerCase();
        if (!ALLOWED_WEB_ROLES.includes(role)) return null; // cashier/guard: no admin portal access

        const effectiveTenantId = accessibleTenants[0]?.tenantId ?? data.tenantId ?? null;

        // 🛡️ 30-Day Terminal Lock Check across tenants
        if (deviceFingerprint && effectiveTenantId) {
          const lockResult = await checkDeviceLock(deviceFingerprint, effectiveTenantId);
          if (lockResult.isLocked) {
            // Log security event for cross-tenant quarantine
            await adminDb.collection("admin_audit_logs").add({
              tenantId: effectiveTenantId,
              timestamp: FieldValue.serverTimestamp(),
              actorId: email,
              actorEmail: email,
              action: "BLOCKED_LOCKED_DEVICE_LOGIN",
              actionType: "BLOCKED_LOCKED_DEVICE_LOGIN",
              details: lockResult.reason,
              severity: "WARNING",
              fingerprint: deviceFingerprint,
            });
            throw new Error(lockResult.reason || "Device terminal is locked for 30 days due to deactivation from another tenant.");
          }
        }

        // single-session enforcement + login audit trail
        const updateData: any = {
          activeSessionId: Date.now().toString(),
          lastLoginAt: FieldValue.serverTimestamp(),
          deviceInfo: "Web Browser",
        };
        if (!data.authUid) {
          updateData.authUid = uid;
        }
        await staffRef.update(updateData);

        // 🛡️ Handle Device Fingerprint Anomaly Warning & 7-Day IP event tracking
        await handleLoginFingerprint({
          staffRef,
          staffData: data,
          role,
          email,
          tenantId: effectiveTenantId,
          deviceFingerprint,
          ipAddress,
        });

        return {
          id: staffRef.id,
          authUid: uid,
          email: data.email,
          name: data.name ?? email.split("@")[0],
          role,
          tenantId: effectiveTenantId,
          storeId: accessibleTenants[0]?.branchCode ?? data.branchCode ?? null,
          canEdit: role === "manager" || role === "tenant_admin",
          accessibleTenants,
          fingerprint: deviceFingerprint || null,
          authMethod: "email",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.staffId = (user as any).staffId;
        token.authUid = (user as any).authUid || (user as any).uid || token.sub;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.storeId = (user as any).storeId;
        token.canEdit = (user as any).canEdit;
        token.accessibleTenants = (user as any).accessibleTenants;
        token.fingerprint = (user as any).fingerprint;
        token.deviceId = (user as any).deviceId;
        token.deviceLabel = (user as any).deviceLabel;
        token.authMethod = (user as any).authMethod;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id = token.id || token.sub;
      (session.user as any).staffId = token.staffId;
      (session.user as any).authUid = token.authUid || token.sub;
      (session.user as any).uid = token.authUid || token.sub;
      (session.user as any).role = token.role;
      (session.user as any).tenantId = token.tenantId;
      (session.user as any).storeId = token.storeId;
      (session.user as any).canEdit = token.canEdit;
      (session.user as any).accessibleTenants = token.accessibleTenants || [];
      (session.user as any).fingerprint = token.fingerprint;
      (session.user as any).deviceId = token.deviceId;
      (session.user as any).deviceLabel = token.deviceLabel;
      (session.user as any).authMethod = token.authMethod;
      return session;
    },
  },
  pages: { signIn: "/login" },
});