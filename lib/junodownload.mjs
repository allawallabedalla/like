// junodownload.mjs — Juno (juno.co.uk / junodownload.com) über die OFFIZIELLEN RSS-Feeds
// (https://www.juno.co.uk/feeds/ — „Dance music RSS feeds"). Kein Scraping: die Feeds sind
// ausdrücklich zum Abonnieren gedacht. Muster: https://www.juno.co.uk/{genre-slug}/feeds/rss/
// Warum: Juno ist der klassische DJ-/Vinyl-Shop — frische Releases pro Genre gibt es dort
// kuratiert, inkl. sauberem „Artist:"-Feld in der Beschreibung (verifiziert am Live-Feed).
// Wie bandcamp.mjs: nur lesend, stark gedrosselt + gecacht; Netzfehler werfen aus cached()
// heraus (werden also NIE gecacht — Lehre aus der Cache-Vergiftung, PR #40).

import { cached } from "./cache.mjs";
import { blocks, decode } from "./xml.mjs";

const HEADERS = {
  "user-agent": "Mozilla/5.0 (LikeBookingTool; personal, non-commercial)",
  accept: "application/rss+xml, application/xml, text/xml",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve();
async function throttled(fn) {
  const job = gate.then(async () => { const r = await fn(); await sleep(500); return r; });
  gate = job.then(() => {}, () => {});
  return job;
}

// Last.fm-/RA-artige Genre-Tags -> Juno-Feed-Slugs. NUR live verifizierte Slugs (08/2026);
// unbekanntes Genre -> kein Feed (defensiv, statt 404s zu raten).
const GENRE_SLUGS = new Map(Object.entries({
  "house": "house",
  "deep house": "deep-house",
  "deephouse": "deep-house",
  "downtempo": "downtempo",
  "trip hop": "downtempo",
  "trip-hop": "downtempo",
  "chillout": "downtempo",
  "electro": "electro",
  "electronic": "electro",
  "electronica": "electro",
  "funk": "funk-soul-jazz",
  "soul": "funk-soul-jazz",
  "jazz": "funk-soul-jazz",
  "nu jazz": "funk-soul-jazz",
  "leftfield": "leftfield",
  "experimental": "leftfield",
  "idm": "leftfield",
  "ambient": "leftfield",
  "reggae": "reggae",
  "dub": "reggae",
  "dancehall": "reggae",
  "rock": "rock-music",
  "indie": "rock-music",
  "indie rock": "rock-music",
  "alternative": "rock-music",
}));

// Erster passender Juno-Slug zu einer Genre-Liste (oder null).
export function junoSlugFor(genres = []) {
  for (const g of genres) {
    const k = String(g || "").toLowerCase().trim();
    if (GENRE_SLUGS.has(k)) return GENRE_SLUGS.get(k);
  }
  return null;
}

// „CARIDAD VALDEZ, Mayra" -> „Mayra Caridad Valdez"; „MOUNT KIMBIE" -> „Mount Kimbie".
// Kurze Versal-Tokens (DJ, MC, LTJ …) bleiben stehen; Artikel/Partikel werden normal gesetzt.
const KEEP_LOWER = new Set(["the", "and", "of", "la", "le", "el", "de", "los", "das", "der", "die"]);
function titleCaseCaps(s) {
  return String(s).split(/\s+/).map((w) => {
    if (!/^[A-Z0-9'&.-]+$/.test(w) || !/[A-Z]/.test(w)) return w;       // schon gemischt -> lassen
    if (w.length <= 2 && !KEEP_LOWER.has(w.toLowerCase())) return w;    // DJ / MC / TV
    return w.split("-").map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join("-");
  }).join(" ");
}
// Ein Roh-Künstlerfeld („A/B/VARIOUS", „NACHNAME, Vorname") -> saubere Namensliste.
export function cleanArtists(raw) {
  const out = [];
  for (let part of String(raw || "").split("/")) {
    part = part.trim();
    if (!part || /^various( artists)?$/i.test(part)) continue;         // Sampler raus (Hub-Gefahr)
    const m = /^([^,]+),\s*(.+)$/.exec(part);                          // „Nachname, Vorname" drehen
    if (m && !/[,/]/.test(m[2])) part = `${m[2].trim()} ${m[1].trim()}`;
    out.push(titleCaseCaps(part));
  }
  return out;
}

// RSS-XML eines Genre-Feeds -> Releases [{title, url, label, artists[]}]. Rein & testbar.
// Verlässt sich NUR auf das beschriftete „Artist:"-Feld der Beschreibung (verifiziertes
// Format); fehlt es (Formatänderung), fällt der Eintrag weg statt Müll zu liefern.
export function parseJunoRss(xml) {
  const out = [];
  for (const it of blocks(String(xml || ""), "item")) {
    const inner = it._inner || "";
    const title = decode((/<title>([\s\S]*?)<\/title>/.exec(inner) || [])[1] || "").trim();
    const url = decode((/<link>([\s\S]*?)<\/link>/.exec(inner) || [])[1] || "").trim();
    const desc = (/<description>([\s\S]*?)<\/description>/.exec(inner) || [])[1] || "";
    const cdata = (/<!\[CDATA\[([\s\S]*?)\]\]>/.exec(desc) || [])[1] || desc;
    const artistRaw = decode((/Artist:\s*([^<]+)/.exec(cdata) || [])[1] || "").trim();
    const label = decode((/Label:\s*([^<]+)/.exec(cdata) || [])[1] || "").trim() || null;
    const relTitle = decode((/Title:\s*([^<]+)/.exec(cdata) || [])[1] || "").trim() || title;
    const artists = cleanArtists(artistRaw);
    if (!artists.length || !url) continue;
    out.push({ title: relTitle, url, label, artists });
  }
  return out;
}

// Frische Releases eines Juno-Genres. 1 Tag gecacht; HTTP-Fehler werfen (nie gecacht).
export async function genreReleases(slug, { limit = 12 } = {}) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return [];
  const all = await cached("juno-genre", s, 1 * 864e5, async () => {
    return throttled(async () => {
      const res = await fetch(`https://www.juno.co.uk/${encodeURIComponent(s)}/feeds/rss/`, {
        headers: HEADERS, signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) throw new Error("Juno HTTP " + res.status);
      return parseJunoRss(await res.text());
    });
  });
  return (all || []).slice(0, limit);
}
