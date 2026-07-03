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
  return { id, title: pack.config.title, item: pack.config.item, n, e };
}

// Schlichte Landing-Seite, die zu allen Pack-Previews verlinkt.
function landingHtml(cards) {
  const items = cards.map((c) => `
      <a class="card" href="./${c.id}/">
        <h2>${c.title}</h2>
        <p>${c.item.plur} · ${c.n} Knoten · ${c.e} Kanten</p>
      </a>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>like — Vorschauen</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, -apple-system, sans-serif; margin: 0; padding: 48px 20px; background: #0f1115; color: #e7e9ee; }
  @media (prefers-color-scheme: light) { body { background: #fafafa; color: #16181d; } }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; } h1 b { color: #ff6a00; }
  .sub { opacity: .7; margin: 0 0 28px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
  .card { display: block; padding: 18px; border: 1px solid #2a2e37; border-radius: 12px; text-decoration: none; color: inherit; transition: border-color .15s, transform .15s; }
  @media (prefers-color-scheme: light) { .card { border-color: #e2e4ea; } }
  .card:hover { border-color: #ff6a00; transform: translateY(-2px); }
  .card h2 { font-size: 18px; margin: 0 0 4px; } .card p { margin: 0; font-size: 13px; opacity: .65; }
  footer { margin-top: 32px; font-size: 13px; opacity: .55; }
</style></head><body><div class="wrap">
  <h1>like<b>.</b> — Vorschauen</h1>
  <p class="sub">Statische, read-only Previews aller Domain-Packs. Anschauen, klicken, filtern — ohne Installation.</p>
  <div class="grid">${items}</div>
  <footer>Live-Suche &amp; eigene Sammlungen gibt es in der App-Version (Download im Release).</footer>
</div></body></html>`;
}

const arg = process.argv.find((a) => a.startsWith("--pack="))?.slice(7);
const all = process.argv.includes("--all");

if (all) {
  // Jedes Pack (inkl. Musik) in seinen eigenen Unterordner; docs/index.html ist die Landing.
  const ids = await listPacks();
  const cards = [];
  for (const id of ids) cards.push(await exportPack(id, join(DOCS, id)));
  await writeFile(join(DOCS, "index.html"), landingHtml(cards), "utf8");
  await writeFile(join(DOCS, ".nojekyll"), "", "utf8");
  console.log(`✓ docs/index.html — Landing mit ${cards.length} Packs`);
} else {
  const id = arg || "music";
  await exportPack(id, id === "music" ? DOCS : join(DOCS, id));
  await writeFile(join(DOCS, ".nojekyll"), "", "utf8");
}

console.log("Lokal testen: docs/index.html im Browser öffnen (kein Server nötig).");
