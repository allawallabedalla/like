// sw.js — schlanker Service-Worker für die PWA. Ziel: App startet auch offline
// (Shell + zuletzt besuchte Karten), aber Live-Daten bleiben immer frisch.
//   • /api/*   -> NUR Netz (nie cachen — Graph/Explore/Radar sollen aktuell sein)
//   • sonst    -> Netz zuerst MIT TIMEOUT (E11): antwortet das Netz nicht binnen 3 s,
//                 kommt die gecachte Shell — auf schlechtem Mobilfunk hängt der Start
//                 sonst am Netz, obwohl alles Nötige längst im Cache liegt. Die
//                 Netz-Antwort läuft im Hintergrund weiter und aktualisiert den Cache.
// Cache-Name versioniert (E11): alte Caches werden beim activate aufgeräumt — beim
// Deploy einer neuen Version bitte die Nummer mitziehen.
const CACHE = "like-shell-v2";
const NET_TIMEOUT_MS = 3000;

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

  // Netz-Fetch startet sofort und cached bei Erfolg — unabhängig davon, ob die Antwort
  // noch rechtzeitig fürs Rennen kommt (so ist der Cache beim nächsten Start frisch).
  const net = fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  const fromCache = () => caches.match(req).then((hit) => hit || caches.match("/"));
  const timeout = new Promise((resolve) => setTimeout(resolve, NET_TIMEOUT_MS)); // resolved undefined

  e.respondWith(
    Promise.race([net.catch(() => undefined), timeout]).then((res) =>
      // Netz gewann UND lieferte -> nehmen; sonst (Timeout/Fehler) Cache, notfalls doch aufs Netz warten
      res || fromCache().then((hit) => hit || net.catch(() => new Response("offline", { status: 503 })))
    )
  );
});
