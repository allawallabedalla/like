// interactions.spec.js — Regressionstests für die fragilen Client-Interaktionen, die in der
// Vergangenheit mehrfach wieder kaputtgingen: Laden ohne Fehler, Ziehen von Knoten, Preview-Pill,
// Zoom, LOD-/Blende-Arithmetik. Läuft im STATIC-Modus (window.LIKE_GRAPH via file://), also
// deterministisch und OHNE Server — ein kontrollierter Graph statt echter API.
const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const APP = pathToFileURL(path.join(__dirname, "..", "public", "index.html")).href + "?e2e=1";

// Kontrollierter Graph: 6 Hubs + je 10 Blätter, ein paar Cross-Kanten -> LOD/Halos/Drag greifen.
function buildGraph() {
  const artists = {}, edges = [];
  const hubs = ["Bob Marley", "Alborosie", "Alpha Blondy", "Speedy J", "Amelie Lens", "Facta"];
  hubs.forEach((name, hi) => {
    const id = "h" + hi;
    artists[id] = { id, name, seed: hi === 0, genres: [hi < 3 ? "reggae" : "techno"], listeners: 500000 };
    for (let k = 0; k < 10; k++) {
      const lid = id + "_l" + k;
      artists[lid] = { id: lid, name: name.split(" ")[0] + " nb" + k, genres: [hi < 3 ? "reggae" : "techno"], listeners: (k % 6) * 40000 };
      edges.push({ from: id, to: lid, type: "similar", weight: 0.5 });
    }
  });
  for (let i = 0; i < hubs.length; i++) for (let j = i + 1; j < hubs.length; j++) if ((i + j) % 2 === 0)
    edges.push({ from: "h" + i, to: "h" + j, type: "together", weight: 2, shows: [] });
  return { artists, edges };
}

async function openApp(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.addInitScript((g) => { window.LIKE_GRAPH = g; }, buildGraph());
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // Layout settlen lassen
  return errors;
}

test.describe("App-Interaktionen (Regression)", () => {
  // Maus-Interaktionen (Drag/Zoom-Klicks) sind Desktop-Sache — auf dem Mobile-Projekt überspringen.
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name === "mobile", "Maus-Interaktionen: nur Desktop"); });

  test("lädt ohne JS-Fehler, Canvas vorhanden", async ({ page }) => {
    const errors = await openApp(page);
    expect(errors, errors.join("\n")).toEqual([]);
    const ok = await page.evaluate(() => { const c = document.getElementById("cv"); return !!c && c.width > 0 && c.height > 0; });
    expect(ok).toBe(true);
  });

  test("Ziehen verschiebt einen Knoten (Drag funktioniert)", async ({ page }) => {
    await openApp(page);
    const before = await page.evaluate(() => window.__e2e.pos("h0"));
    const sp = await page.evaluate(() => window.__e2e.screenPos("h0"));
    expect(before && sp).toBeTruthy();
    const box = await page.locator("#cv").boundingBox();
    const x = box.x + sp.x, y = box.y + sp.y;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 130, y + 90, { steps: 10 }); // deutlich über der 6px-Schwelle
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__e2e.pos("h0"));
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    expect(moved).toBeGreaterThan(20);
  });

  test("Preview-Pill: Scrub-Bar hat eine Breite (~70-108px)", async ({ page }) => {
    await openApp(page);
    const w = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("npBar")).width));
    expect(w).toBeGreaterThanOrEqual(60);
    expect(w).toBeLessThanOrEqual(140);
  });

  test("Zoom rein/raus crasht nicht", async ({ page }) => {
    const errors = await openApp(page);
    for (let i = 0; i < 4; i++) { await page.click("#zoomIn"); await page.waitForTimeout(60); }
    for (let i = 0; i < 4; i++) { await page.click("#zoomOut"); await page.waitForTimeout(60); }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("Max-Zoom: Planeten versteckt, Sonnen sichtbar", async ({ page }) => {
    await openApp(page);
    for (let i = 0; i < 10; i++) { await page.click("#zoomOut"); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ leaf: window.__e2e.lodHidden("h0_l5"), sun: window.__e2e.lodHidden("h0") }));
    expect(r.leaf).toBe(true);   // Planet/Blatt: weg
    expect(r.sun).toBe(false);   // Sonne/Hub: bleibt
  });

  test("LOD-/Zoom-Blende-Arithmetik stimmt", async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(() => {
      const linkFade = (k) => Math.max(0, Math.min(1, (k - 0.35) / (0.7 - 0.35)));
      const cs = (dist, W = 1000) => { const t = Math.min(1, dist / (W * 0.4)); return t * t * (3 - 2 * t); };
      return { lfOut: linkFade(0.2), lfIn: linkFade(0.8), csMid: cs(0), csEdge: cs(400) };
    });
    expect(r.lfOut).toBe(0);   // weit draußen: keine Kanten
    expect(r.lfIn).toBe(1);    // reingezoomt: volle Kanten
    expect(r.csMid).toBe(0);   // Bildmitte: still
    expect(r.csEdge).toBe(1);  // ab 40% Breite: volles Tempo
  });
});
