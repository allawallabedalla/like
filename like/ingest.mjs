#!/usr/bin/env node
// ingest.mjs — Graph aus der CLI füttern.
//
//   node ingest.mjs "Bonobo"                      # ein Seed, 1 Ebene
//   node ingest.mjs "Bonobo" "Floating Points"    # mehrere Seeds
//   node ingest.mjs "Bonobo" --depth 2            # Nachbarn auch expandieren
//   node ingest.mjs --demo                        # Demo-Graph ohne API-Key/Netz
//
// Schreibt/merged in like/graph.json.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, mergeSimilar, emptyGraph, upsertArtist, upsertEdge, noteSource } from "./lib/store.mjs";
import { getSimilar } from "./lib/lastfm.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(ROOT, "graph.json");

const args = process.argv.slice(2);
const seeds = [];
let depth = 1;
let demo = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--depth") depth = Math.max(1, parseInt(args[++i], 10) || 1);
  else if (a === "--demo") demo = true;
  else seeds.push(a);
}

if (demo) {
  await writeDemo();
  process.exit(0);
}

if (seeds.length === 0) {
  console.error('Bitte mindestens einen Künstler angeben, z.B.:  node ingest.mjs "Bonobo"');
  console.error("Oder ohne Key zum Ausprobieren:  node ingest.mjs --demo");
  process.exit(1);
}

const graph = await loadGraph(GRAPH);

// BFS bis `depth`. Ebene 0 = Seeds (seed=true), tiefere Ebenen normal.
let frontier = seeds.map((name) => ({ name, level: 0 }));
const visited = new Set();

while (frontier.length) {
  const next = [];
  for (const { name, level } of frontier) {
    const key = name.toLowerCase().trim();
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const { sourceName, similar } = await getSimilar(name, { limit: level === 0 ? 30 : 15 });
      mergeSimilar(graph, { sourceName, similar, seed: level === 0 });
      console.log(`✓ ${sourceName}: ${similar.length} ähnliche`);
      if (level + 1 < depth) {
        for (const s of similar.slice(0, 8)) next.push({ name: s.name, level: level + 1 });
      }
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
    }
  }
  frontier = next;
}

await saveGraph(GRAPH, graph);
const n = Object.keys(graph.artists).length;
console.log(`\nGespeichert: ${n} Künstler, ${graph.edges.length} Kanten → ${GRAPH}`);

// ---- Demo ohne Netz/Key, damit die Map sofort etwas zeigt ----
async function writeDemo() {
  const g = emptyGraph();
  const clusters = {
    Bonobo: ["Tycho", "Floating Points", "Jon Hopkins", "Four Tet", "Maribou State", "Rival Consoles"],
    Tycho: ["Bonobo", "Boards of Canada", "Com Truise", "ODESZA"],
    "Jon Hopkins": ["Four Tet", "Nils Frahm", "Rival Consoles", "Max Cooper"],
    "Nils Frahm": ["Ólafur Arnalds", "Max Richter", "Kiasmos", "Jon Hopkins"],
    "Four Tet": ["Caribou", "Floating Points", "Burial", "Bicep"],
    Caribou: ["Four Tet", "Bicep", "Dan Snaith", "Jamie xx"],
  };
  for (const [src, list] of Object.entries(clusters)) {
    upsertArtist(g, { name: src, seed: true, url: "https://www.last.fm/music/" + encodeURIComponent(src) });
    list.forEach((name, i) => {
      upsertArtist(g, { name, url: "https://www.last.fm/music/" + encodeURIComponent(name) });
      upsertEdge(g, { from: src.toLowerCase(), to: name.toLowerCase(), type: "similar", weight: 0.9 - i * 0.08, source: "demo" });
    });
  }
  noteSource(g, { id: "demo", label: "Demo-Daten (offline)" });
  await saveGraph(GRAPH, g);
  console.log(`Demo-Graph geschrieben: ${Object.keys(g.artists).length} Künstler, ${g.edges.length} Kanten → ${GRAPH}`);
  console.log("Jetzt:  node server.mjs   und im Browser http://localhost:5173 öffnen.");
}
