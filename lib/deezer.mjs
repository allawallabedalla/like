// deezer.mjs — Deezer API (offen, kein Key): zweite Ähnlichkeitsquelle plus
// nb_fan als harte "wie klein ist der Act?"-Zahl. Nur lesend, gedrosselt, gecacht.

import { cached } from "./cache.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve(); // serialisiert + drosselt
async function get(url) {
  const job = gate.then(async () => {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    await sleep(250);
    if (!res.ok) throw new Error("Deezer HTTP " + res.status);
    const j = await res.json();
    if (j.error) throw new Error("Deezer: " + (j.error.message || j.error.type));
    return j;
  });
  gate = job.then(() => {}, () => {});
  return job;
}

// Namen normalisieren für exakte Treffer (wie in ra.mjs)
const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Act suchen; nur zurückgeben, wenn Deezer sicher DENSELBEN Act meint. 7 Tage gecacht.
export async function artistByName(name) {
  return cached("dz-artist", name, 7 * 864e5, async () => {
    const d = await get("https://api.deezer.com/search/artist?q=" + encodeURIComponent(name) + "&limit=5");
    const hit = (d.data || []).find((a) => norm(a.name) === norm(name));
    if (!hit) return null;
    return { id: hit.id, name: hit.name, fans: hit.nb_fan ?? null, link: hit.link || null };
  });
}

// Ähnliche Acts LAUT DEEZER — inklusive Fananzahl pro Treffer (ein Call!). 7 Tage gecacht.
export async function relatedArtists(name, { limit = 25 } = {}) {
  return cached("dz-related", name + "|" + limit, 7 * 864e5, async () => {
    const a = await artistByName(name);
    if (!a) return [];
    const d = await get(`https://api.deezer.com/artist/${a.id}/related?limit=${limit}`);
    return (d.data || []).map((x) => ({ name: x.name, fans: x.nb_fan ?? null, link: x.link || null }));
  });
}
