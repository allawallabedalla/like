// bandsintown.mjs — optionale Quelle für "zusammen aufgetreten".
// Braucht eine registrierte app_id (https://artists.bandsintown.com/support/api-installation),
// abgelegt in like/.bandsintown-appid oder ENV BANDSINTOWN_APPID. Ohne app_id inaktiv.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let appId = null, looked = false;
async function getAppId() {
  if (looked) return appId;
  looked = true;
  if (process.env.BANDSINTOWN_APPID) return (appId = process.env.BANDSINTOWN_APPID.trim());
  try { appId = (await readFile(join(ROOT, ".bandsintown-appid"), "utf8")).trim() || null; } catch { appId = null; }
  return appId;
}

export async function bandsintownCoappear(name) {
  const id = await getAppId();
  if (!id) return null; // inaktiv ohne app_id
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(name)}/events?app_id=${encodeURIComponent(id)}&date=past`;
  const res = await fetch(url, { headers: { "user-agent": "LikeBookingTool" } });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr)) return null;
  const co = new Map();
  for (const e of arr) for (const ln of e.lineup || []) if (ln && ln !== name) co.set(ln, (co.get(ln) || 0) + 1);
  return { coacts: [...co.entries()].sort((a, b) => b[1] - a[1]).map(([n, w]) => ({ name: n, weight: w })), genres: [] };
}
