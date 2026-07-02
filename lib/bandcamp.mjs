// bandcamp.mjs — Bandcamp (inoffizielle, öffentliche Endpoints — wie RA: Nutzung
// auf eigenes Risiko / ToS, nur lesend, stark gedrosselt + gecacht).
// Warum: Bandcamp ist DIE Heimat kleiner Acts — Ortsangabe und frische Releases
// pro Genre gibt es dort, bevor Last.fm den Act überhaupt kennt.

import { cached } from "./cache.mjs";

const HEADERS = {
  "user-agent": "Mozilla/5.0 (LikeBookingTool; personal, non-commercial)",
  accept: "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve();
async function throttled(fn) {
  const job = gate.then(async () => { const r = await fn(); await sleep(400); return r; });
  gate = job.then(() => {}, () => {});
  return job;
}

const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Act auf Bandcamp suchen (öffentliche Suchbox-API) -> Ort, URL, Genre.
// Nur bei sicherem Namens-Treffer. 14 Tage gecacht.
export async function searchBand(name) {
  return cached("bc-band", name, 14 * 864e5, async () => {
    return throttled(async () => {
      const res = await fetch("https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic", {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: JSON.stringify({ search_text: name, search_filter: "b", fan_id: null, full_page: false }),
      });
      if (!res.ok) throw new Error("Bandcamp HTTP " + res.status);
      const j = await res.json();
      const items = j.auto?.results || j.results || [];
      const hit = items.find((x) => (x.type === "b" || x.item_type === "b" || !x.type) && norm(x.name) === norm(name));
      if (!hit) return null;
      return {
        name: hit.name,
        location: hit.location || null,
        url: hit.item_url_root || hit.url || null,
        genre: hit.genre_name || null,
      };
    });
  });
}

// Frische Releases zu einem Genre-Tag ("new arrivals"). 1 Tag gecacht.
// Primär der Discover-JSON-Endpoint; wenn Bandcamp das Format ändert, geben wir
// still [] zurück (Radar funktioniert dann ohne Bandcamp-Kandidaten weiter).
export async function discoverTag(tag, { limit = 10 } = {}) {
  const t = String(tag).toLowerCase().trim().replace(/\s+/g, "-");
  return cached("bc-discover", t, 1 * 864e5, async () => {
    return throttled(async () => {
      const res = await fetch(`https://bandcamp.com/api/discover/3/get_web?g=${encodeURIComponent(t)}&s=new&p=0&gn=0&f=all&w=0`, { headers: HEADERS });
      if (!res.ok) throw new Error("Bandcamp HTTP " + res.status);
      const j = await res.json();
      const items = j.items || [];
      return items.slice(0, limit).map((x) => ({
        artist: x.secondary_text || x.artist || null,   // Artist-Name
        title: x.primary_text || x.title || null,       // Release-Titel
        url: x.tralbum_url || (x.url_hints ? `https://${x.url_hints.subdomain}.bandcamp.com/${x.url_hints.item_type === "a" ? "album" : "track"}/${x.url_hints.slug}` : null),
        genre: t,
      })).filter((x) => x.artist);
    });
  }).catch(() => []);
}
