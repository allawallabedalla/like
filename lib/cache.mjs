// cache.mjs — simpler Datei-Cache mit TTL (zero-dep). Spart Requests & federt RA-Aussetzer ab.
import { readFile, writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  // Lesbarer Präfix + Kurz-Digest des VOLLEN Schlüssels: das Kürzen auf Dateinamen-Länge und
  // das %→_-Ersetzen allein könnten zwei verschiedene Schlüssel auf dieselbe Datei abbilden —
  // dann bekämen alle Nutzer tagelang die gecachte Antwort des falschen Eintrags serviert.
  const k = String(key).toLowerCase();
  const digest = createHash("sha256").update(ns + "\n" + k).digest("hex").slice(0, 16);
  const safe = ns + "__" + encodeURIComponent(k).replace(/%/g, "_").slice(0, 140) + "-" + digest;
  return join(DIR, safe + ".json");
}

// Liefert gecachten Wert (falls frisch) oder ruft fn(), cached das Ergebnis und gibt es zurück.
// Single-Flight (Taskforce R13): läuft für denselben Schlüssel bereits ein fn() (typisch:
// Hover-Prefetch), hängt sich der zweite Aufrufer (der ＋-Klick) an DASSELBE Promise, statt
// alle Requests zu duplizieren und sich in den Host-Gates hinter die eigenen Prefetch-
// Requests zu stellen (gemessen: 5,5 s statt 3,1 s + doppelte RA-Last). Rejections werden
// nie memoiert — der Eintrag fliegt im finally wieder raus, der nächste Aufruf versucht es neu.
const inflight = new Map(); // ns+"\n"+key(lowercase) -> laufendes Promise
export async function cached(ns, key, ttlMs, fn) {
  const f = fileFor(ns, key);
  try {
    const raw = JSON.parse(await readFile(f, "utf8"));
    if (Date.now() - raw.t < ttlMs) return raw.v;
  } catch { /* kein/abgelaufener Cache */ }
  const ik = ns + "\n" + String(key).toLowerCase(); // gleiche Normalisierung wie fileFor()
  const running = inflight.get(ik);
  if (running) return running;
  const p = (async () => {
    const v = await fn();
    try { await mkdir(DIR, { recursive: true }); await writeFile(f, JSON.stringify({ t: Date.now(), v })); } catch {}
    return v;
  })();
  inflight.set(ik, p);
  try { return await p; } finally { inflight.delete(ik); }
}
