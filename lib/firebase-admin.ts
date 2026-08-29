import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getServiceAccount() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!base64) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 missing in .env.local");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
}

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(getServiceAccount()) });

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);