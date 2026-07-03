// packs/books/pack.mjs — Bücher-Nachbarschaften über Open Library (offen, kein Key).
//   blau  = thematisch ähnlich (geteilte Subjects) + optional TasteDive ("Leser mochten auch")
//   orange = vom selben Autor / derselben Reihe
// Popularität = Open-Library-"Want to read"-Zähler (bester freier Nachfrage-Indikator;
// echte Verkaufszahlen/"auch gekauft" gibt Amazon nicht frei her).
// Anzeigename: "Titel (Autor)" — der Autor in Klammern hält gleichnamige Titel auseinander.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { similarByTaste, hasTastediveKey } from "../../lib/tastedive.mjs";

const OL = "https://openlibrary.org";
const FIELDS = "key,title,author_name,subject,ratings_count,want_to_read_count,first_publish_year,edition_count";

const display = (d) => d.author_name?.length ? `${d.title} (${d.author_name[0]})` : d.title;
const stripAuthor = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();

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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
    key: null,
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

  async explore(name) {
    const doc = await searchDoc(name);
    if (!doc) throw new Error(`„${name}" nicht bei Open Library gefunden`);
    const canonical = display(doc);
    const subjects = cleanSubjects(doc.subject);
    const self = (t) => t && t.toLowerCase() === doc.title.toLowerCase();

    // blau: Subject-Überlappung (Top-2-Themen) + optional TasteDive-Geschmacksnachbarn
    const similar = [], seen = new Set();
    for (const s of subjects.slice(0, 2)) {
      try {
        for (const w of await worksBySubject(s, { limit: 12 })) {
          if (self(w.title)) continue;
          const nm = w.author ? `${w.title} (${w.author})` : w.title;
          const k = nm.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          similar.push({ name: nm, url: w.key ? OL + w.key : null, match: 0.55 });
        }
      } catch { /* Subject unbekannt -> weiter */ }
    }
    try {
      for (const t of await similarByTaste(doc.title, "book", { limit: 10 })) {
        const k = t.name.toLowerCase();
        if (self(t.name) || seen.has(k)) continue;
        seen.add(k);
        similar.push({ name: t.name, url: null, match: 0.75 }); // Geschmacks-Signal wiegt mehr
      }
    } catch {}

    // orange: weitere Bücher desselben Autors
    const together = [];
    const author = doc.author_name?.[0];
    if (author) {
      try {
        for (const d of await worksByAuthor(author, { limit: 10 })) {
          if (self(d.title)) continue;
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
