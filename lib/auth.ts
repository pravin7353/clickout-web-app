import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { adminDb, adminAuth } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const ALLOWED_WEB_ROLES = ["super_admin", "tenant_admin", "manager"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { idToken: {} },
      async authorize(credentials) {
        const idToken = credentials?.idToken as string;
        if (!idToken) return null;

        let decoded;
        try {
          decoded = await adminAuth.verifyIdToken(idToken);
        } catch {
          return null;
        }
        const email = decoded.email!;
        const uid = decoded.uid;

        let staffSnap = await adminDb.collection("staff").where("email", "==", email).where("isActive", "==", true).limit(1).get();
        let staffRef: FirebaseFirestore.DocumentReference;
        let data: FirebaseFirestore.DocumentData;

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
              isOnboardingComplete: false,
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
          staffRef = staffSnap.docs[0].ref;
          data = staffSnap.docs[0].data();
        }

        const role = (data.role ?? "").toString().toLowerCase();
        if (!ALLOWED_WEB_ROLES.includes(role)) return null; // cashier/guard: no admin portal access

        // single-session enforcement + login audit trail
        await staffRef.update({
          activeSessionId: Date.now().toString(),
          lastLoginAt: FieldValue.serverTimestamp(),
          deviceInfo: "Web Browser",
        });

        return {
          id: staffRef.id,
          email: data.email,
          name: data.name ?? email.split("@")[0],
          role,
          tenantId: data.tenantId ?? null,
          storeId: data.branchCode ?? null,
          canEdit: role === "manager" || role === "super_admin",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.storeId = (user as any).storeId;
        token.canEdit = (user as any).canEdit;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).role = token.role;
      (session.user as any).tenantId = token.tenantId;
      (session.user as any).storeId = token.storeId;
      (session.user as any).canEdit = token.canEdit;
      return session;
    },
  },
  pages: { signIn: "/login" },
});