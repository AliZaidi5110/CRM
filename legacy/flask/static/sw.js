// CallPro CRM Offline Service Worker
const CACHE_NAME = "callpro-crm-v38";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/main.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/dashboard.css",
  "/css/friendly.css",
  "/js/api.js",
  "/js/db.js",
  "/js/sync.js",
  "/js/auth.js",
  "/js/components/toast.js",
  "/js/components/modal.js",
  "/js/components/navbar.js",
  "/js/components/sidebar.js",
  "/js/views/dashboard.js",
  "/js/views/leads.js",
  "/js/views/customer_profile.js",
  "/js/views/callbacks.js",
  "/js/views/lead_transfer.js",
  "/js/views/reports.js",
  "/js/views/teams.js",
  "/js/views/users.js",
  "/js/views/audit.js",
  "/js/views/import_export.js",
  "/js/views/contracts.js",
  "/js/views/finance.js",
  "/js/views/employee_finance.js",
  "/js/app.js",
  "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Pass API requests through to network / SyncEngine
  if (e.request.url.includes("/api/")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for navigation requests
        if (e.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});
