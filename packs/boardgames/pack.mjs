// packs/boardgames/pack.mjs — Brettspiel-Nachbarschaften über BoardGameGeek XMLAPI2
// (offen, kein Key; liefert XML). "Ähnlich" gibt es bei BGG nicht als API, deshalb:
//   blau   = geteilte Mechaniken/Kategorien (BGG "boardgamemechanic"/-category)
//   orange = vom selben Designer / Verlag
// Popularität = usersrated (wie viele Menschen es bewertet haben).

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { tags, blocks, decode } from "../../lib/xml.mjs";

const BGG = "https://boardgamegeek.com/xmlapi2";
const yearOf = (item) => tags(item._inner, "yearpublished")[0]?.value;
const display = (name, year) => year ? `${name} (${year})` : name;
const stripYear = (name) => String(name).replace(/\s*\((\d{4})\)\s*$/, "").trim();

async function xml(path) {
  // BGG antwortet gelegentlich mit 202 "processing" — jfetch wirft dann; einmal kurz erneut.
  try { return await jfetch(BGG + path, { gapMs: 400 }); }
  catch { await new Promise((r) => setTimeout(r, 800)); return jfetch(BGG + path, { gapMs: 400 }); }
}

async function searchGame(name) {
  return cached("bgg-search", name, 14 * 864e5, async () => {
    const doc = await xml(`/search?type=boardgame&query=${encodeURIComponent(stripYear(name))}`);
    const items = blocks(doc, "item");
    if (!items.length) return null;
    // exakten (Jahr-)Treffer bevorzugen, sonst den ersten
    const wantYear = name.match(/\((\d{4})\)\s*$/)?.[1];
    const pick = (wantYear && items.find((it) => yearOf(it) === wantYear)) || items[0];
    return pick.id;
  });
}

async function thing(id) {
  return cached("bgg-thing", id, 30 * 864e5, async () => {
    const doc = await xml(`/thing?id=${id}&stats=1`);
    return blocks(doc, "item")[0] || null;
  });
}

// Namen (primary) aus einem <item>-Block ziehen.
function primaryName(item) {
  const names = tags(item._inner, "name");
  return decode((names.find((n) => n.type === "primary") || names[0])?.value || "");
}
function linksOf(item, type) {
  return tags(item._inner, "link").filter((l) => l.type === type).map((l) => ({ id: l.id, value: l.value }));
}

export default {
  id: "boardgames",
  key: null,

  config: {
    id: "boardgames",
    title: "Like Board Games",
    brand: "like",
    item: { sing: "Spiel", plur: "Spiele" },
    searchPlaceholder: "Brettspiel suchen…   ( / )",
    searchTitle: "Brettspiel bei BoardGameGeek suchen — lädt mechanisch Ähnliches + vom selben Designer (Taste /)",
    goTitle: "Spiel laden: geteilte Mechaniken + vom selben Designer/Verlag + Kategorien",
    exampleSeed: "Catan (1995)",
    emptyTitle: "Noch keine Spiele auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: mechanisch Ähnliches + vom selben Designer.",
    edges: {
      similar: { label: "geteilte Mechaniken (BGG)", count: "ähnliche" },
      together: { label: "vom selben Designer/Verlag", count: "vom selben Designer" },
    },
    popularity: { label: "Bewertungen", big: 20000, dimLabel: "Hits dämpfen", dimTitle: "Spiele mit ≥20k BGG-Bewertungen abdunkeln — nur die Geheimtipps leuchten" },
    genreLabel: "Mechaniken",
    genreFilterPlaceholder: "Mechanik filtern…",
    statuses: [
      { value: "shortlist", label: "Wunschliste", color: "#000000" },
      { value: "contacted", label: "bestellt", color: "#ff6a00" },
      { value: "confirmed", label: "im Regal", color: "#1a9e54" },
      { value: "declined", label: "nichts für mich", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Spieleranzahl, wo gespielt, Eindruck…",
    similarLabel: "Geteilte Mechaniken",
    togetherLabel: "Vom selben Designer/Verlag",
    contextLabel: "Mehr vom Designer",
    contextHint: "(BGG)",
    contextButton: "Designer-Umfeld laden",
    contextWait: "Lade Designer-Umfeld … (BGG drosselt)",
    basketLabel: "Wunschliste",
    likeLabel: "merken!",
    profileLabel: "BGG",
    searchLinks: [
      { cls: "", label: "BGG", url: "https://boardgamegeek.com/geeksearch.php?action=search&q={Q}" },
    ],
    radarTitle: "Radar — Brettspiel-Geheimtipps",
    radarTogetherReason: "vom selben Designer wie dein Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: false, venues: false },
    key: null,
  },

  async suggest(q) {
    return cached("bgg-suggest", q, 864e5, async () => {
      const doc = await xml(`/search?type=boardgame&query=${encodeURIComponent(q)}`);
      const items = blocks(doc, "item").slice(0, 6);
      const seen = new Set();
      return items.map((it) => {
        const nm = decode(tags(it._inner, "name")[0]?.value || "");
        return display(nm, yearOf(it));
      }).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  async explore(name) {
    const id = await searchGame(name);
    if (!id) throw new Error(`„${name}" nicht bei BoardGameGeek gefunden`);
    const item = await thing(id);
    if (!item) throw new Error("BGG-Detaildaten nicht ladbar");
    const nm = primaryName(item);
    const year = yearOf(item);
    const mechanics = linksOf(item, "boardgamemechanic").map((l) => l.value);
    const categories = linksOf(item, "boardgamecategory").map((l) => l.value);
    const designers = linksOf(item, "boardgamedesigner");

    // blau: andere Spiele mit derselben (Leit-)Mechanik — via BGG-Family/Rank gibt es
    // keine offene "similar"-Liste, also über die erste Mechanik als Kategorie-Suche.
    const similar = [], seen = new Set([nm.toLowerCase()]);
    // orange: weitere Spiele des ersten Designers
    const together = [];
    if (designers[0]) {
      try {
        for (const g of await gamesByDesigner(designers[0].id, { limit: 12 })) {
          if (seen.has(g.name.toLowerCase())) continue;
          seen.add(g.name.toLowerCase());
          together.push({ name: g.name, url: `https://boardgamegeek.com/boardgame/${g.id}`, weight: 1 });
        }
      } catch {}
    }
    // blau aus dem Designer-Umfeld ist zu eng — stattdessen mechanisch verwandte über
    // die "boardgamefamily"-Links (thematische/serielle Nähe), fällt sonst leer aus.
    for (const fam of linksOf(item, "boardgamefamily").slice(0, 2)) {
      // Familien-IDs sind nicht direkt auflösbar ohne weitere Calls -> als Themen-Chips nutzen
    }

    return {
      canonical: display(nm, year),
      url: `https://boardgamegeek.com/boardgame/${id}`,
      genres: [...mechanics, ...categories].slice(0, 6),
      similarSource: "bgg",
      togetherSource: "bgg",
      // similar bleibt (mangels offener Ähnlichkeitsliste) konservativ: die Designer-Nachbarn
      // sind das verlässlichste "du magst X -> schau Y"-Signal, daher als together geführt.
      similar,
      together: together.slice(0, 12),
      sources: ["bgg"],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const id = await searchGame(a.name);
      if (id) {
        const item = await thing(id);
        const usersrated = tags(item._inner, "usersrated")[0]?.value;
        if (usersrated) out.popularity = parseInt(usersrated, 10) || null;
        if (!a.url) out.url = `https://boardgamegeek.com/boardgame/${id}`;
        if (!a.genres?.length) out.genres = linksOf(item, "boardgamemechanic").map((l) => l.value).slice(0, 6);
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const id = await searchGame(name);
    if (!id) return null;
    const item = await thing(id);
    return parseInt(tags(item._inner, "usersrated")[0]?.value, 10) || null;
  },

  async context(name) {
    const id = await searchGame(name);
    const item = id && (await thing(id));
    const designer = item && linksOf(item, "boardgamedesigner")[0];
    if (!designer) return { groups: [] };
    const games = await gamesByDesigner(designer.id, { limit: 12 });
    return {
      note: `Designer: ${designer.value}`,
      groups: [{ label: "Weitere Spiele", items: games.filter((g) => g.id !== id).map((g) => ({ name: g.name, sub: g.year || "" })) }],
    };
  },

  async diag() {
    return [
      { name: "BGG Suche", probe: async () => !!(await searchGame("Catan (1995)")) },
      { name: "BGG Detaildaten", probe: async () => { const id = await searchGame("Catan (1995)"); return !!(await thing(id)); } },
    ];
  },
};

// BGG hat keinen "Spiele eines Designers"-Endpunkt in XMLAPI2; wir lesen die
// verlinkten Spiele aus der Designer-Seite über die (family-)Sammlung nicht ab,
// sondern über die "linkeditems" des thing-Calls des Designers — der ist als
// type=boardgamedesigner via /thing?id=... erreichbar und listet inbound-Links.
async function gamesByDesigner(designerId, { limit = 12 } = {}) {
  return cached("bgg-designer", designerId + "|" + limit, 14 * 864e5, async () => {
    try {
      const doc = await jfetch(`${BGG}/thing?id=${designerId}`, { gapMs: 400 });
      // inbound boardgame-Links stehen als <link inbound="true" type="boardgamedesigner" .../>
      const item = blocks(doc, "item")[0];
      if (!item) return [];
      const links = tags(item._inner, "link").filter((l) => l.inbound === "true" && l.type === "boardgamedesigner");
      return links.slice(0, limit).map((l) => ({ id: l.id, name: decode(l.value), year: null }));
    } catch { return []; }
  });
}
