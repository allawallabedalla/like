// bench-explore.mjs — Latenz-Benchmark für den ＋-Ausbau (Taskforce "Runde 13").
// Läuft komplett OHNE Netz: fetch wird mit festen Modell-RTTs gemockt
// (Last.fm 250 ms, RA-Search 600 ms, RA-Coappear 1100 ms — Annahmen der Taskforce).
// Szenarien: kalt / warm / "Hover-Prefetch + Klick nach 500 ms". Ausgabe: ms + Fetch-Zählung.
//   LIKE_DATA_DIR=<tmp> LASTFM_API_KEY=dummy node scripts/bench-explore.mjs
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DATA = process.env.LIKE_DATA_DIR;
if (!DATA) { console.error("Bitte LIKE_DATA_DIR auf ein Wegwerf-Verzeichnis setzen."); process.exit(1); }
process.env.LASTFM_API_KEY ||= "dummy";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fetches = 0;
const j = (obj) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => obj, text: async () => JSON.stringify(obj) });

globalThis.fetch = async (url, opts = {}) => {
  fetches++;
  const u = String(url);
  if (u.includes("audioscrobbler")) {
    await sleep(250);
    if (u.includes("getsimilar")) return j({ similarartists: { "@attr": { artist: "Bonobo" }, artist: Array.from({ length: 25 }, (_, i) => ({ name: "Sim " + i, match: String(0.9 - i * 0.02), url: null, mbid: "" })) } });
    if (u.includes("gettoptags")) return j({ toptags: { tag: [{ name: "downtempo", count: 100 }, { name: "electronic", count: 80 }] } });
    if (u.includes("getinfo")) return j({ artist: { name: "Bonobo", stats: { listeners: "890000" } } });
    return j({});
  }
  if (u.includes("ra.co")) {
    const body = String(opts.body || "");
    if (body.includes("search(")) { await sleep(600); return j({ data: { search: [{ id: "1", value: "Bonobo", searchType: "ARTIST" }] } }); }
    await sleep(1100);
    return j({ data: { artist: { name: "Bonobo", contentUrl: "/dj/bonobo", bookingDetails: "", website: null, soundcloud: null, instagram: null, facebook: null, upcomingEventsCount: 2, area: { name: "London" }, country: { name: "UK" }, events: Array.from({ length: 10 }, (_, i) => ({ title: "Ev" + i, date: "2025-01-0" + (i % 9 + 1), artists: [{ name: "Bonobo" }, { name: "Co " + i }], genres: [{ name: "Electronic" }], venue: { name: "V" }, area: { name: "C" } })), upcoming: [] } } });
  }
  // Bandcamp/sonstiges: sofort leer
  return j({});
};

const pack = (await import("../packs/music/pack.mjs")).default;
const CACHE = join(DATA, "cache");
const wipe = async () => { await rm(CACHE, { recursive: true, force: true }); await mkdir(CACHE, { recursive: true }); };
const ms = async (fn) => { const t = performance.now(); await fn(); return Math.round(performance.now() - t); };

// 1) kalt
await wipe(); fetches = 0;
const cold = await ms(() => pack.explore("Bonobo"));
const coldFetches = fetches;

// 2) warm (direkt nochmal)
fetches = 0;
const warm = await ms(() => pack.explore("Bonobo"));
const warmFetches = fetches;

// 3) Hover-Prefetch, Klick 500 ms später (der realistische Fall aus dem Kundenfeedback)
await wipe(); fetches = 0;
const prefetch = pack.explore("Bonobo").catch(() => {}); // Hover feuert, wird nicht awaited
await sleep(500);
const hoverClick = await ms(() => pack.explore("Bonobo"));
await prefetch;
const hoverFetches = fetches;

// 4) R14: zweiphasiger Ausbau — Phase 1 = gefühlte Latenz, Phase 2 = Nachladen der RA-Kanten
await wipe(); fetches = 0;
const p1 = await ms(() => pack.exploreFast("Bonobo"));
const p2 = await ms(() => pack.exploreTogether("Bonobo"));
const stagedFetches = fetches;

console.log(JSON.stringify({
  kalt_ms: cold, kalt_fetches: coldFetches,
  warm_ms: warm, warm_fetches: warmFetches,
  hoverKlick_ms: hoverClick, hoverKlick_fetches_gesamt: hoverFetches,
  staged_phase1_ms: p1, staged_phase2_ms: p2, staged_fetches: stagedFetches,
}, null, 2));
