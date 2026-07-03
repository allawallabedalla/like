#!/usr/bin/env node
// gen-demos.mjs — erzeugt kuratierte Demo-Graphen (packs/<id>/demo.json) für die
// statischen Previews. Bewusst offline & handkuratiert: die Preview soll auch dann
// stabil aussehen, wenn eine externe API gerade klemmt oder blockiert ist.
//
//   node scripts/gen-demos.mjs            # alle Packs
//
// Der Graph pro Pack ist klein (ein Seed + Umfeld), aber echt genug, um die UI,
// Begriffe, Legende und Kantenfarben eines Packs beurteilen zu können.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const slug = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

// Kompakter Builder: seed + Listen von [name, popularity] für similar (blau) und together (orange).
function build({ seed, seedPop, seedGenres, similar = [], together = [], extraEdges = [] }) {
  const artists = {}, edges = [];
  const add = (name, { seed = false, pop = null, genres = [] } = {}) => {
    const id = slug(name);
    if (!artists[id]) artists[id] = { id, name, seed, genres, ...(pop != null ? { listeners: pop } : {}) };
    return id;
  };
  const s = add(seed, { seed: true, pop: seedPop, genres: seedGenres });
  for (const [name, pop, g] of similar) edges.push({ from: s, to: add(name, { pop, genres: g || [] }), type: "similar", weight: 0.6, source: "demo" });
  for (const [name, pop, g] of together) edges.push({ from: s, to: add(name, { pop, genres: g || [] }), type: "together", weight: 2, source: "demo" });
  for (const [a, b, type, w] of extraEdges) edges.push({ from: slug(a), to: slug(b), type, weight: w, source: "demo" });
  return { meta: { version: 1, demo: true }, artists, edges };
}

const DEMOS = {
  music: build({
    seed: "Bonobo", seedPop: 890000, seedGenres: ["Downtempo", "Electronic"],
    similar: [["Tycho", 620000, ["Ambient"]], ["Rival Consoles", 90000, ["Electronic"]], ["Nils Frahm", 410000, ["Neoclassical"]], ["Jon Hopkins", 520000, ["Electronic"]]],
    together: [["Floating Points", 300000, ["Electronic"]], ["Four Tet", 700000, ["Electronic"]]],
    extraEdges: [["Tycho", "Jon Hopkins", "similar", 0.5], ["Four Tet", "Floating Points", "together", 3]],
  }),
  books: build({
    seed: "Der Prozess (Franz Kafka)", seedPop: 4200, seedGenres: ["Klassiker", "Existenzialismus"],
    similar: [["Der Fremde (Albert Camus)", 3800, ["Existenzialismus"]], ["Das Schloss (Franz Kafka)", 2100, ["Klassiker"]], ["1984 (George Orwell)", 9000, ["Dystopie"]], ["Die Verwandlung (Franz Kafka)", 3300, ["Klassiker"]]],
    together: [["Amerika (Franz Kafka)", 900, ["Klassiker"]], ["Das Urteil (Franz Kafka)", 700, ["Klassiker"]]],
    extraEdges: [["Der Fremde (Albert Camus)", "1984 (George Orwell)", "similar", 0.4]],
  }),
  movies: build({
    seed: "Paris, Texas (1984)", seedPop: 2100, seedGenres: ["Drama", "Roadmovie"],
    similar: [["Der Himmel über Berlin (1987)", 1800, ["Drama"]], ["Stranger Than Paradise (1984)", 900, ["Drama"]], ["Badlands (1973)", 1400, ["Drama"]]],
    together: [["Don't Come Knocking (2005)", 300, ["Drama"]], ["Alice in den Städten (1974)", 400, ["Roadmovie"]]],
    extraEdges: [["Badlands (1973)", "Stranger Than Paradise (1984)", "similar", 0.4]],
  }),
  plants: build({
    seed: "Lavendel", seedPop: 48000, seedGenres: ["Lippenblütler", "Lavandula"],
    similar: [["Salbei", 62000, ["Lippenblütler"]], ["Rosmarin", 71000, ["Lippenblütler"]], ["Thymian", 55000, ["Lippenblütler"]], ["Ysop", 8000, ["Lippenblütler"]]],
    together: [["Katzenminze", 21000, ["Lippenblütler"]], ["Bergbohnenkraut", 4000, ["Lippenblütler"]]],
    extraEdges: [["Salbei", "Rosmarin", "similar", 0.5], ["Thymian", "Bergbohnenkraut", "together", 2]],
  }),
  papers: build({
    seed: "Attention Is All You Need (Vaswani 2017)", seedPop: 120000, seedGenres: ["Deep Learning", "NLP"],
    similar: [["BERT (Devlin 2019)", 90000, ["NLP"]], ["GPT-3 (Brown 2020)", 40000, ["NLP"]], ["ResNet (He 2016)", 180000, ["Vision"]]],
    together: [["Transformer-XL (Dai 2019)", 6000, ["NLP"]], ["Set Transformer (Lee 2019)", 2000, ["ML"]]],
    extraEdges: [["BERT (Devlin 2019)", "GPT-3 (Brown 2020)", "similar", 0.6]],
  }),
  boardgames: build({
    seed: "Catan (1995)", seedPop: 130000, seedGenres: ["Aufbau", "Handel"],
    similar: [["Carcassonne (2000)", 120000, ["Legespiel"]], ["Ticket to Ride (2004)", 95000, ["Sammeln"]], ["Terra Mystica (2012)", 45000, ["Aufbau"]]],
    together: [["Die Siedler von Catan: Städte & Ritter (1998)", 20000, ["Aufbau"]], ["Elasund (2005)", 3000, ["Aufbau"]]],
    extraEdges: [["Carcassonne (2000)", "Ticket to Ride (2004)", "similar", 0.5]],
  }),
  podcasts: build({
    seed: "Lage der Nation", seedPop: 320, seedGenres: ["News", "Politik"],
    similar: [["Die Wochendämmerung", 240, ["Politik"]], ["Was jetzt?", 900, ["News"]], ["Apokalypse & Filterkaffee", 800, ["News"]]],
    together: [["Ultras — Warum wir Fußball lieben", 12, ["Doku"]], ["LdN Extra", 40, ["Politik"]]],
    extraEdges: [["Was jetzt?", "Apokalypse & Filterkaffee", "similar", 0.4]],
  }),
  games: build({
    seed: "Hades", seedPop: 3500000, seedGenres: ["Roguelike", "Action"],
    similar: [["Dead Cells", 2800000, ["Roguelike"]], ["Bastion", 2000000, ["Action"]], ["Transistor", 1500000, ["Action"]], ["Cult of the Lamb", 900000, ["Roguelike"]]],
    together: [["Pyre", 400000, ["RPG"]], ["Hades II", 800000, ["Roguelike"]]],
    extraEdges: [["Bastion", "Transistor", "together", 3], ["Dead Cells", "Cult of the Lamb", "similar", 0.5]],
  }),
};

for (const [id, graph] of Object.entries(DEMOS)) {
  const dir = join(ROOT, "packs", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "demo.json"), JSON.stringify(graph, null, 2), "utf8");
  console.log(`✓ packs/${id}/demo.json — ${Object.keys(graph.artists).length} Knoten, ${graph.edges.length} Kanten`);
}
