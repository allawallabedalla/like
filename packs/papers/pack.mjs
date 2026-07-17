// packs/papers/pack.mjs — Paper-/Forschungs-Nachbarschaften über OpenAlex (offen, kein Key).
//   blau   = Semantic-Scholar-Empfehlungen (SPECTER-Embeddings, gratis/ohne Key, braucht eine
//            DOI) — deutlich treffsicherer als OpenAlex' related_works (eine statische ~10er-
//            Liste aus reiner Konzept-Überlappung). Fehlt die DOI oder liefert S2 nichts,
//            fällt explore()/similar() auf related_works zurück.
//   orange = von denselben Autor:innen (weitere Werke der Ko-Autor:innen — Ko-Autorschaft
//            ist hier wörtlich "zusammen aufgetreten")
// Popularität = cited_by_count; Momentum kommt aus counts_by_year (Zitationsgeschwindigkeit).
// Höflichkeit: OpenAlex bittet um eine mailto — via ENV OPENALEX_MAILTO ergänzbar.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";

import { surpriseFrom } from "../../lib/surprise.mjs";

const OA = "https://api.openalex.org";

// „Überrasch mich" (Kaltstart): kuratierter Pool prägender Arbeiten quer durch die
// Disziplinen. surprise() nimmt die mit den WENIGSTEN Zitationen -> eher eine Entdeckung.
const SURPRISE_SEEDS = [
  "As We May Think", "Computing Machinery and Intelligence", "The Tragedy of the Commons",
  "The Strength of Weak Ties", "The Market for Lemons", "Prospect Theory: An Analysis of Decision under Risk",
  "A Relational Model of Data for Large Shared Data Banks", "On Computable Numbers",
  "The Use of Knowledge in Society", "Time, Clocks, and the Ordering of Events in a Distributed System",
  "End-to-End Arguments in System Design", "The Anatomy of a Large-Scale Hypertextual Web Search Engine",
  "The Byzantine Generals Problem", "New Directions in Cryptography",
  "Collective dynamics of 'small-world' networks", "Emergence of Scaling in Random Networks",
  "Why Most Published Research Findings Are False", "The Hallmarks of Cancer",
  "Long Short-Term Memory", "Random Forests", "Latent Dirichlet Allocation",
  "A Mathematical Theory of Communication", "The Mythical Man-Month", "No Silver Bullet",
];
const MAILTO = process.env.OPENALEX_MAILTO || "";
const S2_RECS = "https://api.semanticscholar.org/recommendations/v1/papers/forpaper";

const shortId = (idUrl) => String(idUrl || "").split("/").pop();
// DOI aus dem OpenAlex-Work-Objekt ziehen (mal Top-Level-Feld, mal unter ids.doi).
const doiOf = (w) => {
  const raw = w?.doi || w?.ids?.doi || null;
  return raw ? String(raw).replace(/^https?:\/\/doi\.org\//i, "") : null;
};
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

// Semantic Scholar (SPECTER-Embeddings) statt OpenAlex' related_works. Öffentlich dokumentiert,
// aber ohne Key stark gedrosselt geteilt genutzt -> großzügiger gapMs (wie Nominatim in
// lib/travel.mjs) + langlebiger Cache. Scheitert es (Rate-Limit, keine DOI-Übereinstimmung,
// Formatänderung), gibt es still [] zurück -> Aufrufer fällt auf related_works zurück.
async function s2Recommendations(doi, { limit = 12 } = {}) {
  return cached("s2-recs", doi + "|" + limit, 14 * 864e5, async () => {
    try {
      const u = new URL(`${S2_RECS}/DOI:${encodeURIComponent(doi)}`);
      u.searchParams.set("fields", "title,externalIds");
      u.searchParams.set("limit", String(limit));
      const j = await jfetch(u.href, { gapMs: 1100, timeout: 10000 });
      return (j.recommendedPapers || [])
        .filter((p) => p?.title)
        .map((p) => ({ name: p.title, url: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : null }));
    } catch { return []; }
  });
}

export default {
  id: "papers",
  key: null,

  config: {
    id: "papers",
    // FB26/#94: Anzeigename „Science" statt „Papers" (wurde als „Papier" missverstanden). Pack-ID
    // und URL ?pack=papers bleiben unverändert — nur das sichtbare Label ändert sich.
    title: "Like Science",
    brand: "like",
    item: { sing: "Paper", plur: "Paper" },
    searchPlaceholder: "Paper / Thema suchen…   ( / )",
    searchTitle: "Paper bei OpenAlex suchen — lädt verwandte Arbeiten + Werke der Autor:innen (Taste /)",
    goTitle: "Paper laden: inhaltlich verwandt + von denselben Autor:innen + Themen",
    exampleSeed: "Attention Is All You Need",
    emptyTitle: "Noch keine Paper auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: verwandte Arbeiten + Werke der Autor:innen.",
    edges: {
      similar: { label: "inhaltlich verwandt (Semantic Scholar)", count: "verwandte" },
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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Paper / Thema suchen…   ( / )": "Search paper / topic…   ( / )",
      "Paper bei OpenAlex suchen — lädt verwandte Arbeiten + Werke der Autor:innen (Taste /)": "Search paper on OpenAlex - loads related works + works by the authors (key /)",
      "Paper laden: inhaltlich verwandt + von denselben Autor:innen + Themen": "Load paper: related content + by the same authors + topics",
      "Noch keine Paper auf der Karte": "No papers on the map yet",
      "bringt gleich sein Umfeld mit: verwandte Arbeiten + Werke der Autor:innen.": "brings its surroundings along: related works + works by the authors.",
      "inhaltlich verwandt (Semantic Scholar)": "related content (Semantic Scholar)",
      "verwandte": "related",
      "von denselben Autor:innen": "by the same authors",
      "von den Autor:innen": "by the authors",
      "Zitationen": "Citations",
      "Vielzitierte dämpfen": "Dim highly cited",
      "Sehr häufig zitierte Arbeiten abdunkeln — nur die Nischen leuchten": "Dim very frequently cited works - only the niches glow",
      "Themen": "Topics",
      "Thema filtern…": "Filter topics…",
      "Leseliste": "Reading list",
      "am Lesen": "reading",
      "gelesen": "read",
      "nicht relevant": "not relevant",
      "Notiz": "Note",
      "Kernaussage, Zitat, Bezug zu meiner Arbeit…": "Key point, quote, relation to my work…",
      "Inhaltlich verwandt": "Related content",
      "Von denselben Autor:innen": "By the same authors",
      "Mehr von den Autor:innen": "More by the authors",
      "Autor:innen-Umfeld laden": "Load author context",
      "Lade Autor:innen-Umfeld …": "Loading author context …",
      "merken!": "save!",
      "Radar — aufstrebende Arbeiten": "Radar - rising works",
      "teilt Autor:innen mit deinem Like": "shares authors with your like",
    },
  },

  async suggest(q) {
    return cached("oa-suggest", q, 864e5, async () => {
      const j = await oa("/works", { search: q, "per-page": "6" });
      const seen = new Set();
      return (j.results || []).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, 6);
    });
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): S2-Empfehlungen (DOI nötig),
  // sonst related_works, ohne Ko-Autoren-Werke — schneller als explore().
  async similar(name, { limit = 12 } = {}) {
    const hit = await searchWork(name);
    if (!hit) return { canonical: name, similar: [] };
    const doi = doiOf(hit);
    if (doi) {
      const recs = await s2Recommendations(doi, { limit });
      if (recs.length) return { canonical: display(hit), similar: recs.map((r) => ({ ...r, match: 0.75 })) };
    }
    const rel = [];
    for (const id of (hit.related_works || []).slice(0, Math.min(limit, 12)).map(shortId)) {
      try { const w = await workById(id); rel.push({ name: display(w), url: w.id, match: 0.6 }); } catch {}
    }
    return { canonical: display(hit), similar: rel };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, das UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): inhaltlich verwandt (S2/
  // related_works) PLUS Ko-Autorschaft. Thematische Nähe bleibt im Feld; Ko-Autorschaft ist
  // ein Kollaborations-Netzwerk, das Felder über gemeinsame Autor:innen verbindet (wie
  // geteilte Bühnen bei Music). Beide Straßen best effort. Naben (hyper-produktive
  // Autor:innen / Mega-Kollaborationen) werden beim Ranking über cited_by_count gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let hit; try { hit = await searchWork(name); } catch { return { canonical: name, list: [] }; }
    if (!hit) return { canonical: name, list: [] };
    const canonical = display(hit);
    const seen = new Set([canonical.toLowerCase()]), out = [];
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    const authorIds = (hit.authorships || []).slice(0, 2).map((a) => shortId(a.author?.id)).filter(Boolean);
    const [sim, coResults] = await Promise.all([
      this.similar(name, { limit: 15 }).catch(() => ({ similar: [] })),
      Promise.all(authorIds.map((aid) =>
        cached("oa-authorworks", aid + "|8", 14 * 864e5, () => oa("/works", { filter: `author.id:${aid}`, sort: "cited_by_count:desc", "per-page": "8" })).catch(() => null))),
    ]);
    for (const s of sim.similar || []) add(s.name, s.url, s.match || 0.6);                 // inhaltlich verwandt
    for (const j of coResults) for (const w of j?.results || []) add(display(w), w.id, 0.6); // Ko-Autorschaft
    return { canonical, list: out };
  },

  async explore(name) {
    const hit = await searchWork(name);
    if (!hit) throw new Error(`„${name}" nicht bei OpenAlex gefunden`);
    const topics = (hit.topics || hit.concepts || []).map((t) => t.display_name).slice(0, 6);

    // blau: Semantic-Scholar-Empfehlungen (braucht eine DOI); ohne DOI oder ohne Treffer
    // fällt es auf OpenAlex related_works zurück (hält bis zu ~10 vor).
    const doi = doiOf(hit);
    let rel = doi ? (await s2Recommendations(doi, { limit: 15 })).map((r) => ({ ...r, match: 0.75 })) : [];
    const usedS2 = rel.length > 0;
    if (!rel.length) {
      for (const id of (hit.related_works || []).slice(0, 12).map(shortId)) {
        try { const w = await workById(id); rel.push({ name: display(w), url: w.id, match: 0.6 }); } catch {}
      }
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
      similarSource: usedS2 ? "semanticscholar" : "openalex",
      togetherSource: "openalex",
      similar: rel.slice(0, 15),
      together: together.slice(0, 12),
      sources: usedS2 ? ["openalex", "semanticscholar"] : ["openalex"],
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
      {
        name: "Semantic Scholar Empfehlungen",
        probe: async () => {
          const w = await searchWork("Attention Is All You Need");
          const doi = doiOf(w);
          if (!doi) return true; // kein DOI beim Testpaper -> Feature einfach nicht geprüft, kein Fehlschlag
          return (await s2Recommendations(doi, { limit: 1 })).length >= 0;
        },
        note: "gratis, ohne Key — Fallback: OpenAlex related_works",
      },
    ];
  },
};
