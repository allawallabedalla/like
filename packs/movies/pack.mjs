// packs/movies/pack.mjs — Film-Nachbarschaften über TMDB (Gratis-Key nötig).
//   blau   = inhaltlich ähnlich (TMDB /similar: Genres/Keywords)
//   orange = "Leute schauten auch" (TMDB /recommendations: echtes Nutzerverhalten —
//            das freie Äquivalent zu "wurde zusammen gekauft")
// Popularität = vote_count (wie viele Menschen bewertet haben).
// Anzeigename: "Titel (Jahr)" — hält Remakes auseinander.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { getKey } from "../../lib/keys.mjs";
import { surpriseFrom } from "../../lib/surprise.mjs";

// „Überrasch mich" (Kaltstart): kuratierter Pool eher kleiner/leiser Filme abseits der
// Blockbuster. surprise() nimmt den mit den WENIGSTEN Bewertungen -> echte Entdeckung.
const SURPRISE_SEEDS = [
  "Stalker (1979)", "Wings of Desire (1987)", "In the Mood for Love (2000)", "Le Samouraï (1967)",
  "Come and See (1985)", "Wild Strawberries (1957)", "Paterson (2016)", "The Fall (2006)",
  "Under the Skin (2013)", "A Ghost Story (2017)", "Columbus (2017)", "First Cow (2019)",
  "Leave No Trace (2018)", "The Rider (2017)", "Embrace of the Serpent (2015)", "Ida (2013)",
  "Toni Erdmann (2016)", "Victoria (2015)", "System Crasher (2019)", "Aftersun (2022)",
  "Perfect Days (2023)", "The Green Ray (1986)", "Cléo from 5 to 7 (1962)", "Wanda (1970)",
  "Beau Travail (1999)", "Ratcatcher (1999)", "Morvern Callar (2002)", "Fish Tank (2009)",
];

const TMDB = "https://api.themoviedb.org/3";
const KEY_INFO = { envVar: "TMDB_API_KEY", file: ".tmdb-key", name: "TMDB", createUrl: "https://www.themoviedb.org/settings/api" };

const display = (m) => m.release_date ? `${m.title} (${m.release_date.slice(0, 4)})` : m.title;
const stripYear = (name) => String(name).replace(/\s*\((19|20)\d\d\)\s*$/, "").trim();

async function api(path, params = {}) {
  const key = await getKey(KEY_INFO); // wirft mit "API-Key" im Text -> Frontend öffnet den Dialog
  const u = new URL(TMDB + path);
  u.searchParams.set("api_key", key);
  u.searchParams.set("language", "de-DE");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return jfetch(u.href);
}

async function searchMovie(name) {
  return cached("tmdb-search", name, 7 * 864e5, async () => {
    const year = name.match(/\((\d{4})\)\s*$/)?.[1];
    const j = await api("/search/movie", { query: stripYear(name), ...(year ? { year } : {}) });
    return j.results?.[0] || null;
  });
}

export default {
  id: "movies",
  key: { ...KEY_INFO, pattern: "^[a-f0-9]{32}$", hint: "Für die Live-Suche braucht like movies einen kostenlosen TMDB-API-Key (Konto anlegen → Einstellungen → API)." },

  config: {
    id: "movies",
    title: "Like Movies",
    brand: "like",
    item: { sing: "Film", plur: "Filme" },
    searchPlaceholder: "Film suchen…   ( / )",
    searchTitle: "Film bei TMDB suchen — lädt inhaltlich Ähnliches + „Leute schauten auch“ (Taste /)",
    goTitle: "Film laden: inhaltlich ähnlich + Leute schauten auch + Genres",
    exampleSeed: "Paris, Texas (1984)",
    emptyTitle: "Noch keine Filme auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: inhaltlich Ähnliches + „Leute schauten auch“.",
    edges: {
      similar: { label: "inhaltlich ähnlich (TMDB)", count: "ähnliche" },
      together: { label: "Leute schauten auch (TMDB)", count: "auch geschaut" },
    },
    popularity: { label: "Bewertungen", big: 5000, dimLabel: "Blockbuster dämpfen", dimTitle: "Filme mit ≥5k TMDB-Bewertungen abdunkeln — nur die Entdeckungen leuchten" },
    genreLabel: "Genres",
    genreFilterPlaceholder: "Genre filtern…",
    statuses: [
      { value: "shortlist", label: "Watchlist", color: "#000000" },
      { value: "contacted", label: "angefangen", color: "#ff6a00" },
      { value: "confirmed", label: "gesehen", color: "#1a9e54" },
      { value: "declined", label: "kein Interesse", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Empfohlen von, wo streambar, Gedanken…",
    similarLabel: "Inhaltlich ähnlich",
    togetherLabel: "Leute schauten auch",
    contextLabel: "Vom selben Regisseur",
    contextHint: "(TMDB)",
    contextButton: "Regie-Umfeld laden",
    contextWait: "Lade Regie-Umfeld …",
    basketLabel: "Watchlist",
    likeLabel: "merken!",
    profileLabel: "TMDB",
    searchLinks: [
      { cls: "", label: "JustWatch", url: "https://www.justwatch.com/de/Suche?q={Q}" },
      { cls: "yt", label: "YouTube (Trailer)", url: "https://www.youtube.com/results?search_query={Q}+trailer" },
    ],
    radarTitle: "Radar — Film-Geheimtipps",
    radarTogetherReason: "wird mit deinem Like zusammen geschaut",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: { name: "TMDB-Key", createUrl: "https://www.themoviedb.org/settings/api", hint: "Für die Live-Suche braucht like movies einen kostenlosen TMDB-API-Key (Konto → Einstellungen → API → „API Key (v3 auth)“)." },
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Film": "Movie",
      "Filme": "Movies",
      "Film suchen…   ( / )": "Search movie…   ( / )",
      "Film bei TMDB suchen — lädt inhaltlich Ähnliches + „Leute schauten auch“ (Taste /)": "Search movie on TMDB - loads similar content + \"people also watched\" (key /)",
      "Film laden: inhaltlich ähnlich + Leute schauten auch + Genres": "Load movie: similar content + people also watched + genres",
      "Noch keine Filme auf der Karte": "No movies on the map yet",
      "bringt gleich sein Umfeld mit: inhaltlich Ähnliches + „Leute schauten auch“.": "brings its surroundings along: similar content + \"people also watched\".",
      "inhaltlich ähnlich (TMDB)": "similar content (TMDB)",
      "ähnliche": "similar",
      "Leute schauten auch (TMDB)": "people also watched (TMDB)",
      "auch geschaut": "also watched",
      "Bewertungen": "Ratings",
      "Blockbuster dämpfen": "Dim blockbusters",
      "Filme mit ≥5k TMDB-Bewertungen abdunkeln — nur die Entdeckungen leuchten": "Dim movies with ≥5k TMDB ratings - only the discoveries glow",
      "Genre filtern…": "Filter genres…",
      "angefangen": "started",
      "gesehen": "watched",
      "kein Interesse": "not interested",
      "Notiz": "Note",
      "Empfohlen von, wo streambar, Gedanken…": "Recommended by, where to stream, thoughts…",
      "Inhaltlich ähnlich": "Similar content",
      "Leute schauten auch": "People also watched",
      "Vom selben Regisseur": "By the same director",
      "Regie-Umfeld laden": "Load director context",
      "Lade Regie-Umfeld …": "Loading director context …",
      "merken!": "save!",
      "YouTube (Trailer)": "YouTube (trailer)",
      "Radar — Film-Geheimtipps": "Radar - hidden movie gems",
      "wird mit deinem Like zusammen geschaut": "watched together with your like",
      "TMDB-Key": "TMDB key",
      "Für die Live-Suche braucht like movies einen kostenlosen TMDB-API-Key (Konto → Einstellungen → API → „API Key (v3 auth)“).": "For live search, like movies needs a free TMDB API key (account → settings → API → \"API Key (v3 auth)\").",
    },
  },

  async suggest(q) {
    return cached("tmdb-suggest", q, 864e5, async () => {
      const j = await api("/search/movie", { query: q });
      const seen = new Set();
      return (j.results || []).slice(0, 6).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): nur /similar,
  // ohne Details/Recommendations — deutlich schneller als explore().
  async similar(name, { limit = 20 } = {}) {
    const hit = await searchMovie(name);
    if (!hit) return { canonical: name, similar: [] };
    const sim = await cached("tmdb-sim", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}/similar`));
    return {
      canonical: display(hit),
      similar: (sim.results || []).slice(0, limit).map((m, i) => ({
        name: display(m), url: `https://www.themoviedb.org/movie/${m.id}`, match: Math.max(0.3, 0.8 - i * 0.03),
      })),
    };
  },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): inhaltlich ähnlich (/similar,
  // Genre/Keywords) PLUS „Leute schauten auch" (/recommendations, VERHALTENSbasiert). Die
  // /similar-Straße bleibt fast immer im Genre; /recommendations kommt aus echtem
  // Nutzerverhalten und überbrückt Genregrenzen (Arthouse ↔ Blockbuster, die dasselbe
  // Publikum teilen) — genau die Verbindungen, die reine Genre-Ähnlichkeit nie zeigt.
  // Beide TMDB-Endpunkte, best effort (fällt bei Ausfall sauber auf die andere Straße
  // zurück). Naben (Blockbuster, die überall empfohlen werden) werden nicht hier, sondern
  // beim Ranking über vote_count (`popularity.big`) + „klein/spannend"-Regler gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let hit; try { hit = await searchMovie(name); } catch { return { canonical: name, list: [] }; }
    if (!hit) return { canonical: name, list: [] };
    const [sim, recs] = await Promise.all([
      cached("tmdb-sim", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}/similar`)).catch(() => null),
      cached("tmdb-rec", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}/recommendations`)).catch(() => null),
    ]);
    const out = [], seen = new Set([display(hit).toLowerCase()]);
    const add = (m, match) => { const nm = display(m); const k = nm.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ name: nm, url: `https://www.themoviedb.org/movie/${m.id}`, match }); };
    (sim?.results || []).slice(0, limit).forEach((m, i) => add(m, Math.max(0.3, 0.8 - i * 0.03)));   // Genre-ähnlich
    (recs?.results || []).slice(0, 20).forEach((m, i) => add(m, Math.max(0.4, 0.75 - i * 0.02)));     // Verhalten (crosst Genres)
    return { canonical: display(hit), list: out };
  },

  async explore(name) {
    const hit = await searchMovie(name);
    if (!hit) throw new Error(`„${name}" nicht bei TMDB gefunden`);
    const [details, similar, recs] = await Promise.all([
      cached("tmdb-det", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}`)),
      cached("tmdb-sim", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}/similar`)),
      cached("tmdb-rec", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}/recommendations`)),
    ]);
    const url = `https://www.themoviedb.org/movie/${hit.id}`;
    return {
      canonical: display(details),
      url,
      genres: (details.genres || []).map((g) => g.name).slice(0, 6),
      similarSource: "tmdb",
      togetherSource: "tmdb",
      similar: (similar.results || []).slice(0, 15).map((m, i) => ({
        name: display(m), url: `https://www.themoviedb.org/movie/${m.id}`, match: Math.max(0.3, 0.8 - i * 0.03),
      })),
      // Recommendations sind verhaltensbasiert — Reihenfolge = Stärke, als Gewicht abbilden
      together: (recs.results || []).slice(0, 15).map((m, i) => ({
        name: display(m), url: `https://www.themoviedb.org/movie/${m.id}`, weight: Math.max(1, 5 - Math.floor(i / 3)),
      })),
      sources: ["tmdb"],
    };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, der UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  async enrich(a) {
    const out = {};
    try {
      const hit = await searchMovie(a.name);
      if (hit) {
        const details = await cached("tmdb-det", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}`));
        if (!a.genres?.length) out.genres = (details.genres || []).map((g) => g.name).slice(0, 6);
        if (details.vote_count) out.popularity = details.vote_count;
        if (!a.url) out.url = `https://www.themoviedb.org/movie/${hit.id}`;
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const hit = await searchMovie(name);
    if (!hit) return null;
    const details = await cached("tmdb-det", hit.id, 14 * 864e5, () => api(`/movie/${hit.id}`));
    return details.vote_count || null;
  },

  // "Vom selben Regisseur": Credits -> Regie -> deren bekannteste Filme.
  async context(name) {
    const hit = await searchMovie(name);
    if (!hit) return { groups: [] };
    const credits = await cached("tmdb-cred", hit.id, 30 * 864e5, () => api(`/movie/${hit.id}/credits`));
    const director = (credits.crew || []).find((c) => c.job === "Director");
    if (!director) return { groups: [] };
    const cr = await cached("tmdb-person", director.id, 30 * 864e5, () => api(`/person/${director.id}/movie_credits`));
    const directed = (cr.crew || []).filter((c) => c.job === "Director" && c.id !== hit.id)
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)).slice(0, 12);
    return {
      note: `Regie: ${director.name}`,
      groups: [{
        label: "Weitere Filme",
        items: directed.map((m) => ({ name: display(m), sub: m.vote_count ? `${m.vote_count} Bewertungen` : "" })),
      }],
    };
  },

  async diag() {
    return [
      { name: "TMDB Suche", probe: async () => !!(await searchMovie("Alien (1979)")) },
      { name: "TMDB Recommendations", probe: async () => { const h = await searchMovie("Alien (1979)"); const r = await api(`/movie/${h.id}/recommendations`); return (r.results || []).length > 0; } },
    ];
  },
};
