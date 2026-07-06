// Responsive: Pack-Kacheln in beiden Ansichten (1440 & 375) sichtbar, klickbar und
// (an den Orbs = Tap-Zielen) nicht abgeschnitten. Desktop nutzt Hover, Mobile Touch.
// Zusätzlich: der Space/Flat-Toggle bleibt in beiden Breiten sichtbar, die Topbar
// läuft auf Mobile nicht über.
const { test, expect } = require("@playwright/test");
const { collect, assertClean, dismissIntro, PUBLIC_PACK } = require("./helpers");

test.describe("Pack-Kacheln responsiv", () => {
  test("alle 10 Kacheln sichtbar; Orbs vollständig im Viewport", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto("/", { waitUntil: "networkidle" });
    const viewportSize = page.viewportSize();
    await expect(page.locator(".planet")).toHaveCount(10);
    // jede Kachel sichtbar
    const count = await page.locator(".planet").count();
    for (let i = 0; i < count; i++) await expect(page.locator(".planet").nth(i)).toBeVisible();
    // Ganze Kacheln (inkl. Label) liegen vollständig im Viewport — nicht abgeschnitten.
    const overflowing = await page.evaluate(({ vw, vh }) => {
      const bad = [];
      document.querySelectorAll(".planet").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5) {
          bad.push({ t: el.getAttribute("data-title"), l: Math.round(b.left), r: Math.round(b.right) });
        }
      });
      return bad;
    }, { vw: viewportSize.width, vh: viewportSize.height });
    expect(overflowing, "keine Kachel darf über den Viewport-Rand ragen").toEqual([]);
    // Tap-Ziele (Kachel-Mittelpunkte) liegen im Viewport
    const centersOutside = await page.evaluate(({ vw, vh }) => {
      let n = 0;
      document.querySelectorAll(".planet").forEach((el) => {
        const b = el.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) n++;
      });
      return n;
    }, { vw: viewportSize.width, vh: viewportSize.height });
    expect(centersOutside, "alle Kachel-Mittelpunkte im Viewport").toBe(0);
    assertClean(sink);
  });

  test("Music-Kachel ist in beiden Breiten aktivierbar", async ({ page, isMobile }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const tile = page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`);
    await expect(tile).toBeVisible();
    if (isMobile) await tile.tap({ force: true }); else await tile.click({ force: true });
    await page.waitForURL(/pack=music/, { timeout: 15000 });
  });
});

test.describe("Desktop-spezifisch: Hover", () => {
  test.skip(({ isMobile }) => isMobile, "nur Desktop");
  test("Hover über eine Kachel zeigt die Info-Fläche", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const tile = page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`);
    await tile.hover({ force: true });
    const hint = page.locator("#hint");
    await expect(hint).toHaveClass(/show/);
    await expect(hint).toContainText(/Like Music/i);
  });
});

test.describe("Mobile-spezifisch: Touch", () => {
  test.skip(({ isMobile }) => !isMobile, "nur Mobile");
  test("Tap auf eine Kachel öffnet die Domäne", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`).tap({ force: true });
    await page.waitForURL(/pack=music/, { timeout: 15000 });
    await dismissIntro(page);
    await expect(page.locator(".bar")).toBeVisible();
  });
});

test.describe("App-Topbar responsiv", () => {
  test("Space/Flat-Toggle sichtbar; Topbar ohne Überlauf; Suche kontextgerecht", async ({ page, isMobile }) => {
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await dismissIntro(page);
    // Toggle immer sichtbar
    await expect(page.locator("#segSpace")).toBeVisible();
    await expect(page.locator("#segFlat")).toBeVisible();
    // Topbar läuft nicht über
    const overflow = await page.evaluate(() => {
      const bar = document.querySelector(".bar");
      return bar.scrollWidth > bar.clientWidth + 1;
    });
    expect(overflow, "Topbar darf nicht horizontal überlaufen").toBeFalsy();
    if (isMobile) {
      // Suche wandert ins ⋯-Menü -> Topbar-Suche ausgeblendet
      await expect(page.locator(".search")).toBeHidden();
      await page.locator("#moreBtn").tap();
      await expect(page.locator("#mSearch")).toBeVisible();
    } else {
      // Desktop: Topbar-Suche sichtbar
      await expect(page.locator("#q")).toBeVisible();
    }
  });
});
