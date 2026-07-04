// sw.js — schlanker Service-Worker für die PWA. Ziel: App startet auch offline
// (Shell + zuletzt besuchte Karten), aber Live-Daten bleiben immer frisch.
//   • /api/*   -> NUR Netz (nie cachen — Graph/Explore/Radar sollen aktuell sein)
//   • sonst    -> Netz zuerst, bei Erfolg in den Cache; offline aus dem Cache
const CACHE = "like-shell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([
    "/", "/manifest.webmanifest",
    "/icons/icon-192.png", "/icons/icon-512.png",
  ]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Fremd-Hosts (APIs/CDNs) ignorieren
  if (url.pathname.startsWith("/api/")) return;         // Live-Daten: nie cachen

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});
