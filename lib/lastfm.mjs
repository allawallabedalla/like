// lastfm.mjs — dünner Wrapper um die Last.fm API (nur eingebautes fetch, keine Deps).
// API-Key kommt aus ENV LASTFM_API_KEY oder der Datei like/.lastfm-key (gitignored).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cached } from "./cache.mjs";

const ROOT = process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url)));

let cachedKey = null;
export async function getKey() {
  if (cachedKey) return cachedKey;
  if (process.env.LASTFM_API_KEY) return (cachedKey = process.env.LASTFM_API_KEY.trim());
  try {
    const k = (await readFile(join(ROOT, ".lastfm-key"), "utf8")).trim();
    if (k) return (cachedKey = k);
  } catch {}
  throw new Error(
    "Kein Last.fm API-Key. Hol dir einen (gratis) unter https://www.last.fm/api/account/create " +
      "und lege ihn als ENV LASTFM_API_KEY ab ODER in die Datei like/.lastfm-key"
  );
}

// Ähnliche Künstler zu `name`. Gibt korrigierten Quellnamen + Liste zurück. (14 Tage gecacht)
export async function getSimilar(name, { limit = 30, key } = {}) {
  key ??= await getKey();
  return cached("similar", name + "|" + limit, 14 * 864e5, async () => {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.getsimilar");
    url.searchParams.set("artist", name);
    url.searchParams.set("api_key", key);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("autocorrect", "1");

    const res = await fetch(url);
    if (!res.ok) throw new Error("Last.fm HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(`Last.fm Fehler ${data.error}: ${data.message}`);

    const attr = data.similarartists?.["@attr"];
    const sourceName = attr?.artist || name;
    const list = data.similarartists?.artist || [];
    return {
      sourceName,
      similar: list.map((a) => ({
        name: a.name,
        mbid: a.mbid || null,
        match: parseFloat(a.match) || 0,
        url: a.url || null,
      })),
    };
  });
}

// Namensvorschläge für die Suche (Autocomplete). 1 Tag gecacht.
export async function searchArtists(q, { limit = 6, key } = {}) {
  key ??= await getKey();
  return cached("search", q + "|" + limit, 1 * 864e5, async () => {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.search");
    url.searchParams.set("artist", q);
    url.searchParams.set("api_key", key);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    let list = data.results?.artistmatches?.artist || [];
    if (!Array.isArray(list)) list = [list];
    const seen = new Set();
    return list.map((a) => a.name).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, limit);
  });
}

// Top-Tags (Genres) eines Acts — funktioniert auch für Bands, die nicht (mehr) auftreten.
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
export async function getTopTags(name, { limit = 6, key } = {}) {
  key ??= await getKey();
  return cached("tags", name, 30 * 864e5, async () => {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.gettoptags");
    url.searchParams.set("artist", name);
    url.searchParams.set("api_key", key);
    url.searchParams.set("format", "json");
    url.searchParams.set("autocorrect", "1");
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const tags = data.toptags?.tag || [];
    // nur halbwegs verbreitete Tags, keine "seen live"/"favorite"-Spielereien
    return tags
      .filter((t) => (t.count || 0) >= 5 && !/seen live|favou?rite|my |awesome|loved/i.test(t.name))
      .slice(0, limit)
      .map((t) => titleCase(t.name));
  });
}
