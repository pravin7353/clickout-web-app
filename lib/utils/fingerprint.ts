/**
 * Lightweight, zero-dependency browser and device fingerprint generator.
 * Produces a deterministic SHA-256 / hex hash based on stable hardware & environment attributes.
 */

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex;
}

export async function getClientDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") {
    return "server_env";
  }

  try {
    const components: string[] = [];

    // 1. User Agent & Platform
    components.push(navigator.userAgent || "ua_unknown");
    components.push(navigator.platform || "plat_unknown");
    components.push(navigator.language || "lang_unknown");

    // 2. Screen & Color Depth
    if (window.screen) {
      components.push(`${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`);
      components.push(`${window.devicePixelRatio || 1}`);
    }

    // 3. TimeZone & Locale
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      components.push(tz || "tz_unknown");
    } catch {
      components.push("tz_err");
    }

    // 4. Hardware concurrency & device memory (if supported)
    if (navigator.hardwareConcurrency) {
      components.push(`cores_${navigator.hardwareConcurrency}`);
    }

    // 5. Canvas Fingerprint
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("ClickOutPlatform_Trust_v1", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("ClickOutPlatform_Trust_v1", 4, 17);
        components.push(canvas.toDataURL());
      }
    } catch {
      components.push("canvas_disabled");
    }

    const rawSignature = components.join("|||");

    // Generate web crypto SHA-256 hash if available, fallback to fast 32-bit hash
    if (window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(rawSignature);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return `dfp_${hashHex.slice(0, 32)}`;
    }

    return `dfp_${hashString(rawSignature)}_${hashString(rawSignature.split("").reverse().join(""))}`;
  } catch {
    return `dfp_fallback_${Math.random().toString(36).slice(2, 10)}`;
  }
}
