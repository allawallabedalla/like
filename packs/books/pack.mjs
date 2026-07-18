// packs/books/pack.mjs — Bücher-Nachbarschaften über Open Library (offen, kein Key).
//   blau  = thematisch ähnlich (geteilte Subjects) + optional TasteDive ("Leser mochten auch")
//   orange = vom selben Autor / derselben Reihe
// Popularität = Open-Library-"Want to read"-Zähler (bester freier Nachfrage-Indikator;
// echte Verkaufszahlen/"auch gekauft" gibt Amazon nicht frei her).
// Anzeigename: "Titel (Autor)" — der Autor in Klammern hält gleichnamige Titel auseinander.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { similarByTaste, hasTastediveKey } from "../../lib/tastedive.mjs";
import { surpriseFrom } from "../../lib/surprise.mjs";

const OL = "https://openlibrary.org";

// „Überrasch mich" (Kaltstart): kuratierter Pool leiserer Klassiker & Perlen quer durch
// Genres/Epochen. surprise() nimmt das Buch mit der KLEINSTEN Merklisten-Nachfrage.
const SURPRISE_SEEDS = [
  "Stoner (John Williams)", "The Master and Margarita (Mikhail Bulgakov)", "Piranesi (Susanna Clarke)",
  "The Vegetarian (Han Kang)", "Solaris (Stanisław Lem)", "Invisible Cities (Italo Calvino)",
  "The Left Hand of Darkness (Ursula K. Le Guin)", "Kindred (Octavia E. Butler)",
  "The Remains of the Day (Kazuo Ishiguro)", "Annihilation (Jeff VanderMeer)",
  "Pedro Páramo (Juan Rulfo)", "The Book of Disquiet (Fernando Pessoa)", "Ficciones (Jorge Luis Borges)",
  "The Hour of the Star (Clarice Lispector)", "Giovanni's Room (James Baldwin)",
  "Wide Sargasso Sea (Jean Rhys)", "The Waves (Virginia Woolf)", "Hunger (Knut Hamsun)",
  "The Blind Owl (Sadegh Hedayat)", "Ice (Anna Kavan)", "The Third Policeman (Flann O'Brien)",
  "We (Yevgeny Zamyatin)", "Roadside Picnic (Arkady Strugatsky)", "The Summer Book (Tove Jansson)",
  "Convenience Store Woman (Sayaka Murata)", "The Memory Police (Yoko Ogawa)", "Train Dreams (Denis Johnson)",
];
const FIELDS = "key,title,author_name,subject,ratings_count,want_to_read_count,first_publish_year,edition_count";

const display = (d) => d.author_name?.length ? `${d.title} (${d.author_name[0]})` : d.title;
const stripAuthor = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();

// (U-2d) Dedup über den Open-Library work-key: mehrere Editionen/Übersetzungen teilen
// denselben `/works/OL…W`-Key und dürfen nicht doppelt als Nachbarn erscheinen.
// Fällt kein work-key an, Fallback wie bisher über den normalisierten Titel.
const workKeyOf = (k) => { const m = String(k || "").match(/\/works\/OL\d+W/i); return m ? m[0].toLowerCase() : null; };
const dedupKey = (workKey, title) => workKeyOf(workKey) ? "w:" + workKeyOf(workKey) : "t:" + String(title || "").trim().toLowerCase();

// Suche mit vollem String (Titel + ggf. Autor in Klammern) — Open Library rankt gut.
async function searchDoc(name) {
  return cached("ol-doc", name, 7 * 864e5, async () => {
    const u = new URL(OL + "/search.json");
    u.searchParams.set("q", stripAuthor(name) + " " + (name.match(/\(([^)]*)\)\s*$/)?.[1] || ""));
    u.searchParams.set("limit", "1");
    u.searchParams.set("fields", FIELDS);
    const j = await jfetch(u.href);
    return j.docs?.[0] || null;
  });
}

// Subjects aufräumen: OL-Subjects sind wild gemischt — nur kurze, sprechende behalten.
function cleanSubjects(subjects = []) {
  const junk = /accessible book|protected daisy|in library|overdrive|large type|translations|fiction$|^fiction/i;
  const out = [], seen = new Set();
  for (const s of subjects) {
    const t = String(s).trim();
    if (t.length > 28 || junk.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

async function worksBySubject(subject, { limit = 12 } = {}) {
  return cached("ol-subj", subject + "|" + limit, 14 * 864e5, async () => {
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const j = await jfetch(`${OL}/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`);
    return (j.works || []).map((w) => ({
      title: w.title,
      author: w.authors?.[0]?.name || null,
      key: w.key,
    }));
  });
}

async function worksByAuthor(author, { limit = 10 } = {}) {
  return cached("ol-auth", author + "|" + limit, 14 * 864e5, async () => {
    const u = new URL(OL + "/search.json");
    u.searchParams.set("author", author);
    u.searchParams.set("sort", "readinglog");
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("fields", FIELDS);
    const j = await jfetch(u.href);
    return j.docs || [];
  });
}

export default {
  id: "books",
  key: null, // Open Library ist offen; TasteDive-Key ist optional (.tastedive-key)

  config: {
    id: "books",
    title: "Like Books",
    brand: "like",
    item: { sing: "Buch", plur: "Bücher" },
    searchPlaceholder: "Buch suchen…   ( / )",
    searchTitle: "Buch bei Open Library suchen — lädt thematisch Ähnliches + Bücher desselben Autors (Taste /)",
    goTitle: "Buch laden: thematisch ähnlich + vom selben Autor + Themen",
    exampleSeed: "Der Prozess (Franz Kafka)",
    // (U-2d) drei kontrastierende Einstiegsbücher (SF / literarisch / Sachbuch) als Start-Chips
    seedChips: ["Dune (Frank Herbert)", "Beloved (Toni Morrison)", "Sapiens (Yuval Noah Harari)"],
    emptyTitle: "Noch keine Bücher auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: thematisch Ähnliches + Bücher desselben Autors.",
    edges: {
      similar: { label: "thematisch ähnlich (Open Library)", count: "ähnliche" },
      together: { label: "vom selben Autor", count: "vom selben Autor" },
    },
    popularity: { label: "Merklisten", big: 5000, dimLabel: "Bestseller dämpfen", dimTitle: "Bücher mit ≥5k „Want to read“-Einträgen abdunkeln — nur die Entdeckungen leuchten" },
    genreLabel: "Themen",
    genreFilterPlaceholder: "Thema filtern…",
    statuses: [
      { value: "shortlist", label: "Merkliste", color: "#000000" },
      { value: "contacted", label: "lese ich", color: "#ff6a00" },
      { value: "confirmed", label: "gelesen", color: "#1a9e54" },
      { value: "declined", label: "kein Interesse", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Empfohlen von, Ausgabe, Gedanken…",
    similarLabel: "Thematisch ähnlich",
    togetherLabel: "Vom selben Autor",
    contextLabel: "Mehr vom Autor",
    contextHint: "(Open Library)",
    contextButton: "Autoren-Umfeld laden",
    contextWait: "Lade Autoren-Umfeld …",
    basketLabel: "Leseliste",
    likeLabel: "merken!",
    profileLabel: "Open Library",
    searchLinks: [
      { cls: "", label: "Goodreads", url: "https://www.goodreads.com/search?q={Q}" },
      { cls: "", label: "Buchhandel", url: "https://www.genialokal.de/suche/?q={Q}" },
    ],
    radarTitle: "Radar — Buch-Geheimtipps",
    radarTogetherReason: "vom selben Autor wie dein Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Buch": "Book",
      "Bücher": "Books",
      "Buch suchen…   ( / )": "Search book…   ( / )",
      "Buch bei Open Library suchen — lädt thematisch Ähnliches + Bücher desselben Autors (Taste /)": "Search book on Open Library - loads thematically similar books + books by the same author (key /)",
      "Buch laden: thematisch ähnlich + vom selben Autor + Themen": "Load book: thematically similar + by the same author + topics",
      "Noch keine Bücher auf der Karte": "No books on the map yet",
      "bringt gleich sein Umfeld mit: thematisch Ähnliches + Bücher desselben Autors.": "brings its surroundings along: thematically similar books + books by the same author.",
      "thematisch ähnlich (Open Library)": "thematically similar (Open Library)",
      "ähnliche": "similar",
      "vom selben Autor": "by the same author",
      "Merklisten": "Saved lists",
      "Bestseller dämpfen": "Dim bestsellers",
      "Bücher mit ≥5k „Want to read“-Einträgen abdunkeln — nur die Entdeckungen leuchten": "Dim books with ≥5k \"Want to read\" entries - only the discoveries glow",
      "Themen": "Topics",
      "Thema filtern…": "Filter topics…",
      "Merkliste": "Saved list",
      "lese ich": "reading",
      "gelesen": "read",
      "kein Interesse": "not interested",
      "Notiz": "Note",
      "Empfohlen von, Ausgabe, Gedanken…": "Recommended by, edition, thoughts…",
      "Thematisch ähnlich": "Thematically similar",
      "Vom selben Autor": "By the same author",
      "Mehr vom Autor": "More by the author",
      "Autoren-Umfeld laden": "Load author context",
      "Lade Autoren-Umfeld …": "Loading author context …",
      "Weitere Werke": "More works",
      "Leseliste": "Reading list",
      "merken!": "save!",
      "Buchhandel": "Bookstore",
      "Radar — Buch-Geheimtipps": "Radar - hidden book gems",
      "vom selben Autor wie dein Like": "by the same author as your like",
    },
  },

  async suggest(q) {
    return cached("ol-suggest", q, 864e5, async () => {
      const u = new URL(OL + "/search.json");
      u.searchParams.set("q", q);
      u.searchParams.set("limit", "6");
      u.searchParams.set("fields", "title,author_name");
      const j = await jfetch(u.href);
      const seen = new Set();
      return (j.docs || []).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): nur Subject-Nachbarn
  // (+ optional TasteDive), ohne die Autoren-Werke — schneller als explore().
  async similar(name, { limit = 20 } = {}) {
    const doc = await searchDoc(name);
    if (!doc) return { canonical: name, similar: [] };
    const subjects = cleanSubjects(doc.subject);
    const selfKey = workKeyOf(doc.key);
    const self = (t) => t && t.toLowerCase() === doc.title.toLowerCase();
    const isSelf = (k, t) => (selfKey && workKeyOf(k) === selfKey) || self(t);
    const similar = [], seen = new Set();
    for (const s of subjects.slice(0, 2)) {
      try {
        for (const w of await worksBySubject(s, { limit: 12 })) {
          if (isSelf(w.key, w.title)) continue;
          const nm = w.author ? `${w.title} (${w.author})` : w.title;
          const dk = dedupKey(w.key, nm); // (U-2d) work-key statt Titel
          if (seen.has(dk)) continue;
          seen.add(dk);
          similar.push({ name: nm, url: w.key ? OL + w.key : null, match: 0.5 });
        }
      } catch { /* Subject unbekannt -> weiter */ }
    }
    try {
      for (const t of await similarByTaste(doc.title, "book", { limit: 10 })) {
        const dk = dedupKey(null, t.name);
        if (self(t.name) || seen.has(dk)) continue;
        seen.add(dk);
        similar.push({ name: t.name, url: null, match: 0.5 });
      }
    } catch {}
    return { canonical: display(doc), similar: similar.slice(0, limit) };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, das UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): thematisch ähnlich (Subjects/
  // TasteDive) PLUS weitere Werke desselben Autors. Die Katalog-Straße ist dünner (bündelt
  // nur ein Autor-Werk), erweitert aber die Reichweite („A —selber Autor— A2 —ähnlich— B").
  // Best effort. Naben (Vielschreiber:innen) beim Ranking über die Merklisten-Zahl gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let doc; try { doc = await searchDoc(name); } catch { return { canonical: name, list: [] }; }
    if (!doc) return { canonical: name, list: [] };
    const canonical = display(doc);
    const seen = new Set([canonical.toLowerCase()]), out = [];
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    const author = doc.author_name?.[0];
    const [sim, byAuthor] = await Promise.all([
      this.similar(name, { limit: 20 }).catch(() => ({ similar: [] })),
      author ? worksByAuthor(author, { limit: 10 }).catch(() => []) : Promise.resolve([]),
    ]);
    for (const s of sim.similar || []) add(s.name, s.url, s.match || 0.5);              // thematisch
    for (const d of byAuthor) add(display(d), d.key ? OL + d.key : null, 0.5);          // selber Autor
    return { canonical, list: out };
  },

  async explore(name) {
    const doc = await searchDoc(name);
    if (!doc) throw new Error(`„${name}" nicht bei Open Library gefunden`);
    const canonical = display(doc);
    const subjects = cleanSubjects(doc.subject);
    const selfKey = workKeyOf(doc.key);
    const self = (t) => t && t.toLowerCase() === doc.title.toLowerCase();
    const isSelf = (k, t) => (selfKey && workKeyOf(k) === selfKey) || self(t);

    // blau: thematische Nähe über die Subject-SCHNITTMENGE (U-2d) — je mehr der Top-Subjects
    // des Ausgangsbuchs ein Werk teilt (= es taucht unter mehreren davon auf), desto näher
    // rankt es. Dedup über den work-key, damit Editionen/Übersetzungen nicht doppeln.
    const simMap = new Map(); // dedupKey -> { name, url, shared }
    for (const s of subjects.slice(0, 5)) {
      try {
        for (const w of await worksBySubject(s, { limit: 12 })) {
          if (isSelf(w.key, w.title)) continue;
          const nm = w.author ? `${w.title} (${w.author})` : w.title;
          const dk = dedupKey(w.key, nm);
          const cur = simMap.get(dk);
          if (cur) cur.shared++;                                     // weiteres geteiltes Subject
          else simMap.set(dk, { name: nm, url: w.key ? OL + w.key : null, shared: 1 });
        }
      } catch { /* Subject unbekannt -> weiter */ }
    }
    // mehr geteilte Subjects => höherer match (0.45 + 0.15·Schnittmenge, gedeckelt).
    const similar = [...simMap.values()]
      .sort((a, b) => b.shared - a.shared)
      .map((x) => ({ name: x.name, url: x.url, match: Math.min(0.9, 0.45 + 0.15 * x.shared) }));
    const seen = new Set(simMap.keys());
    try {
      for (const t of await similarByTaste(doc.title, "book", { limit: 10 })) {
        const dk = dedupKey(null, t.name);
        if (self(t.name) || seen.has(dk)) continue;
        seen.add(dk);
        similar.push({ name: t.name, url: null, match: 0.6 }); // Geschmacks-Signal wiegt mehr
      }
    } catch {}

    // orange: weitere Bücher desselben Autors (U-2d: work-key-Dedup gegen Editionen)
    const together = [], seenTogether = new Set(selfKey ? ["w:" + selfKey] : []);
    const author = doc.author_name?.[0];
    if (author) {
      try {
        for (const d of await worksByAuthor(author, { limit: 10 })) {
          if (isSelf(d.key, d.title)) continue;
          const dk = dedupKey(d.key, display(d));
          if (seenTogether.has(dk)) continue;
          seenTogether.add(dk);
          together.push({ name: display(d), url: d.key ? OL + d.key : null, weight: 1 });
        }
      } catch {}
    }

    return {
      canonical,
      url: doc.key ? OL + doc.key : null,
      genres: subjects.slice(0, 6),
      similarSource: "openlibrary",
      togetherSource: "openlibrary",
      similar: similar.slice(0, 20),
      together: together.slice(0, 12),
      sources: ["openlibrary", ...((await hasTastediveKey()) ? ["tastedive"] : [])],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const doc = await searchDoc(a.name);
      if (doc) {
        if (!a.genres?.length) out.genres = cleanSubjects(doc.subject).slice(0, 6);
        const pop = doc.want_to_read_count ?? doc.ratings_count;
        if (pop) out.popularity = pop;
        if (doc.key && !a.url) out.url = OL + doc.key;
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const doc = await searchDoc(name);
    return doc?.want_to_read_count ?? doc?.ratings_count ?? null;
  },

  // "Mehr vom Autor": die bekanntesten Werke, sortiert nach Leselisten-Nachfrage.
  async context(name) {
    const doc = await searchDoc(name);
    const author = doc?.author_name?.[0];
    if (!author) return { groups: [] };
    const docs = await worksByAuthor(author, { limit: 12 });
    return {
      note: `Autor: ${author}`,
      groups: [{
        label: "Weitere Werke",
        items: docs.filter((d) => d.title.toLowerCase() !== doc.title.toLowerCase())
          .map((d) => ({ name: display(d), sub: [d.first_publish_year, d.want_to_read_count ? `${d.want_to_read_count} Merklisten` : null].filter(Boolean).join(" · ") })),
      }],
    };
  },

  async diag() {
    const tdNote = (await hasTastediveKey()) ? "" : "kein Key (optional)";
    return [
      { name: "Open Library Suche", probe: async () => !!(await searchDoc("Dune (Frank Herbert)")) },
      { name: "Open Library Subjects", probe: async () => (await worksBySubject("science fiction", { limit: 2 })).length > 0 },
      { name: "TasteDive (Leser mochten auch)", probe: async () => (await hasTastediveKey()) ? (await similarByTaste("Dune", "book")).length >= 0 : true, note: tdNote },
    ];
  },
};
