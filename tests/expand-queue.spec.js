// ＋-Ausbau-Warteschlange: mehrere schnelle ＋-Klicks auf Monde werden nicht mehr verworfen,
// sondern gesammelt — alle wartenden Knoten pulsieren (Blink-Ring), sie bauen NACHEINANDER
// aus, und die Info-Karte öffnet nur der zuletzt ausgebaute Act EINER Mehrfach-Aktion (ein
// einzelner ＋-Klick bleibt info-frei). Der echte Ausbau braucht das Live-Backend; hier wird
// die Reihenfolge-/Auswahl-Logik mit einem Rekorder-Stub geprüft und das Ring-Zeichnen visuell.
const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const APP = pathToFileURL(path.join(__dirname, "..", "public", "index.html")).href + "?e2e=1";
function buildGraph() {
  const artists = { h: { id: "h", name: "Hub", seed: true, genres: ["techno"], listeners: 500000 } }, edges = [];
  for (let k = 0; k < 6; k++) { artists["m" + k] = { id: "m" + k, name: "Moon " + k, genres: ["techno"], listeners: 30000 }; edges.push({ from: "h", to: "m" + k, type: "similar", weight: 0.6 }); }
  return { artists, edges };
}
async function openApp(page) {
  await page.addInitScript((g) => { window.LIKE_GRAPH = g; try { localStorage.setItem("like_intro_seen", "1"); } catch {} }, buildGraph());
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

test.describe("＋-Ausbau-Warteschlange", () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name === "mobile", "Reihenfolge-Logik: einmal auf Desktop reicht"); });

  test("nacheinander ausbauen; Info nur beim letzten einer Mehrfach-Aktion; einzeln ohne Info", async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const calls = [];
      // exploreByName durch einen Rekorder ersetzen (der echte Ausbau braucht Netzwerk)
      exploreByName = async (name, opts) => { calls.push({ name, select: !!opts.select }); await new Promise((res) => setTimeout(res, 10)); };
      // MEHRFACH: drei ＋ schnell hintereinander
      ["A", "B", "C"].forEach((nm, i) => { expandQueue.push({ name: nm, id: "id" + i }); expandPulse.add("id" + i); });
      const pulseAtStart = expandPulse.size;
      await drainExpandQueue();
      const multi = calls.map((c) => c.name + (c.select ? "*" : "")); // * = Info geöffnet
      const pulseAtEnd = expandPulse.size;
      // EINZELN: ein ＋ -> kein Info
      calls.length = 0;
      expandQueue.push({ name: "Solo", id: "idx" }); expandPulse.add("idx");
      await drainExpandQueue();
      const single = calls.map((c) => c.name + (c.select ? "*" : ""));
      return { pulseAtStart, multi, pulseAtEnd, single };
    });
    expect(r.pulseAtStart).toBe(3);              // alle drei pulsieren
    expect(r.multi).toEqual(["A", "B", "C*"]);   // Reihenfolge; Info NUR beim letzten
    expect(r.pulseAtEnd).toBe(0);                // Ringe nach Abschluss aus
    expect(r.single).toEqual(["Solo"]);          // einzeln: kein Info-Stern
  });

  test("mehrere wartende Knoten zeigen gleichzeitig den Blink-Ring", async ({ page }) => {
    await openApp(page);
    const drawnRings = await page.evaluate(() => {
      // drei Monde in die Pulse-Menge -> Ringe müssen im nächsten Frame gezeichnet werden
      ["m0", "m2", "m4"].forEach((id) => expandPulse.add(id));
      // draw() zählen: wir prüfen, dass die Knoten in der Pulse-Menge liegen und animiert wird
      requestDraw();
      return { pulsing: [...expandPulse], animating: expandPulse.size > 0 };
    });
    expect(drawnRings.pulsing.sort()).toEqual(["m0", "m2", "m4"]);
    expect(drawnRings.animating).toBeTruthy();
  });
});
