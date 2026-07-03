// packs/anything/pack.mjs — Like Anything: der Universalmodus. Egal was du suchst —
// Person, Ort, Idee, Ding, Ereignis — Wikipedia kennt es und weiß, was dazugehört.
//   blau   = thematisch ähnlich (CirrusSearch „morelike": inhaltlich verwandte Artikel)
//   orange = eng verknüpft (Themen, die sich mit deinem Like gegenseitig verlinken)
// Kategorien = „Genres", Seitenaufrufe = Popularität. Frei & ohne Key (Wikipedia).

import {
  resolve, suggest as wikiSuggest, morelike, mutualLinks,
  pageInfo, categoryMembers, wikiUrl,
} from "../../lib/wiki.mjs";

export default {
  id: "anything",
  key: null,

  config: {
    id: "anything",
    title: "Like Anything",
    brand: "like",
    item: { sing: "Thema", plur: "Themen" },
    searchPlaceholder: "Irgendwas suchen…   ( / )",
    searchTitle: "Beliebiges Thema bei Wikipedia suchen — lädt thematisch Ähnliches + eng Verknüpftes (Taste /)",
    goTitle: "Thema laden: thematisch ähnlich + eng verknüpft + Kategorien",
    exampleSeed: "Bauhaus",
    emptyTitle: "Noch nichts auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: thematisch Ähnliches + eng Verknüpftes. Probier ruhig irgendwas.",
    edges: {
      similar: { label: "thematisch ähnlich (Wikipedia)", count: "ähnliche Themen" },
      together: { label: "eng verknüpft", count: "verknüpfte Themen" },
    },
    popularity: { label: "Aufrufe", big: 80000, dimLabel: "Große Themen dämpfen", dimTitle: "Sehr populäre Themen (≥80k Wikipedia-Aufrufe) abdunkeln — nur die Nischen leuchten" },
    genreLabel: "Kategorien",
    genreFilterPlaceholder: "Kategorie filtern…",
    statuses: [
      { value: "shortlist", label: "Merkliste", color: "#000000" },
      { value: "contacted", label: "vertiefen", color: "#ff6a00" },
      { value: "confirmed", label: "kenne ich", color: "#1a9e54" },
      { value: "declined", label: "kein Interesse", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Gedanke, Fundstelle, warum interessant…",
    similarLabel: "Thematisch ähnlich",
    togetherLabel: "Eng verknüpft",
    contextLabel: "Aus derselben Kategorie",
    contextHint: "(Wikipedia)",
    contextButton: "Kategorie-Umfeld laden",
    contextWait: "Lade Kategorie-Umfeld …",
    basketLabel: "Merkliste",
    likeLabel: "merken!",
    profileLabel: "Wikipedia",
    searchLinks: [
      { cls: "", label: "Wikipedia", url: "https://de.wikipedia.org/w/index.php?search={Q}" },
      { cls: "", label: "Google", url: "https://www.google.com/search?q={Q}" },
      { cls: "", label: "Bilder", url: "https://commons.wikimedia.org/w/index.php?search={Q}" },
    ],
    radarTitle: "Radar — Nischen-Fundstücke",
    radarTogetherReason: "ist eng mit deinem Like verknüpft",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
    key: null,
  },

  async suggest(q) {
    try { return await wikiSuggest(q, { limit: 6 }); } catch { return []; }
  },

  async explore(name) {
    const hit = await resolve(name);
    if (!hit) throw new Error(`„${name}" nicht bei Wikipedia gefunden`);
    const { lang, title } = hit;

    const [sim, mut, info] = await Promise.all([
      morelike(lang, title, { limit: 16 }),
      mutualLinks(lang, title, { limit: 14 }),
      pageInfo(lang, title),
    ]);

    // „eng verknüpft" nicht doppeln, was schon als „ähnlich" auftaucht.
    const simSet = new Set(sim.map((t) => t.toLowerCase()));
    const similar = sim.map((t, i) => ({ name: t, url: wikiUrl(lang, t), match: Math.max(0.35, 0.75 - i * 0.025) }));
    const together = mut.filter((t) => !simSet.has(t.toLowerCase()))
      .map((t, i) => ({ name: t, url: wikiUrl(lang, t), weight: Math.max(1, 3 - i * 0.2) }));

    return {
      canonical: title,
      url: info.url,
      genres: info.categories.slice(0, 6),
      similarSource: "wikipedia",
      togetherSource: "wikipedia",
      similar: similar.slice(0, 20),
      together: together.slice(0, 12),
      sources: ["wikipedia"],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const hit = await resolve(a.name);
      if (!hit) return out;
      const info = await pageInfo(hit.lang, hit.title);
      if (info.views) out.popularity = info.views;
      if (!a.url) out.url = info.url;
      if (!a.genres?.length && info.categories.length) out.genres = info.categories.slice(0, 6);
    } catch {}
    return out;
  },

  async popularity(name) {
    try {
      const hit = await resolve(name);
      if (!hit) return null;
      return (await pageInfo(hit.lang, hit.title)).views || null;
    } catch { return null; }
  },

  // „Aus derselben Kategorie": weitere Artikel der stärksten Kategorie des Themas.
  async context(name) {
    const hit = await resolve(name);
    if (!hit) return { groups: [] };
    const info = await pageInfo(hit.lang, hit.title);
    const cat = info.categories[0];
    if (!cat) return { groups: [] };
    const members = await categoryMembers(hit.lang, cat, { limit: 14 });
    const items = members.filter((t) => t.toLowerCase() !== hit.title.toLowerCase()).map((t) => ({ name: t, sub: "" }));
    if (!items.length) return { groups: [] };
    return { note: `Kategorie: ${cat}`, groups: [{ label: cat, items }] };
  },

  async diag() {
    return [
      { name: "Wikipedia Suche", probe: async () => !!(await resolve("Bauhaus")) },
      { name: "Wikipedia morelike", probe: async () => { const h = await resolve("Bauhaus"); return (await morelike(h.lang, h.title)).length >= 0; } },
      { name: "Wikipedia Verlinkungen", probe: async () => { const h = await resolve("Bauhaus"); return (await mutualLinks(h.lang, h.title)).length >= 0; } },
    ];
  },
};
