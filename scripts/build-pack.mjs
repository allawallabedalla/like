#!/usr/bin/env node
// build-pack.mjs — baut die Desktop-App für EIN Domain-Pack.
//
//   node scripts/build-pack.mjs <pack> <mac|win>
//
// Schritte:
//   1. schreibt ".pack" (wird ins Bundle aufgenommen -> server.mjs lädt dieses Pack)
//   2. leitet productName/appId/artifactName aus dem Pack ab
//   3. ruft electron-builder mit diesen Overrides auf (asar bleibt aus, wie im Repo)
//
// Icons: liegt packs/<id>/icon.(icns|png) vor, wird es genutzt; sonst das Default build/icon.*.

import { writeFile, access, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadPack } from "../lib/packs.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const [, , packId, platform] = process.argv;
if (!packId || !["mac", "win"].includes(platform)) {
  console.error("Aufruf: node scripts/build-pack.mjs <pack> <mac|win>");
  process.exit(2);
}

const pack = await loadPack(packId);
const exists = async (p) => { try { await access(join(ROOT, p)); return true; } catch { return false; } };

// .pack einbetten, damit der gebaute Server dieses Pack lädt.
await writeFile(join(ROOT, ".pack"), JSON.stringify({ id: packId }), "utf8");

const productName = pack.config.title || `Like ${packId}`;
const appId = `de.nicolasreis.like.${packId}`;
// eindeutige Artefaktnamen je Pack (music-vX behält den alten Namensstamm "Like");
// pro Target überschreiben, damit setup/portable unterscheidbar bleiben (sonst Kollision).
const stem = packId === "music" ? "Like" : `Like-${packId}`;

const macIcon = (await exists(`packs/${packId}/icon.icns`)) ? `packs/${packId}/icon.icns` : "build/icon.icns";
const winIcon = (await exists(`packs/${packId}/icon.png`)) ? `packs/${packId}/icon.png` : "build/icon.png";

const overrides = [
  `--config.productName=${productName}`,
  `--config.appId=${appId}`,
  `--config.mac.icon=${macIcon}`,
  `--config.win.icon=${winIcon}`,
  `--config.nsis.artifactName=${stem}-\${version}-setup.exe`,
  `--config.nsis.shortcutName=${productName}`,
  `--config.portable.artifactName=${stem}-\${version}-portable.exe`,
  `--config.dmg.artifactName=${stem}-\${version}-\${arch}.dmg`,
];

const platformFlag = platform === "mac" ? "--mac" : "--win";
const args = ["electron-builder", platformFlag, "--publish", "never", ...overrides];

console.log(`▶ Baue Pack „${packId}" (${platform}) als „${productName}" …`);
const res = spawnSync("npx", args, {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
});

// .pack wieder entfernen — sonst lädt ein lokales `node server.mjs` danach still
// das zuletzt gebaute Pack statt Musik (das Bundle hat seine Kopie schon).
try { await unlink(join(ROOT, ".pack")); } catch {}

process.exit(res.status ?? 1);
