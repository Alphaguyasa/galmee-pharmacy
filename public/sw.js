/* Galmee Pharmacy service worker: offline shell.
 * - Static build assets: cache first (file names are content-hashed).
 * - Page navigations: network first, then the cached copy, then /offline. /verify is precached so a
 *   receipt can be checked offline (with keys saved on the phone) right after the app is installed.
 * - Supabase/API calls are never cached here; offline writes go through the Dexie queue.
 */
const VERSION = "v1";
const SHELL_CACHE = `galmee-shell-${VERSION}`;
const PAGE_CACHE = `galmee-pages-${VERSION}`;
const PRECACHE = ["/offline", "/verify", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Pages that must work offline from the first open: also cache the build files their HTML points at, otherwise the
// cached HTML shows but never becomes interactive (the first visit is not yet served through this worker).
const PRECACHE_PAGES = ["/offline", "/verify"];

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(PRECACHE);
  const assets = new Set();
  for (const page of PRECACHE_PAGES) {
    const res = await cache.match(page);
    if (!res) continue;
    const html = await res.clone().text();
    for (const m of html.matchAll(/["'(](\/_next\/static\/[^"'()\s?#]+)/g)) assets.add(m[1]);
  }
  // Best effort: a missing build file must not stop the worker from installing.
  await Promise.all([...assets].map((a) => cache.add(a).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline")) || Response.error()),
    );
  }
});
