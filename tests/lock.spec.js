// Lock-Logik: gesperrte Packs dürfen NICHT nutzbar sein — auch nicht per direkter URL.
// Gate ist in der Testumgebung aktiv (LIKE_UNLOCK_PASSWORD gesetzt), nur „music" ist frei.
const { test, expect } = require("@playwright/test");
const { collect, assertClean, dismissIntro, unlock, UNLOCK_PW, PUBLIC_PACK, LOCKED_PACKS } = require("./helpers");

test.describe("Gesperrte Packs sind ohne Freischaltung nicht nutzbar", () => {
  test("direkte URL zu gesperrtem Pack leitet auf die Landing um", async ({ page, baseURL }) => {
    for (const id of ["books", "movies", "travel"]) {
      await page.goto(`/?pack=${id}`, { waitUntil: "domcontentloaded" });
      // Server antwortet 302 -> Landing; die URL trägt kein ?pack mehr
      const u = new URL(page.url());
      expect(u.pathname, `${id}: sollte auf / landen`).toBe("/");
      expect(u.searchParams.has("pack"), `${id}: kein pack-Param nach Redirect`).toBeFalsy();
      await expect(page.locator(".planet").first()).toBeVisible();
    }
  });

  test("API eines gesperrten Packs liefert 401 (kein Datenzugriff)", async ({ request }) => {
    for (const id of LOCKED_PACKS.slice(0, 4)) {
      const g = await request.get(`/api/graph?pack=${id}`);
      expect(g.status(), `${id}: /api/graph`).toBe(401);
      const h = await request.get(`/api/health?pack=${id}`);
      expect(h.status(), `${id}: /api/health`).toBe(401);
    }
  });

  test("öffentliches Pack (music) ist frei nutzbar", async ({ request }) => {
    const g = await request.get(`/api/graph?pack=${PUBLIC_PACK}`);
    expect(g.status()).toBe(200);
    const h = await request.get(`/api/health?pack=${PUBLIC_PACK}`);
    expect(h.status()).toBe(200);
  });
});

test.describe("Landing markiert gesperrte Packs als Coming soon", () => {
  test("gesperrte Kacheln sind keine Links, sondern Passwort-geschützte Buttons", async ({ page, baseURL }) => {
    const sink = collect(page, baseURL);
    await page.goto("/", { waitUntil: "networkidle" });
    // genau 9 gesperrte + 1 freie Kachel
    await expect(page.locator(".planet.locked")).toHaveCount(LOCKED_PACKS.length);
    await expect(page.locator(`a.planet[href*="pack=${PUBLIC_PACK}"]`)).toHaveCount(1);
    // gesperrte Kacheln haben KEIN href (kein direkter Absprung), aber Schloss-Markierung
    const lockedHrefs = await page.locator(".planet.locked").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(lockedHrefs.every((h) => h === null)).toBeTruthy();
    await expect(page.locator(".planet.locked .lk").first()).toBeAttached();
    assertClean(sink);
  });

  test("Klick/Tap auf gesperrte Kachel navigiert NICHT, sondern fragt Passwort", async ({ page, isMobile }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    let prompted = false;
    page.on("dialog", (d) => { prompted = true; d.dismiss().catch(() => {}); });
    const locked = page.locator(".planet.locked").first();
    if (isMobile) await locked.tap({ force: true }); else await locked.click({ force: true });
    await page.waitForTimeout(500);
    expect(prompted, "Passwort-Prompt sollte erscheinen").toBeTruthy();
    // weiterhin auf der Landing (keine Freischaltung ohne Passwort)
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("Freischaltung (Unlock)", () => {
  test("falsches Passwort wird abgelehnt (401)", async ({ request }) => {
    const res = await request.post("/api/unlock", { data: { password: "definitiv-falsch" } });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBeFalsy();
  });

  test("korrektes Passwort schaltet gesperrte Packs frei (URL + API)", async ({ page, context, baseURL }) => {
    // vor Unlock: books leitet um
    await page.goto("/?pack=books", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/");
    // Unlock -> Cookie im Context
    await unlock(context, baseURL);
    // API jetzt frei
    const g = await context.request.get("/api/graph?pack=books");
    expect(g.status(), "books /api/graph nach Unlock").toBe(200);
    // Seite jetzt erreichbar (keine Umleitung mehr)
    const sink = collect(page, baseURL);
    await page.goto("/?pack=books", { waitUntil: "networkidle" });
    expect(new URL(page.url()).searchParams.get("pack")).toBe("books");
    await dismissIntro(page);
    await expect(page.locator(".bar")).toBeVisible();
    assertClean(sink);
  });
});
