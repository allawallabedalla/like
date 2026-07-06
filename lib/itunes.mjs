// itunes.mjs — Apple iTunes Search API (offen, kein Key): 30-Sekunden-Preview.
// Fallback für die Klangprobe, wenn Deezer den Act nicht kennt. Breite Abdeckung
// (auch nicht-elektronische Acts). Nur lesend, gedrosselt, gecacht.

import { cached } from "./cache.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve();
async function get(url) {
  const job = gate.then(async () => {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    await sleep(250);
    if (!res.ok) throw new Error("iTunes HTTP " + res.status);
    return res.json();
  });
  gate = job.then(() => {}, () => {});
  return job;
}

const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Etwas lockerer, aber weiterhin sicher: Klammer-Zusatz raus, „&"↔„and", führendes „the" weg.
// „Harris" bleibt ≠ „Calvin Harris" — es matchen nur harmlose Varianten desselben Acts.
const loose = (s) => norm(String(s).replace(/\([^)]*\)/g, "").replace(/&/g, "and").replace(/^\s*the\s+/i, ""));
const matches = (a, b) => norm(a) === norm(b) || loose(a) === loose(b);
const pickHit = (results, name) => {
  const hit = (results || []).find((r) => r.previewUrl && matches(r.artistName, name));
  return hit ? { url: hit.previewUrl, track: hit.trackName || null, artist: hit.artistName || name } : null;
};

// 30-Sekunden-Preview eines Songs des Acts. { url, track } oder null. 14 Tage gecacht.
// Zwei Anläufe, beide streng am Künstlernamen verankert (nie ein fremder Act):
//   1) gezielte Künstler-Suche (attribute=artistTerm)
//   2) breite Song-Suche (fängt Acts, die Anlauf 1 nicht als artistTerm findet)
export async function previewByName(name) {
  return cached("it-preview-v3", name, 14 * 864e5, async () => {
    try {
      const d = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&attribute=artistTerm&limit=8`);
      const hit = pickHit(d.results, name);
      if (hit) return hit;
    } catch {}
    try {
      const d = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&limit=15`);
      const hit = pickHit(d.results, name);
      if (hit) return hit;
    } catch {}
    return null;
  });
}
