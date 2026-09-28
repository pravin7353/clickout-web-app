/**
 * ⚡ ClickOut Employee PWA Minimal Service Worker
 * 
 * Strict Caching Policy:
 * 1. ONLY caches the static shell of /employee/login.
 * 2. MUST NEVER cache authenticated routes (/employee, /hr, /manager, etc.).
 * 3. MUST NEVER cache Server Actions (Next-Action header / POST requests).
 * 4. MUST NEVER cache attendance, geofence pings, leaves, or staff profile data.
 */

const CACHE_NAME = "clickout-employee-login-shell-v1";
const STATIC_SHELL_URLS = [
  "/employee/login",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL_URLS).catch(() => {
        // Tolerant of partial cache warmup in dev
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Never cache non-GET requests (Server Actions, mutations, Auth POSTs)
  if (req.method !== "GET") {
    return;
  }

  // 2. Never cache Server Actions or RSC data requests
  if (req.headers.get("Next-Action") || req.headers.get("RSC")) {
    return;
  }

  // 3. Never cache API routes, auth callbacks, or data queries
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) {
    return;
  }

  // 4. Never cache authenticated application portals or sensitive data
  // Only /employee/login static shell is eligible for caching
  const isEmployeeLogin = url.pathname === "/employee/login";
  const isPublicStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icon-");

  if (!isEmployeeLogin && !isPublicStaticAsset) {
    // Strictly bypass cache for all authenticated and admin pages
    return;
  }

  // 5. Network-first strategy for login shell, with offline fallback
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(req).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (isEmployeeLogin) {
            return caches.match("/employee/login");
          }
          return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
        });
      })
  );
});
