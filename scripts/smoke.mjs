// smoke.mjs — startet den echten Server auf einem freien Port und prüft, dass die
// Kern-Endpunkte antworten. Fängt Boot-/Import-/Syntaxfehler ab, bevor gebaut/
// veröffentlicht wird. Kein Browser nötig, läuft in wenigen Sekunden.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { readdirSync } from "node:fs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Jedes Pack einmal booten und die Kern-Endpunkte prüfen — fängt Boot-/Import-/
// Syntaxfehler in JEDEM Pack ab, bevor gebaut/veröffentlicht wird.
const PACKS = readdirSync(join(ROOT, "packs"), { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();

async function checkPack(pack, port) {
  const dataDir = mkdtempSync(join(tmpdir(), `like-smoke-${pack}-`));
  writeFileSync(join(dataDir, pack === "music" ? "graph.json" : `graph-${pack}.json`), JSON.stringify({
    meta: { version: 1 }, artists: { a: { id: "a", name: "Test", genres: [], seed: true } }, edges: [], events: [], sources: [],
  }));
  const srv = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), LIKE_DATA_DIR: dataDir, LIKE_PACK: pack, LASTFM_API_KEY: "smoke", TMDB_API_KEY: "smoke" },
    stdio: "inherit",
  });
  const BASE = `http://127.0.0.1:${port}`;
  const get = async (p, opts) => { const r = await fetch(BASE + p, opts); if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`); return r; };
  try {
    let up = false;
    for (let i = 0; i < 50; i++) { try { await fetch(BASE + "/api/health"); up = true; break; } catch { await sleep(100); } }
    if (!up) throw new Error("Server nicht gestartet");
    const j = await (await get("/api/health")).json();
    if (!j.ok || !j.version) throw new Error("health unvollständig");
    if (j.pack !== pack) throw new Error(`falsches Pack geladen: ${j.pack} statt ${pack}`);
    const html = await (await get("/")).text();
    if (!html.includes("window.LIKE_CFG")) throw new Error("Pack-Config nicht injiziert");
    const g = await (await get("/api/graph")).json();
    if (!g.artists) throw new Error("kein Graph");
    console.log(`✓ Pack „${pack}"`);
  } finally { srv.kill(); }
}

async function main() {
  let port = 5391;
  for (const pack of PACKS) { await checkPack(pack, port++); }
  console.log(`✓ Smoke-Test bestanden (${PACKS.length} Packs)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("✗ Smoke-Test:", e.message); process.exit(1); });
