#!/usr/bin/env node
// server.mjs — lokaler Zero-Dep-Server für die Map.
//
//   node server.mjs            -> http://localhost:5173
//
// Endpunkte:
//   GET  /                 index.html
//   GET  /api/graph        kompletter Graph (JSON)
//   POST /api/expand       { name }      -> Last.fm getSimilar, merged, gibt Graph zurück
//   POST /api/artist       { id, known?, note? }  -> Booking-Metadaten speichern

import { createServer } from "node:http";
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, mergeSimilar, materialize, addEvent, emptyGraph, upsertArtist, upsertEdge } from "./lib/store.mjs";
import { getSimilar, getTopTags, getArtistInfo, searchArtists, clearKeyCache } from "./lib/lastfm.mjs";
import { fetchLineup } from "./lib/wikipedia.mjs";
import { discoverAndScrape } from "./lib/discover.mjs";
import { coAppearances } from "./lib/coappear.mjs";
import { loadStats, saveStats, addSnapshot, growthPerMonth } from "./lib/stats.mjs";
import { relatedArtists, topTrackPreview } from "./lib/deezer.mjs";
import { previewByName } from "./lib/itunes.mjs";
import { labelmates } from "./lib/musicbrainz.mjs";
import { searchBand, discoverTag } from "./lib/bandcamp.mjs";

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
const GRAPH = join(DATA_DIR, "graph.json");
const DIGEST = join(DATA_DIR, "digest.json");
const PORT = process.env.PORT || 5173;

// Version aus package.json lesen (bleibt so automatisch synchron mit dem Release).
let APP_VERSION = "";
try { APP_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version || ""; } catch {}

// Radar ist teuer (viele Hörerzahl-Lookups) -> 10 Min im Speicher cachen.
let radarCache = null; // { at, key, payload }
const RADAR_TTL = 10 * 60 * 1000;

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(join(ROOT, "public", "index.html"));
      return send(res, 200, html, "text/html; charset=utf-8");
    }

    // Selbstauskunft: hat der Server einen Last.fm-Key? (fürs Frontend beim Start)
    if (req.method === "GET" && url.pathname === "/api/health") {
      let key = !!process.env.LASTFM_API_KEY;
      if (!key) { try { await access(join(DATA_DIR, ".lastfm-key")); key = true; } catch {} }
      return send(res, 200, { ok: true, key, version: APP_VERSION });
    }

    // Key aus der App heraus speichern (Erststart ohne eingebetteten Key).
    if (req.method === "POST" && url.pathname === "/api/key") {
      const { key } = await readBody(req);
      const k = String(key || "").trim();
      if (!/^[a-f0-9]{32}$/i.test(k)) return send(res, 400, { error: "Das sieht nicht wie ein Last.fm-API-Key aus (32 Zeichen, hex)." });
      await writeFile(join(DATA_DIR, ".lastfm-key"), k, "utf8");
      clearKeyCache();
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/graph") {
      const minShared = Math.max(1, parseInt(url.searchParams.get("minShared"), 10) || 2);
      const g = await loadGraph(GRAPH);
      return send(res, 200, materialize(g, { minShared }));
    }

    if (req.method === "POST" && url.pathname === "/api/expand") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      const g = await loadGraph(GRAPH);
      try {
        const { sourceName, similar } = await getSimilar(name, { limit: 30 });
        mergeSimilar(g, { sourceName, similar, seed: true });
        await saveGraph(GRAPH, g);
        return send(res, 200, { ok: true, sourceName, added: similar.length, graph: materialize(g) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Haupt-Flow: einen Act erkunden -> ähnlicher Stil (Last.fm) + zusammen aufgetreten (RA) + Genres.
    if (req.method === "POST" && url.pathname === "/api/explore") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      const g = await loadGraph(GRAPH);
      let canonical = name, similar = [], coacts = [], raGenres = [], tags = [], sources = [];
      // Last.fm bestimmt Identität + ähnlichen Stil (auch für Bands, die nicht mehr auftreten)
      try { const r = await getSimilar(name, { limit: 30 }); canonical = r.sourceName; similar = r.similar; } catch { /* nicht bei Last.fm */ }
      try { tags = await getTopTags(canonical); } catch {}
      // RA nur, wenn es DENSELBEN Act sicher kennt — Name wird NICHT von RA überschrieben
      let booking = null;
      try { const ca = await coAppearances(canonical); coacts = ca.coacts; raGenres = ca.genres; sources = ca.sources; booking = ca.booking; } catch { /* RA aus */ }

      // Genres: RA (kuratiert) zuerst, dann Last.fm-Tags; case-insensitive dedupe
      const genres = [], seenG = new Set();
      for (const x of [...raGenres, ...tags]) { const k = x.toLowerCase(); if (!seenG.has(k)) { seenG.add(k); genres.push(x); } }

      const src = upsertArtist(g, { name: canonical, seed: true });
      src.explored = true;
      if (genres.length) src.genres = genres.slice(0, 6);
      if (booking) { src.booking = booking; src.active = booking.upcoming > 0; }
      for (const s of similar.slice(0, 25)) {
        const t = upsertArtist(g, { name: s.name, url: s.url });
        addEdge(g, src.id, t.id, "similar", s.match || 0.5, "lastfm");
      }
      for (const c of coacts.slice(0, 25)) {
        const t = upsertArtist(g, { name: c.name });
        addEdge(g, src.id, t.id, "together", c.weight, sources.join("+") || "ra", c.shows);
      }
      await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, name: canonical, similar: similar.length, together: coacts.length, sources, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/delete") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      if (!g.artists[id]) return send(res, 404, { error: "Act unbekannt" });
      delete g.artists[id];
      g.edges = g.edges.filter((e) => e.from !== id && e.to !== id);
      await saveGraph(GRAPH, g);
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
      await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      const { scope = "all" } = await readBody(req);
      let g;
      if (scope === "all") {
        g = emptyGraph();
      } else if (scope === "lineups") {
        // Festivals/Lineups + Entdeckungs-Cache löschen, deine Acts behalten
        g = await loadGraph(GRAPH);
        g.events = [];
        for (const a of Object.values(g.artists)) { delete a.bl; delete a.wikiChecked; delete a.wiki; }
        g.sources = (g.sources || []).filter((s) => s.id !== "wikipedia");
      } else if (scope === "discovered") {
        // entdeckte Acts sind abgeleitet -> es reicht, die Wiki-Caches/Events zu kappen? Nein:
        // nur die Acts entfernen, die NICHT seed/known/notiert/last.fm-verbunden sind.
        g = await loadGraph(GRAPH);
        const keepLastfm = new Set();
        for (const e of g.edges) { keepLastfm.add(e.from); keepLastfm.add(e.to); }
        for (const a of Object.values(g.artists)) {
          if (!a.seed && !a.known && !a.note && !keepLastfm.has(a.id)) delete g.artists[a.id];
        }
      } else {
        return send(res, 400, { error: "scope muss all|lineups|discovered sein" });
      }
      await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, graph: materialize(g) });
    }

    if (req.method === "POST" && url.pathname === "/api/auto") {
      const { lang = "en", maxArtists = 60, minArtists = 2, maxFestivals = 30 } = await readBody(req);
      const g = await loadGraph(GRAPH);
      try {
        const summary = await discoverAndScrape(g, { lang, maxArtists, minArtists, maxFestivals });
        await saveGraph(GRAPH, g);
        return send(res, 200, { ok: true, summary, graph: materialize(g) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/scrape") {
      const { target, lang = "en", name, date, place } = await readBody(req);
      if (!target) return send(res, 400, { error: "target (URL oder Titel) fehlt" });
      const g = await loadGraph(GRAPH);
      try {
        const r = await fetchLineup(target, { lang });
        if (!r.lineup.length) return send(res, 200, { ok: false, error: "Kein Lineup gefunden", eventName: r.eventName });
        const { event, artistCount } = addEvent(g, {
          name: name || r.eventName, date, place, lineup: r.lineup, sourceUrl: r.sourceUrl,
        });
        await saveGraph(GRAPH, g);
        return send(res, 200, { ok: true, eventName: event.name, artistCount, graph: materialize(g) });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/artist") {
      const { id, known, note, status } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "Künstler unbekannt" });
      if (typeof known === "boolean") a.known = known;
      if (typeof note === "string") a.note = note;
      if (typeof status === "string") { a.status = status; a.known = status !== ""; } // known bleibt abgeleitet
      await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, artist: a });
    }

    // Act-Steckbrief beim Anklicken nachladen: Genres + Hörerzahl (+ Momentum-
    // Snapshot) + Bandcamp-Ort als Fallback, wenn RA keine Region kennt.
    if (req.method === "POST" && url.pathname === "/api/enrich") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      let changed = false;
      if (!a.genres || !a.genres.length) {
        try { const t = await getTopTags(a.name); if (t.length) { a.genres = t; changed = true; } } catch {}
      }
      let growth = null;
      try {
        const info = await getArtistInfo(a.name);
        if (info?.listeners) {
          if (a.listeners !== info.listeners) { a.listeners = info.listeners; changed = true; }
          const stats = await loadStats();
          if (addSnapshot(stats, id, info.listeners)) await saveStats(stats);
          growth = growthPerMonth(stats, id);
        }
      } catch { /* kein Key / Act unbekannt -> ohne Hörerzahl weiter */ }
      if (!a.booking?.area && !a.bcLocation) {
        try { const b = await searchBand(a.name); if (b?.location) { a.bcLocation = b.location; a.bcUrl = b.url; changed = true; } } catch {}
      }
      if (changed) await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, genres: a.genres || [], listeners: a.listeners ?? null, growth, location: a.booking?.area || a.bcLocation || null, bcUrl: a.bcUrl || null });
    }

    // Klangprobe: 30-Sekunden-Vorschau (Deezer zuerst, sonst iTunes) — beide gratis.
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      let p = null;
      try { p = await topTrackPreview(name); } catch {}
      if (!p?.url) { try { p = await previewByName(name); } catch {} }
      if (!p?.url) return send(res, 200, { ok: false });
      return send(res, 200, { ok: true, url: p.url, track: p.track, artist: p.artist });
    }

    // Label-Umfeld eines Acts (MusicBrainz, offene Daten): Labels + Roster-Kolleg:innen.
    if (req.method === "POST" && url.pathname === "/api/labelmates") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      try {
        const r = await labelmates(a.name);
        return send(res, 200, { ok: true, labels: r.labels, mates: r.mates });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Radar: Geheimtipp-Score 2.0 — kleine Acts nah an deinen Likes, mit Begründung.
    // Kandidaten: (a) unerforschte Graph-Nachbarn deiner Likes, (b) Deezer-Related
    // deiner Top-Likes (auch Acts, die noch gar nicht auf der Karte sind),
    // (c) frische Bandcamp-Releases in deinen dominanten Genres.
    if (req.method === "POST" && url.pathname === "/api/radar") {
      const { limit = 10, extraLikes = [], force = false } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const extra = new Set(extraLikes);
      const likes = new Set(Object.values(g.artists)
        .filter((a) => a.seed || a.known || (a.status && a.status !== "declined") || extra.has(a.id))
        .map((a) => a.id));
      if (!likes.size) return send(res, 400, { error: "Erst ein paar Acts suchen oder liken — dann hat das Radar einen Geschmack, an dem es sich orientieren kann." });

      // 10-Min-Cache: gleiche Likes -> gleicher Vorschlag, ohne erneut alle
      // Hörerzahlen abzufragen. force=true (Aktualisieren-Button) umgeht ihn.
      const cacheKey = [...likes].sort().join(",") + "|" + limit;
      if (!force && radarCache && radarCache.key === cacheKey && Date.now() - radarCache.at < RADAR_TTL) {
        return send(res, 200, { ...radarCache.payload, cached: true, computedAt: radarCache.at });
      }

      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const inGraph = new Set(Object.values(g.artists).map((a) => norm(a.name)));
      const likeName = (id) => g.artists[id]?.name || id;

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

      // Hörerzahlen für die Top-Kandidaten (gecacht; Snapshots fürs Momentum)
      const stats = await loadStats();
      let statsChanged = false, graphChanged = false;
      for (const c of graphCands.slice(0, 25)) {
        const a = g.artists[c.id];
        try {
          const info = await getArtistInfo(a.name);
          if (info?.listeners) {
            if (a.listeners !== info.listeners) { a.listeners = info.listeners; graphChanged = true; }
            if (addSnapshot(stats, c.id, info.listeners)) statsChanged = true;
          }
        } catch { /* ohne Hörerzahl weiter */ }
      }
      if (statsChanged) await saveStats(stats);
      if (graphChanged) await saveGraph(GRAPH, g);

      // (b) Deezer-Related der Top-4-Likes (nach Grad) — bringt NEUE Namen mit Fananzahl
      const deg = {};
      for (const e of g.edges) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; }
      const topLikes = [...likes].sort((a, b) => (deg[b] || 0) - (deg[a] || 0)).slice(0, 4);
      const dzCands = [];
      const seenNew = new Set();
      for (const id of topLikes) {
        try {
          for (const r of await relatedArtists(likeName(id), { limit: 20 })) {
            const k = norm(r.name);
            if (inGraph.has(k) || seenNew.has(k)) continue;
            seenNew.add(k);
            dzCands.push({ name: r.name, fans: r.fans, link: r.link, via: likeName(id) });
          }
        } catch { /* Deezer down -> weiter */ }
      }

      // (c) Bandcamp "new arrivals" in den dominanten Genres deiner Likes
      const genreCount = new Map();
      for (const id of likes) for (const gn of g.artists[id]?.genres || []) {
        const k = gn.toLowerCase(); genreCount.set(k, (genreCount.get(k) || 0) + 1);
      }
      const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      const bcCands = [];
      for (const tag of topGenres) {
        const items = await discoverTag(tag, { limit: 8 });
        for (const it of items) {
          const k = norm(it.artist);
          if (inGraph.has(k) || seenNew.has(k)) continue;
          seenNew.add(k);
          bcCands.push(it);
        }
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
        if (a.listeners != null) reasons.push(`${fmtNum(a.listeners)} Hörer`);
        if (growth != null && growth >= 10) reasons.push(`▲ +${growth}%/Monat`);
        if (c.together) reasons.push("hat mit deinem Like gespielt");
        if (a.active) reasons.push("tritt auf");
        out.push({ name: a.name, id: c.id, inGraph: true, listeners: a.listeners ?? null, growth, score, reasons, url: a.bcUrl || a.url || null });
      }
      for (const d of dzCands) {
        const reasons = [`Deezer-Nachbar von ${d.via}`];
        if (d.fans != null) reasons.push(`${fmtNum(d.fans)} Fans`);
        reasons.push("noch nicht auf deiner Karte");
        out.push({ name: d.name, id: null, inGraph: false, fans: d.fans, score: 0.55 * small(d.fans), reasons, url: d.link });
      }
      for (const b of bcCands) {
        out.push({ name: b.artist, id: null, inGraph: false, score: 0.45,
          reasons: [`frisch auf Bandcamp (${b.genre})`, b.title ? `Release: „${b.title}"` : null, "noch nicht auf deiner Karte"].filter(Boolean),
          url: b.url });
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

    // Beim App-Start: Hörerzahlen der markierten Acts still snapshotten, damit sich
    // die Momentum-Zeitreihe von allein füllt (gecacht -> meist ohne Netz-Call).
    if (req.method === "POST" && url.pathname === "/api/snapshot") {
      const g = await loadGraph(GRAPH);
      const marked = Object.values(g.artists).filter((a) => a.seed || a.known || a.status);
      const stats = await loadStats();
      let statsChanged = false, graphChanged = false, n = 0;
      for (const a of marked) {
        try {
          const info = await getArtistInfo(a.name);
          if (info?.listeners) {
            if (a.listeners !== info.listeners) { a.listeners = info.listeners; graphChanged = true; }
            if (addSnapshot(stats, a.id, info.listeners)) { statsChanged = true; n++; }
          }
        } catch { /* ohne Hörerzahl weiter */ }
      }
      if (statsChanged) await saveStats(stats);
      if (graphChanged) await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, snapshotted: n, marked: marked.length });
    }

    // Wochen-Digest: welche deiner markierten Acts sind gewachsen/geschrumpft,
    // seit wann läuft der Verlauf, und wie viele Radar-Treffer gab es zuletzt.
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
      // seit letztem Öffnen des Digests vergangene Tage
      let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
      const sinceDays = dg.lastOpen ? Math.round((Date.now() - dg.lastOpen) / 864e5) : null;
      dg.lastOpen = Date.now();
      try { await writeFile(DIGEST, JSON.stringify(dg), "utf8"); } catch {}
      return send(res, 200, { ok: true, grown: grown.slice(0, 6), shrunk: shrunk.slice(0, 3), marked: marked.length, historyDays, sinceDays });
    }

    // Genres für einen bereits vorhandenen Act nachladen (Last.fm-Tags) — beim Anklicken.
    if (req.method === "POST" && url.pathname === "/api/genres") {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      if (a.genres && a.genres.length) return send(res, 200, { ok: true, genres: a.genres });
      let genres = [];
      try { genres = await getTopTags(a.name); } catch {}
      a.genres = genres;
      await saveGraph(GRAPH, g);
      return send(res, 200, { ok: true, genres });
    }

    // Suchvorschläge (Autocomplete).
    if (req.method === "GET" && url.pathname === "/api/suggest") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return send(res, 200, { names: [] });
      let names = [];
      try { names = await searchArtists(q); } catch {}
      return send(res, 200, { names });
    }

    // Markierte Acts als CSV exportieren (Shortlist fürs Booking).
    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const g = await loadGraph(GRAPH);
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["Name", "Status", "Genres", "Region", "Aktiv", "Booking/Kontakt", "Notiz", "RA", "Soundcloud", "Instagram", "Website"]];
      for (const a of Object.values(g.artists)) {
        if (!a.status && !a.known && !a.note) continue; // nur kuratierte Acts
        const b = a.booking || {};
        rows.push([a.name, a.status || (a.known ? "shortlist" : ""), (a.genres || []).join("; "),
          [b.area, b.country].filter(Boolean).join(", "), a.active ? "ja" : "", b.details || "", a.note || "",
          b.ra || "", b.soundcloud || "", b.instagram || "", b.website || ""]);
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

// nur lokal binden — der Server (inkl. eingebettetem Last.fm-Key) soll nicht im
// LAN erreichbar sein. PORT=0 lässt das OS einen freien Port wählen (Electron nutzt das).
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Like läuft auf ${url}`);
  if (process.argv.includes("--open") || process.env.LIKE_OPEN) openBrowser(url);
});
