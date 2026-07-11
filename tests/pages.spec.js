// Seiten/Routen-Crawl: jede öffentliche Seite lädt fehlerfrei (keine unerwarteten
// Console-Errors, keine same-origin 4xx/5xx) und die Navigation funktioniert.
// Läuft in beiden Projekten (desktop 1440 / mobile 375).
const { test, expect } = require("@playwright/test");
const { collect, assertClean, dismissIntro, PUBLIC_PACK } = require("./helpers");

test.describe("Seiten laden fehlerfrei", () => {
  test("Landing / lädt sauber und zeigt Pack-Kacheln", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle(/like/i);
    // „like"-Wortmarke im Zentrum (Sonne)
    await expect(page.locator("#sun")).toContainText(/like/i);
    // eine Kachel je Pack (10 Domänen)
    await expect(page.locator(".planet")).toHaveCount(10);
    // das öffentliche Pack ist ein echter Link
    await expect(page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`)).toHaveCount(1);
    assertClean(sink);
  });

  test("Impressum lädt sauber und hat Zurück-Link", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto("/impressum", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText(/Impressum/i);
    await expect(page.locator('a[href="/"]')).toBeVisible();
    assertClean(sink);
  });

  test("App /?pack=music lädt sauber mit Topbar + Suche", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await dismissIntro(page);
    // immer sichtbare Topbar-Elemente
    await expect(page.locator(".bar")).toBeVisible();
    // Space/Flat lebt im ⋯-Menü (Abschnitt „Ansicht")
    await page.locator("#moreBtn").click();
    await expect(page.locator("#segSpace")).toBeVisible();
    await expect(page.locator("#segFlat")).toBeVisible();
    await page.keyboard.press("Escape");
    // E1: Erstbesuch zeigt die Beispiel-Karte samt Hinweisband — das × führt zurück
    // zum leeren Zustand mit der zentralen Suchleiste.
    await expect(page.locator("#demoBar")).toBeVisible();
    await page.locator("#demoOff").click();
    await expect(page.locator("#demoBar")).toHaveCount(0);
    await expect(page.locator(".emptysearch #q2")).toBeVisible();
    assertClean(sink);
  });

  test("E1: Beispiel-Karte lädt beim leeren Erstbesuch (Knoten sichtbar, nichts gespeichert)", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto(`/?pack=${PUBLIC_PACK}&e2e=1`, { waitUntil: "networkidle" });
    await dismissIntro(page);
    await expect(page.locator("#demoBar")).toBeVisible();
    const count = await page.evaluate(() => window.__e2e?.count());
    expect(count, "Demo-Karte bringt Knoten mit").toBeGreaterThan(3);
    // nichts wurde in den echten (leeren) Graphen geschrieben
    const real = await page.evaluate(async () => (await (await fetch("/api/graph?pack=music", { headers: { "x-like-anon": localStorage.getItem("like_anon") || "" } })).json()));
    expect(Object.keys(real.artists || {}).length).toBe(0);
    assertClean(sink);
  });
});

test.describe("Navigation", () => {
  test("Landing -> Klick/Tap auf Music-Kachel öffnet die App", async ({ page, baseURL, isMobile }) => {
    const sink = collect(page, baseURL);
    await page.goto("/", { waitUntil: "networkidle" });
    const tile = page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`);
    await expect(tile).toBeVisible();
    // Kacheln sitzen auf einer Canvas-rAF-Seite -> Playwrights Stabilitäts-Heuristik greift;
    // die Position ist unter reducedMotion statisch, daher force (echter Klick auf den <a>-Link).
    if (isMobile) await tile.tap({ force: true }); else await tile.click({ force: true });
    await page.waitForURL(/pack=music/, { timeout: 15000 });
    await dismissIntro(page);
    await expect(page.locator(".bar")).toBeVisible();
    assertClean(sink);
  });

  test("Impressum -> Zurück-Link führt zur Landing", async ({ page, baseURL, isMobile }) => {
    const sink = collect(page, baseURL);
    await page.goto("/impressum", { waitUntil: "networkidle" });
    const back = page.locator('a[href="/"]');
    if (isMobile) await back.tap(); else await back.click();
    await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
    await expect(page.locator(".planet").first()).toBeVisible();
    assertClean(sink);
  });
});
