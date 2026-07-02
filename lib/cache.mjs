// cache.mjs — simpler Datei-Cache mit TTL (zero-dep). Spart Requests & federt RA-Aussetzer ab.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url))), "cache");

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
