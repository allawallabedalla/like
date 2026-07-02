#!/usr/bin/env node
// auto.mjs — automatisch Festivals zu deinen Acts finden & deren Lineups scrapen.
//
//   node auto.mjs                       # 1 Durchlauf (60 Acts, en)
//   node auto.mjs --lang de             # deutsche Wikipedia
//   node auto.mjs --max 120             # mehr Acts pro Lauf
//   node auto.mjs --min 3               # Festival muss >=3 deiner Acts verlinken
//   node auto.mjs --all                 # so lange wiederholen, bis alle Acts geprüft sind
//
// Mehrfach aufrufen verarbeitet jeweils die nächsten ungeprüften Acts.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, deriveCoLineup } from "./lib/store.mjs";
import { discoverAndScrape } from "./lib/discover.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(ROOT, "graph.json");

const args = process.argv.slice(2);
const opts = { lang: "en", maxArtists: 60, minArtists: 2, maxFestivals: 30, all: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--lang") opts.lang = args[++i];
  else if (a === "--max") opts.maxArtists = parseInt(args[++i], 10) || 60;
  else if (a === "--min") opts.minArtists = parseInt(args[++i], 10) || 2;
  else if (a === "--festivals") opts.maxFestivals = parseInt(args[++i], 10) || 30;
  else if (a === "--all") opts.all = true;
}

const graph = await loadGraph(GRAPH);
let round = 0;
do {
  round++;
  console.log(`\n=== Durchlauf ${round} ===`);
  const s = await discoverAndScrape(graph, { ...opts, log: (m) => console.log("  " + m) });
  await saveGraph(GRAPH, graph);
  console.log(`\n  → ${s.processedArtists} Acts geprüft (${s.resolved} mit Wiki-Seite), ${s.scraped} Festivals · ${s.discovered} neue Acts entdeckt · ${s.connections} Verbindungen. Verbleibend: ${s.remaining}.`);
  if (!opts.all || s.remaining === 0 || s.processedArtists === 0) break;
} while (true);

const co = deriveCoLineup(graph, { minShared: opts.minShared }).length;
console.log(`\nFertig. ${Object.keys(graph.artists).length} eigene Acts, ${graph.events.length} Festivals, ${co} co_lineup-Verbindungen.`);
