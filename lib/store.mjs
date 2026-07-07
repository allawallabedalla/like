// store.mjs — Laden/Speichern/Mergen des Graphen.
// graph.json ist bewusst so strukturiert wie eine spätere SQLite-DB:
//   artists  (id, name, mbid, url, genres, known, note, seed)
//   edges    (from, to, type, weight, source)
//   events   (id, name, date, place, lineup[])   -> erzeugen co_lineup-Kanten
//   sources  (id, label, fetched)
// Migration nach SQLite ist damit ein 1:1-Mapping.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
const nowTag = () => { try { return Date.now(); } catch { return "x"; } };

export function slug(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Diakritika entfernen
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Name ohne Wikipedia-Begriffsklärung: "Bonobo (musician)" -> "Bonobo".
export function cleanName(name) {
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}
// Abgleich-Schlüssel: verbindet Festival-Lineups mit Last.fm-Acts trotz "(musician)" o.ä.
export function matchKey(name) {
  return slug(cleanName(name));
}

export function emptyGraph() {
  return {
    meta: { version: 1, updated: new Date().toISOString() },
    artists: {},
    edges: [],
    events: [],
    sources: [],
  };
}

export async function loadGraph(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyGraph();
    throw err; // EACCES o.ä.: echtes Problem, nicht verschlucken
  }
  try {
    const g = JSON.parse(raw);
    // sanfte Defaults, falls alte Datei
    g.artists ??= {};
    g.edges ??= [];
    g.events ??= [];
    g.sources ??= [];
    g.meta ??= { version: 1 };
    migrate(g);
    return g;
  } catch {
    // Beschädigte/abgeschnittene JSON: NICHT hart 500 für immer. Datei beiseitelegen (rettbar),
    // ein etwaiges Backup versuchen, sonst leer starten. So bleibt die Karte benutzbar.
    try { await rename(path, path + ".corrupt." + nowTag()); } catch {}
    try {
      const bak = path.replace(/\.json$/, ".bak.json");
      const g = JSON.parse(await readFile(bak, "utf8"));
      g.artists ??= {}; g.edges ??= []; g.events ??= []; g.sources ??= []; g.meta ??= { version: 1 };
      migrate(g);
      return g;
    } catch { return emptyGraph(); }
  }
}

// Aufräumen alter Datenstände (verlustfrei für deine Acts/Kanten/Notizen/Markierungen).
function migrate(g) {
  // verwaiste, nur abgeleitete Lineup-Knoten und leere IDs entfernen
  for (const id of Object.keys(g.artists)) {
    if (id.startsWith("lu:") || !id) delete g.artists[id];
  }
  // alte Auto-/Wikipedia-Caches abwerfen (werden nicht mehr genutzt)
  for (const a of Object.values(g.artists)) {
    delete a.bl; delete a.wikiChecked; delete a.wiki;
    a.status ??= a.known ? "shortlist" : "";
  }
  // Kanten ohne gültige Endpunkte verwerfen
  g.edges = g.edges.filter((e) => g.artists[e.from] && g.artists[e.to]);
  g.events = []; // events flossen nur in die alte (deaktivierte) Lineup-Ebene
}

export async function saveGraph(path, graph) {
  graph.meta = { ...(graph.meta || {}), version: 1, updated: new Date().toISOString() };
  await mkdir(dirname(path), { recursive: true });
  // atomar: erst Temp-Datei, dann rename — wird der Prozess mitten im Schreiben
  // beendet (App-Fenster zu -> server.kill()), bleibt der alte Stand intakt
  const tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(graph, null, 2), "utf8");
  await rename(tmp, path);
}

// Künstler sicherstellen (anlegen oder vorhandenen behalten/ergänzen).
export function upsertArtist(graph, { name, mbid = null, url = null, seed = false }) {
  const id = slug(name);
  const existing = graph.artists[id];
  if (existing) {
    if (mbid && !existing.mbid) existing.mbid = mbid;
    if (url && !existing.url) existing.url = url;
    if (seed) existing.seed = true;
    return existing;
  }
  const a = {
    id,
    name,
    mbid,
    url,
    genres: [],
    known: false, // für Booking: kennst du den Act schon?
    note: "",
    seed, // hast du diesen Act aktiv gesucht?
  };
  graph.artists[id] = a;
  return a;
}

// Kante mergen (Dedup über from|to|type|source; Gewicht aktualisieren).
export function upsertEdge(graph, { from, to, type, weight = 1, source }) {
  if (from === to) return;
  const e = graph.edges.find(
    (x) => x.from === from && x.to === to && x.type === type && x.source === source
  );
  if (e) {
    e.weight = weight;
    return e;
  }
  const edge = { from, to, type, weight, source };
  graph.edges.push(edge);
  return edge;
}

export function noteSource(graph, { id, label }) {
  const s = graph.sources.find((x) => x.id === id);
  if (s) {
    s.fetched = new Date().toISOString();
    return s;
  }
  graph.sources.push({ id, label, fetched: new Date().toISOString() });
}

// Ein Event mit Lineup speichern. WICHTIG: Acts werden NICHT als Knoten angelegt —
// das Lineup ist nur Rohmaterial. Welche Acts/Kanten in der Map landen, entscheidet
// erst der Relevanzfilter in buildLineupLayer() (sonst würde ein Festival tausende
// fremde Acts einschleppen).
export function addEvent(graph, { name, date = null, place = null, lineup = [], sourceUrl = null }) {
  const id = slug(name) + (date ? "@" + date : "");
  // dedupliziert nach Abgleich-Schlüssel, gespeichert wird der bereinigte Anzeigename
  const seen = new Set();
  const names = [];
  for (const raw of lineup) {
    const k = matchKey(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    names.push(cleanName(raw));
  }
  const existing = graph.events.find((e) => e.id === id);
  const ev = existing || { id };
  ev.name = name; ev.date = date; ev.place = place; ev.lineup = names; ev.sourceUrl = sourceUrl;
  if (!existing) graph.events.push(ev);
  noteSource(graph, { id: "wikipedia", label: "Wikipedia Lineups" });
  return { event: ev, artistCount: names.length };
}

// Aus den events die Lineup-Ebene bauen: NUR relevante Acts + ihre co_lineup-Kanten.
// Relevant = (a) deine vorhandenen Acts ("core"), plus (b) Acts, die mit einem core-Act
// in >= minShared Festivals zusammen auftraten (1 Schritt Entdeckung). Gewicht = Anzahl
// gemeinsamer Festivals. So bleibt der Graph auf deinen Kosmos zentriert.
export function buildLineupLayer(graph, { minShared = 2, maxDiscovered = 120 } = {}) {
  const events = graph.events || [];
  if (!events.length) return { discovered: {}, edges: [] };

  // Anzeigenamen je Schlüssel merken; Event-Lineups als Schlüssel-Arrays
  const keyName = new Map();
  const evKeys = events.map((ev) => {
    const ks = [];
    for (const n of ev.lineup || []) {
      const k = matchKey(n);
      if (!keyName.has(k)) keyName.set(k, n);
      ks.push(k);
    }
    return [...new Set(ks)];
  });

  // core = deine vorhandenen Acts; Schlüssel -> bestehende Knoten-ID
  const idForKey = new Map();
  const core = new Set();
  for (const a of Object.values(graph.artists)) {
    const k = matchKey(a.name);
    core.add(k); idForKey.set(k, a.id);
    if (!keyName.has(k)) keyName.set(k, a.name);
  }

  const pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  // 1) Paare zählen, die einen core-Act berühren (effizient: core × Lineup, nicht n²)
  const touch = new Map();
  for (const ks of evKeys) {
    const coreActs = ks.filter((k) => core.has(k));
    if (!coreActs.length) continue;
    const seen = new Set();
    for (const c of coreActs) for (const o of ks) {
      if (o === c) continue;
      const key = pairKey(c, o);
      if (seen.has(key)) continue;
      seen.add(key);
      inc(touch, key);
    }
  }

  // Entdeckungs-Kandidaten (nicht-core Acts) nach Stärke der Bindung an deine Acts ranken.
  // Da Festival-Hauptartikel All-Time sind, würde "alles >= minShared" explodieren —
  // deshalb nur die Top-maxDiscovered, die am häufigsten mit deinen Acts geteilt haben.
  const bond = new Map(); // nonCoreKey -> Summe geteilter Festivals mit core
  for (const [key, w] of touch) {
    if (w < minShared) continue;
    const [a, b] = key.split("|");
    const aCore = core.has(a), bCore = core.has(b);
    if (aCore === bCore) continue; // nur core—neu zählt für die Entdeckung
    const nk = aCore ? b : a;
    bond.set(nk, (bond.get(nk) || 0) + w);
  }
  const topNew = [...bond.entries()].sort((x, y) => y[1] - x[1]).slice(0, maxDiscovered).map(([k]) => k);
  const relevant = new Set([...core, ...topNew]);

  // 2) Kanten nur zwischen relevanten Acts (inkl. neu-neu), Gewicht = geteilte Festivals
  const pc = new Map();
  for (const ks of evKeys) {
    const f = ks.filter((k) => relevant.has(k));
    for (let i = 0; i < f.length; i++)
      for (let j = i + 1; j < f.length; j++) inc(pc, pairKey(f[i], f[j]));
  }

  const idOf = (k) => idForKey.get(k) || "lu:" + k;
  let edges = [];
  for (const [key, w] of pc) {
    if (w < minShared) continue;
    const [a, b] = key.split("|");
    edges.push({ from: idOf(a), to: idOf(b), type: "co_lineup", weight: w, source: "wikipedia" });
  }
  // Sicherheitsdeckel: stärkste Kanten zuerst
  if (edges.length > 2500) edges = edges.sort((x, y) => y.weight - x.weight).slice(0, 2500);

  // entdeckte Knoten (relevante Acts, die noch keine eigenen Knoten sind)
  const discovered = {};
  for (const k of relevant) {
    if (idForKey.has(k)) continue;
    const id = "lu:" + k;
    discovered[id] = { id, name: keyName.get(k) || k, mbid: null, url: null, genres: [], known: false, note: "", seed: false, discovered: true };
  }
  return { discovered, edges };
}

// Rückwärtskompatibel: nur die co_lineup-Kanten (für Zähl-Ausgaben).
export function deriveCoLineup(graph, { minShared = 2 } = {}) {
  return buildLineupLayer(graph, { minShared }).edges;
}

// Graph für die Anzeige. Kanten (similar / together) werden inzwischen direkt gespeichert
// (siehe /api/explore), daher nur eine Kopie zurückgeben. buildLineupLayer bleibt für die
// alten Wikipedia/auto-Endpunkte erhalten, fließt aber nicht mehr automatisch ein.
export function materialize(graph) {
  return { ...graph, artists: { ...graph.artists }, edges: [...graph.edges] };
}

// Eine getSimilar-Antwort in den Graphen mergen.
// similar: [{ name, mbid, match, url }]
export function mergeSimilar(graph, { sourceName, similar, seed = true }) {
  const src = upsertArtist(graph, { name: sourceName, seed });
  for (const s of similar) {
    const tgt = upsertArtist(graph, { name: s.name, mbid: s.mbid, url: s.url });
    upsertEdge(graph, {
      from: src.id,
      to: tgt.id,
      type: "similar",
      weight: s.match ?? 1,
      source: "lastfm",
    });
  }
  noteSource(graph, { id: "lastfm", label: "Last.fm artist.getSimilar" });
  return src;
}
