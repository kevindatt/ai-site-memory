/* AI Site Memory service worker — app-shell only.
 *
 * Caching policy (privacy-first):
 * - Versioned app-shell assets (/, index, manifest, icons, hashed bundles)
 *   are cached so the installed PWA opens offline.
 * - Navigations use network-first with an offline fallback to cached /.
 * - NEVER cached: document contents, picked local files, tokens, audit
 *   data. None of those travel over HTTP anyway (picked files stay in
 *   memory; audit/tokens stay in browser storage), and this worker adds no
 *   runtime cache that could retain them.
 * Bump CACHE_VERSION whenever the shell changes; old caches self-delete.
 */

const CACHE_VERSION = "asm-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (APP_SHELL.includes(url.pathname)) return true;
  // Vite hashed bundles and styles only — never document content.
  return url.pathname.startsWith("/assets/") && /\.(js|css|png|svg|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }
  if (!isShellAsset(url)) return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});
