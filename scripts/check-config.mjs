// check-config.mjs — validiert die electron-builder-Config aus package.json gegen
// das offizielle Schema (app-builder-lib/scheme.json). Fängt genau die Klasse Fehler
// ab, die uns schon Release-Runs gekostet hat (z.B. unbekannte win-Optionen), BEVOR
// ein Runner Electron herunterlädt und baut. Läuft in Sekunden.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function main() {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (!pkg.build) { console.error("✗ package.json hat kein 'build'-Feld"); process.exit(1); }

  let scheme, Ajv, addFormats;
  try {
    scheme = require("app-builder-lib/scheme.json");
    Ajv = require("ajv").default || require("ajv");
    addFormats = require("ajv-formats").default || require("ajv-formats");
  } catch (e) {
    console.error("✗ Schema/Validator nicht gefunden (npm ci vergessen?):", e.message);
    process.exit(1);
  }

  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(scheme);
  if (validate(pkg.build)) {
    console.log("✓ electron-builder-Config ist schema-valide");
    return;
  }
  console.error("✗ Ungültige electron-builder-Config:");
  for (const e of validate.errors) {
    const extra = e.params?.additionalProperty ? ` -> unbekannt: ${e.params.additionalProperty}` : "";
    console.error(`   ${e.instancePath || "(root)"} ${e.message}${extra}`);
  }
  process.exit(1);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
