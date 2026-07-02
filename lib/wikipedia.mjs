// wikipedia.mjs — Lineups von Wikipedia ziehen (MediaWiki API, nur eingebautes fetch).
//
// Strategie: Wikitext der Seite holen, den Lineup-Abschnitt finden
// (Überschrift wie "Line-up", "Acts", "Besetzung", "Künstler" …) und darin die
// Künstler-Wikilinks [[…]] einsammeln. Robust, weil Wikitext stabiler ist als das HTML.

const UA = "LikeBookingTool/0.1 (personal, non-commercial booking tool)";

// Alle Wikipedia-Requests laufen serialisiert mit Mindestabstand + Retry/Backoff,
// damit wir nicht in die Rate-Limits (HTTP 429) laufen.
const MIN_INTERVAL = 180; // ms Abstand zwischen Requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve();
async function wpFetch(url) {
  const job = gate.then(async () => {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429 || res.status === 503) {
        const ra = parseInt(res.headers.get("retry-after") || "0", 10);
        await sleep(ra ? ra * 1000 : 500 * 2 ** i);
        continue;
      }
      await sleep(MIN_INTERVAL);
      return res;
    }
    await sleep(MIN_INTERVAL);
    return fetch(url, { headers: { "user-agent": UA } });
  });
  gate = job.then(() => {}, () => {});
  return job;
}

// Akzeptiert vollständige URL ODER reinen Seitentitel (+ lang-Option).
export function parseTarget(input, fallbackLang = "en") {
  const s = String(input).trim();
  const m = s.match(/^https?:\/\/([a-z]{2,3})\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i);
  if (m) {
    return { lang: m[1].toLowerCase(), title: decodeURIComponent(m[2]).replace(/_/g, " ") };
  }
  return { lang: fallbackLang, title: s };
}

const LINEUP_RE = /line[\s-]?up|lineup|^acts$|artists|performers|performing|bands|k[üu]nstler|besetzung|programm|teilnehmer|auftritte/i;
const SKIP_LINK_RE = /^(List|Liste|File|Datei|Image|Bild|Category|Kategorie|Template|Vorlage|Help|Hilfe|Wikipedia|Portal|Special|Spezial)\b|:/i;
// Begriffsklärungs-Zusätze, die klar keine Acts sind (aber "(band)"/"(musician)" bleiben!).
const NON_ARTIST_QUALIFIER = /\((magazine|newspaper|website|company|publisher|software|video game|TV (channel|series|network)|radio (station|network)|film|novel|book|brewery|beer|drink|river|city|town|county|state|footballer|politician|disambiguation)\)\s*$/i;

// Eine Wikitext-Überschrift: == Titel ==, === … === usw. Gibt {level, title, index} zurück.
function findHeadings(wikitext) {
  const out = [];
  const re = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;
  let m;
  while ((m = re.exec(wikitext))) {
    out.push({ level: m[1].length, title: m[2].replace(/\[\[|\]\]|'''?/g, "").trim(), start: m.index, end: re.lastIndex });
  }
  return out;
}

// Fußnoten, HTML-Kommentare und Zitations-Templates entfernen (Quellen-Links raus).
function clean(region) {
  return region
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{\s*(cite|citation|sfn|refn|reflist|efn)[\s\S]*?\}\}/gi, "");
}

const LINK_RE = /\[\[([^\]|#<>{}]+?)(?:\|[^\]]*)?\]\]/g;

// Künstler-Wikilinks einsammeln. Nur aus Lineup-typischen Zeilen (Aufzählung, Tabellenzelle
// oder komma-getrennte Mehrfach-Links) — Fließtext-/Prosa-Links werden ignoriert.
function extractArtists(region) {
  const seen = new Set();
  const out = [];
  for (const raw of clean(region).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const links = [...line.matchAll(LINK_RE)].map((m) => m[1].trim()).filter(Boolean);
    if (links.length === 0) continue;

    const isListOrTable = /^[*#;:|!]/.test(line);
    if (!isListOrTable && links.length < 2) continue; // einzelner Link im Fließtext -> kein Act

    for (const name of links) {
      if (SKIP_LINK_RE.test(name) || NON_ARTIST_QUALIFIER.test(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export async function fetchLineup(input, { lang = "en" } = {}) {
  const target = parseTarget(input, lang);
  const api = `https://${target.lang}.wikipedia.org/w/api.php`;
  const url = new URL(api);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", target.title);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("format", "json");

  const res = await wpFetch(url);
  if (!res.ok) throw new Error("Wikipedia HTTP " + res.status);
  const data = await res.json();
  if (data.error) throw new Error("Wikipedia: " + data.error.info);

  const pageTitle = data.parse?.title || target.title;
  const wikitext = data.parse?.wikitext || "";
  if (!wikitext) throw new Error("Keine Seiteninhalte gefunden für: " + target.title);

  const headings = findHeadings(wikitext);

  // Lineup-Abschnitt(e) finden: jede passende Überschrift, Region bis zur nächsten
  // Überschrift gleicher/höherer Ebene (Unterabschnitte wie Jahre bleiben drin).
  const artists = [];
  const seen = new Set();
  let matchedSections = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (!LINEUP_RE.test(h.title)) continue;
    let regionEnd = wikitext.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) { regionEnd = headings[j].start; break; }
    }
    matchedSections.push(h.title);
    for (const name of extractArtists(wikitext.slice(h.end, regionEnd))) {
      const k = name.toLowerCase();
      if (!seen.has(k)) { seen.add(k); artists.push(name); }
    }
  }

  // Fallback: keine Lineup-Überschrift gefunden -> ganze Seite scannen (z. B. reine Jahres-Seiten)
  if (artists.length === 0) {
    for (const name of extractArtists(wikitext)) {
      const k = name.toLowerCase();
      if (!seen.has(k)) { seen.add(k); artists.push(name); }
    }
    matchedSections = ["(ganze Seite — kein Lineup-Abschnitt erkannt)"];
  }

  return {
    eventName: pageTitle,
    lineup: artists,
    sections: matchedSections,
    sourceUrl: `https://${target.lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
  };
}

// ---- Automatische Entdeckung: Acts -> Festivals (Backlinks + Kategorien) ----

async function wpQuery(lang, params) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await wpFetch(url);
  if (!res.ok) throw new Error("Wikipedia HTTP " + res.status);
  const d = await res.json();
  if (d.error) throw new Error("Wikipedia: " + d.error.info);
  return d;
}

const MUSIC_CAT_RE = /musician|musical group|musical ensemble|musical duo|musical trio|\bbands?\b|\bsingers?\b|vocal group|girl group|boy band|\bDJs?\b|rapper|record producer|songwriter|electronic music|hip hop|Musiker|Musikgruppe|S(ä|ae)nger|Band /i;
const FEST_CAT_RE = /festival/i;

// Wikipedia-Seite eines Acts finden (mit Begriffsklärung wie "(musician)" / "(band)").
export async function resolveArtistTitle(name, { lang = "en" } = {}) {
  const cands = [name, `${name} (musician)`, `${name} (band)`, `${name} (DJ)`, `${name} (rapper)`, `${name} (singer)`, `${name} (duo)`];
  const d = await wpQuery(lang, {
    action: "query", redirects: 1, titles: cands.join("|"),
    prop: "categories", cllimit: "max", clshow: "!hidden",
  });
  const pages = (d.query?.pages || []).filter((p) => !p.missing && (p.categories || []).some((c) => MUSIC_CAT_RE.test(c.title)));
  if (!pages.length) return null;
  const score = (t) => (t === name ? 0 : /\((musician|band|DJ|rapper|singer|duo|group)\)$/i.test(t) ? 1 : 2);
  pages.sort((a, b) => score(a.title) - score(b.title));
  return pages[0].title;
}

// Seiten, die auf `title` verlinken (Namespace 0, keine Weiterleitungen).
export async function getBacklinks(title, { lang = "en", limit = 200 } = {}) {
  const d = await wpQuery(lang, {
    action: "query", list: "backlinks", bltitle: title,
    blnamespace: 0, bllimit: limit, blfilterredir: "nonredirects",
  });
  return (d.query?.backlinks || []).map((b) => b.title);
}

// Aus einer Titelliste die heraussuchen, die laut Kategorie Festivals sind (Batches à 50).
export async function filterFestivals(titles, { lang = "en" } = {}) {
  const out = new Set();
  const todo = titles.filter((t) => !/^(List of|Lists of|Liste )/i.test(t));
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const d = await wpQuery(lang, {
      action: "query", titles: batch.join("|"), redirects: 1,
      prop: "categories", cllimit: "max", clshow: "!hidden",
    });
    for (const p of (d.query?.pages || [])) {
      if (p.missing) continue;
      if ((p.categories || []).some((c) => FEST_CAT_RE.test(c.title))) out.add(p.title);
    }
  }
  return out;
}
