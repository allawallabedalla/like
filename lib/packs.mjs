// packs.mjs — Domain-Pack-Loader. Ein Pack bündelt alles Domänen-Spezifische:
// Datenquellen-Adapter + Frontend-Config (Begriffe, Kantentypen, Feature-Flags).
// Der Kern (Server, Graph-Store, Canvas-UI) bleibt für alle Packs identisch.
//
// Pack-Auswahl (erste Quelle gewinnt):
//   1. ENV LIKE_PACK=books          (auch: node server.mjs --pack=books)
//   2. Datei ".pack" neben server.mjs (wird beim Pack-Build eingebettet)
//   3. Default "music"
//
// Pack-Interface (packs/<id>/pack.mjs, default-Export):
//   id            string — muss dem Ordnernamen entsprechen
//   config        Objekt fürs Frontend (window.LIKE_CFG) — Begriffe/Legende/Features
//   key           { name, envVar, file, pattern, createUrl, hint } | null
//   suggest(q)                 -> [namen] (Autocomplete)
//   explore(name)              -> { canonical, url?, genres[], similar[], together[], meta?, active?, sources[] }
//   enrich(artist)             -> { genres?, popularity?, location?, locationUrl?, url? }
//   popularity(name)           -> number|null   (optional; für Momentum/Radar/Snapshot)
//   preview(name)              -> { url, track, artist }|null (optional; 30s-Probe)
//   context(name)              -> { groups:[{label, items:[{name, sub}]}] } (optional; z.B. Label-Umfeld)
//   radarExtras(ctx)           -> [{ name, score, reasons[], url }] (optional; Extra-Kandidaten)
//   diag()                     -> [{ name, probe: async fn, note? }] (optional; Quellen-Diagnose)
//   clearKeyCache()            (optional; nach POST /api/key)

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function resolvePackId() {
  const arg = process.argv.find((a) => a.startsWith("--pack="));
  if (arg) return arg.slice(7).trim();
  if (process.env.LIKE_PACK) return process.env.LIKE_PACK.trim();
  try {
    const p = JSON.parse(await readFile(join(ROOT, ".pack"), "utf8"));
    if (p?.id) return String(p.id).trim();
  } catch {}
  return "music";
}

export async function listPacks() {
  try {
    const entries = await readdir(join(ROOT, "packs"), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch { return []; }
}

export async function loadPack(id) {
  id ??= await resolvePackId();
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Ungültige Pack-Id: ${id}`);
  let mod;
  try {
    mod = await import(`../packs/${id}/pack.mjs`);
  } catch (e) {
    const known = (await listPacks()).join(", ") || "(keine gefunden)";
    throw new Error(`Pack "${id}" konnte nicht geladen werden (bekannt: ${known}): ${e.message}`);
  }
  const pack = mod.default;
  if (!pack?.id || !pack.config || typeof pack.explore !== "function") {
    throw new Error(`Pack "${id}" ist unvollständig (braucht id, config, explore()).`);
  }
  return pack;
}

// Datendateien pro Pack trennen — Musik behält die alten Namen (kein Migrationsbruch).
export function dataFile(dataDir, packId, base) {
  if (packId === "music") return join(dataDir, base);
  const [name, ext] = [base.replace(/\.[^.]+$/, ""), base.match(/\.[^.]+$/)?.[0] || ""];
  return join(dataDir, `${name}-${packId}${ext}`);
}
