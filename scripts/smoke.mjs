// smoke.mjs — startet den echten Server auf einem freien Port und prüft, dass die
// Kern-Endpunkte antworten. Fängt Boot-/Import-/Syntaxfehler ab, bevor gebaut/
// veröffentlicht wird. Kein Browser nötig, läuft in wenigen Sekunden.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = mkdtempSync(join(tmpdir(), "like-smoke-"));
// Mini-Graph, damit /api/graph etwas liefert
writeFileSync(join(dataDir, "graph.json"), JSON.stringify({
  meta: { version: 1 }, artists: { a: { id: "a", name: "Test", genres: [], seed: true } }, edges: [], events: [], sources: [],
}));

const PORT = 5391;
const srv = spawn(process.execPath, ["server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), LIKE_DATA_DIR: dataDir, LASTFM_API_KEY: "smoke" },
  stdio: "inherit",
});

const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, opts) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res;
}

async function main() {
  // auf Server warten
  let up = false;
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + "/api/health"); up = true; break; } catch { await sleep(100); }
  }
  if (!up) throw new Error("Server nicht gestartet");

  const checks = [
    ["GET /", () => get("/")],
    ["GET /api/health", async () => { const j = await (await get("/api/health")).json(); if (!j.ok || !j.version) throw new Error("health unvollständig"); }],
    ["GET /api/graph", async () => { const j = await (await get("/api/graph")).json(); if (!j.artists) throw new Error("kein Graph"); }],
    ["GET /api/suggest", () => get("/api/suggest?q=ab")],
  ];
  for (const [name, fn] of checks) { await fn(); console.log("✓", name); }
  console.log("✓ Smoke-Test bestanden");
}

main()
  .then(() => { srv.kill(); process.exit(0); })
  .catch((e) => { console.error("✗ Smoke-Test:", e.message); srv.kill(); process.exit(1); });
