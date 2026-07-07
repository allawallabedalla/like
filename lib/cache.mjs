// cache.mjs — simpler Datei-Cache mit TTL (zero-dep). Spart Requests & federt RA-Aussetzer ab.
import { readFile, writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url))), "cache");

// Cache beschneiden: Dateien, die länger als maxAgeMs nicht geändert wurden, löschen.
// Ohne das wächst das Cache-Verzeichnis unbegrenzt (eine Datei je je gefragtem Namen) und
// füllt irgendwann die Platte -> dann scheitern auch die Graph-Speicherungen (ENOSPC).
export async function pruneCache(maxAgeMs = 30 * 864e5) {
  let removed = 0;
  try {
    const now = Date.now();
    for (const f of await readdir(DIR)) {
      try {
        const p = join(DIR, f);
        const s = await stat(p);
        if (now - s.mtimeMs > maxAgeMs) { await unlink(p); removed++; }
      } catch { /* Datei verschwand nebenbei -> egal */ }
    }
  } catch { /* Verzeichnis existiert noch nicht */ }
  return removed;
}

function fileFor(ns, key) {
  const safe = ns + "__" + encodeURIComponent(String(key).toLowerCase()).replace(/%/g, "_").slice(0, 160);
  return join(DIR, safe + ".json");
}

// Liefert gecachten Wert (falls frisch) oder ruft fn(), cached das Ergebnis und gibt es zurück.
export async function cached(ns, key, ttlMs, fn) {
  const f = fileFor(ns, key);
  try {
    const raw = JSON.parse(await readFile(f, "utf8"));
    if (Date.now() - raw.t < ttlMs) return raw.v;
  } catch { /* kein/abgelaufener Cache */ }
  const v = await fn();
  try { await mkdir(DIR, { recursive: true }); await writeFile(f, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}
