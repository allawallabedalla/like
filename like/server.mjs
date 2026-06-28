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
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, mergeSimilar, materialize, addEvent, emptyGraph, upsertArtist, upsertEdge } from "./lib/store.mjs";
import { getSimilar, getTopTags, searchArtists } from "./lib/lastfm.mjs";
import { fetchLineup } from "./lib/wikipedia.mjs";
import { discoverAndScrape } from "./lib/discover.mjs";
import { coAppearances } from "./lib/coappear.mjs";

// Ungerichtete Kante hinzufügen/aktualisieren (dedupe über sortiertes from|to + type).
function addEdge(g, a, b, type, weight, source) {
  if (a === b) return;
  const [from, to] = a < b ? [a, b] : [b, a];
  const e = g.edges.find((x) => x.type === type && x.from === from && x.to === to);
  if (e) { e.weight = Math.max(e.weight, weight); return; }
  g.edges.push({ from, to, type, weight, source });
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(ROOT, "graph.json");
const PORT = process.env.PORT || 5173;

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
        addEdge(g, src.id, t.id, "together", c.weight, sources.join("+") || "ra");
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

server.listen(PORT, () => {
  console.log(`Like läuft auf http://localhost:${PORT}`);
});
