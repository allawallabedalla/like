// packs/travel/pack.mjs — Like Travel: Reiseziele entdecken über zwei unabhängige Achsen.
//   blau   = ähnlicher Reisestil (gleicher „Vibe": Strand/Berge/Kultur/Party/… — via
//            Wikivoyage-Volltextsuche nach dem Stil, bewusst OHNE Geo-Bezug)
//   orange = gut kombinierbar (Nachbarziele im Umkreis — Wikivoyage-Geosuche)
// Zwei Kriterien, wie gewünscht getrennt:
//   • Heimat-Distanz  = Luftlinie zum Heimatort (Standard „Berlin, Deutschland",
//     überschreibbar per ENV LIKE_TRAVEL_HOME) — erscheint als Chip am Ziel.
//   • Stil-Abweichung = trägt der Graph selbst: nahe blaue Nachbarn = ähnlicher Stil.
//     Türkei-All-inclusive ↔ Alpen-Bergtour liegen geografisch nah, im Stil aber weit.
// Alles aus freien Quellen (OpenStreetMap/Nominatim + Wikivoyage), kein Key.
// Popularität = Wikivoyage-Seitenaufrufe (bester freier Nachfrage-Indikator).

import {
  geocode, haversineKm, resolveTitle, suggestTitles, article, styleTags,
  styleSimilar, geoNearby, voyUrl,
} from "../../lib/travel.mjs";

const HOME_NAME = (process.env.LIKE_TRAVEL_HOME || "Berlin, Deutschland").trim();
const fmtKm = (km) => km.toLocaleString("de-DE");

let homePromise = null;
function home() { return homePromise ??= geocode(HOME_NAME).catch(() => null); }

// Koordinaten eines Ziels: bevorzugt Wikivoyage (spart Nominatim-Anfragen), sonst Nominatim.
async function coordFor(art, name) {
  if (art?.coord) return art.coord;
  try { const g = await geocode(name); return g ? { lat: g.lat, lon: g.lon } : null; } catch { return null; }
}

// Stil-Tags + Heimat-Distanz-Chip zu einer Genre-Liste bündeln (Distanz ans Ende, damit
// die Cluster-Färbung weiter den Reisestil nimmt, nicht die eindeutige Kilometerzahl).
async function genresFor(tags, coord) {
  const g = [...tags];
  const h = await home();
  const km = h && coord ? haversineKm(h, coord) : null;
  if (km != null) g.push(`${fmtKm(km)} km ab Zuhause`);
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
    emptyTitle: "Noch keine Reiseziele auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: ähnlicher Stil + Nachbarziele. Distanz zählt ab „" + HOME_NAME + "“.",
    edges: {
      similar: { label: "ähnlicher Reisestil (Wikivoyage)", count: "ähnlicher Vibe" },
      together: { label: "gut kombinierbar (in der Nähe)", count: "Nachbarziele" },
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
    contextLabel: "In der Region",
    contextHint: "(Wikivoyage)",
    contextButton: "Region laden",
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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
    key: null,
  },

  async suggest(q) {
    try { return await suggestTitles(q, { limit: 6 }); } catch { return []; }
  },

  async explore(name) {
    const hit = await resolveTitle(name);
    if (!hit) throw new Error(`„${name}" nicht bei Wikivoyage gefunden (Reiseziele)`);
    const art = await article(hit.lang, hit.title);
    const { tags } = styleTags(art.wikitext);
    const coord = await coordFor(art, hit.title);

    const [peers, near] = await Promise.all([
      styleSimilar(hit.lang, tags, hit.title, { limit: 14 }),
      geoNearby(hit.lang, coord, hit.title, { limit: 14 }),
    ]);

    const seenSim = new Set();
    const similar = peers.filter((p) => !seenSim.has(p.title.toLowerCase()) && seenSim.add(p.title.toLowerCase()))
      .map((p, i) => ({ name: p.title, url: voyUrl(p.lang, p.title), match: Math.max(0.35, 0.75 - i * 0.03) }));

    // näher = höheres Gewicht (dickere orange Kante)
    const together = near.map((n) => ({
      name: n.title, url: voyUrl(n.lang, n.title),
      weight: n.km <= 20 ? 3 : n.km <= 50 ? 2.2 : n.km <= 90 ? 1.6 : 1,
    }));

    return {
      canonical: hit.title,
      url: voyUrl(hit.lang, hit.title),
      genres: await genresFor(tags, coord),
      similarSource: "wikivoyage",
      togetherSource: "wikivoyage",
      similar: similar.slice(0, 20),
      together: together.slice(0, 12),
      sources: ["wikivoyage", "openstreetmap"],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const hit = await resolveTitle(a.name);
      if (!hit) return out;
      const art = await article(hit.lang, hit.title);
      if (art.views) out.popularity = art.views;
      if (!a.url) out.url = voyUrl(hit.lang, hit.title);
      const { tags } = styleTags(art.wikitext);
      // Distanz nutzt Wikivoyage-Koordinaten (kein Nominatim-Aufruf pro Nachbar).
      if (!a.genres?.length || a.genres.length < 2) out.genres = await genresFor(tags, art.coord);
    } catch {}
    return out;
  },

  async popularity(name) {
    try {
      const hit = await resolveTitle(name);
      if (!hit) return null;
      const art = await article(hit.lang, hit.title);
      return art.views || null;
    } catch { return null; }
  },

  // „In der Region": Nachbarziele im weiteren Umkreis als Liste.
  async context(name) {
    const hit = await resolveTitle(name);
    if (!hit) return { groups: [] };
    const art = await article(hit.lang, hit.title);
    const coord = await coordFor(art, hit.title);
    const near = await geoNearby(hit.lang, coord, hit.title, { radiusKm: 250, limit: 14 });
    if (!near.length) return { groups: [] };
    return {
      note: `Nachbarziele um ${hit.title}`,
      groups: [{
        label: "In der Region",
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
