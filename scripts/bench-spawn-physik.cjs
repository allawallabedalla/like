// R16 Vorher/Nachher: Screen-Pixel-Bewegung UNBETEILIGTER Bestandsknoten während eines
// ＋-Ausbaus (das Maß, das der UX-Agent als ~75%-Kamera-Anteil identifiziert hat).
const { chromium } = require("/home/user/like/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const flat = process.env.SPACE ? false : true;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-DE" });
  await ctx.addInitScript((f) => { try { localStorage.setItem("like_anon", "r16m"); localStorage.setItem("like_demo_off", "1"); localStorage.setItem("like_landing_flat", f ? "1" : "0"); } catch {} }, flat);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://127.0.0.1:5472/?pack=music&e2e=1", { waitUntil: "domcontentloaded" });
  await p.locator("#introSkip").click().catch(() => {});
  await p.waitForTimeout(400);
  if (!flat) { await p.evaluate(() => { try { setSpace && setSpace(true); } catch {} }); }
  // Karte aufbauen: Alpha suchen (12 Similars), einpendeln lassen
  await p.evaluate(() => exploreByName("Alpha"));
  await p.waitForFunction(() => window.__e2e && window.__e2e.count() >= 12, null, { timeout: 8000 });
  await p.waitForFunction(() => alpha < 0.02, null, { timeout: 8000 });
  await p.waitForTimeout(500);
  // Bystander-Set: alle aktuellen Knoten AUSSER S01 und seinen künftigen Kindern (T01..T09)
  const measure = await p.evaluate(async () => {
    const s01 = nodeById.get("s01"); if (!s01) return { err: "kein s01" };
    const bystanders = nodes.filter(n => !n.venue && n.id !== "s01").map(n => n.id);
    const screenPos = () => { const m = {}; for (const id of bystanders) { const n = nodeById.get(id); if (n) m[id] = { x: view.x + n.x * view.k, y: view.y + n.y * view.k }; } return m; };
    const start = screenPos();
    const track = {}; for (const id of bystanders) track[id] = { last: start[id], path: 0, net: 0 };
    let maxFrame = 0;
    let stop = false;
    const raf = () => { if (stop) return; const cur = screenPos(); for (const id of bystanders) { const c = cur[id], l = track[id].last; if (!c || !l) continue; const d = Math.hypot(c.x - l.x, c.y - l.y); track[id].path += d; if (d > maxFrame) maxFrame = d; track[id].last = c; } requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // ＋ auf S01 auslösen (staged: Phase 1 similar + Phase 2 together)
    queueExpand(s01);
    await new Promise(r => setTimeout(r, 4500)); // beide Wellen + Einpendeln
    stop = true;
    const end = screenPos();
    let sumPath = 0, sumNet = 0, n = 0;
    for (const id of bystanders) { if (!end[id] || !start[id]) continue; sumPath += track[id].path; sumNet += Math.hypot(end[id].x - start[id].x, end[id].y - start[id].y); n++; }
    return { bystander: n, meanPath: Math.round(sumPath / n), meanNet: Math.round(sumNet / n), maxFrame: Math.round(maxFrame) };
  });
  console.log(JSON.stringify({ modus: flat ? "flat" : "space", ...measure, errs: errs.length }));
  await b.close();
})();
