// packs/games/pack.mjs — (Indie-)Game-Nachbarschaften über Steam Storefront + SteamSpy
// (beide offen, kein Key).
//   blau   = Schnittmenge der Top-3-SteamSpy-Tags (mehr geteilte Tags = näher dran) +
//            optional TasteDive ("Spieler mochten auch")
//   orange = vom selben Entwickler
// Popularität = Steams offizielle Rezensionszahl (query_summary.total_reviews), Fallback
// SteamSpy-Owner-Schätzung (Mittel der Spanne) falls die Review-Zahl mal fehlt. Reviews
// sind eine exakte, sich laufend ändernde Zahl statt SteamSpys grober Owner-Bucket-Spanne
// ("500k–1M") — die Momentum-Zeitreihe (▲ +x%/Monat) bekommt dadurch überhaupt Bewegung.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { similarByTaste, hasTastediveKey } from "../../lib/tastedive.mjs";
import { surpriseFrom } from "../../lib/surprise.mjs";

const STEAM = "https://store.steampowered.com/api";

// „Überrasch mich" (Kaltstart): kuratierter Pool feiner Indie-Titel. surprise() nimmt
// das Spiel mit den WENIGSTEN Reviews (popularity()) -> eher ein Geheimtipp.
const SURPRISE_SEEDS = [
  "A Short Hike", "Outer Wilds", "Return of the Obra Dinn", "Tunic", "Chicory: A Colorful Tale",
  "Eastward", "Spiritfarer", "Night in the Woods", "Oxenfree", "Firewatch", "Gris",
  "Baba Is You", "The Witness", "Opus Magnum", "Into the Breach", "FTL: Faster Than Light",
  "Katana ZERO", "Hyper Light Drifter", "Cocoon", "Animal Well", "Chants of Sennaar",
  "Citizen Sleeper", "Norco", "Kentucky Route Zero", "Signalis", "Sable", "Inscryption",
  "Wilmot's Warehouse", "Mini Metro", "Islanders",
];
const SPY = "https://steamspy.com/api.php";

// Normalisierung für den Namensvergleich: Kleinschreibung, Diakritika weg, alles
// Nicht-Alphanumerische zu einem Leerzeichen. Zahlen bleiben erhalten (Teil-Nummern wie
// „Hades II"/„2" sollen NICHT verschmelzen) — nur Interpunktion/Akzente werden geglättet.
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function searchGame(name) {
  return cached("steam-search", name, 14 * 864e5, async () => {
    const u = new URL(STEAM + "/storesearch/");
    u.searchParams.set("term", name);
    u.searchParams.set("cc", "de");
    u.searchParams.set("l", "en");
    const j = await jfetch(u.href);
    const items = j.items || [];
    if (!items.length) return null;
    // (U-2d) Namensvetter-Disambiguierung: NICHT blind items[0]. Die Storefront-Suche
    // schiebt gerne ein gleichnamiges DLC/Franchise-Ergebnis vor das eigentliche Hauptspiel.
    // Bewusste Wahl: 1) exakter (normalisierter) Namens-Treffer bevorzugt, sonst
    // 2) der populärste Kandidat (meiste Reviews, ersatzweise Owner-Schätzung).
    const want = normName(name);
    const exact = items.filter((it) => normName(it.name) === want);
    const pool = exact.length ? exact : items.slice(0, 5);
    if (pool.length === 1) return pool[0]; // eindeutig -> ohne Zusatz-Abfragen zurück
    let best = pool[0], bestPop = -1;
    for (const it of pool) {
      let pop = 0; // best effort: einzelne Fehlschläge zählen als 0, verwerfen den Kandidaten nicht
      try { pop = (await popularityFor(it.id, await spy(it.id).catch(() => null))) || 0; } catch { pop = 0; }
      if (pop > bestPop) { bestPop = pop; best = it; }
    }
    return best; // { id, name, ... }
  });
}

async function spy(appid) {
  return cached("steamspy-app", appid, 14 * 864e5, async () => {
    const j = await jfetch(`${SPY}?request=appdetails&appid=${appid}`);
    return j && j.appid ? j : null;
  });
}

// Owner-Schätzung "20,000 .. 50,000" -> Mittelwert. Nur noch Fallback (s.u.), wenn Steam
// selbst keine Rezensionszahl liefert.
function ownersMid(s) {
  const m = String(s?.owners || "").replace(/,/g, "").match(/(\d+)\D+(\d+)/);
  return m ? Math.round((+m[1] + +m[2]) / 2) : null;
}
function tagList(s) {
  if (!s?.tags) return [];
  return Array.isArray(s.tags) ? s.tags : Object.keys(s.tags);
}
// Tags nach SteamSpy-Stimmen sortiert (s.tags ist meist { tagName: votes }) — für die
// Top-3-Schnittmenge brauchen wir eine verlässliche Rangfolge, nicht bloß Objekt-Reihenfolge.
function topTagNames(s, n = 3) {
  if (!s?.tags) return [];
  if (Array.isArray(s.tags)) return s.tags.slice(0, n);
  return Object.entries(s.tags).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, n).map(([k]) => k);
}

// Offizieller Steam-Endpunkt: exakte, laufend aktuelle Rezensionszahl (kein Key nötig).
async function reviewCount(appid) {
  return cached("steam-reviews", appid, 3 * 864e5, async () => {
    try {
      const j = await jfetch(`https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&language=all&purchase_type=all`);
      return j?.query_summary?.total_reviews || null;
    } catch { return null; }
  });
}
async function popularityFor(appid, s) {
  const reviews = await reviewCount(appid);
  return reviews ?? ownersMid(s);
}

// (U-2d) Kleiner Retry mit ansteigender Pause für die SteamSpy-Tag-Chart: sie ist die BLAUE
// „ähnlich"-Quelle und fiel bei 429/503 bisher STILL komplett weg. Bis zu 2 Wiederholungen
// mit wachsender Pause (400 ms, 800 ms), dann den Fehler durchreichen.
async function fetchTagChart(tag) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await jfetch(`${SPY}?request=tag&tag=${encodeURIComponent(tag)}`);
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// blau: Schnittmenge der Top-3-Tags statt nur des einen stärksten Tags — sonst landen alle
// Spiele eines Genres beim selben Mega-Hit-Chart (widerspricht der Kleine-Acts-DNA). Rang =
// wie viele der Top-3-Tags ein Kandidat mit dem Ausgangsspiel teilt; bei Gleichstand kleinere
// Spiele bevorzugen, Mega-Seller im Match-Wert zusätzlich dämpfen.
async function tagIntersectionSimilar(s, excludeNameLower, { limit = 20 } = {}) {
  const top3 = topTagNames(s, 3);
  if (!top3.length) return [];
  const cand = new Map(); // name -> { app, hits }
  let anyChart = false; // (U-2d) wurde überhaupt eine Tag-Chart geladen?
  for (const tag of top3) {
    try {
      const j = await cached("steamspy-tag", tag, 7 * 864e5, () => fetchTagChart(tag)); // (U-2d) mit Retry/Backoff
      anyChart = true;
      for (const app of Object.values(j || {})) {
        const nm = app?.name; if (!nm || nm.toLowerCase() === excludeNameLower) continue;
        const rec = cand.get(nm) || { app, hits: 0 };
        rec.hits++; cand.set(nm, rec);
      }
    } catch { /* ein Tag ohne Chart -> mit den übrigen weiter */ }
  }
  // (U-2d) Ehrlich melden statt still verschwinden: keine einzige Tag-Chart erreichbar (429/503?)
  // -> blau fällt dann leer aus; klarer diag-Hinweis statt stillem Totalausfall.
  if (!anyChart) console.warn(`[games] blau leer — keine SteamSpy-Tag-Chart erreichbar (Tags: ${top3.join(", ")})`);
  const dampBig = (owners) => owners == null ? 1 : owners > 5000000 ? 0.6 : owners > 1000000 ? 0.8 : 1;
  return [...cand.values()]
    .sort((a, b) => b.hits - a.hits || (ownersMid(a.app) ?? 1e9) - (ownersMid(b.app) ?? 1e9))
    .slice(0, limit)
    .map((r) => ({
      name: r.app.name, url: `https://store.steampowered.com/app/${r.app.appid}`,
      // (U-2d) Match = Anteil der geteilten Top-3-Tags (1/3 -> 0.5, 2/3 -> 0.75, 3/3 -> 1.0):
      // klarere Spreizung als die alte 0.55/0.75/0.95-Staffel, danach Mega-Seller dämpfen.
      match: Math.min(1, 0.25 + 0.25 * r.hits) * dampBig(ownersMid(r.app)),
    }));
}

async function byDeveloper(dev, { limit = 12 } = {}) {
  // SteamSpy hat keinen sauberen Entwickler-Filter ohne Vollscan; die Storefront-Textsuche
  // nach dem Entwicklernamen liefert dessen Titel gut — aber als Textsuche eben auch FREMDE
  // Studios (z. B. Titel, die den Namen nur erwähnen).
  // (U-2d) Darum jeden Kandidaten über die exakte SteamSpy-`developer`-Info gegen den
  // Seed-Entwickler abgleichen und Nicht-Treffer verwerfen. Lieber eine leere Orange-Liste
  // als falsche „vom selben Entwickler"-Kanten (Ehrlichkeits-Prinzip).
  return cached("steam-dev", dev + "|" + limit, 14 * 864e5, async () => {
    const u = new URL(STEAM + "/storesearch/");
    u.searchParams.set("term", dev);
    u.searchParams.set("cc", "de");
    u.searchParams.set("l", "en");
    const j = await jfetch(u.href);
    const want = String(dev).trim().toLowerCase(); // Seed-Entwickler, normalisiert
    const out = [];
    for (const it of j.items || []) {
      if (out.length >= limit) break;
      let candDev = null;
      try { candDev = (await spy(it.id))?.developer || null; } catch { candDev = null; }
      // exakter Feld-Abgleich (kein Substring): nur behalten, wenn der Entwickler exakt passt
      if (candDev && String(candDev).trim().toLowerCase() === want) out.push(it);
    }
    return out;
  });
}

export default {
  id: "games",
  key: null, // Steam/SteamSpy offen; TasteDive-Key optional (.tastedive-key)

  config: {
    id: "games",
    title: "Like Games",
    brand: "like",
    item: { sing: "Spiel", plur: "Spiele" },
    searchPlaceholder: "Spiel suchen…   ( / )",
    searchTitle: "Spiel bei Steam suchen — lädt Tag-Nachbarn + vom selben Entwickler (Taste /)",
    goTitle: "Spiel laden: geteilte Tags + vom selben Entwickler + Genres",
    exampleSeed: "Hades",
    // (U-2d) Start-Chips (Kaltstart): drei kontrastierende Eigennamen — Metroidvania, Cozy-Sim,
    // Narrativ-RPG. Eigennamen -> kein EN-Overlay nötig.
    seedChips: ["Hollow Knight", "Stardew Valley", "Disco Elysium"],
    emptyTitle: "Noch keine Spiele auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: Tag-Nachbarn + vom selben Entwickler.",
    edges: {
      similar: { label: "Tag-Schnittmenge (SteamSpy)", count: "ähnliche" },
      together: { label: "vom selben Entwickler", count: "vom Entwickler" },
    },
    // Reviews statt Besitzer-Schätzung (s.o.) -> "big"-Schwelle grob umgerechnet (Faustregel ~30-50 Besitzer/Review).
    popularity: { label: "Reviews", big: 15000, dimLabel: "Hits dämpfen", dimTitle: "Spiele mit sehr vielen Reviews abdunkeln — nur die Indies leuchten" },
    genreLabel: "Tags",
    genreFilterPlaceholder: "Tag filtern…",
    statuses: [
      { value: "shortlist", label: "Wunschliste", color: "#000000" },
      { value: "contacted", label: "spiele ich", color: "#ff6a00" },
      { value: "confirmed", label: "durchgespielt", color: "#1a9e54" },
      { value: "declined", label: "nichts für mich", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Empfohlen von, Plattform, Eindruck…",
    similarLabel: "Tag-Schnittmenge",
    togetherLabel: "Vom selben Entwickler",
    contextLabel: "Mehr vom Entwickler",
    contextHint: "(Steam)",
    contextButton: "Entwickler-Umfeld laden",
    contextWait: "Lade Entwickler-Umfeld …",
    basketLabel: "Wunschliste",
    likeLabel: "merken!",
    profileLabel: "Steam",
    searchLinks: [
      { cls: "", label: "Steam", url: "https://store.steampowered.com/search/?term={Q}" },
      { cls: "yt", label: "YouTube", url: "https://www.youtube.com/results?search_query={Q}+gameplay" },
    ],
    radarTitle: "Radar — Indie-Geheimtipps",
    radarTogetherReason: "vom selben Entwickler wie dein Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Spiel": "Game",
      "Spiele": "Games",
      "Spiel suchen…   ( / )": "Search game…   ( / )",
      "Spiel bei Steam suchen — lädt Tag-Nachbarn + vom selben Entwickler (Taste /)": "Search game on Steam - loads tag neighbors + by the same developer (key /)",
      "Spiel laden: geteilte Tags + vom selben Entwickler + Genres": "Load game: shared tags + by the same developer + genres",
      "Noch keine Spiele auf der Karte": "No games on the map yet",
      "bringt gleich sein Umfeld mit: Tag-Nachbarn + vom selben Entwickler.": "brings its surroundings along: tag neighbors + by the same developer.",
      "Tag-Schnittmenge (SteamSpy)": "tag overlap (SteamSpy)",
      "ähnliche": "similar",
      "vom selben Entwickler": "by the same developer",
      "vom Entwickler": "by the developer",
      "Reviews": "Reviews",
      "Hits dämpfen": "Dim hits",
      "Spiele mit sehr vielen Reviews abdunkeln — nur die Indies leuchten": "Dim games with very many reviews - only the indies glow",
      "Tag filtern…": "Filter tags…",
      "Wunschliste": "Wishlist",
      "spiele ich": "playing",
      "durchgespielt": "completed",
      "nichts für mich": "not for me",
      "Notiz": "Note",
      "Empfohlen von, Plattform, Eindruck…": "Recommended by, platform, impression…",
      "Tag-Schnittmenge": "Tag overlap",
      "Vom selben Entwickler": "By the same developer",
      "Mehr vom Entwickler": "More from the developer",
      "Entwickler-Umfeld laden": "Load developer context",
      "Lade Entwickler-Umfeld …": "Loading developer context …",
      "merken!": "save!",
      "Radar — Indie-Geheimtipps": "Radar - hidden indie gems",
      "vom selben Entwickler wie dein Like": "by the same developer as your like",
    },
  },

  async suggest(q) {
    return cached("steam-suggest", q, 864e5, async () => {
      const u = new URL(STEAM + "/storesearch/");
      u.searchParams.set("term", q);
      u.searchParams.set("cc", "de"); u.searchParams.set("l", "en");
      const j = await jfetch(u.href);
      const seen = new Set();
      return (j.items || []).slice(0, 6).map((i) => i.name).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): Top-3-Tag-Schnittmenge
  // (+ optional TasteDive), ohne Entwickler-Werke — schneller als explore().
  async similar(name, { limit = 18 } = {}) {
    const hit = await searchGame(name);
    if (!hit) return { canonical: name, similar: [] };
    const s = await spy(hit.id);
    const seen = new Set([hit.name.toLowerCase()]);
    const similar = (await tagIntersectionSimilar(s, hit.name.toLowerCase(), { limit: 20 }))
      .filter((x) => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    try {
      for (const t of await similarByTaste(hit.name, "game", { limit: 8 })) {
        const k = t.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        similar.push({ name: t.name, url: null, match: 0.75 });
      }
    } catch {}
    return { canonical: hit.name, similar: similar.slice(0, limit) };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, das UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): geteilte Tags (+ TasteDive)
  // PLUS weitere Spiele desselben Entwicklers. Die Katalog-Straße ist dünner, erweitert
  // aber die Reichweite („A —selber Entwickler— A2 —ähnlich— B"). Best effort. Naben
  // (Riesen-Studios mit großem Katalog) beim Ranking über die Besitzer-Schätzung gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let hit; try { hit = await searchGame(name); } catch { return { canonical: name, list: [] }; }
    if (!hit) return { canonical: name, list: [] };
    const seen = new Set([hit.name.toLowerCase()]), out = [];
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    const s = await spy(hit.id).catch(() => null);
    const dev = s?.developer || null;
    const [sim, byDev] = await Promise.all([
      this.similar(name, { limit: 18 }).catch(() => ({ similar: [] })),
      dev ? byDeveloper(dev).catch(() => []) : Promise.resolve([]),
    ]);
    for (const x of sim.similar || []) add(x.name, x.url, x.match || 0.5);                        // geteilte Tags
    for (const g of byDev) add(g.name, `https://store.steampowered.com/app/${g.id}`, 0.5);       // selber Entwickler
    return { canonical: hit.name, list: out };
  },

  async explore(name) {
    const hit = await searchGame(name);
    if (!hit) throw new Error(`„${name}" nicht bei Steam gefunden`);
    const s = await spy(hit.id);
    const tags = tagList(s).slice(0, 6);
    const dev = s?.developer || null;

    // blau: Top-3-Tag-Schnittmenge (SteamSpy) — mehr geteilte Tags = näherer Nachbar
    const seen = new Set([hit.name.toLowerCase()]);
    const similar = (await tagIntersectionSimilar(s, hit.name.toLowerCase(), { limit: 20 }))
      .filter((x) => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    try {
      for (const t of await similarByTaste(hit.name, "game", { limit: 8 })) {
        const k = t.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        similar.push({ name: t.name, url: null, match: 0.75 });
      }
    } catch {}

    // orange: vom selben Entwickler
    const together = [];
    if (dev) {
      try {
        for (const g of await byDeveloper(dev)) {
          if (g.name.toLowerCase() === hit.name.toLowerCase()) continue;
          together.push({ name: g.name, url: `https://store.steampowered.com/app/${g.id}`, weight: 1 });
        }
      } catch {}
    }

    return {
      canonical: hit.name,
      url: `https://store.steampowered.com/app/${hit.id}`,
      genres: tags,
      similarSource: "steam",
      togetherSource: "steam",
      similar: similar.slice(0, 18),
      together: together.slice(0, 10),
      sources: ["steam", "steamspy", ...((await hasTastediveKey()) ? ["tastedive"] : [])],
    };
  },

  async enrich(a) {
    const out = {};
    if (!a?.name) return out; // (U-2d) Null-Guard: ohne Namen gibt es nichts anzureichern
    try {
      const hit = await searchGame(a.name);
      if (hit) {
        if (!a.url) out.url = `https://store.steampowered.com/app/${hit.id}`;
        const s = await spy(hit.id);
        const pop = await popularityFor(hit.id, s);
        if (pop) out.popularity = pop;
        if (!a.genres?.length && tagList(s).length) out.genres = tagList(s).slice(0, 6);
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const hit = await searchGame(name);
    if (!hit) return null;
    // (U-2d) Null-Guard: SteamSpy darf ausfallen — popularityFor fällt dann auf die
    // Steam-Review-Zahl zurück (bzw. null), statt an spy()-Fehlern zu scheitern.
    return popularityFor(hit.id, await spy(hit.id).catch(() => null));
  },

  async context(name) {
    const hit = await searchGame(name);
    const s = hit && (await spy(hit.id));
    if (!s?.developer) return { groups: [] };
    const games = await byDeveloper(s.developer, { limit: 12 });
    return {
      note: `Entwickler: ${s.developer}`,
      groups: [{ label: "Weitere Spiele", items: games.filter((g) => g.id !== hit.id).map((g) => ({ name: g.name, sub: "" })) }],
    };
  },

  async diag() {
    const tdNote = (await hasTastediveKey()) ? "" : "kein Key (optional)";
    return [
      { name: "Steam Store-Suche", probe: async () => !!(await searchGame("Hades")) },
      { name: "SteamSpy Details", probe: async () => { const h = await searchGame("Hades"); return !!(h && (await spy(h.id))); } }, // (U-2d) Null-Guard: h.id nicht auf null lesen
      { name: "TasteDive (Spieler mochten auch)", probe: async () => true, note: tdNote },
    ];
  },
};
