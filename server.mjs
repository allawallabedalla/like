#!/usr/bin/env node
// server.mjs — lokaler Zero-Dep-Server für die Map. Domänen-neutral:
// alles Inhaltliche (Suche, ähnlich, zusammen, Popularität) kommt aus dem
// geladenen Domain-Pack (packs/<id>/pack.mjs). Default-Pack: music.
//
//   node server.mjs                  -> http://localhost:5173 (Musik)
//   node server.mjs --pack=books     -> Bücher-Variante (auch: ENV LIKE_PACK)
//
// Endpunkte (alle Packs):
//   GET  /                 index.html (mit injizierter Pack-Config)
//   GET  /api/graph        kompletter Graph (JSON)
//   POST /api/explore      { name } -> Pack-Adapter, merged, gibt Graph zurück
//   POST /api/artist       { id, known?, note?, status? } -> Kurations-Metadaten

import { createServer } from "node:http";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, materialize, addEvent, emptyGraph, upsertArtist } from "./lib/store.mjs";
import { loadStats, saveStats, addSnapshot, growthPerMonth, setStatsFile } from "./lib/stats.mjs";
import { loadPack, dataFile } from "./lib/packs.mjs";
import { clearKey } from "./lib/keys.mjs";

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

const pack = await loadPack();
const GRAPH = dataFile(DATA_DIR, pack.id, "graph.json");
const DIGEST = dataFile(DATA_DIR, pack.id, "digest.json");
setStatsFile(dataFile(DATA_DIR, pack.id, "stats.json"));

// Version aus package.json lesen (bleibt so automatisch synchron mit dem Release).
let APP_VERSION = "";
try { APP_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version || ""; } catch {}

// Radar ist teuer (viele Popularitäts-Lookups) -> 10 Min im Speicher cachen.
let radarCache = null; // { at, key, payload }
const RADAR_TTL = 10 * 60 * 1000;

// Graph speichern UND den Radar-Cache verwerfen — jede Mutation geht hier durch,
// damit das Radar nie veraltete Vorschläge zeigt.
function persist(g) { radarCache = null; return saveGraph(GRAPH, g); }

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
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// Pack-Config ins Frontend injizieren (vor dem Haupt-Script, wie beim Static-Export).
async function indexHtml() {
  const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
  const cfg = JSON.stringify(pack.config).replace(/</g, "\\u003c");
  return html.replace("<script>", `<script>window.LIKE_CFG = ${cfg};</script>\n<script>`);
}

async function hasApiKey() {
  if (!pack.key) return true; // Pack braucht keinen Key
  if (process.env[pack.key.envVar]) return true;
  try { await access(join(DATA_DIR, pack.key.file)); return true; } catch {}
  try { await access(join(ROOT, pack.key.file)); return true; } catch {}
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return send(res, 200, await indexHtml(), "text/html; charset=utf-8");
    }

    // Selbstauskunft: Pack + Key-Status (fürs Frontend beim Start)
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, key: await hasApiKey(), version: APP_VERSION, pack: pack.id });
    }

    // Quellen-Diagnose: alle Datenquellen des Packs live anpingen,
    // damit man im echten Betrieb sofort sieht, welche Quelle klemmt.
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
    // /api/expand bleibt als Alias erhalten (alte Aufrufer).
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
        // nur die Einträge entfernen, die NICHT gesucht/markiert/notiert/verbunden sind.
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
    // Der bisherige Stand wird vorher als graph.bak.json gesichert — kein Datenverlust.
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
      radarCache = null;
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

    // Steckbrief beim Anklicken nachladen: Genres + Popularität (+ Momentum-
    // Snapshot) + Ort/Zusatzinfo — was das Pack eben liefert.
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
        const stats = await loadStats();
        if (addSnapshot(stats, id, patch.popularity)) await saveStats(stats);
        growth = growthPerMonth(stats, id);
      }
      if (patch.location && !a.booking?.area && !a.bcLocation) { a.bcLocation = patch.location; a.bcUrl = patch.locationUrl || null; changed = true; }
      if (changed) await persist(g);
      return send(res, 200, { ok: true, genres: a.genres || [], listeners: a.listeners ?? null, growth, location: a.booking?.area || a.bcLocation || null, bcUrl: a.bcUrl || null });
    }

    // Klangprobe/Vorschau — nur, wenn das Pack eine liefert.
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      if (!pack.preview) return send(res, 200, { ok: false });
      let p = null;
      try { p = await pack.preview(name); } catch {}
      if (!p?.url) return send(res, 200, { ok: false });
      return send(res, 200, { ok: true, url: p.url, track: p.track, artist: p.artist });
    }

    // Umfeld eines Eintrags (Musik: Label-Umfeld). /api/labelmates bleibt als Alias.
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
    // Generisch: Graph-Nachbarn × Kleinheit × Momentum; Packs können via radarExtras
    // zusätzliche Kandidaten beisteuern (Musik: Deezer + Bandcamp).
    if (req.method === "POST" && url.pathname === "/api/radar") {
      const { limit = 10, extraLikes = [], force = false } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const extra = new Set(extraLikes);
      const likes = new Set(Object.values(g.artists)
        .filter((a) => a.seed || a.known || (a.status && a.status !== "declined") || extra.has(a.id))
        .map((a) => a.id));
      if (!likes.size) return send(res, 400, { error: "Erst ein paar Einträge suchen oder liken — dann hat das Radar einen Geschmack, an dem es sich orientieren kann." });

      const cacheKey = [...likes].sort().join(",") + "|" + limit;
      if (!force && radarCache && radarCache.key === cacheKey && Date.now() - radarCache.at < RADAR_TTL) {
        return send(res, 200, { ...radarCache.payload, cached: true, computedAt: radarCache.at });
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

      // Popularität für die Top-Kandidaten (gecacht; Snapshots fürs Momentum)
      const stats = await loadStats();
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
      if (statsChanged) await saveStats(stats);
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

      // Scoring: Nähe × Kleinheit × Momentum × Boni — mit Klartext-Begründung
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
      // gesehene Radar-Namen fürs Digest ("neue Treffer seit letzter Woche") merken
      try {
        let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
        dg.seenRadar = [...new Set([...(dg.seenRadar || []), ...radar.map((r) => r.name)])].slice(-400);
        await writeFile(DIGEST, JSON.stringify(dg), "utf8");
      } catch {}
      const payload = { ok: true, likes: likes.size, radar, computedAt: Date.now() };
      radarCache = { at: payload.computedAt, key: cacheKey, payload };
      return send(res, 200, payload);
    }

    // Beim App-Start: Popularität der markierten Einträge still snapshotten, damit
    // sich die Momentum-Zeitreihe von allein füllt (gecacht -> meist ohne Netz-Call).
    if (req.method === "POST" && url.pathname === "/api/snapshot") {
      if (!pack.popularity) return send(res, 200, { ok: true, snapshotted: 0, marked: 0 });
      const g = await loadGraph(GRAPH);
      const marked = Object.values(g.artists).filter((a) => a.seed || a.known || a.status);
      const stats = await loadStats();
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
      if (statsChanged) await saveStats(stats);
      if (graphChanged) await persist(g);
      return send(res, 200, { ok: true, snapshotted: n, marked: marked.length });
    }

    // Wochen-Digest: welche markierten Einträge sind gewachsen/geschrumpft.
    if (req.method === "POST" && url.pathname === "/api/digest") {
      const g = await loadGraph(GRAPH);
      const stats = await loadStats();
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

// nur lokal binden — der Server (inkl. eingebettetem API-Key) soll nicht im
// LAN erreichbar sein. PORT=0 lässt das OS einen freien Port wählen (Electron nutzt das).
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Like [${pack.id}] läuft auf ${url}`);
  if (process.argv.includes("--open") || process.env.LIKE_OPEN) openBrowser(url);
});
