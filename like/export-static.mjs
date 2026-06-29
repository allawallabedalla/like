#!/usr/bin/env node
// export-static.mjs — erzeugt eine statische, Pages-taugliche Vorschau der aktuellen Karte.
//
//   node export-static.mjs
//
// Schreibt docs/index.html (mit eingebettetem Graph) + docs/.nojekyll.
// Read-only: anschauen/zoomen/klicken/vergleichen/Pfade/Genre-Filter/Korb/PNG —
// keine Live-Suche/Erweiterung (die braucht Server + Last.fm-Key).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, materialize } from "./lib/store.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DOCS = join(ROOT, "docs");

const graph = materialize(await loadGraph(join(ROOT, "graph.json")));
const html = await readFile(join(ROOT, "public", "index.html"), "utf8");

// `<` escapen, damit kein `</script>` im Datenblock das Tag vorzeitig schließt
const data = JSON.stringify(graph).replace(/</g, "\\u003c");
const inject = `<script>window.LIKE_GRAPH = ${data};</script>\n<script>`;
const out = html.replace("<script>", inject); // vor dem Haupt-Script einbetten

await mkdir(DOCS, { recursive: true });
await writeFile(join(DOCS, "index.html"), out, "utf8");
await writeFile(join(DOCS, ".nojekyll"), "", "utf8");

const n = Object.keys(graph.artists).length, e = graph.edges.length;
console.log(`✓ docs/index.html geschrieben — ${n} Acts, ${e} Kanten (statisch, read-only).`);
console.log("Lokal testen:  einfach docs/index.html im Browser öffnen (kein Server nötig).");
