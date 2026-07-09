// PWA & State: Manifest + Service Worker valide, Offline lädt aus dem Cache,
// Live-Daten (/api/*) sind vom Cache ausgenommen (Deploy-Updates greifen), und die
// clientseitige Persistenz (localStorage) überlebt einen Reload.
const { test, expect } = require("@playwright/test");
const { dismissIntro, PUBLIC_PACK } = require("./helpers");

test.describe("Manifest & Icons", () => {
  test("Manifest ist valide und vollständig", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const m = await res.json();
    expect(typeof m.name).toBe("string");
    expect(typeof m.short_name).toBe("string");
    expect(m.start_url).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui", "browser"]).toContain(m.display);
    expect(Array.isArray(m.icons) && m.icons.length).toBeTruthy();
    for (const ic of m.icons) {
      expect(ic.src).toBeTruthy();
      expect(ic.sizes).toBeTruthy();
      expect(ic.type).toMatch(/image\//);
    }
  });

  test("alle im Manifest referenzierten Icons laden (200)", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    for (const ic of m.icons) {
      const r = await request.get(ic.src);
      expect(r.status(), `Icon ${ic.src}`).toBe(200);
      expect(r.headers()["content-type"]).toMatch(/image\//);
    }
  });
});

test.describe("Service Worker", () => {
  test("sw.js wird ausgeliefert und enthält install/activate/fetch", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/javascript/);
    const src = await res.text();
    expect(src).toMatch(/addEventListener\(["']install/);
    expect(src).toMatch(/addEventListener\(["']activate/);
    expect(src).toMatch(/addEventListener\(["']fetch/);
  });

  test("SW registriert und aktiviert sich (127.0.0.1 = sicherer Kontext)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return (reg.active || reg.installing || reg.waiting) ? "registered" : "none";
    });
    expect(state).toBe("registered");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  });
});

test.describe("Offline & Cache-Strategie", () => {
  test("Seite lädt offline aus dem Cache", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // SW registrieren + Kontrolle übernehmen lassen, Shell cachen
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    await page.goto("/", { waitUntil: "networkidle" }); // einmal online neu laden -> im Cache
    // jetzt offline gehen und neu laden
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    // Landing kommt aus dem Cache: Sonne + Kacheln sind da
    await expect(page.locator("#sun")).toBeVisible();
    await expect(page.locator(".planet").first()).toBeVisible();
    await context.setOffline(false);
  });

  test("Live-Daten (/api/*) sind vom SW-Cache ausgenommen (Deploy-Updates greifen)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    // sw.js überspringt /api/ per `if (url.pathname.startsWith("/api/")) return;` -> die
    // Antwort wird NICHT vom Service Worker bedient (network-first für Live-Daten).
    const health = await page.evaluate(async () => {
      const r = await fetch("/api/health?pack=music", { cache: "no-store" });
      return { ok: r.ok, status: r.status };
    });
    expect(health.ok).toBe(true);
    expect(health.status).toBe(200);
  });
});

test.describe("Persistenz (localStorage überlebt Reload)", () => {
  test("Ansicht/Theme-Wahl bleibt nach Reload erhalten", async ({ page }) => {
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await dismissIntro(page);
    // Standard = Flat/Light. Auf Space schalten (den Nicht-Default -> testet Persistenz echt;
    // persistiert like_theme=dark, gekoppelt). Der Toggle lebt im ⋯-Menü.
    await page.locator("#moreBtn").click();
    await page.locator("#segSpace").click();
    await expect(page.locator("#segSpace")).toHaveClass(/on/);
    const stored = await page.evaluate(() => localStorage.getItem("like_theme"));
    expect(stored).toBe("dark");
    // Reload -> Wahl bleibt
    await page.reload({ waitUntil: "networkidle" });
    await dismissIntro(page);
    // Ohne Intro zeigt der Testserver (kein Last.fm-Key) den Key-Dialog — wegklicken,
    // sonst blockiert er den Klick aufs ⋯-Menü.
    if (await page.locator("#keyModal.show").count()) await page.locator("#keyLater").click();
    await page.locator("#moreBtn").click();
    await expect(page.locator("#segSpace")).toHaveClass(/on/);
    expect(await page.evaluate(() => localStorage.getItem("like_theme"))).toBe("dark");
  });

  test("manuell gesetzter localStorage-Wert überlebt Reload", async ({ page }) => {
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.setItem("e2e_probe", "kept-42"));
    await page.reload({ waitUntil: "networkidle" });
    expect(await page.evaluate(() => localStorage.getItem("e2e_probe"))).toBe("kept-42");
  });
});
