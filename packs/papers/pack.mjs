// packs/papers/pack.mjs — Paper-/Forschungs-Nachbarschaften über OpenAlex (offen, kein Key).
//   blau   = inhaltlich verwandt (OpenAlex related_works)
//   orange = von denselben Autor:innen (weitere Werke der Ko-Autor:innen — Ko-Autorschaft
//            ist hier wörtlich "zusammen aufgetreten")
// Popularität = cited_by_count; Momentum kommt aus counts_by_year (Zitationsgeschwindigkeit).
// Höflichkeit: OpenAlex bittet um eine mailto — via ENV OPENALEX_MAILTO ergänzbar.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";

const OA = "https://api.openalex.org";
const MAILTO = process.env.OPENALEX_MAILTO || "";

const shortId = (idUrl) => String(idUrl || "").split("/").pop();
// Anzeigename: "Titel (Erstautor Jahr)" — knapp, hält gleichnamige Titel auseinander.
function display(w) {
  const author = w.authorships?.[0]?.author?.display_name;
  const parts = [w.title || w.display_name || "(ohne Titel)"];
  const tag = [author, w.publication_year].filter(Boolean).join(" ");
  return tag ? `${parts[0]} (${tag})` : parts[0];
}
const cleanTitle = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();

async function oa(path, params = {}) {
  const u = new URL(OA + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (MAILTO) u.searchParams.set("mailto", MAILTO);
  return jfetch(u.href);
}

async function searchWork(name) {
  return cached("oa-search", name, 14 * 864e5, async () => {
    const j = await oa("/works", { search: cleanTitle(name), "per-page": "1" });
    return j.results?.[0] || null;
  });
}
async function workById(id) {
  return cached("oa-work", id, 30 * 864e5, () => oa(`/works/${id}`));
}

export default {
  id: "papers",
  key: null,

  config: {
    id: "papers",
    title: "Like Papers",
    brand: "like",
    item: { sing: "Paper", plur: "Paper" },
    searchPlaceholder: "Paper / Thema suchen…   ( / )",
    searchTitle: "Paper bei OpenAlex suchen — lädt verwandte Arbeiten + Werke der Autor:innen (Taste /)",
    goTitle: "Paper laden: inhaltlich verwandt + von denselben Autor:innen + Themen",
    exampleSeed: "Attention Is All You Need",
    emptyTitle: "Noch keine Paper auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: verwandte Arbeiten + Werke der Autor:innen.",
    edges: {
      similar: { label: "inhaltlich verwandt (OpenAlex)", count: "verwandte" },
      together: { label: "von denselben Autor:innen", count: "von den Autor:innen" },
    },
    popularity: { label: "Zitationen", big: 1000, dimLabel: "Vielzitierte dämpfen", dimTitle: "Sehr häufig zitierte Arbeiten abdunkeln — nur die Nischen leuchten" },
    genreLabel: "Themen",
    genreFilterPlaceholder: "Thema filtern…",
    statuses: [
      { value: "shortlist", label: "Leseliste", color: "#000000" },
      { value: "contacted", label: "am Lesen", color: "#ff6a00" },
      { value: "confirmed", label: "gelesen", color: "#1a9e54" },
      { value: "declined", label: "nicht relevant", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Kernaussage, Zitat, Bezug zu meiner Arbeit…",
    similarLabel: "Inhaltlich verwandt",
    togetherLabel: "Von denselben Autor:innen",
    contextLabel: "Mehr von den Autor:innen",
    contextHint: "(OpenAlex)",
    contextButton: "Autor:innen-Umfeld laden",
    contextWait: "Lade Autor:innen-Umfeld …",
    basketLabel: "Leseliste",
    likeLabel: "merken!",
    profileLabel: "OpenAlex",
    searchLinks: [
      { cls: "", label: "Google Scholar", url: "https://scholar.google.com/scholar?q={Q}" },
      { cls: "", label: "Semantic Scholar", url: "https://www.semanticscholar.org/search?q={Q}" },
    ],
    radarTitle: "Radar — aufstrebende Arbeiten",
    radarTogetherReason: "teilt Autor:innen mit deinem Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
    key: null,
  },

  async suggest(q) {
    return cached("oa-suggest", q, 864e5, async () => {
      const j = await oa("/works", { search: q, "per-page": "6" });
      const seen = new Set();
      return (j.results || []).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, 6);
    });
  },

  async explore(name) {
    const hit = await searchWork(name);
    if (!hit) throw new Error(`„${name}" nicht bei OpenAlex gefunden`);
    const topics = (hit.topics || hit.concepts || []).map((t) => t.display_name).slice(0, 6);

    // blau: related_works (OpenAlex hält bis zu ~10 vor)
    const relIds = (hit.related_works || []).slice(0, 12).map(shortId);
    const rel = [];
    for (const id of relIds) {
      try { const w = await workById(id); rel.push({ name: display(w), url: w.id, match: 0.6 }); } catch {}
    }

    // orange: weitere Werke der (Ko-)Autor:innen — Ko-Autorschaft
    const together = [], seen = new Set([shortId(hit.id)]);
    const authorIds = (hit.authorships || []).slice(0, 2).map((a) => shortId(a.author?.id)).filter(Boolean);
    for (const aid of authorIds) {
      try {
        const j = await cached("oa-authorworks", aid + "|8", 14 * 864e5, () => oa("/works", { filter: `author.id:${aid}`, sort: "cited_by_count:desc", "per-page": "8" }));
        for (const w of j.results || []) {
          const sid = shortId(w.id);
          if (seen.has(sid)) continue;
          seen.add(sid);
          together.push({ name: display(w), url: w.id, weight: 1 });
        }
      } catch {}
    }

    return {
      canonical: display(hit),
      url: hit.id,
      genres: topics,
      similarSource: "openalex",
      togetherSource: "openalex",
      similar: rel.slice(0, 15),
      together: together.slice(0, 12),
      sources: ["openalex"],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const w = await searchWork(a.name);
      if (w) {
        if (w.cited_by_count != null) out.popularity = w.cited_by_count;
        if (!a.url) out.url = w.id;
        if (!a.genres?.length) out.genres = (w.topics || w.concepts || []).map((t) => t.display_name).slice(0, 6);
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const w = await searchWork(name);
    return w?.cited_by_count ?? null;
  },

  async context(name) {
    const hit = await searchWork(name);
    const author = hit?.authorships?.[0]?.author;
    if (!author) return { groups: [] };
    const aid = shortId(author.id);
    const j = await cached("oa-authorworks", aid + "|12", 14 * 864e5, () => oa("/works", { filter: `author.id:${aid}`, sort: "cited_by_count:desc", "per-page": "12" }));
    return {
      note: `Autor:in: ${author.display_name}`,
      groups: [{
        label: "Meistzitierte Werke",
        items: (j.results || []).filter((w) => shortId(w.id) !== shortId(hit.id))
          .map((w) => ({ name: display(w), sub: `${w.cited_by_count || 0} Zitationen` })),
      }],
    };
  },

  async diag() {
    return [
      { name: "OpenAlex Suche", probe: async () => !!(await searchWork("Attention Is All You Need")) },
      { name: "OpenAlex related_works", probe: async () => { const w = await searchWork("Attention Is All You Need"); return (w.related_works || []).length > 0; } },
    ];
  },
};
