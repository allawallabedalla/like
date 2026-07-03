// packs/podcasts/pack.mjs — Podcast-Nachbarschaften über die iTunes/Apple Search API
// (offen, kein Key). Apple bietet keine offene "ähnliche Podcasts"-Liste, deshalb:
//   blau   = gleiches Genre (Apple-Genre-Nachbarn) + optional TasteDive ("Hörer mochten auch")
//   orange = vom selben Anbieter/Netzwerk (artistName)
// Popularität = trackCount (Episodenzahl) als grober Aktivitäts-Indikator — Apple gibt
// keine Hörerzahlen frei; das ist die ehrliche Grenze dieses Packs.

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";
import { similarByTaste, hasTastediveKey } from "../../lib/tastedive.mjs";

const ITUNES = "https://itunes.apple.com";

async function searchPodcast(name) {
  return cached("pod-search", name, 14 * 864e5, async () => {
    const u = new URL(ITUNES + "/search");
    u.searchParams.set("term", name);
    u.searchParams.set("media", "podcast");
    u.searchParams.set("limit", "1");
    const j = await jfetch(u.href);
    return j.results?.[0] || null;
  });
}

// Beliebte Podcasts desselben Genres: Apples Top-Charts-RSS (echte Popularität,
// keine Wortsuche). Fallback auf die normale Suche, falls das RSS-Format kippt.
async function byGenre(genreId, { limit = 14 } = {}) {
  return cached("pod-genre", genreId + "|" + limit, 7 * 864e5, async () => {
    try {
      const j = await jfetch(`${ITUNES}/de/rss/toppodcasts/genre=${genreId}/limit=${limit}/json`);
      let entries = j.feed?.entry || [];
      if (!Array.isArray(entries)) entries = [entries];
      const out = entries
        .map((e) => ({ collectionName: e["im:name"]?.label, collectionViewUrl: e.link?.attributes?.href || null }))
        .filter((p) => p.collectionName);
      if (out.length) return out;
    } catch { /* RSS klemmt -> Suche */ }
    const u = new URL(ITUNES + "/search");
    u.searchParams.set("term", "podcast");
    u.searchParams.set("media", "podcast");
    u.searchParams.set("genreId", String(genreId));
    u.searchParams.set("limit", String(limit));
    const j = await jfetch(u.href);
    return j.results || [];
  });
}

async function byProvider(artist, { limit = 12 } = {}) {
  return cached("pod-provider", artist + "|" + limit, 7 * 864e5, async () => {
    const u = new URL(ITUNES + "/search");
    u.searchParams.set("term", artist);
    u.searchParams.set("media", "podcast");
    u.searchParams.set("attribute", "artistTerm"); // nach Anbieter suchen, nicht nach Titel
    u.searchParams.set("limit", "20");
    const j = await jfetch(u.href);
    return (j.results || []).filter((p) => p.artistName && p.artistName.toLowerCase() === artist.toLowerCase()).slice(0, limit);
  });
}

export default {
  id: "podcasts",
  key: null, // Apple-Suche ist offen; TasteDive-Key optional (.tastedive-key)

  config: {
    id: "podcasts",
    title: "Like Podcasts",
    brand: "like",
    item: { sing: "Podcast", plur: "Podcasts" },
    searchPlaceholder: "Podcast suchen…   ( / )",
    searchTitle: "Podcast bei Apple suchen — lädt Genre-Nachbarn + vom selben Anbieter (Taste /)",
    goTitle: "Podcast laden: Genre-Nachbarn + vom selben Anbieter + Genres",
    exampleSeed: "Lage der Nation",
    emptyTitle: "Noch keine Podcasts auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: Genre-Nachbarn + vom selben Anbieter.",
    edges: {
      similar: { label: "gleiches Genre (Apple)", count: "ähnliche" },
      together: { label: "vom selben Anbieter", count: "vom Anbieter" },
    },
    popularity: { label: "Episoden", big: 500, dimLabel: "Dauerläufer dämpfen", dimTitle: "Podcasts mit sehr vielen Episoden abdunkeln" },
    genreLabel: "Genres",
    genreFilterPlaceholder: "Genre filtern…",
    statuses: [
      { value: "shortlist", label: "will ich hören", color: "#000000" },
      { value: "contacted", label: "höre ich", color: "#ff6a00" },
      { value: "confirmed", label: "Abo", color: "#1a9e54" },
      { value: "declined", label: "nichts für mich", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Empfohlen von, beste Folge, Gedanken…",
    similarLabel: "Gleiches Genre",
    togetherLabel: "Vom selben Anbieter",
    contextLabel: "Mehr vom Anbieter",
    contextHint: "(Apple)",
    contextButton: "Anbieter-Umfeld laden",
    contextWait: "Lade Anbieter-Umfeld …",
    basketLabel: "Hörliste",
    likeLabel: "merken!",
    profileLabel: "Apple Podcasts",
    searchLinks: [
      { cls: "", label: "Apple", url: "https://podcasts.apple.com/search?term={Q}" },
      { cls: "yt", label: "YouTube", url: "https://www.youtube.com/results?search_query={Q}+podcast" },
    ],
    radarTitle: "Radar — Podcast-Geheimtipps",
    radarTogetherReason: "vom selben Anbieter wie dein Like",
    previewLabel: "Neueste Folge anspielen",
    features: { preview: true, radar: true, context: true, active: false, booking: false, tour: false, venues: false },
    key: null,
  },

  async suggest(q) {
    return cached("pod-suggest", q, 864e5, async () => {
      const u = new URL(ITUNES + "/search");
      u.searchParams.set("term", q);
      u.searchParams.set("media", "podcast");
      u.searchParams.set("limit", "6");
      const j = await jfetch(u.href);
      const seen = new Set();
      return (j.results || []).map((p) => p.collectionName).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  async explore(name) {
    const hit = await searchPodcast(name);
    if (!hit) throw new Error(`„${name}" nicht bei Apple Podcasts gefunden`);
    const canonical = hit.collectionName;
    const genres = (hit.genres || []).filter((g) => g !== "Podcasts").slice(0, 6);

    // blau: Genre-Nachbarn + optional TasteDive
    const similar = [], seen = new Set([canonical.toLowerCase()]);
    if (hit.primaryGenreId || hit.genreIds?.[0]) {
      try {
        for (const p of await byGenre(hit.primaryGenreId || hit.genreIds[0])) {
          const k = (p.collectionName || "").toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          similar.push({ name: p.collectionName, url: p.collectionViewUrl || null, match: 0.5 });
        }
      } catch {}
    }
    try {
      for (const t of await similarByTaste(canonical, "podcast", { limit: 8 })) {
        const k = t.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        similar.push({ name: t.name, url: null, match: 0.75 });
      }
    } catch {}

    // orange: vom selben Anbieter
    const together = [];
    if (hit.artistName) {
      try {
        for (const p of await byProvider(hit.artistName)) {
          if ((p.collectionName || "").toLowerCase() === canonical.toLowerCase()) continue;
          together.push({ name: p.collectionName, url: p.collectionViewUrl || null, weight: 1 });
        }
      } catch {}
    }

    return {
      canonical,
      url: hit.collectionViewUrl || null,
      genres,
      similarSource: "apple",
      togetherSource: "apple",
      similar: similar.slice(0, 18),
      together: together.slice(0, 10),
      sources: ["apple", ...((await hasTastediveKey()) ? ["tastedive"] : [])],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const hit = await searchPodcast(a.name);
      if (hit) {
        if (hit.trackCount) out.popularity = hit.trackCount;
        if (!a.url) out.url = hit.collectionViewUrl || null;
        if (!a.genres?.length) out.genres = (hit.genres || []).filter((g) => g !== "Podcasts").slice(0, 6);
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const hit = await searchPodcast(name);
    return hit?.trackCount || null;
  },

  // ▶ im Panel: die neueste Episode anspielen (Apple liefert die Audio-URL direkt).
  async preview(name) {
    const u = new URL(ITUNES + "/search");
    u.searchParams.set("term", name);
    u.searchParams.set("media", "podcast");
    u.searchParams.set("entity", "podcastEpisode");
    u.searchParams.set("limit", "3");
    const j = await jfetch(u.href);
    const ep = (j.results || []).find((r) => r.episodeUrl || r.previewUrl);
    if (!ep) return null;
    return { url: ep.episodeUrl || ep.previewUrl, track: ep.trackName || null, artist: ep.collectionName || name };
  },

  async context(name) {
    const hit = await searchPodcast(name);
    if (!hit?.artistName) return { groups: [] };
    const list = await byProvider(hit.artistName, { limit: 12 });
    return {
      note: `Anbieter: ${hit.artistName}`,
      groups: [{ label: "Weitere Podcasts", items: list.filter((p) => p.collectionName !== hit.collectionName).map((p) => ({ name: p.collectionName, sub: (p.genres || [])[0] || "" })) }],
    };
  },

  async diag() {
    const tdNote = (await hasTastediveKey()) ? "" : "kein Key (optional)";
    return [
      { name: "Apple Podcast-Suche", probe: async () => !!(await searchPodcast("Lage der Nation")) },
      { name: "Apple Genre-Nachbarn", probe: async () => { const h = await searchPodcast("Lage der Nation"); return (await byGenre(h.primaryGenreId || h.genreIds?.[0] || 26)).length > 0; } },
      { name: "TasteDive (Hörer mochten auch)", probe: async () => (await hasTastediveKey()) ? true : true, note: tdNote },
    ];
  },
};
