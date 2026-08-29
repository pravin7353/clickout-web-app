import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { adminDb, adminAuth } from "./firebase-admin";

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

        const snap = await adminDb
          .collection("staff")
          .where("email", "==", decoded.email)
          .where("isActive", "==", true)
          .limit(1)
          .get();

        if (snap.empty) return null;
        const staff = snap.docs[0].data();
        const role = (staff.role ?? "").toString().toLowerCase();

        if (!ALLOWED_WEB_ROLES.includes(role)) return null;

        return {
          id: snap.docs[0].id,
          email: staff.email,
          role,
          tenantId: staff.tenantId ?? null,
          storeId: staff.branchCode ?? null,
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
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).role = token.role;
      (session.user as any).tenantId = token.tenantId;
      (session.user as any).storeId = token.storeId;
      return session;
    },
  },
  pages: { signIn: "/login" },
});