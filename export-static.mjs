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
  return { id, title: pack.config.title, item: pack.config.item, n, e, mini: miniCluster(graph) };
}

// Mini-Netz einer Karte als Inline-SVG: Seed mittig, Nachbarn im Ring, Kanten in den
// App-Farben (blau = ähnlich, orange = zusammen). Positionen deterministisch (Index-Winkel),
// damit der Export stabil bleibt. Die dezente Animation macht CSS (nur beim Hover).
function miniCluster(graph) {
  const arts = Object.values(graph.artists);
  const seed = arts.find((a) => a.seed) || arts[0];
  if (!seed) return "";
  const others = arts.filter((a) => a.id !== seed.id).slice(0, 5);
  const picked = [seed, ...others];
  const pos = new Map();
  pos.set(seed.id, { x: 60, y: 45 });
  others.forEach((a, i) => {
    const ang = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(a.id, { x: 60 + Math.cos(ang) * 34, y: 45 + Math.sin(ang) * 30 });
  });
  const inSet = new Set(picked.map((a) => a.id));
  const lines = graph.edges.filter((ed) => inSet.has(ed.from) && inSet.has(ed.to)).map((ed) => {
    const p = pos.get(ed.from), q = pos.get(ed.to);
    const col = ed.type === "similar" ? "#5b8cff" : ed.type === "together" ? "#ff8a3d" : "#a586ff";
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${col}" stroke-width="1.4" opacity=".7"/>`;
  }).join("");
  const dots = picked.map((a, i) => {
    const p = pos.get(a.id), r = a.id === seed.id ? 5 : 3.4;
    const fill = a.id === seed.id ? "currentColor" : "currentColor";
    const op = a.id === seed.id ? 1 : 0.72;
    return `<circle class="mn" style="--i:${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}" opacity="${op}"/>`;
  }).join("");
  return `<svg class="mini" viewBox="0 0 120 90" aria-hidden="true">${lines}${dots}</svg>`;
}

// Landing-Seite: lebendiges Hintergrund-Kugelnetz (dieselbe Idee wie die App), plus
// pro Pack eine Karte mit Mini-Cluster. Zero-Dep, Canvas + SVG, respektiert reduced-motion.
function landingHtml(cards) {
  const items = cards.map((c) => `
      <a class="card" href="./${c.id}/">
        <div class="thumb">${c.mini}</div>
        <div class="cbody"><h2>${c.title}</h2>
        <p>${c.item.plur} · ${c.n} Knoten · ${c.e} Kanten</p></div>
      </a>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>like — Vorschauen</title>
<style>
  :root { color-scheme: light dark; --bg: #0f1115; --fg: #e7e9ee; --line: #2a2e37; --card: #171a21; --muted: .62; }
  @media (prefers-color-scheme: light) { :root { --bg: #fafafa; --fg: #16181d; --line: #e2e4ea; --card: #fff; } }
  * { box-sizing: border-box; }
  body { font: 16px/1.5 system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); overflow-x: hidden; }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; }
  .wrap { position: relative; z-index: 1; max-width: 760px; margin: 0 auto; padding: 56px 20px 40px; }
  h1 { font-size: 30px; margin: 0 0 4px; letter-spacing: -.01em; } h1 b { color: #ff6a00; }
  .sub { opacity: .72; margin: 0 0 30px; max-width: 46ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(224px, 1fr)); gap: 14px; }
  .card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--line);
    border-radius: 14px; text-decoration: none; color: inherit; background: color-mix(in srgb, var(--card) 82%, transparent);
    backdrop-filter: blur(6px); transition: border-color .18s, transform .18s, box-shadow .18s; }
  .card:hover { border-color: #ff6a00; transform: translateY(-3px); box-shadow: 0 10px 34px rgba(0,0,0,.22); }
  .thumb { flex: none; width: 68px; height: 52px; }
  .mini { width: 100%; height: 100%; overflow: visible; }
  .mini .mn { transform-box: fill-box; transform-origin: center; }
  .card:hover .mini .mn { animation: pulse 1.4s ease-in-out infinite; animation-delay: calc(var(--i) * .12s); }
  .mini line { transition: opacity .18s; } .card:hover .mini line { opacity: 1; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.35); } }
  .cbody h2 { font-size: 17px; margin: 0 0 2px; } .cbody p { margin: 0; font-size: 12.5px; opacity: var(--muted); }
  footer { margin-top: 34px; font-size: 13px; opacity: .55; }
  @media (prefers-reduced-motion: reduce) { .card:hover .mini .mn { animation: none; } }
</style></head><body>
  <canvas id="bg"></canvas>
  <div class="wrap">
    <h1>like<b>.</b> — Vorschauen</h1>
    <p class="sub">Statische, read-only Previews aller Domain-Packs. Anschauen, klicken, filtern — ohne Installation. Jede Karte zeigt das Netz ihrer Domäne.</p>
    <div class="grid">${items}</div>
    <footer>Live-Suche, Umschalter &amp; eigene Sammlungen gibt es in der App-Version (Download im Release).</footer>
  </div>
<script>
// Hintergrund-Kugelnetz: langsam treibende Knoten, blaue/orange Kanten, sehr dezent.
(function () {
  var cv = document.getElementById("bg"), ctx = cv.getContext("2d");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W, H, DPR = Math.min(devicePixelRatio || 1, 2), nodes = [], links = [];
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function resize(){ W = innerWidth; H = innerHeight; cv.width = W*DPR; cv.height = H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
  function seed(){
    var N = Math.max(14, Math.min(40, Math.round(W*H/42000)));
    nodes = []; for (var i=0;i<N;i++) nodes.push({ x: Math.random()*W, y: Math.random()*H, vx:(Math.random()-.5)*.14, vy:(Math.random()-.5)*.14, r: 2+Math.random()*3 });
    links = []; for (var j=0;j<nodes.length;j++){ var k=(j+1+((Math.random()*3)|0))%nodes.length; if(k!==j) links.push({a:nodes[j], b:nodes[k], t: Math.random()<.5?"s":"t"}); }
  }
  function frame(){
    ctx.clearRect(0,0,W,H);
    var isDark = css("--bg").toLowerCase().indexOf("#0") === 0 || matchMedia("(prefers-color-scheme: dark)").matches;
    for (var i=0;i<nodes.length;i++){ var n=nodes[i]; n.x+=n.vx; n.y+=n.vy;
      if(n.x<0||n.x>W) n.vx*=-1; if(n.y<0||n.y>H) n.vy*=-1; }
    for (var l=0;l<links.length;l++){ var e=links[l];
      ctx.strokeStyle = e.t==="s" ? "#5b8cff" : "#ff8a3d"; ctx.globalAlpha = isDark?0.16:0.13; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(e.a.x,e.a.y); ctx.lineTo(e.b.x,e.b.y); ctx.stroke(); }
    ctx.globalAlpha = isDark?0.5:0.35; ctx.fillStyle = isDark?"#c7ccd6":"#5b6270";
    for (var m=0;m<nodes.length;m++){ var q=nodes[m]; ctx.beginPath(); ctx.arc(q.x,q.y,q.r,0,7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if(!reduce) requestAnimationFrame(frame);
  }
  addEventListener("resize", function(){ resize(); seed(); if(reduce) frame(); });
  resize(); seed(); frame();
})();
</script>
</body></html>`;
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
