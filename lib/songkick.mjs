// songkick.mjs — optionale Quelle für "zusammen aufgetreten".
// Braucht einen API-Key (https://www.songkick.com/api_key_requests/new),
// abgelegt in like/.songkick-key oder ENV SONGKICK_KEY. Ohne Key inaktiv.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let key = null, looked = false;
async function getKey() {
  if (looked) return key;
  looked = true;
  if (process.env.SONGKICK_KEY) return (key = process.env.SONGKICK_KEY.trim());
  try { key = (await readFile(join(ROOT, ".songkick-key"), "utf8")).trim() || null; } catch { key = null; }
  return key;
}

export async function songkickCoappear(name) {
  const k = await getKey();
  if (!k) return null; // inaktiv ohne Key
  const s = await fetch(`https://api.songkick.com/api/3.0/search/artists.json?apikey=${k}&query=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
  if (!s.ok) return null;
  const sj = await s.json();
  const artist = sj.resultsPage?.results?.artist?.[0];
  if (!artist) return null;
  const g = await fetch(`https://api.songkick.com/api/3.0/artists/${artist.id}/gigography.json?apikey=${k}&per_page=50`, { signal: AbortSignal.timeout(8000) });
  if (!g.ok) return null;
  const gj = await g.json();
  const events = gj.resultsPage?.results?.event || [];
  const co = new Map();
  for (const e of events)
    for (const p of e.performance || [])
      if (p.artist?.displayName && p.artist.displayName !== name)
        co.set(p.artist.displayName, (co.get(p.artist.displayName) || 0) + 1);
  return { coacts: [...co.entries()].sort((a, b) => b[1] - a[1]).map(([n, w]) => ({ name: n, weight: w })), genres: [] };
}
