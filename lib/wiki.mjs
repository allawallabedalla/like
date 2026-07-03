// wiki.mjs — universeller Wikipedia-Adapter für „Like Anything" (frei, kein Key).
// Egal ob Person, Ort, Idee, Ding, Ereignis: Wikipedia kennt es und weiß, was damit
// zusammenhängt. Zwei Signale:
//   • morelike  → thematisch ähnliche Artikel (CirrusSearch-Volltext-Ähnlichkeit) = blau
//   • gegenseitige Links (A↔B) → eng verknüpfte Themen (verlinken sich beide) = orange
// Kategorien = „Genres", Seitenaufrufe = Popularität. Deutsch zuerst, Englisch als Fallback.

import { cached } from "./cache.mjs";
import { jfetch } from "./jfetch.mjs";

const LANGS = ["de", "en"];
const api = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

async function wq(lang, params) {
  const u = new URL(api(lang));
  u.searchParams.set("format", "json");
  u.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return jfetch(u.href, { gapMs: 180, timeout: 10000 });
}

// Wartungs-/Meta-Kategorien aussortieren, sprechende behalten.
const CAT_JUNK = /wikipedia|wikidata|commons|stub|\bCS1\b|webarchive|use dmy|use mdy|articles?|pages?|namespace|redirect|disambig|begriffskl|normdaten|gnd|isbn|coordinates|geokoordinaten|vorlage|template|wartung|hauptkategorie/i;
function cleanCategories(cats = []) {
  const out = [], seen = new Set();
  for (const c of cats) {
    const t = String(c.title || c).replace(/^(Category|Kategorie):/i, "").trim();
    if (!t || t.length > 42 || CAT_JUNK.test(t)) continue;
    if (/\b(19|20)\d\d\b/.test(t)) continue; // Jahres-Kategorien ("Gegründet 1919")
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

// Besten Artikeltitel zu einer Eingabe finden (de zuerst, dann en).
export async function resolve(name) {
  return cached("wiki-res", name, 14 * 864e5, async () => {
    for (const lang of LANGS) {
      try {
        const d = await wq(lang, { action: "query", list: "search", srsearch: name, srlimit: "1", srnamespace: "0" });
        const hit = d.query?.search?.[0];
        if (hit) return { lang, title: hit.title };
      } catch {}
    }
    return null;
  });
}

// Autocomplete: mehrere Titelvorschläge (OpenSearch-Prefix, de zuerst).
export async function suggest(q, { limit = 6 } = {}) {
  return cached("wiki-sugg", q + "|" + limit, 864e5, async () => {
    for (const lang of LANGS) {
      try {
        const u = new URL(api(lang));
        u.searchParams.set("action", "opensearch");
        u.searchParams.set("search", q);
        u.searchParams.set("limit", String(limit));
        u.searchParams.set("namespace", "0");
        u.searchParams.set("format", "json");
        const j = await jfetch(u.href, { gapMs: 180, timeout: 8000 });
        const names = Array.isArray(j) ? j[1] : [];
        if (names?.length) return names;
      } catch {}
    }
    return [];
  });
}

// Thematisch ähnliche Artikel (CirrusSearch „morelike").
export async function morelike(lang, title, { limit = 16 } = {}) {
  return cached("wiki-more", lang + "|" + title + "|" + limit, 3 * 864e5, async () => {
    try {
      const d = await wq(lang, {
        action: "query", list: "search",
        srsearch: `morelike:${title}`, srlimit: String(limit),
        srnamespace: "0", srqiprofile: "classic",
      });
      return (d.query?.search || []).map((s) => s.title).filter((t) => t.toLowerCase() !== title.toLowerCase());
    } catch { return []; }
  });
}

// Eng verknüpfte Themen: Artikel, die A verlinkt UND die zurück auf A verlinken.
// Gegenseitigkeit ist ein starkes „gehört zusammen"-Signal.
export async function mutualLinks(lang, title, { limit = 14 } = {}) {
  return cached("wiki-mut", lang + "|" + title + "|" + limit, 3 * 864e5, async () => {
    try {
      const [out, back] = await Promise.all([
        wq(lang, { action: "query", prop: "links", titles: title, plnamespace: "0", pllimit: "max", redirects: "1" }),
        wq(lang, { action: "query", list: "backlinks", bltitle: title, blnamespace: "0", bllimit: "500", blfilterredir: "nonredirects" }),
      ]);
      const outLinks = (out.query?.pages?.[0]?.links || []).map((l) => l.title); // grob nach Prominenz (Artikelreihenfolge)
      const backSet = new Set((back.query?.backlinks || []).map((b) => b.title.toLowerCase()));
      const mutual = outLinks.filter((t) => backSet.has(t.toLowerCase()));
      const pick = (mutual.length >= 4 ? mutual : outLinks).slice(0, limit);
      return pick;
    } catch { return []; }
  });
}

// Kategorien + Seitenaufrufe (Popularität) + kanonische URL.
export async function pageInfo(lang, title) {
  return cached("wiki-info", lang + "|" + title, 3 * 864e5, async () => {
    try {
      const d = await wq(lang, {
        action: "query", titles: title, redirects: "1",
        prop: "categories|pageviews|info", cllimit: "max", clshow: "!hidden", inprop: "url",
      });
      const pg = d.query?.pages?.[0] || {};
      const views = pg.pageviews ? Object.values(pg.pageviews).reduce((s, v) => s + (v || 0), 0) : 0;
      return {
        categories: cleanCategories(pg.categories),
        views,
        url: pg.canonicalurl || wikiUrl(lang, title),
      };
    } catch { return { categories: [], views: 0, url: wikiUrl(lang, title) }; }
  });
}

// Kategorie-Mitglieder (für „In der Nähe des Themas" / Kontext).
export async function categoryMembers(lang, category, { limit = 14 } = {}) {
  try {
    const d = await wq(lang, {
      action: "query", list: "categorymembers",
      cmtitle: `Category:${category}`, cmnamespace: "0", cmlimit: String(limit + 4), cmtype: "page",
    });
    return (d.query?.categorymembers || []).map((m) => m.title);
  } catch { return []; }
}

export function wikiUrl(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
