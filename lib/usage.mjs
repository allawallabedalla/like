// usage.mjs — anonyme, rein AGGREGIERTE Nutzungszähler (W7). Zero-Dep.
// Gezählt wird ausschließlich „Aktion X ist am Tag Y insgesamt N-mal passiert" —
// keine IDs, keine IPs, keine Sessions, keine Reihenfolgen, kein Personenbezug.
// Ablage: DATA_DIR/usage.json  ->  { "2026-07-11": { "explore:music": 12, "radar:music": 3 } }
// Schreiben ist entprellt (alle ~15 s bei Aktivität), alte Tage werden nach 180 Tagen entfernt.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

let FILE = null, data = null, dirty = false, timer = null;
const KEEP_DAYS = 180;
const day = () => new Date().toISOString().slice(0, 10);

export async function initUsage(dataDir) {
  FILE = join(dataDir, "usage.json");
  try { data = JSON.parse(await readFile(FILE, "utf8")) || {}; } catch { data = {}; }
}

async function flush() {
  if (!dirty || !FILE || !data) return;
  dirty = false;
  // alte Tage kappen, damit die Datei nicht endlos wächst
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const d of Object.keys(data)) if (d < cutoff) delete data[d];
  try {
    await mkdir(dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, FILE);
  } catch { dirty = true; } // nächster Tick versucht es erneut
}

// Eine Aktion zählen, z. B. count("explore", "music"). Bewusst fire-and-forget und
// fehlertolerant — Zählen darf nie einen echten Request verlangsamen oder brechen.
export function countUsage(action, packId) {
  if (!data) return;
  const k = packId ? `${action}:${packId}` : String(action);
  const d = day();
  (data[d] ||= {})[k] = (data[d][k] || 0) + 1;
  dirty = true;
  if (!timer) { timer = setInterval(() => { flush(); }, 15000); timer.unref?.(); }
}

// Kompletter Auszug (für den Betreiber-Endpoint) — Kopie, damit niemand `data` mutiert.
export function usageSnapshot() { return data ? JSON.parse(JSON.stringify(data)) : {}; }
