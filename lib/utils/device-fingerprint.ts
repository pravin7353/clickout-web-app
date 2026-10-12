/**
 * Device Fingerprint Generator for ClickOut Employee PWA Anti-Mock & Anti-Spoof Protection.
 * Gathers hardware & browser characteristics and digests them into a unique device identifier.
 */

export async function generateDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";

  const nav = typeof navigator !== "undefined" ? navigator : ({} as any);
  const scr = typeof window.screen !== "undefined" ? window.screen : ({} as any);

  const components = [
    nav.userAgent || "unknown_ua",
    scr.width || 0,
    scr.height || 0,
    scr.colorDepth || 24,
    (nav as any).hardwareConcurrency || "unknown_cpu",
    (nav as any).deviceMemory || "unknown_mem",
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "unknown_tz",
    (nav as any).platform || "unknown_plat",
  ].join("###");

  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
      const encoder = new TextEncoder();
      const data = encoder.encode(components);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fallback if crypto.subtle is restricted in non-HTTPS local dev
  }

  // FNV-1a 32-bit hash fallback
  let hash = 2166136261;
  for (let i = 0; i < components.length; i++) {
    hash ^= components.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}
