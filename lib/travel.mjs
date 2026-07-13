// travel.mjs — Reiseziel-Nachbarschaften aus freien Quellen (kein Key):
//   • Nominatim (OpenStreetMap)  → Koordinaten eines Orts  → Heimat-Distanz (Luftlinie)
//   • Wikivoyage (MediaWiki API) → Reisestil-Tags (Lexikon-Scan), Stil-Peers (Volltextsuche),
//                                  Nachbarziele (Geosuche), Beliebtheit (pageviews)
//
// Zwei unabhängige Achsen, genau wie gewünscht:
//   1) Heimat-Distanz  = Luftlinie Ort ↔ Heimatort (frei konfigurierbar)
//   2) Stil-Abweichung = Unterschied im Reisestil (Strand/Berge/Kultur/Party/…),
//      NICHT an Distanz gekoppelt. Türkei-All-inclusive und Alpen-Bergtour liegen
//      geografisch nah, im Stil aber weit auseinander — hier sauber getrennt.

import { cached } from "./cache.mjs";
import { jfetch } from "./jfetch.mjs";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Reisestil-Lexikon: Stichwort (DE/EN, klein) -> kanonischer deutscher Tag.
// Wird über den Wikivoyage-Artikeltext gezählt -> die häufigsten Tags = der „Vibe".
const STYLE_LEXICON = [
  ["Strand & Meer", /\b(beach|beaches|strand|strände|küste|coast|coastal|seaside|riviera|lagoon|lagune|bay|bucht)\b/g],
  ["Berge & Wandern", /\b(mountain|mountains|berg|berge|hiking|wandern|wanderung|trekking|trail|alpine|alpin|gipfel|peak|summit|valley|tal)\b/g],
  ["Ski & Winter", /\b(ski|skiing|snowboard|winter sports?|wintersport|piste|slopes?|schnee|snow resort)\b/g],
  ["Stadt & Kultur", /\b(museum|museums?|gallery|galerie|old town|altstadt|cathedral|kathedrale|dom|architecture|architektur|historic|geschichte|heritage|monument|palace|palast|castle|schloss)\b/g],
  ["Party & Nightlife", /\b(nightlife|nachtleben|clubs?|party|bars?|disco|pub|cocktail)\b/g],
  ["Natur & Wildlife", /\b(national park|nationalpark|wildlife|safari|jungle|dschungel|rainforest|regenwald|nature reserve|naturschutz|glacier|gletscher|waterfall|wasserfall|volcano|vulkan)\b/g],
  ["Wüste & Abenteuer", /\b(desert|wüste|adventure|abenteuer|canyon|schlucht|expedition|dunes?|dünen|oasis|oase)\b/g],
  ["Tauchen & Wassersport", /\b(diving|tauchen|snorkel|schnorcheln|reef|riff|surf|surfing|wellen|kayak|kajak|sailing|segeln)\b/g],
  ["Kulinarik & Wein", /\b(wine|wein|vineyard|weingut|cuisine|kulinarik|gourmet|food scene|street food|market|markt|brewery|brauerei)\b/g],
  ["Ruhe & Wellness", /\b(spa|wellness|thermal|therme|hot spring|relax|erholung|retreat|yoga|resort)\b/g],
  ["Romantik", /\b(romantic|romantik|honeymoon|flitterwochen|sunset|sonnenuntergang|couples?)\b/g],
  ["Familie", /\b(family|familie|theme park|freizeitpark|amusement park|zoo|aquarium|kid-friendly|kinderfreundlich)\b/g],
];

// Titel, die Wikivoyage-Reisethemen (keine Orte) sind — aus den Stil-Peers filtern.
const NON_PLACE = /^(Diving|Hiking|Skiing|Cycling|Wine|Beaches|Nightlife|Cuisine|Travel|Backpacking|Road trips?|National parks|Museums|Architecture|Festivals?|Public holidays|Visa|Money|Health|Stay safe|Talk|Get (in|around))\b/i;

// ---- Nominatim: Ort -> Koordinaten ----
export async function geocode(name) {
  return cached("nom-geo", name, 30 * 864e5, async () => {
    const u = new URL(NOMINATIM);
    u.searchParams.set("q", name);
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("limit", "1");
    u.searchParams.set("addressdetails", "1");
    // Nominatim-Policy: höchstens 1 Anfrage/Sekunde, identifizierender User-Agent (setzt jfetch).
    const j = await jfetch(u.href, { gapMs: 1100, timeout: 10000 });
    const h = Array.isArray(j) ? j[0] : null;
    if (!h) return null;
    return {
      lat: parseFloat(h.lat), lon: parseFloat(h.lon),
      display: h.display_name,
      name: h.name || String(name),
      country: h.address?.country || null,
      type: h.type || h.category || null,
    };
  });
}

// Luftlinie in km (Haversine).
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

// ---- Wikivoyage (MediaWiki) ----
function voyApi(lang) { return `https://${lang}.wikivoyage.org/w/api.php`; }

async function voyQuery(lang, params) {
  const u = new URL(voyApi(lang));
  u.searchParams.set("format", "json");
  u.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return jfetch(u.href, { gapMs: 200, timeout: 10000 });
}

// Autocomplete: mehrere Reiseziel-Titel zu einer Eingabe (de zuerst, dann en auffüllen).
export async function suggestTitles(q, { limit = 6 } = {}) {
  try {
    return await cached("voy-sugg2", q + "|" + limit, 864e5, async () => {
      const out = [], seen = new Set();
      let fails = 0;
      for (const lang of ["de", "en"]) {
        try {
          const d = await voyQuery(lang, { action: "query", list: "search", srsearch: q, srlimit: String(limit), srnamespace: "0" });
          for (const r of d.query?.search || []) {
            if (NON_PLACE.test(r.title) || seen.has(r.title.toLowerCase())) continue;
            seen.add(r.title.toLowerCase()); out.push(r.title);
            if (out.length >= limit) break;
          }
        } catch { fails++; }
        if (out.length >= limit) break;
      }
      if (!out.length && fails) throw new Error("voy nicht erreichbar"); // -> Fallback unten, ungecacht
      return out;
    });
  } catch { return []; }
}

// Besten Artikeltitel für einen Ort finden (de zuerst, dann en).
// WICHTIG (Cache-Vergiftung, wie in wiki.mjs): ein Netz-/Drossel-Fehler darf NICHT als
// „nicht gefunden" 14 Tage eingefroren werden. Darum: bei Störung aus cached() heraus
// werfen (dann wird nichts geschrieben) — nur ein echtes leeres Suchergebnis cachet null.
export async function resolveTitle(name) {
  return cached("voy-title2", name, 14 * 864e5, async () => {
    let fails = 0;
    for (const lang of ["de", "en"]) {
      try {
        const d = await voyQuery(lang, { action: "query", list: "search", srsearch: name, srlimit: "1", srnamespace: "0" });
        const hit = d.query?.search?.[0];
        if (hit) return { lang, title: hit.title };
      } catch { fails++; }
    }
    if (fails) throw new Error("Wikivoyage ist gerade nicht erreichbar (Netz/Drossel) — kurz warten und nochmal versuchen.");
    return null;
  });
}

// Artikel-Rohtext + Links + Koordinaten + Aufrufe (für Seed).
export async function article(lang, title) {
  try {
    return await cached("voy-art2", lang + "|" + title, 7 * 864e5, async () => {
      // Der parse-Call trägt den Artikel (Stil-Tags/Links). Scheitert ER, gibt es nichts
      // Sinnvolles zu cachen -> Fehler durchreichen (nicht als leerer Artikel einfrieren).
      const p = await voyQuery(lang, { action: "parse", page: title, prop: "wikitext|links", redirects: "1" });
      const wikitext = p.parse?.wikitext || "";
      const links = (p.parse?.links || []).filter((l) => l.ns === 0 && l.exists).map((l) => l.title);
      let coord = null, views = 0;
      try { // Koordinaten/Aufrufe sind optional -> deren Ausfall darf den Artikel nicht kippen
        const q = await voyQuery(lang, { action: "query", titles: title, prop: "coordinates|pageviews", redirects: "1" });
        const pg = q.query?.pages?.[0];
        if (pg?.coordinates?.[0]) coord = { lat: pg.coordinates[0].lat, lon: pg.coordinates[0].lon };
        if (pg?.pageviews) views = Object.values(pg.pageviews).reduce((s, v) => s + (v || 0), 0);
      } catch {}
      return { lang, title, wikitext, links, coord, views };
    });
  } catch { return { lang, title, wikitext: "", links: [], coord: null, views: 0 }; } // neutral, UNGECACHT
}

// Reisestil-Tags aus dem Artikeltext (häufigste Lexikon-Treffer zuerst) + roher Zählvektor.
export function styleTags(wikitext, { limit = 5 } = {}) {
  const text = String(wikitext).toLowerCase();
  const counts = [];
  for (const [tag, re] of STYLE_LEXICON) {
    const m = text.match(re);
    if (m && m.length) counts.push([tag, m.length]);
  }
  counts.sort((a, b) => b[1] - a[1]);
  return { tags: counts.slice(0, limit).map(([t]) => t), vector: Object.fromEntries(counts) };
}

// Stil-Peers: andere Ziele mit ähnlichem Vibe (Volltextsuche nach dem Top-Stil).
// Bewusst OHNE Geo-Bezug — der Stil trägt, nicht die Nähe.
export async function styleSimilar(lang, topTags, seedTitle, { limit = 14 } = {}) {
  if (!topTags.length) return [];
  try {
    return await cached("voy-style2", lang + "|" + topTags.slice(0, 2).join("+") + "|" + limit, 3 * 864e5, async () => {
      // Suchbegriff aus den 1–2 stärksten Stil-Tags (nur der beschreibende Teil vor „&").
      const terms = topTags.slice(0, 2).map((t) => t.split("&")[0].trim()).join(" ");
      const out = [], seen = new Set([seedTitle.toLowerCase()]);
      let fails = 0;
      for (const l of [lang, lang === "de" ? "en" : "de"]) {
        try {
          const d = await voyQuery(l, { action: "query", list: "search", srsearch: terms, srlimit: String(limit + 6), srnamespace: "0" });
          for (const r of d.query?.search || []) {
            const t = r.title;
            if (NON_PLACE.test(t) || seen.has(t.toLowerCase())) continue;
            seen.add(t.toLowerCase());
            out.push({ title: t, lang: l });
            if (out.length >= limit) break;
          }
        } catch { fails++; }
        if (out.length >= limit) break;
      }
      if (!out.length && fails) throw new Error("voy nicht erreichbar"); // -> leer, ungecacht
      return out;
    });
  } catch { return []; }
}

// Nachbarziele (kombinierbar): Wikivoyage-Artikel im Umkreis der Koordinaten.
export async function geoNearby(lang, coord, seedTitle, { radiusKm = 120, limit = 14 } = {}) {
  if (!coord) return [];
  try {
    return await cached("voy-near2", lang + "|" + coord.lat.toFixed(2) + "," + coord.lon.toFixed(2) + "|" + radiusKm, 7 * 864e5, async () => {
      const d = await voyQuery(lang, {
        action: "query", list: "geosearch",
        gscoord: `${coord.lat}|${coord.lon}`, gsradius: String(Math.min(10000, radiusKm * 1000)),
        gslimit: String(limit + 6), gsnamespace: "0",
      });
      const out = [];
      for (const g of d.query?.geosearch || []) {
        if (g.title.toLowerCase() === seedTitle.toLowerCase() || NON_PLACE.test(g.title)) continue;
        out.push({ title: g.title, km: Math.round(g.dist / 1000), lang });
        if (out.length >= limit) break;
      }
      return out;
    });
  } catch { return []; } // Fehler -> leer, aber UNGECACHT
}

export function voyUrl(lang, title) {
  return `https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
