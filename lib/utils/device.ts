/**
 * 🛡️ Browser Device Binding & Identifier Utilities
 * 
 * Note: Browser device binding is a SOFT control (not hardware-level).
 * Storage (localStorage/IndexedDB) can be cleared by users or browser privacy modes.
 * We persist the generated UUID deviceId in BOTH localStorage and IndexedDB and restore
 * from whichever survives to maximize resilience against accidental cache clears.
 */

import { getClientDeviceFingerprint } from "./fingerprint";

const DB_NAME = "clickout_device_meta_v1";
const STORE_NAME = "device_identity";
const KEY_NAME = "bound_device_id";
const LOCAL_STORAGE_KEY = "clickout_bound_device_id";

/**
 * Reads deviceId from IndexedDB
 */
function readIndexedDB(): Promise<string | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (e: any) => {
        const db = e.target.result;
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const getReq = store.get(KEY_NAME);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Writes deviceId to IndexedDB
 */
function writeIndexedDB(id: string): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (e: any) => {
        const db = e.target.result;
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.put(id, KEY_NAME);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };

      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Generates a random standard UUID v4 string
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "dev_" + "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parses user agent to create a human-friendly label for auditing (e.g. "Chrome on Android")
 */
export function getDeviceLabel(): string {
  if (typeof window === "undefined" || !navigator) return "Unknown Device";

  const ua = navigator.userAgent || "";
  let os = "Unknown OS";
  let browser = "Browser";

  // OS detection
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Windows NT 10.0/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser detection
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Opera|OPR/i.test(ua)) browser = "Opera";

  const isMobile = /Mobi|Android/i.test(ua);
  return `${browser} on ${os}${isMobile ? " (Mobile)" : ""}`;
}

/**
 * Returns or generates a persistent device UUID, resiliently synchronized across localStorage and IndexedDB.
 */
export async function getPersistentDeviceId(): Promise<string> {
  if (typeof window === "undefined") {
    return "server_env";
  }

  let localId: string | null = null;
  try {
    localId = localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    // localStorage restricted or disabled
  }

  const idbId = await readIndexedDB();

  // 1. Recover existing ID from whichever survives
  const existingId = localId || idbId;

  if (existingId) {
    // Resynchronize both stores
    if (!localId) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, existingId);
      } catch {}
    }
    if (!idbId) {
      await writeIndexedDB(existingId);
    }
    return existingId;
  }

  // 2. Generate a new UUID on first use
  const newId = generateUUID();

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, newId);
  } catch {}

  await writeIndexedDB(newId);

  return newId;
}

/**
 * Helper to retrieve full device context for employee login
 */
export async function getClientDeviceInfo(): Promise<{
  deviceId: string;
  deviceLabel: string;
  fingerprint: string;
}> {
  const [deviceId, fingerprint] = await Promise.all([
    getPersistentDeviceId(),
    getClientDeviceFingerprint(),
  ]);

  return {
    deviceId,
    deviceLabel: getDeviceLabel(),
    fingerprint,
  };
}

import { signOut } from "next-auth/react";
import { clientAuth } from "@/lib/firebase-client";

/**
 * Cleanly signs out of both Firebase client and NextAuth, then navigates to /employee/login?revoked=1
 * to ensure all session cookies and local auth tokens are flushed.
 */
export async function handleEmployeeSessionRevocation(): Promise<void> {
  try {
    await clientAuth.signOut();
  } catch {}
  try {
    await signOut({ redirect: false });
  } catch {}
  if (typeof window !== "undefined") {
    window.location.href = "/employee/login?revoked=1";
  }
}
