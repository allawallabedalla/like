// stats.mjs — Hörerzahl-Zeitreihe je Act (Momentum). Zero-Dep.
// Jedes Mal, wenn wir eine Hörerzahl anfassen, heben wir sie als Snapshot auf.
// Nach ein paar Wochen entsteht daraus von selbst ein Wachstums-Signal:
// "+38% Hörer in 4 Wochen" = Act im Aufwind, bevor es alle wissen.

import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url))), "stats.json");

const DAY = 864e5;
const MIN_GAP = 5 * DAY;   // frühestens alle 5 Tage ein neuer Snapshot
const MAX_POINTS = 30;     // ~ ein halbes Jahr Verlauf pro Act
const MIN_SPAN = 12 * DAY; // unter 12 Tagen Spannweite ist "Wachstum" nur Rauschen

export async function loadStats() {
  try { return JSON.parse(await readFile(FILE, "utf8")); }
  catch { return {}; }
}

export async function saveStats(stats) {
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(stats), "utf8");
  await rename(tmp, FILE);
}

// Snapshot anhängen (dedupliziert: nicht öfter als alle MIN_GAP). true = geändert.
export function addSnapshot(stats, id, listeners, now = Date.now()) {
  if (!listeners || listeners <= 0) return false;
  const arr = (stats[id] ??= []);
  const last = arr[arr.length - 1];
  if (last && now - last.t < MIN_GAP) return false;
  arr.push({ t: now, l: listeners });
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  return true;
}

// Wachstum in %/30 Tage: neuester Punkt vs. ältester Punkt der letzten ~60 Tage.
// null, wenn die Historie (noch) zu kurz ist.
export function growthPerMonth(stats, id, now = Date.now()) {
  const arr = stats[id];
  if (!arr || arr.length < 2) return null;
  const newest = arr[arr.length - 1];
  const window = arr.filter((p) => now - p.t <= 60 * DAY);
  const oldest = window[0] ?? arr[arr.length - 2];
  const span = newest.t - oldest.t;
  if (span < MIN_SPAN || !oldest.l) return null;
  const growth = (newest.l - oldest.l) / oldest.l;
  return Math.round(growth * (30 * DAY / span) * 100); // auf %/Monat normiert
}
