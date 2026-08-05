// gestures.spec.js — U-3p: Regressionstests für die Handy-Gesten aus Runde 26.
//
// Warum eine eigene Datei und nicht interactions.spec.js: die dortigen Tests laufen im
// STATIC-Modus über file:// (kontrollierter Graph, kein Server). Die Sheets und ihre Gesten
// hängen aber an Dingen, die es dort nicht gibt (Popover-Inhalte, Demo-Karte, Klangprobe).
// Also gegen den echten Server mit der kuratierten Beispiel-Karte (`/api/demo`) — die lädt
// ohne Netz und liefert deterministisch Knoten.
//
// Warum CDP statt page.touchscreen: `tap()` sendet nur touchstart/touchend. Ein Wisch braucht
// eine Move-Kette dazwischen, und genau die wertet makeSheet() aus. Also
// Input.dispatchTouchEvent über eine CDP-Session.
const { test, expect } = require("@playwright/test");
const { PUBLIC_PACK, dismissIntro } = require("./helpers");

// Nur das mobile Projekt (375×812, hasTouch) — auf dem Desktop greifen weder Sheet- noch
// Coarse-Regeln, die Tests wären dort sinnlos.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch-Gesten: nur im mobile-Projekt");
});

async function openApp(page) {
  await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
  await dismissIntro(page);
  // Ohne Last.fm-Key zeigt der Testserver den Key-Dialog — er würde jede Geste abfangen.
  if (await page.locator("#keyModal.show").count()) await page.locator("#keyLater").click();
  await page.waitForTimeout(1200); // Layout settlen lassen
  return page.context().newCDPSession(page);
}

// Wisch mit echter Move-Kette. dy < 0 = nach oben.
async function swipe(cdp, page, x, y, dy, steps = 10) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(12);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(450); // Snap-/Schließ-Animation
}

async function longPress(cdp, page, x, y) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(700); // > LONG_PRESS_MS (480)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
}

// Achtung: die Popover schalten über .show, das Info-Panel über .open — beides hier gekapselt,
// damit ein Test nicht stillschweigend „immer zu" misst.
const shown = (page, id) => page.evaluate((i) => document.getElementById(i).classList.contains("show"), id);
const panelOpen = (page) => page.evaluate(() => document.getElementById("panel").classList.contains("open"));
const rect = (page, id) => page.evaluate((i) => {
  const r = document.getElementById(i).getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), vh: innerHeight, vw: innerWidth };
}, id);

// Einen Knoten der Beispiel-Karte finden: Raster abtasten, bis sich das Info-Panel öffnet.
// Gibt die Bildschirmkoordinaten des Treffers zurück.
async function findNode(page) {
  const box = await page.locator("#cv").boundingBox();
  for (let gy = 0.22; gy <= 0.74; gy += 0.06) {
    for (let gx = 0.16; gx <= 0.84; gx += 0.06) {
      const x = box.x + box.width * gx, y = box.y + box.height * gy;
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(150);
      if (await panelOpen(page)) return { x, y, box };
    }
  }
  throw new Error("kein Knoten auf der Beispiel-Karte gefunden");
}

test.describe("U-3a — Fenster sind Bottom-Sheets und lassen sich wegwischen", () => {
  test("⋯-Menü liegt vollständig im Bild und scrollt (statt unten rauszuragen)", async ({ page }) => {
    await openApp(page);
    await page.locator("#moreBtn").tap();
    await page.waitForTimeout(400);
    const r = await rect(page, "morebox");
    // Der eigentliche Befund von Runde 26: 958 px hoch bei 844 px Viewport, ohne overflow-y —
    // alles ab „Karte" (Export, Backup, Löschen, Impressum) war unerreichbar.
    expect(r.bottom, "⋯-Menü darf nicht unter den Bildschirmrand ragen").toBeLessThanOrEqual(r.vh + 1);
    expect(r.width, "⋯-Menü ist auf dem Telefon volle Breite").toBe(r.vw);
    const scroll = await page.evaluate(() => {
      const e = document.getElementById("morebox");
      return { canScroll: e.scrollHeight > e.clientHeight, overflow: getComputedStyle(e).overflowY };
    });
    expect(scroll.overflow).toBe("auto");
    expect(scroll.canScroll, "der überstehende Teil muss scrollbar sein").toBeTruthy();
    // Und der untere Teil ist tatsächlich erreichbar (Impressum steht ganz unten im Menü
    // und ist — anders als „Löschen…" — nicht auf den Profi-Modus beschränkt).
    await page.evaluate(() => { const e = document.getElementById("morebox"); e.scrollTop = e.scrollHeight; });
    await expect(page.locator('#morebox a[href="/impressum"]')).toBeInViewport();
  });

  test("Wisch nach unten schließt das ⋯-Menü", async ({ page }) => {
    const cdp = await openApp(page);
    await page.locator("#moreBtn").tap();
    await page.waitForTimeout(400);
    expect(await shown(page, "morebox")).toBeTruthy();
    const r = await rect(page, "morebox");
    await swipe(cdp, page, r.vw / 2, r.top + 12, 220);
    expect(await shown(page, "morebox"), "Wisch nach unten am Griff schließt").toBeFalsy();
  });

  test("Scrollen im Sheet schließt es NICHT", async ({ page }) => {
    const cdp = await openApp(page);
    await page.locator("#moreBtn").tap();
    await page.waitForTimeout(400);
    // Erst nach unten scrollen, dann von der Mitte aus nach unten ziehen: die Geste gehört
    // dem Scrollen, nicht dem Sheet. (makeSheet startet den Zieh-Wisch nur bei scrollTop <= 0
    // oder direkt am Griff.)
    await page.evaluate(() => { document.getElementById("morebox").scrollTop = 200; });
    const r = await rect(page, "morebox");
    await swipe(cdp, page, r.vw / 2, r.top + r.height / 2, 160);
    expect(await shown(page, "morebox"), "Scrollen darf das Fenster nicht schließen").toBeTruthy();
  });

  test("Info-Panel: Wisch hoch zieht auf, zweimal runter schließt", async ({ page }) => {
    const cdp = await openApp(page);
    await findNode(page);
    const tall = () => page.evaluate(() => document.getElementById("panel").classList.contains("tall"));
    const open = () => panelOpen(page);

    const r1 = await rect(page, "panel");
    await swipe(cdp, page, r1.vw / 2, r1.top + 10, -160);
    expect(await tall(), "Wisch nach oben am Griff zieht das Panel auf").toBeTruthy();
    const r2 = await rect(page, "panel");
    expect(r2.height, "aufgezogen ist höher als normal").toBeGreaterThan(r1.height);

    await swipe(cdp, page, r2.vw / 2, r2.top + 10, 200);
    expect(await tall(), "erster Wisch runter: zurück auf Normalhöhe").toBeFalsy();
    expect(await open(), "… aber noch offen").toBeTruthy();

    const r3 = await rect(page, "panel");
    await swipe(cdp, page, r3.vw / 2, r3.top + 10, 200);
    expect(await open(), "zweiter Wisch runter schließt").toBeFalsy();
  });
});

test.describe("U-3d/U-3k — Fenster wieder loswerden", () => {
  test("Tipp auf die Karte schließt offene Popover", async ({ page }) => {
    await openApp(page);
    const box = await page.locator("#cv").boundingBox();
    await page.locator("#moreBtn").tap();
    await page.waitForTimeout(400);
    expect(await shown(page, "morebox")).toBeTruthy();
    // Auf Touch kommt kein mousedown an (der Canvas behält die Geste per preventDefault) —
    // ohne closeOverlaysOnMapTap() blieb das Menü offen.
    await page.touchscreen.tap(box.x + 30, box.y + 120);
    await page.waitForTimeout(400);
    expect(await shown(page, "morebox"), "Tipp auf die Karte schließt das Menü").toBeFalsy();
  });

  test("⋯-Menü und Entdecken haben einen erreichbaren Schließen-Knopf", async ({ page }) => {
    await openApp(page);
    for (const [box, btn, opener] of [["morebox", "#moreClose", "#moreBtn"], ["discoverbox", "#discoverClose", "#mDiscover"]]) {
      if (opener === "#mDiscover") { await page.locator("#moreBtn").tap(); await page.waitForTimeout(300); }
      await page.locator(opener).tap();
      await page.waitForTimeout(400);
      expect(await shown(page, box), `${box} sollte offen sein`).toBeTruthy();
      const b = page.locator(btn);
      await expect(b, `${btn} muss sichtbar sein (VoiceOver hat kein Esc und der Griff ist aria-hidden)`).toBeVisible();
      expect(await b.getAttribute("aria-label")).toBeTruthy();
      const bb = await b.boundingBox();
      expect(Math.min(bb.width, bb.height), `${btn} braucht eine Finger-Trefferfläche`).toBeGreaterThanOrEqual(40);
      await b.tap();
      await page.waitForTimeout(300);
      expect(await shown(page, box), `${btn} schließt ${box}`).toBeFalsy();
    }
  });
});

test.describe("U-3b — Klangprobe ist auf dem Telefon erreichbar", () => {
  test("langes Drücken bietet die Klangprobe als ersten Eintrag", async ({ page }) => {
    const cdp = await openApp(page);
    const hit = await findNode(page);
    await page.waitForTimeout(500); // nudgeAboveSheet: Knoten wandert über das Sheet
    const panelTop = (await rect(page, "panel")).top;
    // centerOn setzt den gewählten Knoten mittig in den freien Streifen über dem Sheet.
    await longPress(cdp, page, hit.box.x + hit.box.width / 2, hit.box.y + (52 + panelTop) / 2);
    const items = await page.evaluate(() =>
      [...document.querySelectorAll("#ctxmenu div")].map((d) => ({ text: d.textContent, h: Math.round(d.getBoundingClientRect().height) })));
    expect(items.length, "langes Drücken öffnet das Kontextmenü").toBeGreaterThan(0);
    expect(items[0].text, "Klangprobe steht ganz oben").toMatch(/Klangprobe|preview/i);
    for (const it of items) {
      expect(it.h, `Kontextmenü-Zeile „${it.text}" braucht 44 px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("U-3e/U-3i — Finger-Tauglichkeit", () => {
  test("kein Eingabefeld schreibt kleiner als 16 px (sonst zoomt iOS Safari hinein)", async ({ page }) => {
    await openApp(page);
    // Checkboxen/Radios/Slider tragen keinen Text und lösen den Auto-Zoom nicht aus.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea')]
        .map((e) => ({ id: e.id || e.className, fs: parseFloat(getComputedStyle(e).fontSize) }))
        .filter((x) => x.fs < 16));
    expect(small, "Felder < 16px lösen auf iOS einen Zoom aus, der seit U-2f nicht zurückgeht").toEqual([]);
  });

  test("sichtbare Bedienelemente sind mindestens 40 px hoch", async ({ page }) => {
    await openApp(page);
    await findNode(page); // Panel öffnen, damit auch dessen Knöpfe gemessen werden
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("button, .zoomctl button, #ctxmenu div")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        // #listSwitch ist ein Text-Umschalter im Korb-Kopf (kein Icon-Ziel) und bewusst flacher.
        if (el.id === "listSwitch") continue;
        if (r.height < 40) out.push({ id: el.id, text: (el.textContent || "").trim().slice(0, 20), h: Math.round(r.height) });
      }
      return out;
    });
    expect(small, "zu flache Bedienelemente").toEqual([]);
  });
});
