#!/usr/bin/env node
// scrape.mjs — Lineup von Wikipedia in den Graphen ziehen.
//
//   node scrape.mjs "https://de.wikipedia.org/wiki/Melt!_2023"
//   node scrape.mjs "Coachella 2023"                       # --lang en (Default)
//   node scrape.mjs "Fusion Festival" --lang de
//   node scrape.mjs "Roskilde Festival 2023" --name "Roskilde 2023" --date 2023 --place "Roskilde, DK"
//   node scrape.mjs "..." --dry                            # nur anzeigen, nicht speichern
//
// Erzeugt ein Event + paarweise co_lineup-Kanten (orange in der Map).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, addEvent, deriveCoLineup } from "./lib/store.mjs";
import { fetchLineup } from "./lib/wikipedia.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GRAPH = join(ROOT, "graph.json");

const args = process.argv.slice(2);
const opts = { lang: "en", name: null, date: null, place: null, dry: false };
const targets = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--lang") opts.lang = args[++i];
  else if (a === "--name") opts.name = args[++i];
  else if (a === "--date") opts.date = args[++i];
  else if (a === "--place") opts.place = args[++i];
  else if (a === "--dry") opts.dry = true;
  else targets.push(a);
}

if (targets.length === 0) {
  console.error('Bitte eine Wikipedia-URL oder einen Seitentitel angeben, z.B.:');
  console.error('  node scrape.mjs "https://de.wikipedia.org/wiki/Melt!_2023"');
  process.exit(1);
}

const graph = await loadGraph(GRAPH);
let touched = false;

for (const t of targets) {
  try {
    const r = await fetchLineup(t, { lang: opts.lang });
    console.log(`\n▼ ${r.eventName}`);
    console.log(`  Abschnitte: ${r.sections.join(" · ")}`);
    console.log(`  ${r.lineup.length} Künstler gefunden`);
    if (r.lineup.length) console.log("  " + r.lineup.slice(0, 20).join(", ") + (r.lineup.length > 20 ? " …" : ""));

    if (r.lineup.length === 0) { console.log("  (nichts zu speichern)"); continue; }
    if (opts.dry) { console.log("  --dry: nicht gespeichert"); continue; }

    const { event, artistCount } = addEvent(graph, {
      name: opts.name || r.eventName,
      date: opts.date,
      place: opts.place,
      lineup: r.lineup,
      sourceUrl: r.sourceUrl,
    });
    console.log(`  ✓ Event "${event.name}" gespeichert (${artistCount} Künstler verknüpft)`);
    touched = true;
  } catch (err) {
    console.error(`  ✗ ${t}: ${err.message}`);
  }
}

if (touched) {
  await saveGraph(GRAPH, graph);
  const co = deriveCoLineup(graph, { minShared: 2 }).length;
  console.log(`\nGespeichert → ${Object.keys(graph.artists).length} Künstler, ${graph.events.length} Events.`);
  console.log(`Abgeleitete co_lineup-Kanten (ab 2 gemeinsamen Festivals): ${co}.`);
  if (co === 0) console.log("Tipp: Erst mit mehreren Festivals entstehen Verbindungen. Scrape weitere, deren Acts sich überschneiden.");
}
