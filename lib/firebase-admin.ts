import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getServiceAccount() {
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf-8");
  return JSON.parse(json);
}

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(getServiceAccount()) });

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);