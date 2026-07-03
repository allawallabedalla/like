// tastedive.mjs — "Leute mochten auch" über Geschmacks-Ähnlichkeit (TasteDive).
// Optionaler Gratis-Key (https://tastedive.com/read/api) — ohne Key liefert die
// Funktion einfach [] und die Packs kommen mit ihren Basis-Quellen aus.
// Ein Key versorgt gleich mehrere Packs: Bücher, Filme, Podcasts, Games.

import { getKey } from "./keys.mjs";
import { cached } from "./cache.mjs";
import { jfetch } from "./jfetch.mjs";

export async function hasTastediveKey() {
  return !!(await getKey({ envVar: "TASTEDIVE_KEY", file: ".tastedive-key", name: "TasteDive", createUrl: "https://tastedive.com/read/api", required: false }));
}

// type: "book" | "movie" | "podcast" | "game" | "music" | "show" | "author"
export async function similarByTaste(q, type, { limit = 12 } = {}) {
  const k = await getKey({ envVar: "TASTEDIVE_KEY", file: ".tastedive-key", name: "TasteDive", createUrl: "https://tastedive.com/read/api", required: false });
  if (!k) return [];
  return cached("tastedive", type + "|" + q, 14 * 864e5, async () => {
    const u = new URL("https://tastedive.com/api/similar");
    u.searchParams.set("q", `${type}:${q}`);
    u.searchParams.set("type", type);
    u.searchParams.set("k", k);
    u.searchParams.set("limit", String(limit));
    const j = await jfetch(u.href);
    // API lieferte historisch beide Schreibweisen (similar/Similar)
    const arr = j?.similar?.results || j?.Similar?.Results || [];
    return arr.map((r) => ({ name: r.name || r.Name })).filter((x) => x.name);
  });
}
