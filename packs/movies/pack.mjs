// packs/movies/pack.mjs — Film-Nachbarschaften über TMDB (Gratis-Key nötig).
//   blau   = inhaltlich ähnlich (TMDB /similar: Genres/Keywords)
//   orange = "Leute schauten auch" (TMDB /recommendations: echtes Nutzerverhalten —
//            das freie Äquivalent zu "wurde zusammen gekauft")
// Popularität = vote_count (wie viele Menschen bewertet haben).
// Anzeigename: "Titel (Jahr)" — hält Remakes auseinander.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { getKey } from "../../lib/keys.mjs";

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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
    key: { name: "TMDB-Key", createUrl: "https://www.themoviedb.org/settings/api", hint: "Für die Live-Suche braucht like movies einen kostenlosen TMDB-API-Key (Konto → Einstellungen → API → „API Key (v3 auth)“)." },
  },

  async suggest(q) {
    return cached("tmdb-suggest", q, 864e5, async () => {
      const j = await api("/search/movie", { query: q });
      const seen = new Set();
      return (j.results || []).slice(0, 6).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
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
