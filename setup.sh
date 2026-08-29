#!/bin/bash
set -e

echo "1/6 Next.js project bana raha hu..."
npx create-next-app@latest clickout-admin-web --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --yes
cd clickout-admin-web

echo "2/6 Zaruri packages install kar raha hu..."
npm install next-auth@beta firebase-admin firebase bcryptjs

echo "3/6 shadcn/ui set kar raha hu..."
npx shadcn@latest init -d
npx shadcn@latest add button table dialog form input -y

echo "4/6 Folders bana raha hu..."
mkdir -p lib actions app/api/auth/\[...nextauth\]

echo "5/6 Code files likh raha hu..."

cat > lib/firebase-admin.ts << 'EOF'
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

export const adminDb = getFirestore(app);
EOF

cat > lib/auth.ts << 'EOF'
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { adminDb } from "./firebase-admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const snap = await adminDb
          .collection("admin_users")
          .where("email", "==", credentials?.email)
          .limit(1)
          .get();

        if (snap.empty) return null;
        const user = snap.docs[0].data();
        const valid = await bcrypt.compare(
          credentials!.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        return { id: snap.docs[0].id, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = (user as any).role;
      return token;
    },
    async session({ session, token }) {
      (session.user as any).role = token.role;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
EOF

cat > lib/rbac.ts << 'EOF'
import { auth } from "./auth";

type Role = "admin" | "exporter" | "compliance";

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");

  const role = (session.user as any).role as Role;
  if (!allowed.includes(role)) throw new Error("FORBIDDEN");

  return { session, role };
}
EOF

cat > lib/firebase-client.ts << 'EOF'
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

export const clientDb = getFirestore(app);
EOF

cat > "app/api/auth/[...nextauth]/route.ts" << 'EOF'
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
EOF

cat > actions/orders.ts << 'EOF'
"use server";

import { adminDb } from "@/lib/firebase-admin";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function flagOrderAsFraud(orderId: string, reason: string) {
  const { session } = await requireRole(["admin", "compliance"]);

  await adminDb.collection("orders").doc(orderId).update({
    fraudFlagged: true,
    fraudReason: reason,
    flaggedBy: session.user?.email,
    flaggedAt: new Date().toISOString(),
  });

  revalidatePath("/dashboard/compliance");
}
EOF

cat > .env.local.example << 'EOF'
# Firebase console > Project settings > Service accounts > Generate new private key
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Firebase console > Project settings > General > Your apps > Web app config
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# random string, terminal me chalao: openssl rand -base64 32
AUTH_SECRET=
EOF

cp .env.local.example .env.local

echo "6/6 Firestore rules copy kar raha hu..."
echo "-- IMPORTANT: firestore.rules is-file ko manually iss folder me daal do jo maine pehle share ki thi --"

echo ""
echo "DONE! Ab ye karo:"
echo "1. .env.local file khol ke apni Firebase details bharo"
echo "2. cd clickout-admin-web && npm run dev"
echo "3. browser me http://localhost:3000 kholo"
