#!/usr/bin/env node
// export-static.mjs — erzeugt eine statische, Pages-taugliche Vorschau (read-only).
//
//   node export-static.mjs                 # aktuelles Musik-graph.json -> docs/index.html
//   node export-static.mjs --pack=books    # Bücher-Demo -> docs/books/index.html
//   node export-static.mjs --all           # alle Packs (Demo-Graphen) + docs/index.html (Landing)
//
// Bettet Graph + Pack-Config in die eine index.html ein: anschauen/zoomen/klicken/
// filtern/PNG — keine Live-Suche/Erweiterung (die braucht Server + Keys).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, materialize } from "./lib/store.mjs";
import { loadPack, listPacks } from "./lib/packs.mjs";
import { miniCluster, landingHtml } from "./lib/landing.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DOCS = join(ROOT, "docs");
const HTML = await readFile(join(ROOT, "public", "index.html"), "utf8");

const escData = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

async function graphForPack(id) {
  // Musik nimmt (falls vorhanden) den echten graph.json, sonst den Demo-Graphen.
  if (id === "music") {
    try {
      const g = materialize(await loadGraph(join(ROOT, "graph.json")));
      if (Object.keys(g.artists).length) return g;
    } catch {}
  }
  try { return JSON.parse(await readFile(join(ROOT, "packs", id, "demo.json"), "utf8")); }
  catch { return { meta: { version: 1 }, artists: {}, edges: [] }; }
}

async function exportPack(id, outDir) {
  const pack = await loadPack(id);
  const graph = await graphForPack(id);
  const inject =
    `<script>window.LIKE_CFG = ${escData(pack.config)};\n` +
    `window.LIKE_GRAPH = ${escData(graph)};</script>\n<script>`;
  const out = HTML.replace("<script>", inject);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.html"), out, "utf8");
  const n = Object.keys(graph.artists).length, e = graph.edges.length;
  console.log(`✓ ${join(outDir, "index.html").replace(ROOT + "/", "")} — Pack „${id}", ${n} Knoten, ${e} Kanten`);
  return { id, title: pack.config.title, item: pack.config.item, n, e, mini: miniCluster(graph) };
}

const arg = process.argv.find((a) => a.startsWith("--pack="))?.slice(7);
const all = process.argv.includes("--all");

if (all) {
  // Jedes Pack (inkl. Musik) in seinen eigenen Unterordner; docs/index.html ist die Landing.
  const ids = await listPacks();
  const cards = [];
  for (const id of ids) cards.push(await exportPack(id, join(DOCS, id)));
  await writeFile(join(DOCS, "index.html"), landingHtml(cards, {
    hrefFor: (id) => `./${id}/`,
    pageTitle: "like — Vorschauen",
    heading: "like<b>.</b> — Vorschauen",
    sub: "Statische, read-only Previews aller Domain-Packs. Anschauen, klicken, filtern — ohne Installation. Jede Karte zeigt das Netz ihrer Domäne.",
    footer: "Live-Suche, Umschalter &amp; eigene Sammlungen gibt es in der App-Version (Download im Release).",
  }), "utf8");
  await writeFile(join(DOCS, ".nojekyll"), "", "utf8");
  console.log(`✓ docs/index.html — Landing mit ${cards.length} Packs`);
} else {
  const id = arg || "music";
  await exportPack(id, id === "music" ? DOCS : join(DOCS, id));
  await writeFile(join(DOCS, ".nojekyll"), "", "utf8");
}

console.log("Lokal testen: docs/index.html im Browser öffnen (kein Server nötig).");
