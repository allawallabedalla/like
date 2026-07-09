// packs/games/pack.mjs — (Indie-)Game-Nachbarschaften über Steam Storefront + SteamSpy
// (beide offen, kein Key).
//   blau   = geteilte Tags/Genres (SteamSpy-Tags) + optional TasteDive ("Spieler mochten auch")
//   orange = vom selben Entwickler
// Popularität = SteamSpy-Owner-Schätzung (Mittel der Spanne). Für "klein/Indie" ideal.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { similarByTaste, hasTastediveKey } from "../../lib/tastedive.mjs";

const STEAM = "https://store.steampowered.com/api";
const SPY = "https://steamspy.com/api.php";

async function searchGame(name) {
  return cached("steam-search", name, 14 * 864e5, async () => {
    const u = new URL(STEAM + "/storesearch/");
    u.searchParams.set("term", name);
    u.searchParams.set("cc", "de");
    u.searchParams.set("l", "en");
    const j = await jfetch(u.href);
    return j.items?.[0] || null; // { id, name, ... }
  });
}

async function spy(appid) {
  return cached("steamspy-app", appid, 14 * 864e5, async () => {
    const j = await jfetch(`${SPY}?request=appdetails&appid=${appid}`);
    return j && j.appid ? j : null;
  });
}

// Owner-Schätzung "20,000 .. 50,000" -> Mittelwert.
function ownersMid(s) {
  const m = String(s?.owners || "").replace(/,/g, "").match(/(\d+)\D+(\d+)/);
  return m ? Math.round((+m[1] + +m[2]) / 2) : null;
}
function tagList(s) {
  if (!s?.tags) return [];
  return Array.isArray(s.tags) ? s.tags : Object.keys(s.tags);
}

async function byDeveloper(dev, { limit = 12 } = {}) {
  // SteamSpy hat keinen sauberen Entwickler-Filter ohne Vollscan; die Storefront-Suche
  // nach dem Entwicklernamen ist der pragmatische Weg (liefert dessen Titel gut).
  return cached("steam-dev", dev + "|" + limit, 14 * 864e5, async () => {
    const u = new URL(STEAM + "/storesearch/");
    u.searchParams.set("term", dev);
    u.searchParams.set("cc", "de");
    u.searchParams.set("l", "en");
    const j = await jfetch(u.href);
    return (j.items || []).slice(0, limit);
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
    emptyTitle: "Noch keine Spiele auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: Tag-Nachbarn + vom selben Entwickler.",
    edges: {
      similar: { label: "geteilte Tags (SteamSpy)", count: "ähnliche" },
      together: { label: "vom selben Entwickler", count: "vom Entwickler" },
    },
    popularity: { label: "Besitzer", big: 500000, dimLabel: "Hits dämpfen", dimTitle: "Spiele mit sehr vielen Besitzern abdunkeln — nur die Indies leuchten" },
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
    similarLabel: "Geteilte Tags",
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
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false },
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
      "geteilte Tags (SteamSpy)": "shared tags (SteamSpy)",
      "ähnliche": "similar",
      "vom selben Entwickler": "by the same developer",
      "vom Entwickler": "by the developer",
      "Besitzer": "Owners",
      "Hits dämpfen": "Dim hits",
      "Spiele mit sehr vielen Besitzern abdunkeln — nur die Indies leuchten": "Dim games with very many owners - only the indies glow",
      "Tag filtern…": "Filter tags…",
      "Wunschliste": "Wishlist",
      "spiele ich": "playing",
      "durchgespielt": "completed",
      "nichts für mich": "not for me",
      "Notiz": "Note",
      "Empfohlen von, Plattform, Eindruck…": "Recommended by, platform, impression…",
      "Geteilte Tags": "Shared tags",
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

  async explore(name) {
    const hit = await searchGame(name);
    if (!hit) throw new Error(`„${name}" nicht bei Steam gefunden`);
    const s = await spy(hit.id);
    const tags = tagList(s).slice(0, 6);
    const dev = s?.developer || null;

    // blau: geteilte Tags — SteamSpy "tag"-Endpunkt liefert Top-Spiele pro Tag
    const similar = [], seen = new Set([hit.name.toLowerCase()]);
    if (tags[0]) {
      try {
        const j = await cached("steamspy-tag", tags[0], 7 * 864e5, () => jfetch(`${SPY}?request=tag&tag=${encodeURIComponent(tags[0])}`));
        for (const app of Object.values(j || {}).slice(0, 20)) {
          const k = (app.name || "").toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          similar.push({ name: app.name, url: `https://store.steampowered.com/app/${app.appid}`, match: 0.5 });
        }
      } catch {}
    }
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
    try {
      const hit = await searchGame(a.name);
      if (hit) {
        if (!a.url) out.url = `https://store.steampowered.com/app/${hit.id}`;
        const s = await spy(hit.id);
        const owners = ownersMid(s);
        if (owners) out.popularity = owners;
        if (!a.genres?.length && tagList(s).length) out.genres = tagList(s).slice(0, 6);
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const hit = await searchGame(name);
    if (!hit) return null;
    return ownersMid(await spy(hit.id));
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
      { name: "SteamSpy Details", probe: async () => { const h = await searchGame("Hades"); return !!(await spy(h.id)); } },
      { name: "TasteDive (Spieler mochten auch)", probe: async () => true, note: tdNote },
    ];
  },
};
