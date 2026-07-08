// deezer.mjs — Deezer API (offen, kein Key): zweite Ähnlichkeitsquelle plus
// nb_fan als harte "wie klein ist der Act?"-Zahl. Nur lesend, gedrosselt, gecacht.

import { cached } from "./cache.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve(); // serialisiert + drosselt
async function get(url) {
  const job = gate.then(async () => {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
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
// Etwas lockerer, aber weiterhin sicher: führendes „the" weg, „&"↔„and", Klammer-Zusatz
// (z.B. „(musician)") entfernen. „Harris" bleibt ≠ „Calvin Harris" — nur harmlose Varianten
// desselben Acts matchen so zusätzlich.
const loose = (s) => norm(String(s).replace(/\([^)]*\)/g, "").replace(/&/g, "and").replace(/^\s*the\s+/i, ""));
const nameMatches = (a, b) => norm(a) === norm(b) || loose(a) === loose(b);
export { nameMatches as dzNameMatches };

// Act suchen; nur zurückgeben, wenn Deezer sicher DENSELBEN Act meint. 7 Tage gecacht.
export async function artistByName(name) {
  return cached("dz-artist", name, 7 * 864e5, async () => {
    const d = await get("https://api.deezer.com/search/artist?q=" + encodeURIComponent(name) + "&limit=5");
    const hit = (d.data || []).find((a) => norm(a.name) === norm(name));
    if (!hit) return null;
    return { id: hit.id, name: hit.name, fans: hit.nb_fan ?? null, link: hit.link || null };
  });
}

// 30-Sekunden-Vorschau des Top-Tracks eines Acts (Deezer liefert die gratis, ohne Key).
// { url, track } oder null. 14 Tage gecacht.
export async function topTrackPreview(name) {
  return cached("dz-preview-v2", name, 14 * 864e5, async () => {
    const a = await artistByName(name);
    if (!a) return null;
    const d = await get(`https://api.deezer.com/artist/${a.id}/top?limit=1`);
    const t = (d.data || [])[0];
    if (!t?.preview) return null;
    // fans mitgeben -> der Aufrufer kann einen „berühmter Namensvetter?"-Plausi-Check machen (C6).
    return { url: t.preview, track: t.title || null, artist: a.name, fans: a.fans ?? null };
  });
}

// Fallback-Vorschau über die Track-Suche: findet eine Preview auch dann, wenn der
// /artist/top-Endpunkt leer ist oder die Artist-Suche einen anderen Act oben hatte.
// Verifiziert den Künstlernamen am Track (norm/loose) — spielt also nie einen fremden Act.
export async function trackPreviewSearch(name) {
  return cached("dz-preview-trk", name, 14 * 864e5, async () => {
    const q = `artist:"${name.replace(/"/g, "")}"`;
    const d = await get("https://api.deezer.com/search?q=" + encodeURIComponent(q) + "&limit=15");
    const hit = (d.data || []).find((t) => t.preview && t.artist && nameMatches(t.artist.name, name));
    if (!hit) return null;
    return { url: hit.preview, track: hit.title || null, artist: hit.artist.name };
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
