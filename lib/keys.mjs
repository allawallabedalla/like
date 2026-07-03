// keys.mjs — generischer API-Key-Leser für Packs: ENV zuerst, dann Datei im
// Datenverzeichnis (bzw. Repo-Root). Gleiche Mechanik wie der Last.fm-Key.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url)));

const memo = new Map();
export function clearKey(file) { memo.delete(file); }

// wirft mit "API-Key" im Text, wenn `required` und nichts gefunden — das Frontend
// erkennt daran den fehlenden Key und öffnet den Einrichtungs-Dialog.
export async function getKey({ envVar, file, name, createUrl, required = true }) {
  if (memo.has(file)) return memo.get(file);
  if (envVar && process.env[envVar]) { const k = process.env[envVar].trim(); memo.set(file, k); return k; }
  try {
    const k = (await readFile(join(ROOT, file), "utf8")).trim();
    if (k) { memo.set(file, k); return k; }
  } catch {}
  if (!required) return null;
  throw new Error(`Kein ${name} API-Key. Gratis erstellen: ${createUrl} — dann als ENV ${envVar} oder Datei ${file} ablegen.`);
}
