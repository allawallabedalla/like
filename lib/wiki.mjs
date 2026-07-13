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

// WICHTIG (Cache-Vergiftung): Netz-/Drossel-/Timeout-Fehler dürfen NIE als „nicht
// gefunden"/„leer" im Datei-Cache landen — sonst friert ein einzelner Timeout im
// Start-Burst einen Namen tagelang als falsches „gibt es nicht" ein („Wikipedia zu X
// kann nicht gefunden werden", obwohl der Artikel existiert). Muster deshalb überall:
// Fehler fliegen aus cached() heraus (dann wird NICHTS geschrieben) und werden erst
// außen in eine ehrliche Meldung bzw. einen neutralen, ungecachten Fallback übersetzt.
// Die Namespaces sind auf *2 gedreht, damit bereits vergiftete Alt-Einträge ignoriert
// werden (pruneCache räumt sie nach 30 Tagen weg).

// Besten Artikeltitel zu einer Eingabe finden (de zuerst, dann en).
export async function resolve(name) {
  return cached("wiki-res2", name, 14 * 864e5, async () => {
    let fails = 0;
    for (const lang of LANGS) {
      try {
        const d = await wq(lang, { action: "query", list: "search", srsearch: name, srlimit: "1", srnamespace: "0" });
        const hit = d.query?.search?.[0];
        if (hit) return { lang, title: hit.title };
      } catch { fails++; }
    }
    // Mindestens eine Sprache nicht erreichbar und kein Treffer -> KEIN Urteil möglich:
    // ehrlich scheitern (wird nicht gecacht) statt fälschlich „nicht gefunden".
    if (fails) throw new Error("Wikipedia ist gerade nicht erreichbar (Netz/Drossel) — kurz warten und nochmal versuchen.");
    return null; // sauberes „wirklich kein Treffer" — das darf gecacht werden
  });
}

// Autocomplete: mehrere Titelvorschläge (OpenSearch-Prefix, de zuerst).
export async function suggest(q, { limit = 6 } = {}) {
  try {
    return await cached("wiki-sugg2", q + "|" + limit, 864e5, async () => {
      let fails = 0;
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
        } catch { fails++; }
      }
      if (fails) throw new Error("wiki nicht erreichbar"); // -> Fallback unten, ungecacht
      return [];
    });
  } catch { return []; }
}

// Thematisch ähnliche Artikel (CirrusSearch „morelike").
export async function morelike(lang, title, { limit = 16 } = {}) {
  try {
    return await cached("wiki-more2", lang + "|" + title + "|" + limit, 3 * 864e5, async () => {
      const d = await wq(lang, {
        action: "query", list: "search",
        srsearch: `morelike:${title}`, srlimit: String(limit),
        srnamespace: "0", srqiprofile: "classic",
      });
      return (d.query?.search || []).map((s) => s.title).filter((t) => t.toLowerCase() !== title.toLowerCase());
    });
  } catch { return []; } // Fehler -> leer, aber UNGECACHT (nächster Versuch darf klappen)
}

// Eng verknüpfte Themen: Artikel, die A verlinkt UND die zurück auf A verlinken.
// Gegenseitigkeit ist ein starkes „gehört zusammen"-Signal.
export async function mutualLinks(lang, title, { limit = 14 } = {}) {
  try {
    return await cached("wiki-mut2", lang + "|" + title + "|" + limit, 3 * 864e5, async () => {
      const [out, back] = await Promise.all([
        wq(lang, { action: "query", prop: "links", titles: title, plnamespace: "0", pllimit: "max", redirects: "1" }),
        wq(lang, { action: "query", list: "backlinks", bltitle: title, blnamespace: "0", bllimit: "500", blfilterredir: "nonredirects" }),
      ]);
      const outLinks = (out.query?.pages?.[0]?.links || []).map((l) => l.title); // grob nach Prominenz (Artikelreihenfolge)
      const backSet = new Set((back.query?.backlinks || []).map((b) => b.title.toLowerCase()));
      const mutual = outLinks.filter((t) => backSet.has(t.toLowerCase()));
      const pick = (mutual.length >= 4 ? mutual : outLinks).slice(0, limit);
      return pick;
    });
  } catch { return []; } // Fehler -> leer, aber UNGECACHT
}

// Ausgehende Artikel-Links (eine Abfrage, grob nach Prominenz = Artikelreihenfolge).
// Das ist die zweite „Straße" für die Brücke: worauf ein Thema verweist (Vereine,
// Mitspieler, Orte, Werke …) verbindet oft zwei Themen, die morelike getrennt hält —
// z.B. „Franz Beckenbauer" → „FC Bayern München" ← „Mario Basler".
export async function pageLinks(lang, title, { limit = 40 } = {}) {
  try {
    return await cached("wiki-links2", lang + "|" + title + "|" + limit, 3 * 864e5, async () => {
      const d = await wq(lang, { action: "query", prop: "links", titles: title, plnamespace: "0", pllimit: "max", redirects: "1" });
      return (d.query?.pages?.[0]?.links || []).map((l) => l.title).slice(0, limit);
    });
  } catch { return []; } // Fehler -> leer, aber UNGECACHT
}

// Kategorien + Seitenaufrufe (Popularität) + kanonische URL.
export async function pageInfo(lang, title) {
  try {
    return await cached("wiki-info2", lang + "|" + title, 3 * 864e5, async () => {
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
    });
  } catch { return { categories: [], views: 0, url: wikiUrl(lang, title) }; } // Fehler -> neutral, UNGECACHT
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
