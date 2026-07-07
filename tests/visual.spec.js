// Visual Regression: Screenshots der Kernseiten bei 375, 768 und 1440 px.
// toHaveScreenshot legt die Baseline beim ersten Lauf an; danach werden Abweichungen
// gemeldet. Determinismus: reducedMotion (global) stoppt JS-Bewegung, animations:"disabled"
// (global in expect) friert CSS ein, und Math.random wird pro Seite deterministisch geseedet
// (sonst wären Sternenfeld und Planeten-Startwinkel bei jedem Lauf anders).
const { test, expect } = require("@playwright/test");
const { dismissIntro } = require("./helpers");

// Nur einmal (Desktop-Projekt) laufen lassen — die Viewport-Breite steuert der Test selbst,
// sonst gäbe es doppelte Baselines aus dem Mobile-Projekt.
test.describe("Visual Regression", () => {
  // Nur im desktop-Projekt laufen — die Breite setzt der Test selbst (375/768/1440).
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Screenshots nur im desktop-Projekt");
  });

  const WIDTHS = [375, 768, 1440];
  const PAGES = [
    { name: "landing", path: "/", ready: "#sun" },
    { name: "app-music", path: "/?pack=music", ready: ".emptysearch #q2", app: true },
    { name: "impressum", path: "/impressum", ready: "h1" },
  ];

  // Deterministischer PRNG, bevor Seiten-Skripte laufen -> stabile Sterne/Planeten.
  const seed = () => {
    // eslint-disable-next-line no-extend-native
    let s = 123456789;
    Math.random = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  };

  for (const width of WIDTHS) {
    for (const pg of PAGES) {
      test(`${pg.name} @ ${width}px`, async ({ page }) => {
        await page.addInitScript(seed);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pg.path, { waitUntil: "networkidle" });
        if (pg.app) await dismissIntro(page);
        await page.locator(pg.ready).first().waitFor({ state: "visible" });
        await page.waitForTimeout(400); // Layout/Canvas einmal zeichnen lassen
        // Kein Masking: Math.random ist geseedet (Sterne/Planeten deterministisch) und
        // reducedMotion + animations:"disabled" frieren die Bewegung ein.
        await expect(page).toHaveScreenshot(`${pg.name}-${width}.png`, {
          fullPage: false,
          animations: "disabled",
        });
      });
    }
  }
});
