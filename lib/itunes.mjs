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

// 30-Sekunden-Preview eines Songs des Acts. { url, track } oder null. 14 Tage gecacht.
export async function previewByName(name) {
  return cached("it-preview-v2", name, 14 * 864e5, async () => { // v2: exakter Künstlername (siehe unten)
    const d = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&attribute=artistTerm&limit=5`);
    const self = norm(name);
    // NUR exakter Künstlername (normalisiert). KEIN Fallback auf den ersten beliebigen
    // Treffer — sonst spielt z.B. „Harris" den populäreren „Calvin Harris" ab. Lieber keine
    // Klangprobe als die eines fremden Acts.
    const hit = (d.results || []).find((r) => r.previewUrl && norm(r.artistName) === self);
    if (!hit) return null;
    return { url: hit.previewUrl, track: hit.trackName || null, artist: hit.artistName || name };
  });
}
