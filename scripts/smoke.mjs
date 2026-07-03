// smoke.mjs — startet den echten Server (der ALLE Packs lädt) auf einem freien Port
// und prüft die Kern-Endpunkte je Pack über ?pack=. Fängt Boot-/Import-/Syntaxfehler in
// jedem Pack ab, bevor gebaut/veröffentlicht wird. Kein Browser nötig, wenige Sekunden.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACKS = readdirSync(join(ROOT, "packs"), { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();

const PORT = 5391;
const dataDir = mkdtempSync(join(tmpdir(), "like-smoke-"));
const srv = spawn(process.execPath, ["server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), LIKE_DATA_DIR: dataDir, LASTFM_API_KEY: "smoke", TMDB_API_KEY: "smoke" },
  stdio: "inherit",
});
const BASE = `http://127.0.0.1:${PORT}`;

async function get(path, pack) {
  const res = await fetch(BASE + path, pack ? { headers: { "x-like-pack": pack } } : undefined);
  if (!res.ok) throw new Error(`${path} [${pack || "-"}] -> HTTP ${res.status}`);
  return res;
}

async function main() {
  let up = false;
  for (let i = 0; i < 60; i++) { try { await fetch(BASE + "/api/packs"); up = true; break; } catch { await sleep(100); } }
  if (!up) throw new Error("Server nicht gestartet");

  // Pack-Liste
  const pl = await (await get("/api/packs")).json();
  if (!pl.ok || !Array.isArray(pl.packs) || pl.packs.length !== PACKS.length) throw new Error("Pack-Liste unvollständig");
  console.log(`✓ /api/packs (${pl.packs.length} Packs, default: ${pl.default})`);

  // Jedes Pack: Health (richtiges Pack + Config-Injektion), Graph, Index
  for (const pack of PACKS) {
    const h = await (await get("/api/health", pack)).json();
    if (!h.ok || !h.version) throw new Error(`health unvollständig [${pack}]`);
    if (h.pack !== pack) throw new Error(`falsches Pack: ${h.pack} statt ${pack}`);
    const html = await (await get(`/?pack=${pack}`)).text();
    if (!html.includes("window.LIKE_CFG") || !html.includes("window.LIKE_PACKS")) throw new Error(`Config/Pack-Liste nicht injiziert [${pack}]`);
    const g = await (await get("/api/graph", pack)).json();
    if (!g.artists) throw new Error(`kein Graph [${pack}]`);
    console.log(`✓ Pack „${pack}"`);
  }

  // Unbekanntes Pack wird sauber abgewiesen
  const bad = await fetch(BASE + "/api/health", { headers: { "x-like-pack": "does-not-exist" } });
  if (bad.status !== 400) throw new Error("unbekanntes Pack nicht abgewiesen");
  console.log("✓ unbekanntes Pack -> 400");

  console.log(`✓ Smoke-Test bestanden (${PACKS.length} Packs, ein Server)`);
}

main()
  .then(() => { srv.kill(); process.exit(0); })
  .catch((e) => { console.error("✗ Smoke-Test:", e.message); srv.kill(); process.exit(1); });
