// packs/travel/pack.mjs — Like Travel: Reiseziele entdecken über zwei unabhängige Achsen.
//   blau   = ähnlicher Reisestil (gleicher „Vibe": Strand/Berge/Kultur/Party/… — via
//            Wikivoyage-Volltextsuche nach dem Stil, bewusst OHNE Geo-Bezug)
//   orange = gut kombinierbar (direkte Nachbarn ≤10 km — Wikivoyage-Geosuche, MediaWiki-Limit)
// Zwei Kriterien, wie gewünscht getrennt:
//   • Heimat-Distanz  = Luftlinie zum Heimatort (Standard „Berlin, Deutschland",
//     überschreibbar per ENV LIKE_TRAVEL_HOME) — erscheint als Chip am Ziel.
//   • Stil-Abweichung = trägt der Graph selbst: nahe blaue Nachbarn = ähnlicher Stil.
//     Türkei-All-inclusive ↔ Alpen-Bergtour liegen geografisch nah, im Stil aber weit.
// Alles aus freien Quellen (OpenStreetMap/Nominatim + Wikivoyage), kein Key.
// Popularität = Wikivoyage-Seitenaufrufe (bester freier Nachfrage-Indikator).

import {
  geocode, haversineKm, resolveTitle, suggestTitles, article, styleTags,
  styleSimilar, geoNearby, voyUrl, rankBySimilarStyle, STYLE_TAG_EN,
} from "../../lib/travel.mjs";
import { surpriseFrom } from "../../lib/surprise.mjs";

const HOME_NAME = (process.env.LIKE_TRAVEL_HOME || "Berlin, Deutschland").trim();

// „Überrasch mich" (Kaltstart): kuratierter Pool schöner, eher leiser Ziele (statt der
// üblichen Hauptstädte). surprise() nimmt das mit den WENIGSTEN Seitenaufrufen.
const SURPRISE_SEEDS = [
  "Matera", "Kotor", "Ohrid", "Piran", "Ronda", "Sintra", "Gent", "Utrecht", "Aarhus",
  "Bergen", "Tartu", "Vilnius", "Brno", "Ljubljana", "Triest", "Bologna", "Porto", "Faro",
  "Valletta", "Plovdiv", "Sibiu", "Breslau", "Danzig", "Leipzig", "Erfurt", "Bamberg",
  "Görlitz", "Bled", "Rovinj", "Zadar", "Mostar", "Thessaloniki", "Nafplio", "Kaunas",
  "Riga", "Lübeck", "Quedlinburg",
];
// (U-2d) Zahl + Vibe-Tag sprachbewusst. lang stammt aus dem Request (ctx.lang) — bei explore
// gesetzt, sonst Deutsch (Quellsprache). vibe() nutzt die Single-Source-Map aus lib/travel.mjs.
const fmtKm = (km, lang) => km.toLocaleString(lang === "en" ? "en-US" : "de-DE");
const vibe = (tag, lang) => (lang === "en" && STYLE_TAG_EN[tag]) ? STYLE_TAG_EN[tag] : tag;

let homePromise = null;
function envHome() { return homePromise ??= geocode(HOME_NAME).catch(() => null); }
// Heimatort: pro Request überschreibbar (Geolocation/Eingabe des Nutzers via ctx.home),
// sonst Fallback auf die ENV/Standard-Heimat (Berlin).
async function homeCoord(ctx) {
  const h = ctx && ctx.home;
  if (h && isFinite(h.lat) && isFinite(h.lon)) return { lat: h.lat, lon: h.lon };
  return envHome();
}

// Koordinaten eines Ziels: bevorzugt Wikivoyage (spart Nominatim-Anfragen), sonst Nominatim.
async function coordFor(art, name) {
  if (art?.coord) return art.coord;
  try { const g = await geocode(name); return g ? { lat: g.lat, lon: g.lon } : null; } catch { return null; }
}

// Stil-Tags + Heimat-Distanz-Chip zu einer Genre-Liste bündeln (Distanz ans Ende, damit
// die Cluster-Färbung weiter den Reisestil nimmt, nicht die eindeutige Kilometerzahl).
async function genresFor(tags, coord, ctx) {
  // (U-2d) Vibe-Tags in die UI-Sprache übersetzen und den Distanz-Chip lokalisieren
  // („{km} km ab Zuhause" ↔ „{km} km from home"). ctx.lang gibt es nur im explore()-Pfad;
  // im enrich()-Pfad reicht der Server keine Sprache durch -> dort bleibt es bei Deutsch.
  const lang = ctx?.lang === "en" ? "en" : "de";
  const g = tags.map((t) => vibe(t, lang));
  const h = await homeCoord(ctx);
  const km = h && coord ? haversineKm(h, coord) : null;
  if (km != null) g.push(lang === "en" ? `${fmtKm(km, lang)} km from home` : `${fmtKm(km, lang)} km ab Zuhause`);
  return g;
}

export default {
  id: "travel",
  key: null,

  config: {
    id: "travel",
    title: "Like Travel",
    brand: "like",
    item: { sing: "Reiseziel", plur: "Reiseziele" },
    searchPlaceholder: "Reiseziel suchen…   ( / )",
    searchTitle: "Reiseziel bei Wikivoyage suchen — lädt Ziele mit ähnlichem Stil + Nachbarziele (Taste /)",
    goTitle: "Reiseziel laden: ähnlicher Reisestil + gut kombinierbar + Vibe & Heimat-Distanz",
    exampleSeed: "Lissabon",
    // (U-2d) Drei kontrastierende Start-Ziele (Eigennamen, in DE/EN gleich geschrieben):
    // Tropen-Strand ↔ Alpen/Ski ↔ Wüsten-Metropole — zeigt die Stil-Achse gleich beim Einstieg.
    seedChips: ["Bali", "Zermatt", "Dubai"],
    emptyTitle: "Noch keine Reiseziele auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: ähnlicher Stil + Nachbarziele. Distanz zählt ab „" + HOME_NAME + "“.",
    edges: {
      similar: { label: "ähnlicher Reisestil (Wikivoyage)", count: "ähnlicher Vibe" },
      together: { label: "gut kombinierbar (≤ 10 km)", count: "Nachbarziele" },
    },
    popularity: { label: "Aufrufe", big: 40000, dimLabel: "Touristenmagnete dämpfen", dimTitle: "Sehr populäre Ziele (≥40k Wikivoyage-Aufrufe) abdunkeln — nur die Geheimtipps leuchten" },
    genreLabel: "Vibe",
    genreFilterPlaceholder: "Reisestil filtern…",
    statuses: [
      { value: "shortlist", label: "Wunschliste", color: "#000000" },
      { value: "contacted", label: "geplant", color: "#ff6a00" },
      { value: "confirmed", label: "war ich", color: "#1a9e54" },
      { value: "declined", label: "nichts für mich", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Beste Reisezeit, Anreise, Tipp, Idee…",
    similarLabel: "Ähnlicher Reisestil",
    togetherLabel: "Gut kombinierbar",
    contextLabel: "Ganz in der Nähe",
    contextHint: "(Wikivoyage)",
    contextButton: "Nachbarziele laden",
    contextWait: "Lade Nachbarziele …",
    basketLabel: "Reiseliste",
    likeLabel: "merken!",
    profileLabel: "Wikivoyage",
    searchLinks: [
      { cls: "", label: "Wikivoyage", url: "https://de.wikivoyage.org/wiki/Spezial:Suche?search={Q}" },
      { cls: "", label: "Karte", url: "https://www.openstreetmap.org/search?query={Q}" },
      { cls: "", label: "Bilder", url: "https://commons.wikimedia.org/w/index.php?search={Q}" },
    ],
    radarTitle: "Radar — Geheimtipps",
    radarTogetherReason: "liegt nah an deinem Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Reiseziel": "Destination",
      "Reiseziele": "Destinations",
      "Reiseziel suchen…   ( / )": "Search destination…   ( / )",
      "Reiseziel bei Wikivoyage suchen — lädt Ziele mit ähnlichem Stil + Nachbarziele (Taste /)": "Search destination on Wikivoyage - loads destinations with a similar style + nearby destinations (key /)",
      "Reiseziel laden: ähnlicher Reisestil + gut kombinierbar + Vibe & Heimat-Distanz": "Load destination: similar travel style + combines well + vibe & distance from home",
      "Noch keine Reiseziele auf der Karte": "No destinations on the map yet",
      // emptyHint wird oben aus HOME_NAME zusammengesetzt — hier identisch aufbauen, damit der exakte String matcht
      ["bringt gleich sein Umfeld mit: ähnlicher Stil + Nachbarziele. Distanz zählt ab „" + HOME_NAME + "“."]:
        "brings its surroundings along: similar style + nearby destinations. Distance measured from \"" + HOME_NAME + "\".",
      "ähnlicher Reisestil (Wikivoyage)": "similar travel style (Wikivoyage)",
      "ähnlicher Vibe": "similar vibe",
      "gut kombinierbar (≤ 10 km)": "combines well (within 10 km)",
      "Nachbarziele": "nearby destinations",
      "Aufrufe": "Views",
      "Touristenmagnete dämpfen": "Dim tourist magnets",
      "Sehr populäre Ziele (≥40k Wikivoyage-Aufrufe) abdunkeln — nur die Geheimtipps leuchten": "Dim very popular destinations (≥40k Wikivoyage views) - only the hidden gems glow",
      "Reisestil filtern…": "Filter travel styles…",
      "Wunschliste": "Wishlist",
      "geplant": "planned",
      "war ich": "been there",
      "nichts für mich": "not for me",
      "Notiz": "Note",
      "Beste Reisezeit, Anreise, Tipp, Idee…": "Best season, getting there, tip, idea…",
      "Ähnlicher Reisestil": "Similar travel style",
      "Gut kombinierbar": "Combines well",
      "Ganz in der Nähe": "Right nearby",
      "Nachbarziele laden": "Load nearby destinations",
      "Lade Nachbarziele …": "Loading nearby destinations …",
      "Reiseliste": "Travel list",
      "merken!": "save!",
      "Karte": "Map",
      "Bilder": "Images",
      "Radar — Geheimtipps": "Radar - hidden gems",
      "liegt nah an deinem Like": "lies close to your like",
      // (U-2d) Fehlermeldung mit {name}-Platzhalter — über tr() übersetzt, {name} wird ersetzt.
      "„{name}\" nicht bei Wikivoyage gefunden (Reiseziele)": "\"{name}\" not found on Wikivoyage (destinations)",
      // (U-2d) Vibe-Tags DE->EN aus der Single-Source-Map (lib/travel.mjs) einspiegeln.
      ...STYLE_TAG_EN,
    },
  },

  // (U-2d) Kleiner Sprach-Helfer: übersetzt einen deutschen Quellstring über das vorhandene
  // EN-Overlay (config.en). {name}-Platzhalter bleibt stehen und wird vom Aufrufer ersetzt.
  tr(lang, s) { return (lang === "en" && this.config.en[s]) ? this.config.en[s] : s; },

  async suggest(q) {
    try { return await suggestTitles(q, { limit: 6 }); } catch { return []; }
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): nur Stil-Nachbarn (blau),
  // ohne Geo-Umkreis/Genres — schneller als explore(). (U-2d) Bewusst OHNE Kosinus-Re-Rank:
  // der kostet je Peer einen Artikel-Abruf und bliebe auf dem latenzkritischen Brücken-Pfad zu
  // teuer; das Vektor-Re-Ranking der blauen Kandidaten passiert im explore()-Pfad.
  async similar(name, { limit = 14 } = {}) {
    const hit = await resolveTitle(name);
    if (!hit) return { canonical: name, similar: [] };
    const art = await article(hit.lang, hit.title);
    const { tags } = styleTags(art.wikitext);
    const peers = await styleSimilar(hit.lang, tags, hit.title, { limit: Math.min(limit, 14) });
    const seen = new Set();
    return {
      canonical: hit.title,
      similar: peers.filter((p) => !seen.has(p.title.toLowerCase()) && seen.add(p.title.toLowerCase()))
        .map((p, i) => ({ name: p.title, url: voyUrl(p.lang, p.title), match: Math.max(0.35, 0.75 - i * 0.03) })),
    };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, das UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): ähnlicher Reisestil (blau)
  // PLUS geografische Nähe (orange). Travel trennt bewusst Stil und Nähe — die Brücke nur
  // über Stil laufen zu lassen verschenkt die halbe Idee. Über Nähe beantwortet sie
  // „welches Ziel liegt zwischen A und B?". Beide Straßen best effort. Naben (große
  // Metropolen im Umkreis) werden beim Ranking über die Seitenaufrufe gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let hit; try { hit = await resolveTitle(name); } catch { return { canonical: name, list: [] }; }
    if (!hit) return { canonical: name, list: [] };
    const art = await article(hit.lang, hit.title).catch(() => null);
    if (!art) return { canonical: hit.title, list: [] };
    const { tags } = styleTags(art.wikitext);
    const coord = await coordFor(art, hit.title).catch(() => null);
    const [peers, near] = await Promise.all([
      styleSimilar(hit.lang, tags, hit.title, { limit: 14 }).catch(() => []),
      coord ? geoNearby(hit.lang, coord, hit.title, { limit: 14 }).catch(() => []) : Promise.resolve([]),
    ]);
    const seen = new Set([hit.title.toLowerCase()]), out = [];
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    peers.forEach((p, i) => add(p.title, voyUrl(p.lang, p.title), Math.max(0.35, 0.75 - i * 0.03)));                     // Reisestil
    near.forEach((n) => add(n.title, voyUrl(n.lang, n.title), n.km <= 20 ? 0.7 : n.km <= 50 ? 0.6 : n.km <= 90 ? 0.5 : 0.4)); // Nähe (näher = stärker)
    return { canonical: hit.title, list: out };
  },

  async explore(name, ctx) {
    const lang = ctx?.lang === "en" ? "en" : "de";
    const hit = await resolveTitle(name);
    if (!hit) throw new Error(this.tr(lang, `„{name}" nicht bei Wikivoyage gefunden (Reiseziele)`).replace("{name}", name));
    const art = await article(hit.lang, hit.title);
    const { tags, vector } = styleTags(art.wikitext);
    const coord = await coordFor(art, hit.title);

    const [peers, near] = await Promise.all([
      styleSimilar(hit.lang, tags, hit.title, { limit: 14 }),
      geoNearby(hit.lang, coord, hit.title, { limit: 14 }),
    ]);
    // (U-2d) BLAU nach Stil-Vektor-Ähnlichkeit re-ranken (Kosinus der styleTags-Vektoren) statt
    // bloßer Volltext-Suchreihenfolge; der match-Wert folgt danach dem echten Ähnlichkeits-Rang.
    const rankedPeers = await rankBySimilarStyle(vector, peers);

    const seenSim = new Set();
    const similar = rankedPeers.filter((p) => !seenSim.has(p.title.toLowerCase()) && seenSim.add(p.title.toLowerCase()))
      .map((p, i) => ({ name: p.title, url: voyUrl(p.lang, p.title), match: Math.max(0.35, 0.75 - i * 0.03) }));

    // ORANGE: Nähe = Kantengewicht. Ehrlich (U-2d): Die Geosuche liefert nur ≤10 km (MediaWiki-
    // Limit), also greift praktisch immer die oberste Stufe — die feineren Schwellen bleiben als
    // reversibler Vorrat, falls je ein größerer Radius machbar wird.
    const together = near.map((n) => ({
      name: n.title, url: voyUrl(n.lang, n.title),
      weight: n.km <= 20 ? 3 : n.km <= 50 ? 2.2 : n.km <= 90 ? 1.6 : 1,
    }));

    return {
      canonical: hit.title,
      url: voyUrl(hit.lang, hit.title),
      genres: await genresFor(tags, coord, ctx),
      // FB29/#97: Wikivoyage-Koordinaten fürs Info-Panel (kleine Karte „wo liegt das?") mit
      // durchreichen. Werden schon für „km ab Zuhause"/geoNearby berechnet — hier nur mitgeliefert.
      coord: coord && isFinite(coord.lat) && isFinite(coord.lon) ? { lat: coord.lat, lon: coord.lon } : null,
      similarSource: "wikivoyage",
      togetherSource: "wikivoyage",
      similar: similar.slice(0, 20),
      together: together.slice(0, 12),
      sources: ["wikivoyage", "openstreetmap"],
    };
  },

  async enrich(a, ctx) {
    const out = {};
    try {
      const hit = await resolveTitle(a.name);
      if (!hit) return out;
      const art = await article(hit.lang, hit.title);
      if (art.views) out.popularity = art.views;
      if (!a.url) out.url = voyUrl(hit.lang, hit.title);
      const { tags } = styleTags(art.wikitext);
      // Distanz nutzt Wikivoyage-Koordinaten (kein Nominatim-Aufruf pro Nachbar).
      if (!a.genres?.length || a.genres.length < 2) out.genres = await genresFor(tags, art.coord, ctx);
      // FB29/#97: Koordinaten auch für Nachbarknoten nachliefern (Info-Panel-Mini-Karte), falls das
      // Wikivoyage-Extrakt sie kennt — so bekommt nicht nur der gesuchte Seed eine Karte.
      if (art.coord && isFinite(art.coord.lat) && isFinite(art.coord.lon)) out.coord = { lat: art.coord.lat, lon: art.coord.lon };
    } catch {}
    return out;
  },

  // Heimatort aus Nutzer-Eingabe zu Koordinaten auflösen (für den „Heimat-Distanz"-Chip).
  async geocodeHome(q) {
    try { const g = await geocode(String(q || "").trim()); return g ? { name: g.name || String(q).trim(), lat: g.lat, lon: g.lon } : null; }
    catch { return null; }
  },

  async popularity(name) {
    try {
      const hit = await resolveTitle(name);
      if (!hit) return null;
      const art = await article(hit.lang, hit.title);
      return art.views || null;
    } catch { return null; }
  },

  // „Ganz in der Nähe": direkte Nachbarn (≤10 km) als Liste. Ehrlich (U-2d): kein weiter
  // Umkreis — die MediaWiki-Geosuche deckt nur ≤10 km ab (radiusKm wird in geoNearby gekappt).
  // Der Server reicht hier keine UI-Sprache durch -> die Laufzeit-Strings bleiben Deutsch.
  async context(name) {
    const hit = await resolveTitle(name);
    if (!hit) return { groups: [] };
    const art = await article(hit.lang, hit.title);
    const coord = await coordFor(art, hit.title);
    const near = await geoNearby(hit.lang, coord, hit.title, { limit: 14 });
    if (!near.length) return { groups: [] };
    return {
      note: `Nachbarziele um ${hit.title}`,
      groups: [{
        label: "Ganz in der Nähe",
        items: near.map((n) => ({ name: n.title, sub: `${fmtKm(n.km)} km entfernt` })),
      }],
    };
  },

  async diag() {
    return [
      { name: "Nominatim (OpenStreetMap)", probe: async () => !!(await geocode("Lissabon")) },
      { name: "Wikivoyage Suche", probe: async () => !!(await resolveTitle("Lissabon")) },
      { name: "Wikivoyage Geosuche", probe: async () => {
          const h = await resolveTitle("Lissabon"); const art = await article(h.lang, h.title);
          return (await geoNearby(h.lang, art.coord, h.title)).length >= 0;
        } },
    ];
  },
};
