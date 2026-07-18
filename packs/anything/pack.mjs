// packs/anything/pack.mjs — Like Anything: der Universalmodus. Egal was du suchst —
// Person, Ort, Idee, Ding, Ereignis — Wikipedia kennt es und weiß, was dazugehört.
//   blau   = thematisch ähnlich (CirrusSearch „morelike": inhaltlich verwandte Artikel)
//   orange = eng verknüpft (Themen, die sich mit deinem Like gegenseitig verlinken)
// Kategorien = „Genres", Seitenaufrufe = Popularität. Frei & ohne Key (Wikipedia).

import {
  resolve, suggest as wikiSuggest, morelike, mutualLinks, pageLinks, hubPenalty,
  pageInfo, categoryMembers, wikiUrl, isJunkTitle,
} from "../../lib/wiki.mjs";
import { surpriseFrom } from "../../lib/surprise.mjs";

// „Überrasch mich" (Kaltstart): kuratierter Pool eher nischiger, aber ergiebiger Themen —
// quer durch Kultur, Natur, Ideen. surprise() nimmt den mit den WENIGSTEN Seitenaufrufen.
const SURPRISE_SEEDS = [
  "Zettelkasten", "Wabi-Sabi", "Solarpunk", "Land Art", "Umami", "Synästhesie",
  "Permakultur", "Psychogeografie", "Oulipo", "Fluxus", "Arte Povera", "Brutalismus",
  "Biolumineszenz", "Murmuration", "Zugunruhe", "Fermentation", "Kintsugi", "Ikigai",
  "Situationistische Internationale", "Cyanotypie", "Camera obscura", "Polyphonie",
  "Bibliotherapie", "Mnemotechnik", "Serendipität", "Panspermie", "Bioakustik",
  "Lichtverschmutzung", "Genossenschaft", "Allmende", "Baukultur", "Soundscape",
];

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
    seedChips: ["Bauhaus", "Schwarzes Loch", "Espresso"],
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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Thema": "Topic",
      "Themen": "Topics",
      "Irgendwas suchen…   ( / )": "Search anything…   ( / )",
      "Beliebiges Thema bei Wikipedia suchen — lädt thematisch Ähnliches + eng Verknüpftes (Taste /)": "Search any topic on Wikipedia - loads thematically similar + closely linked topics (key /)",
      "Thema laden: thematisch ähnlich + eng verknüpft + Kategorien": "Load topic: thematically similar + closely linked + categories",
      "Noch nichts auf der Karte": "Nothing on the map yet",
      "bringt gleich sein Umfeld mit: thematisch Ähnliches + eng Verknüpftes. Probier ruhig irgendwas.": "brings its surroundings along: thematically similar + closely linked topics. Go ahead, try anything.",
      "thematisch ähnlich (Wikipedia)": "thematically similar (Wikipedia)",
      "ähnliche Themen": "similar topics",
      "eng verknüpft": "closely linked",
      "verknüpfte Themen": "linked topics",
      "Aufrufe": "Views",
      "Große Themen dämpfen": "Dim big topics",
      "Sehr populäre Themen (≥80k Wikipedia-Aufrufe) abdunkeln — nur die Nischen leuchten": "Dim very popular topics (≥80k Wikipedia views) - only the niches glow",
      "Kategorien": "Categories",
      "Kategorie filtern…": "Filter categories…",
      "Merkliste": "Saved list",
      "vertiefen": "explore further",
      "kenne ich": "know it",
      "kein Interesse": "not interested",
      "Notiz": "Note",
      "Gedanke, Fundstelle, warum interessant…": "Thought, source, why interesting…",
      "Thematisch ähnlich": "Thematically similar",
      "Eng verknüpft": "Closely linked",
      "Aus derselben Kategorie": "From the same category",
      "Kategorie-Umfeld laden": "Load category context",
      "Lade Kategorie-Umfeld …": "Loading category context …",
      "merken!": "save!",
      "Bilder": "Images",
      "Radar — Nischen-Fundstücke": "Radar - niche finds",
      "ist eng mit deinem Like verknüpft": "is closely linked to your like",
    },
  },

  async suggest(q) {
    try { return await wikiSuggest(q, { limit: 6 }); } catch { return []; }
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): nur morelike,
  // ohne Verlinkungen/Kategorien — deutlich schneller als explore().
  async similar(name, { limit = 20 } = {}) {
    const hit = await resolve(name);
    if (!hit) return { canonical: name, similar: [] };
    const sim = await morelike(hit.lang, hit.title, { limit: Math.min(limit, 20) });
    return { canonical: hit.title, similar: sim.map((t, i) => ({ name: t, url: wikiUrl(hit.lang, t), match: Math.max(0.35, 0.75 - i * 0.025) })) };
  },

  // BREITE Nachbarschaft NUR für die Brücke: morelike (thematisch ähnlich) PLUS die
  // ausgehenden Artikel-Links (worauf das Thema verweist). morelike allein bleibt fast
  // immer im selben Typ (Fußballer → Fußballer, Stadt → Stadt); die Links überbrücken die
  // Typgrenze (Person → Verein/Ort → andere Person). Erst so findet die Suche
  // „Mario Basler ↔ Istanbul" — und robuster auch „Beckenbauer ↔ Basler" (gemeinsame
  // Vereins-/Nationalelf-Links), wenn sich ihre morelike-Listen nicht überschneiden.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    const hit = await resolve(name);
    if (!hit) return { canonical: name, list: [] };
    // Wichtig: viele Links einbeziehen (nicht nur `limit`). `prop=links` liefert ALPHABETISCH
    // sortiert — die ersten 40 sind ein zufälliger A–D-Ausschnitt, in dem der verbindende
    // Nabe-Link (Land/Stadt) oft fehlt -> gar kein Treffpunkt (z. B. „Basler ↔ Bauhaus").
    // Der Fetch holt ohnehin bis zu 500; wir schneiden großzügig. hubPenalty hält das Ranking
    // sauber (Naben nur, wenn sie die einzige kurze Verbindung sind). Der eine Endpunkt-Fetch
    // reicht so, um gemeinsame Naben sofort beim Start zu treffen.
    // Endpunkte (Server ruft mit limit≈60): voller Link-Satz (bis 500) — die gemeinsame Nabe
    // wird so schon beim Start getroffen. Tiefe Expansions-Knoten (limit≈40): moderater
    // Deckel, damit die Frontier nicht explodiert.
    const linkCap = limit >= 50 ? 500 : 150;
    const [sim, links] = await Promise.all([
      morelike(hit.lang, hit.title, { limit: 20 }),
      pageLinks(hit.lang, hit.title, { limit: linkCap }),
    ]);
    const out = [], seen = new Set([hit.title.toLowerCase()]);
    const add = (t, match) => { const k = t.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ name: t, url: wikiUrl(hit.lang, t), match }); };
    sim.forEach((t, i) => add(t, Math.max(0.4, 0.75 - i * 0.02)));   // „ähnlich" wiegt etwas mehr
    // Links als zweite Straße — aber generische Naben (Land/Jahr/Grundbegriff) per hubPenalty
    // ABWERTEN (nicht entfernen): so ranken spezifische Brücken oben, ohne dass eine Nabe je
    // als kürzeste Verbindung verschwiegen würde. Die Tiefe (Stationen) bleibt primär.
    links.forEach((t, i) => add(t, Math.max(0.25, 0.5 - i * 0.008) * hubPenalty(t)));
    return { canonical: hit.title, list: out };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, der UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  async explore(name) {
    const hit = await resolve(name);
    if (!hit) throw new Error(`„${name}" nicht bei Wikipedia gefunden`);
    const { lang, title } = hit;

    const [sim, mut, info] = await Promise.all([
      morelike(lang, title, { limit: 16 }),
      mutualLinks(lang, title, { limit: 14 }),
      pageInfo(lang, title),
    ]);

    // (U-2d) Listen-/Jahres-/Kategorie-/Begriffsklärungsseiten sind als Knoten nur Lärm —
    // vor der Weiterverarbeitung mit derselben Stoppliste wie in mutualLinks aussortieren.
    // (morelike liefert zwar Namespace 0, aber „Liste der …", „1974" und BKS sind ebenfalls
    // Namespace-0-Artikel und rutschen sonst ungefiltert als Knoten durch.)
    const simClean = sim.filter((t) => !isJunkTitle(t));

    // „eng verknüpft" nicht doppeln, was schon als „ähnlich" auftaucht.
    const simSet = new Set(simClean.map((t) => t.toLowerCase()));
    const similar = simClean.map((t, i) => ({ name: t, url: wikiUrl(lang, t), match: Math.max(0.35, 0.75 - i * 0.025) }));
    const together = mut.items.filter((t) => !simSet.has(t.toLowerCase()))
      .map((t, i) => ({ name: t, url: wikiUrl(lang, t), weight: Math.max(1, 3 - i * 0.2) }));

    // (U-2d) EHRLICHKEIT: Nur bei echter Gegenseitigkeit (mut.exact) ist die orange Relation
    // wirklich „eng verknüpft". Beim Fallback zeigt mutualLinks bloß EINSEITIGE Links — dann
    // die Quelle transparent als „wikipedia:verlinkt" ausweisen, statt „eng verknüpft" zu
    // behaupten. So bleibt die Kante als Beleg-Quelle am Knoten ehrlich zuordenbar.
    const togetherSource = mut.exact ? "wikipedia" : "wikipedia:verlinkt";

    return {
      canonical: title,
      url: info.url,
      genres: info.categories.slice(0, 6),
      similarSource: "wikipedia",
      togetherSource,
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
      { name: "Wikipedia Verlinkungen", probe: async () => { const h = await resolve("Bauhaus"); return (await mutualLinks(h.lang, h.title)).items.length >= 0; } },
    ];
  },
};
