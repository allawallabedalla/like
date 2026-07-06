#!/usr/bin/env node
// server.mjs — lokaler Zero-Dep-Server für die Map. Domänen-neutral und Multi-Pack:
// EINE App bedient alle Domänen. Das aktive Pack kommt pro Request aus ?pack=<id>
// (oder Header x-like-pack; Fallback: Default). So kann die App zur Laufzeit zwischen
// Musik, Büchern, Filmen … umschalten (ein Reload mit ?pack=), ohne Server-Neustart.
//
//   node server.mjs                  -> http://localhost:5173 (Default-Pack)
//   node server.mjs --pack=books     -> Default auf Bücher setzen (auch ENV LIKE_PACK)
//
// Endpunkte (alle Packs, jeweils mit ?pack=<id>):
//   GET  /                 „Kugeln"-Übersicht (Pack-Auswahl); mit ?pack=<id> die Karte selbst
//   GET  /api/packs        alle Packs (leichte Liste für den Umschalter)
//   GET  /api/graph        kompletter Graph des Packs
//   POST /api/explore      { name } -> Pack-Adapter, merged, gibt Graph zurück
//   POST /api/bridge       { from, to } -> verbindende Einträge (Meet-in-the-middle)

import { createServer } from "node:http";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, materialize, addEvent, emptyGraph, upsertArtist } from "./lib/store.mjs";
import { loadStats, saveStats, addSnapshot, growthPerMonth } from "./lib/stats.mjs";
import { loadPack, listPacks, resolvePackId, dataFile } from "./lib/packs.mjs";
import { clearKey } from "./lib/keys.mjs";
import { hasPushover, sendFeedback } from "./lib/pushover.mjs";
import { miniCluster, landingHtml } from "./lib/landing.mjs";

// Ungerichtete Kante hinzufügen/aktualisieren (dedupe über sortiertes from|to + type).
function addEdge(g, a, b, type, weight, source, shows) {
  if (a === b) return;
  const [from, to] = a < b ? [a, b] : [b, a];
  const e = g.edges.find((x) => x.type === type && x.from === from && x.to === to);
  if (e) {
    e.weight = Math.max(e.weight, weight);
    if (shows?.length) e.shows = mergeShows(e.shows, shows);
    return;
  }
  const edge = { from, to, type, weight, source };
  if (shows?.length) edge.shows = shows.slice(0, 12);
  g.edges.push(edge);
}
// Auftrittsorte zusammenführen (dedupe über event+date+venue, max 12)
function mergeShows(a = [], b = []) {
  const out = [], seen = new Set();
  for (const s of [...a, ...b]) {
    const k = `${s.event}|${s.date}|${s.venue}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LIKE_DATA_DIR || ROOT;
const PORT = process.env.PORT || 5173;
// Bind-Host: lokal/Desktop = loopback (Server + eingebetteter Key nicht im LAN sichtbar).
// Gehostet (Docker/Render) HOST=0.0.0.0 setzen, damit der Plattform-Proxy den Container erreicht.
const HOST = process.env.HOST || "127.0.0.1";

// Alle Packs beim Start laden (validiert sie gleich; Import ist netzfrei -> schnell).
const PACKS = new Map();
for (const id of await listPacks()) {
  try { PACKS.set(id, await loadPack(id)); }
  catch (e) { console.error(`Pack "${id}" übersprungen: ${e.message}`); }
}
const DEFAULT_PACK = PACKS.has(await resolvePackId()) ? await resolvePackId() : (PACKS.has("music") ? "music" : [...PACKS.keys()][0]);
if (!PACKS.size) { console.error("Keine Packs gefunden (packs/<id>/pack.mjs)."); process.exit(1); }
// Leichte Liste für den Umschalter (ohne die vollen Configs).
const PACK_LIST = [...PACKS.values()].map((p) => ({ id: p.id, title: p.config.title, item: p.config.item, brand: p.config.brand }));

// Version aus package.json lesen (bleibt so automatisch synchron mit dem Release).
let APP_VERSION = "";
try { APP_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version || ""; } catch {}

// „Kugeln"-Landing (GET / ohne ?pack): eine Karte je Pack mit Mini-Netz aus dem Demo-Graphen.
// Der Demo-Graph dient nur der Vorschau-Optik; die echte Karte startet leer und füllt sich beim Suchen.
const LANDING_CARDS = [];
for (const p of PACKS.values()) {
  let g = { artists: {}, edges: [] };
  try { g = JSON.parse(await readFile(join(ROOT, "packs", p.id, "demo.json"), "utf8")); } catch {}
  LANDING_CARDS.push({
    id: p.id, title: p.config.title, item: p.config.item,
    n: Object.keys(g.artists || {}).length, e: (g.edges || []).length, mini: miniCluster(g),
  });
}
// Statisch ausgelieferte PWA-Dateien (Pfad -> Datei in public/ + Content-Type).
const PWA_ASSETS = {
  "/manifest.webmanifest": { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "no-cache" },
  "/sw.js": { file: "sw.js", type: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/icons/icon-192.png": { file: "icons/icon-192.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/icon-512.png": { file: "icons/icon-512.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/icon-maskable-512.png": { file: "icons/icon-maskable-512.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/apple-touch-icon.png": { file: "icons/apple-touch-icon.png", type: "image/png", cache: "public, max-age=604800" },
};

function landingPage() {
  return landingHtml(LANDING_CARDS, {
    hrefFor: (id) => `/?pack=${encodeURIComponent(id)}`,
    pageTitle: "like — Übersicht",
    heading: "like<b>.</b>",
    sub: "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.",
    cardSub: (c) => c.item.plur,
    footer: APP_VERSION ? `v${APP_VERSION} · alle Domänen in einer App` : "",
  });
}

// Radar ist teuer (viele Popularitäts-Lookups) -> 10 Min im Speicher cachen, PRO PACK.
const radarCache = new Map(); // packId -> { at, key, payload }
const RADAR_TTL = 10 * 60 * 1000;

// Feedback ist einmal beim Start bekannt (Credentials ändern sich zur Laufzeit nicht).
const FEEDBACK_ON = await hasPushover();
// simple In-Memory-Drossel gegen Spam: max. 6 Feedback-Nachrichten pro 5 Minuten (global).
let fbHits = [];

function send(res, code, body, type = "application/json") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try { resolve(s ? JSON.parse(s) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// Aktives Pack für diesen Request (Query > Header > Default).
function reqPackId(url, req) {
  return url.searchParams.get("pack") || req.headers["x-like-pack"] || DEFAULT_PACK;
}

// Pack-Config ins Frontend injizieren (+ Pack-Liste für den Umschalter).
async function indexHtml(pack) {
  const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
  const cfg = JSON.stringify(pack.config).replace(/</g, "\\u003c");
  const list = JSON.stringify(PACK_LIST).replace(/</g, "\\u003c");
  return html.replace("<script>", `<script>window.LIKE_CFG = ${cfg};\nwindow.LIKE_PACKS = ${list};</script>\n<script>`);
}

async function hasApiKey(pack) {
  if (!pack.key) return true; // Pack braucht keinen Key
  if (process.env[pack.key.envVar]) return true;
  try { await access(join(DATA_DIR, pack.key.file)); return true; } catch {}
  try { await access(join(ROOT, pack.key.file)); return true; } catch {}
  return false;
}

// "Ähnlich"-Nachbarn für die Brücke: nutzt das leichte pack.similar(), sonst explore().similar.
async function neighborsFor(pack, name, limit) {
  if (pack.similar) { const r = await pack.similar(name, { limit }); return { canonical: r.canonical || name, list: r.similar || [] }; }
  const r = await pack.explore(name); return { canonical: r.canonical || name, list: (r.similar || []).slice(0, limit) };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Pack-Liste braucht keinen konkreten Pack-Kontext.
    if (req.method === "GET" && url.pathname === "/api/packs") {
      return send(res, 200, { ok: true, packs: PACK_LIST, default: DEFAULT_PACK });
    }

    // Landing/Übersicht: nackte URL ohne ?pack= -> die „Kugeln"-Auswahlseite.
    // Mit ?pack=<id> geht es (weiter unten) direkt in die jeweilige Karte.
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html") && !url.searchParams.has("pack")) {
      return send(res, 200, landingPage(), "text/html; charset=utf-8");
    }

    // PWA-Assets (Manifest, Service-Worker, Icons) — statisch aus public/, ohne Pack-Kontext.
    if (req.method === "GET" && PWA_ASSETS[url.pathname]) {
      const a = PWA_ASSETS[url.pathname];
      try {
        const buf = await readFile(join(ROOT, "public", a.file));
        res.writeHead(200, { "content-type": a.type, "cache-control": a.cache });
        return res.end(buf);
      } catch { return send(res, 404, { error: "not found" }); }
    }

    // Geschmacks-Fingerabdruck: Likes + Top-Themen ÜBER ALLE Domänen (nur lokale Graphen,
    // kein Netz). Plus "verbindende Themen": Genres, die in ≥2 Domänen vorkommen.
    if (req.method === "GET" && url.pathname === "/api/taste") {
      const per = [];
      const genrePacks = new Map(); // genreLower -> { name, packs:Set }
      for (const [id, pk] of PACKS) {
        const g = await loadGraph(dataFile(DATA_DIR, id, "graph.json"));
        const liked = Object.values(g.artists).filter((a) => a.seed || a.known || (a.status && a.status !== "declined"));
        const gc = new Map();
        for (const a of liked) for (const gn of a.genres || []) {
          const k = gn.toLowerCase();
          gc.set(k, { name: gn, count: (gc.get(k)?.count || 0) + 1 });
          let e = genrePacks.get(k);
          if (!e) { e = { name: gn, packs: new Set() }; genrePacks.set(k, e); }
          e.packs.add(pk.config.title);
        }
        const topGenres = [...gc.values()].sort((a, b) => b.count - a.count).slice(0, 6);
        // die "wichtigsten" Likes zuerst: kuratierte (Status) vor bloß gesuchten
        const topItems = liked.sort((a, b) => (b.status ? 1 : 0) - (a.status ? 1 : 0)).slice(0, 5).map((a) => a.name);
        per.push({ id, title: pk.config.title, item: pk.config.item, count: liked.length, topGenres, topItems });
      }
      const overlaps = [...genrePacks.values()].filter((e) => e.packs.size >= 2)
        .map((e) => ({ name: e.name, packs: [...e.packs] })).slice(0, 10);
      return send(res, 200, { ok: true, packs: per, overlaps });
    }

    // Cross-Pack-Brücke: gibt es diesen Eintrag (Adaption/Namensvetter) in anderen Domänen?
    // Fragt die suggest()-Adapter der ANDEREN Packs mit dem bereinigten Namen und matcht
    // tolerant über Namens-Token. "Dune (2021)" findet so "Dune (Frank Herbert)" im Bücher-Pack.
    if (req.method === "POST" && url.pathname === "/api/crossbridge") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      const currentId = reqPackId(url, req);
      const clean = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const q = norm(clean);
      const tokens = new Set(q.split(" ").filter((t) => t.length > 3));
      const matches = (cand) => {
        const c = norm(String(cand).replace(/\s*\([^)]*\)\s*$/, ""));
        if (!c) return false;
        if (c.includes(q) || q.includes(c)) return true;
        return [...tokens].some((t) => c.split(" ").includes(t));
      };
      const others = [...PACKS.values()].filter((p) => p.id !== currentId && p.suggest);
      const hits = (await Promise.all(others.map(async (p) => {
        try {
          const names = await Promise.race([
            p.suggest(clean),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
          ]);
          const hit = (names || []).find(matches);
          return hit ? { pack: p.id, packTitle: p.config.title, name: hit } : null;
        } catch { return null; }
      }))).filter(Boolean);
      return send(res, 200, { ok: true, hits });
    }

    const packId = reqPackId(url, req);
    const pack = PACKS.get(packId);
    if (!pack) return send(res, 400, { error: `Unbekanntes Pack: ${packId}` });
    const GRAPH = dataFile(DATA_DIR, pack.id, "graph.json");
    const DIGEST = dataFile(DATA_DIR, pack.id, "digest.json");
    const STATS = dataFile(DATA_DIR, pack.id, "stats.json");
    // Graph speichern UND den Radar-Cache dieses Packs verwerfen (nie veraltete Vorschläge).
    const persist = (g) => { radarCache.delete(pack.id); return saveGraph(GRAPH, g); };

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return send(res, 200, await indexHtml(pack), "text/html; charset=utf-8");
    }

    // Selbstauskunft: Pack + Key-Status + ob Feedback verfügbar ist (fürs Frontend beim Start)
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, key: await hasApiKey(pack), version: APP_VERSION, pack: pack.id, feedback: FEEDBACK_ON });
    }

    // Testuser-Feedback -> Pushover an den Betreiber. Nur wenn Credentials hinterlegt sind.
    if (req.method === "POST" && url.pathname === "/api/feedback") {
      if (!FEEDBACK_ON) return send(res, 400, { error: "Feedback ist auf diesem Build nicht eingerichtet." });
      const { message } = await readBody(req);
      const msg = String(message || "").trim();
      if (msg.length < 2) return send(res, 400, { error: "Bitte etwas mehr Text." });
      const now = Date.now();
      fbHits = fbHits.filter((t) => now - t < 5 * 60 * 1000);
      if (fbHits.length >= 6) return send(res, 429, { error: "Zu viele Nachrichten — bitte kurz warten." });
      fbHits.push(now);
      try {
        await sendFeedback({ message: `[${pack.id} v${APP_VERSION}] ${msg.slice(0, 900)}` });
        return send(res, 200, { ok: true });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Quellen-Diagnose: alle Datenquellen des Packs live anpingen.
    if (req.method === "POST" && url.pathname === "/api/diag") {
      const probes = pack.diag ? await pack.diag() : [];
      const sources = await Promise.all(probes.map(async ({ name, probe, note = "" }) => {
        const t0 = Date.now();
        try {
          const ok = await probe();
          return { name, status: ok ? "ok" : "leer", ms: Date.now() - t0, note };
        } catch (e) {
          return { name, status: "fehler", ms: Date.now() - t0, note: String(e.message || e).slice(0, 80) };
        }
      }));
      return send(res, 200, { ok: true, sources });
    }

    // Key aus der App heraus speichern (Erststart ohne eingebetteten Key).
    if (req.method === "POST" && url.pathname === "/api/key") {
      if (!pack.key) return send(res, 400, { error: "Dieses Pack braucht keinen API-Key." });
      const { key } = await readBody(req);
      const k = String(key || "").trim();
      if (!new RegExp(pack.key.pattern).test(k)) {
        return send(res, 400, { error: `Das sieht nicht wie ein ${pack.key.name}-API-Key aus.` });
      }
      await writeFile(join(DATA_DIR, pack.key.file), k, "utf8");
      clearKey(pack.key.file);
      pack.clearKeyCache?.();
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/graph") {
      const g = await loadGraph(GRAPH);
      return send(res, 200, materialize(g));
    }

    // Haupt-Flow: einen Eintrag erkunden -> ähnlich + zusammen + Genres (via Pack).
    if (req.method === "POST" && (url.pathname === "/api/explore" || url.pathname === "/api/expand")) {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      const g = await loadGraph(GRAPH);
      let r;
      try { r = await pack.explore(name); }
      catch (err) { return send(res, 502, { error: err.message }); }

      const src = upsertArtist(g, { name: r.canonical || name, url: r.url || null, seed: true });
      src.explored = true;
      if (r.genres?.length) src.genres = r.genres.slice(0, 6);
      if (r.meta) { src.booking = r.meta; }
      if (r.active !== undefined) src.active = r.active;
      for (const s of (r.similar || []).slice(0, 25)) {
        const t = upsertArtist(g, { name: s.name, url: s.url });
        addEdge(g, src.id, t.id, "similar", s.match || 0.5, r.similarSource || pack.id);
      }
      for (const c of (r.together || []).slice(0, 25)) {
        const t = upsertArtist(g, { name: c.name, url: c.url });
        addEdge(g, src.id, t.id, "together", c.weight || 1, r.togetherSource || pack.id, c.shows);
      }
      await persist(g);
      return send(res, 200, {
        ok: true, name: src.name, similar: (r.similar || []).length, together: (r.together || []).length,
        sources: r.sources || [], graph: materialize(g),
      });
    }

    // Brücke suchen: welcher Eintrag verbindet zwei (noch) getrennte Knoten? Meet-in-the-
    // middle über die „ähnlich"-Relation des Packs (funktioniert in ALLEN Domänen): erst
    // gemeinsame direkte Nachbarn (A—X—B), sonst eine Ebene tiefer (A—X—Y—B). Popularität
    // der Zwischen-Einträge kommt mit, damit der Client nach „naheliegend ↔ klein" sortieren
    // kann. Nur Suche — nichts wird gespeichert.
    if (req.method === "POST" && url.pathname === "/api/bridge") {
      const { from, to } = await readBody(req);
      if (!from || !to) return send(res, 400, { error: "from/to fehlt" });
      try {
        const [ra, rb] = await Promise.all([neighborsFor(pack, from, 60), neighborsFor(pack, to, 60)]);
        const A = ra.canonical, B = rb.canonical;
        const lc = (s) => String(s).toLowerCase();
        const skip = new Set([lc(A), lc(B), lc(from), lc(to)]);
        const NA = ra.list, NB = rb.list;
        const inA = new Map(NA.map((s) => [lc(s.name), s]));
        const inB = new Map(NB.map((s) => [lc(s.name), s]));
        let mode = "direct", cands = [];

        // 1) direkt: X ist Nachbar von A UND B  (A—X—B)
        for (const s of NA) {
          const t = inB.get(lc(s.name));
          if (t && !skip.has(lc(s.name)))
            cands.push({ via: [{ name: s.name, url: s.url || t.url || null }], strength: ((s.match || 0.5) + (t.match || 0.5)) / 2 });
        }
        cands.sort((x, y) => y.strength - x.strength);
        cands = cands.slice(0, 15);

        // Reicht das nicht: von BEIDEN Seiten je eine Ebene expandieren und in der Mitte treffen.
        // Das findet auch Brücken, die keine gemeinsame direkte Verbindung haben (mehrere Schichten).
        if (!cands.length) {
          const K = 8;
          const topA = NA.slice(0, K), topB = NB.slice(0, K);
          const [expA, expB] = await Promise.all([
            Promise.all(topA.map((x) => neighborsFor(pack, x.name, 40).then((r) => ({ x, list: r.list })).catch(() => null))),
            Promise.all(topB.map((y) => neighborsFor(pack, y.name, 40).then((r) => ({ y, list: r.list })).catch(() => null))),
          ]);
          const AX = expA.filter(Boolean), BY = expB.filter(Boolean);

          // 2) zwei Stationen: A—X—Y—B  (Y Nachbar von X und von B; oder X Nachbar von Y und von A)
          const two = [], seen2 = new Set();
          const addTwo = (X, Y, sMatch) => {
            const key = lc(X.name) + "|" + lc(Y.name);
            if (seen2.has(key)) return; seen2.add(key);
            two.push({ via: [{ name: X.name, url: X.url || null }, { name: Y.name, url: Y.url || null }], strength: sMatch });
          };
          for (const { x, list } of AX) for (const y of list) {
            const t = inB.get(lc(y.name));
            if (t && !skip.has(lc(y.name)) && lc(y.name) !== lc(x.name)) addTwo(x, y, ((x.match || 0.5) + (y.match || 0.5) + (t.match || 0.5)) / 3);
          }
          for (const { y, list } of BY) for (const x of list) {
            const s = inA.get(lc(x.name));
            if (s && !skip.has(lc(x.name)) && lc(x.name) !== lc(y.name)) addTwo(s, y, ((s.match || 0.5) + (x.match || 0.5) + (y.match || 0.5)) / 3);
          }
          if (two.length) {
            mode = "two"; two.sort((a, b) => b.strength - a.strength); cands = two.slice(0, 12);
          } else {
            // 3) drei Stationen: A—X—M—Y—B  (M gemeinsamer Nachbar einer A-seitigen und einer B-seitigen Station)
            mode = "three";
            const bSets = BY.map(({ y, list }) => ({ y, set: new Map(list.map((m) => [lc(m.name), m])) }));
            const three = [], seen3 = new Set();
            for (const { x, list } of AX) for (const m of list) {
              if (skip.has(lc(m.name)) || lc(m.name) === lc(x.name)) continue;
              for (const { y, set } of bSets) {
                if (lc(y.name) === lc(x.name) || lc(y.name) === lc(m.name)) continue;
                const mm = set.get(lc(m.name));
                if (!mm) continue;
                const key = lc(x.name) + "|" + lc(m.name) + "|" + lc(y.name);
                if (seen3.has(key)) continue; seen3.add(key);
                three.push({ via: [{ name: x.name, url: x.url || null }, { name: m.name, url: m.url || mm.url || null }, { name: y.name, url: y.url || null }],
                  strength: ((x.match || 0.5) + (m.match || 0.5) + (mm.match || 0.5) + (y.match || 0.5)) / 4 });
              }
            }
            three.sort((a, b) => b.strength - a.strength); cands = three.slice(0, 10);
          }
        }

        // Genres + Popularität der Zwischen-Einträge (gebündelt via enrich; sonst nur Popularität).
        // Genres wandern mit an die Kandidaten, damit sie am Geist mit angezeigt werden.
        const names = [...new Set(cands.flatMap((c) => c.via.map((v) => v.name)))];
        const meta = {};
        await Promise.all(names.map(async (n) => {
          try {
            if (pack.enrich) { const e = await pack.enrich({ name: n }); meta[n] = { genres: e.genres || [], listeners: e.popularity ?? null }; }
            else if (pack.popularity) { meta[n] = { genres: [], listeners: (await pack.popularity(n)) ?? null }; }
            else meta[n] = { genres: [], listeners: null };
          } catch { meta[n] = { genres: [], listeners: null }; }
        }));
        for (const c of cands) for (const v of c.via) { const m = meta[v.name]; if (m) { v.listeners = m.listeners; v.genres = m.genres; } }

        return send(res, 200, { ok: true, from: A, to: B, mode, candidates: cands });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Gewählte Brücke in den Graphen einfügen: Zwischen-Einträge anlegen und die Kette
    // A — via… — B als „similar"-Kanten verbinden. from/to existieren schon auf der Karte.
    if (req.method === "POST" && url.pathname === "/api/bridge/add") {
      const { from, to, via = [], fromId, toId } = await readBody(req);
      if (!from || !to || !via.length) return send(res, 400, { error: "from/to/via fehlt" });
      const g = await loadGraph(GRAPH);
      const aNode = (fromId && g.artists[fromId]) || upsertArtist(g, { name: from });
      const bNode = (toId && g.artists[toId]) || upsertArtist(g, { name: to });
      const chain = [aNode, ...via.map((name) => upsertArtist(g, { name })), bNode];
      for (let i = 0; i < chain.length - 1; i++) addEdge(g, chain[i].id, chain[i + 1].id, "similar", 0.5, "bridge");
      await persist(g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/delete") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      if (!g.artists[id]) return send(res, 404, { error: "Eintrag unbekannt" });
      delete g.artists[id];
      g.edges = g.edges.filter((e) => e.from !== id && e.to !== id);
      await persist(g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/restore") {
      const { artist, edges = [] } = await readBody(req);
      if (!artist?.id) return send(res, 400, { error: "artist fehlt" });
      const g = await loadGraph(GRAPH);
      g.artists[artist.id] = artist;
      for (const e of edges) {
        if (!g.edges.find((x) => x.type === e.type && x.from === e.from && x.to === e.to)) g.edges.push(e);
      }
      await persist(g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      const { scope = "all" } = await readBody(req);
      let g;
      if (scope === "all") {
        g = emptyGraph();
      } else if (scope === "lineups") {
        g = await loadGraph(GRAPH);
        g.events = [];
        for (const a of Object.values(g.artists)) { delete a.bl; delete a.wikiChecked; delete a.wiki; }
        g.sources = (g.sources || []).filter((s) => s.id !== "wikipedia");
      } else if (scope === "discovered") {
        g = await loadGraph(GRAPH);
        const keep = new Set();
        for (const e of g.edges) { keep.add(e.from); keep.add(e.to); }
        for (const a of Object.values(g.artists)) {
          if (!a.seed && !a.known && !a.note && !keep.has(a.id)) delete g.artists[a.id];
        }
      } else {
        return send(res, 400, { error: "scope muss all|lineups|discovered sein" });
      }
      await persist(g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    // Ganzen Graphen importieren (Backup wiederherstellen / auf anderen Rechner mitnehmen).
    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readBody(req);
      const incoming = body?.graph ?? body;
      if (!incoming || typeof incoming !== "object" || typeof incoming.artists !== "object" || !Array.isArray(incoming.edges)) {
        return send(res, 400, { error: "Keine gültige Graph-Datei (erwartet { artists, edges })." });
      }
      try {
        const cur = await readFile(GRAPH, "utf8");
        await writeFile(dataFile(DATA_DIR, pack.id, "graph.bak.json"), cur, "utf8");
      } catch { /* noch kein Graph vorhanden -> nichts zu sichern */ }
      const g = { meta: incoming.meta || { version: 1 }, artists: incoming.artists, edges: incoming.edges,
        events: incoming.events || [], sources: incoming.sources || [] };
      await persist(g);
      const loaded = await loadGraph(GRAPH); // durch Migration/Bereinigung schicken
      return send(res, 200, { ok: true, artists: Object.keys(loaded.artists).length, graph: materialize(loaded) });
    }

    // Legacy (nur Musik): Wikipedia-Lineups / Auto-Entdeckung.
    if (req.method === "POST" && url.pathname === "/api/auto" && pack.id === "music") {
      const { lang = "en", maxArtists = 60, minArtists = 2, maxFestivals = 30 } = await readBody(req);
      const g = await loadGraph(GRAPH);
      try {
        const { discoverAndScrape } = await import("./lib/discover.mjs");
        const summary = await discoverAndScrape(g, { lang, maxArtists, minArtists, maxFestivals });
        await persist(g);
        return send(res, 200, { ok: true, summary, graph: materialize(g) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/scrape" && pack.id === "music") {
      const { target, lang = "en", name, date, place } = await readBody(req);
      if (!target) return send(res, 400, { error: "target (URL oder Titel) fehlt" });
      const g = await loadGraph(GRAPH);
      try {
        const { fetchLineup } = await import("./lib/wikipedia.mjs");
        const r = await fetchLineup(target, { lang });
        if (!r.lineup.length) return send(res, 200, { ok: false, error: "Kein Lineup gefunden", eventName: r.eventName });
        const { event, artistCount } = addEvent(g, {
          name: name || r.eventName, date, place, lineup: r.lineup, sourceUrl: r.sourceUrl,
        });
        await persist(g);
        return send(res, 200, { ok: true, eventName: event.name, artistCount, graph: materialize(g) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/artist") {
      const { id, known, note, status } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "Eintrag unbekannt" });
      if (typeof known === "boolean") a.known = known;
      if (typeof note === "string") a.note = note;
      if (typeof status === "string") { a.status = status; a.known = status !== ""; } // known bleibt abgeleitet
      await persist(g);
      return send(res, 200, { ok: true, artist: a });
    }

    // Steckbrief beim Anklicken nachladen: Genres + Popularität (+ Momentum) + Ort.
    if (req.method === "POST" && url.pathname === "/api/enrich") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      let changed = false, growth = null;
      let patch = {};
      try { patch = await pack.enrich(a) || {}; } catch {}
      if (patch.genres?.length && (!a.genres || !a.genres.length)) { a.genres = patch.genres; changed = true; }
      if (patch.url && !a.url) { a.url = patch.url; changed = true; }
      if (patch.popularity) {
        if (a.listeners !== patch.popularity) { a.listeners = patch.popularity; changed = true; }
        const stats = await loadStats(STATS);
        if (addSnapshot(stats, id, patch.popularity)) await saveStats(STATS, stats);
        growth = growthPerMonth(stats, id);
      }
      if (patch.location && !a.booking?.area && !a.bcLocation) { a.bcLocation = patch.location; a.bcUrl = patch.locationUrl || null; changed = true; }
      if (changed) await persist(g);
      return send(res, 200, { ok: true, genres: a.genres || [], listeners: a.listeners ?? null, growth, location: a.booking?.area || a.bcLocation || null, bcUrl: a.bcUrl || null });
    }

    // Vorschau/Klangprobe — nur, wenn das Pack eine liefert.
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      if (!pack.preview) return send(res, 200, { ok: false });
      let p = null;
      try { p = await pack.preview(name); } catch {}
      if (!p?.url) return send(res, 200, { ok: false });
      return send(res, 200, { ok: true, url: p.url, track: p.track, artist: p.artist });
    }

    // Umfeld eines Eintrags. /api/labelmates bleibt als Alias.
    if (req.method === "POST" && (url.pathname === "/api/context" || url.pathname === "/api/labelmates")) {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      if (!pack.context) return send(res, 200, { ok: true, note: null, groups: [] });
      try {
        const r = await pack.context(a.name);
        return send(res, 200, { ok: true, note: r.note || null, groups: r.groups || [] });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Radar: Geheimtipp-Score — kleine Einträge nah an deinen Likes, mit Begründung.
    if (req.method === "POST" && url.pathname === "/api/radar") {
      const { limit = 10, extraLikes = [], force = false } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const extra = new Set(extraLikes);
      const likes = new Set(Object.values(g.artists)
        .filter((a) => a.seed || a.known || (a.status && a.status !== "declined") || extra.has(a.id))
        .map((a) => a.id));
      if (!likes.size) return send(res, 400, { error: "Erst ein paar Einträge suchen oder liken — dann hat das Radar einen Geschmack, an dem es sich orientieren kann." });

      const cacheKey = [...likes].sort().join(",") + "|" + limit;
      const cached = radarCache.get(pack.id);
      if (!force && cached && cached.key === cacheKey && Date.now() - cached.at < RADAR_TTL) {
        return send(res, 200, { ...cached.payload, cached: true, computedAt: cached.at });
      }

      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const inGraph = new Set(Object.values(g.artists).map((a) => norm(a.name)));
      const likeName = (id) => g.artists[id]?.name || id;
      const popLabel = pack.config.popularity?.label || "";

      // (a) Graph-Nachbarn: Nähe = Summe der Kantengewichte zu Likes
      const cand = new Map();
      for (const e of g.edges) {
        const [l, o] = likes.has(e.from) && !likes.has(e.to) ? [e.from, e.to]
                     : likes.has(e.to) && !likes.has(e.from) ? [e.to, e.from] : [null, null];
        if (!o || !g.artists[o]) continue;
        const c = cand.get(o) ?? { id: o, closeness: 0, together: false, vias: new Set() };
        c.closeness += e.type === "similar" ? (e.weight || 0.5) : Math.min(1, 0.4 + 0.1 * (e.weight || 1));
        if (e.type !== "similar") c.together = true;
        c.vias.add(likeName(l));
        cand.set(o, c);
      }
      const graphCands = [...cand.values()].sort((x, y) => y.closeness - x.closeness).slice(0, 30);

      const stats = await loadStats(STATS);
      let statsChanged = false, graphChanged = false;
      if (pack.popularity) {
        for (const c of graphCands.slice(0, 25)) {
          const a = g.artists[c.id];
          try {
            const p = await pack.popularity(a.name);
            if (p) {
              if (a.listeners !== p) { a.listeners = p; graphChanged = true; }
              if (addSnapshot(stats, c.id, p)) statsChanged = true;
            }
          } catch { /* ohne Popularität weiter */ }
        }
      }
      if (statsChanged) await saveStats(STATS, stats);
      if (graphChanged) await persist(g);

      // (b) Pack-spezifische Zusatzkandidaten (Musik: Deezer-Related + Bandcamp-Releases)
      let extras = [];
      if (pack.radarExtras) {
        const deg = {};
        for (const e of g.edges) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; }
        const topLikeNames = [...likes].sort((a, b) => (deg[b] || 0) - (deg[a] || 0)).slice(0, 4).map(likeName);
        const genreCount = new Map();
        for (const id of likes) for (const gn of g.artists[id]?.genres || []) {
          const k = gn.toLowerCase(); genreCount.set(k, (genreCount.get(k) || 0) + 1);
        }
        const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
        try { extras = await pack.radarExtras({ topLikeNames, topGenres, isKnown: (k) => inGraph.has(k) }) || []; } catch {}
      }

      const small = (n) => n == null ? 0.5 : n < 3000 ? 1 : n < 10000 ? 0.85 : n < 30000 ? 0.65 : n < 100000 ? 0.4 : n < 300000 ? 0.2 : 0.08;
      const fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);
      const out = [];
      for (const c of graphCands) {
        const a = g.artists[c.id];
        const growth = growthPerMonth(stats, c.id);
        const mom = growth == null ? 1 : growth >= 25 ? 1.25 : growth >= 10 ? 1.12 : growth < 0 ? 0.92 : 1;
        const score = Math.min(c.closeness, 3) / 3 * small(a.listeners) * mom * (c.together ? 1.15 : 1) * (a.active ? 1.1 : 1);
        const reasons = [`nah an ${[...c.vias].slice(0, 2).join(" & ")}`];
        if (a.listeners != null && popLabel) reasons.push(`${fmtNum(a.listeners)} ${popLabel}`);
        if (growth != null && growth >= 10) reasons.push(`▲ +${growth}%/Monat`);
        if (c.together) reasons.push(pack.config.radarTogetherReason || "direkt verbunden");
        if (a.active && pack.config.activeLabel) reasons.push(pack.config.activeLabel);
        out.push({ name: a.name, id: c.id, inGraph: true, listeners: a.listeners ?? null, growth, score, reasons, url: a.bcUrl || a.url || null });
      }
      for (const x of extras) {
        out.push({ name: x.name, id: null, inGraph: false, score: x.score ?? 0.5, reasons: x.reasons || [], url: x.url || null });
      }
      out.sort((x, y) => y.score - x.score);
      const radar = out.slice(0, Math.max(3, Math.min(30, limit)));
      try {
        let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
        dg.seenRadar = [...new Set([...(dg.seenRadar || []), ...radar.map((r) => r.name)])].slice(-400);
        await writeFile(DIGEST, JSON.stringify(dg), "utf8");
      } catch {}
      const payload = { ok: true, likes: likes.size, radar, computedAt: Date.now() };
      radarCache.set(pack.id, { at: payload.computedAt, key: cacheKey, payload });
      return send(res, 200, payload);
    }

    // Beim App-Start: Popularität der markierten Einträge still snapshotten.
    if (req.method === "POST" && url.pathname === "/api/snapshot") {
      if (!pack.popularity) return send(res, 200, { ok: true, snapshotted: 0, marked: 0 });
      const g = await loadGraph(GRAPH);
      const marked = Object.values(g.artists).filter((a) => a.seed || a.known || a.status);
      const stats = await loadStats(STATS);
      let statsChanged = false, graphChanged = false, n = 0;
      for (const a of marked) {
        try {
          const p = await pack.popularity(a.name);
          if (p) {
            if (a.listeners !== p) { a.listeners = p; graphChanged = true; }
            if (addSnapshot(stats, a.id, p)) { statsChanged = true; n++; }
          }
        } catch { /* ohne Popularität weiter */ }
      }
      if (statsChanged) await saveStats(STATS, stats);
      if (graphChanged) await persist(g);
      return send(res, 200, { ok: true, snapshotted: n, marked: marked.length });
    }

    // Wochen-Digest: welche markierten Einträge sind gewachsen/geschrumpft.
    if (req.method === "POST" && url.pathname === "/api/digest") {
      const g = await loadGraph(GRAPH);
      const stats = await loadStats(STATS);
      const marked = Object.values(g.artists).filter((a) => a.seed || a.known || a.status);
      const grown = [], shrunk = [];
      let oldest = Date.now();
      for (const a of marked) {
        const arr = stats[a.id];
        if (arr?.length) oldest = Math.min(oldest, arr[0].t);
        const gr = growthPerMonth(stats, a.id);
        if (gr == null) continue;
        if (gr >= 10) grown.push({ name: a.name, id: a.id, growth: gr, listeners: a.listeners ?? null });
        else if (gr < 0) shrunk.push({ name: a.name, id: a.id, growth: gr });
      }
      grown.sort((x, y) => y.growth - x.growth);
      shrunk.sort((x, y) => x.growth - y.growth);
      const historyDays = Math.round((Date.now() - oldest) / 864e5);
      let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
      const sinceDays = dg.lastOpen ? Math.round((Date.now() - dg.lastOpen) / 864e5) : null;
      dg.lastOpen = Date.now();
      try { await writeFile(DIGEST, JSON.stringify(dg), "utf8"); } catch {}
      return send(res, 200, { ok: true, grown: grown.slice(0, 6), shrunk: shrunk.slice(0, 3), marked: marked.length, historyDays, sinceDays });
    }

    // Genres für einen bereits vorhandenen Eintrag nachladen — beim Anklicken.
    if (req.method === "POST" && url.pathname === "/api/genres") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      if (a.genres && a.genres.length) return send(res, 200, { ok: true, genres: a.genres });
      let genres = [];
      try { genres = (await pack.enrich(a))?.genres || []; } catch {}
      a.genres = genres;
      await persist(g);
      return send(res, 200, { ok: true, genres });
    }

    // Suchvorschläge (Autocomplete).
    if (req.method === "GET" && url.pathname === "/api/suggest") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return send(res, 200, { names: [] });
      let names = [];
      try { names = pack.suggest ? await pack.suggest(q) : []; } catch {}
      return send(res, 200, { names });
    }

    // Markierte Einträge als CSV exportieren (Shortlist).
    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const g = await loadGraph(GRAPH);
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const music = pack.config.features?.booking;
      const rows = [music
        ? ["Name", "Status", "Genres", "Region", "Aktiv", "Booking/Kontakt", "Notiz", "RA", "Soundcloud", "Instagram", "Website"]
        : ["Name", "Status", "Genres", "Notiz", "URL"]];
      for (const a of Object.values(g.artists)) {
        if (!a.status && !a.known && !a.note) continue; // nur kuratierte Einträge
        const b = a.booking || {};
        rows.push(music
          ? [a.name, a.status || (a.known ? "shortlist" : ""), (a.genres || []).join("; "),
             [b.area, b.country].filter(Boolean).join(", "), a.active ? "ja" : "", b.details || "", a.note || "",
             b.ra || "", b.soundcloud || "", b.instagram || "", b.website || ""]
          : [a.name, a.status || (a.known ? "shortlist" : ""), (a.genres || []).join("; "), a.note || "", a.url || ""]);
      }
      const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="like-shortlist.csv"' });
      return res.end(csv);
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

// Browser plattformübergreifend öffnen (Windows/macOS/Linux), wenn mit --open gestartet.
function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  import("node:child_process").then(({ exec }) => exec(cmd, () => {}));
}

// Default loopback (Desktop/lokal); gehostet via HOST=0.0.0.0 (siehe oben).
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${server.address().port}`;
  console.log(`Like läuft auf ${url} (Packs: ${[...PACKS.keys()].join(", ")}; Default: ${DEFAULT_PACK})`);
  if (process.argv.includes("--open") || process.env.LIKE_OPEN) openBrowser(url);
});
