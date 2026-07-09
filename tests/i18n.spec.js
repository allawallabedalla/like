// Sprach-Umschaltung DE/EN: Deutsch ist die Quellsprache (Tests laufen mit locale de-DE,
// siehe playwright.config). Hier wird explizit geprüft, dass (1) der Browser-Default greift,
// (2) der Umschalter die Wahl persistiert und (3) die Oberfläche wirklich auf Englisch steht —
// statisches Markup, Config-Labels (Pack-Overlay) und ein dynamischer Text.
const { test, expect } = require("@playwright/test");
const { dismissIntro, PUBLIC_PACK } = require("./helpers");

test.describe("Sprache (DE/EN)", () => {
  test("Deutsch als Default (locale de-DE); EN-Schalter übersetzt App + speichert Wahl", async ({ page }) => {
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await dismissIntro(page);
    // Default: Deutsch (Browser-Sprache de-DE)
    await expect(page.locator("#go")).toHaveText("Suchen");
    await expect(page.locator("#langDe")).toHaveClass(/on/);
    // Umschalten auf EN -> Reload -> Oberfläche englisch
    await page.locator("#langEn").click();
    await page.waitForLoadState("networkidle");
    await dismissIntro(page);
    if (await page.locator("#keyModal.show").count()) await page.locator("#keyLater").click();
    await expect(page.locator("#go")).toHaveText("Search");                    // statisches Markup
    expect(await page.evaluate(() => localStorage.getItem("like_lang"))).toBe("en");
    await page.locator("#moreBtn").click();
    await expect(page.locator("#morebox .mtitle").first()).toHaveText("Mode"); // Menü-Abschnitt
    await expect(page.locator("#modeFun")).toHaveText("Browse");
    await page.keyboard.press("Escape");
    // Panel-Label aus der Pack-Config (en-Overlay): Platzhalter der Suche
    await expect(page.locator("#q")).toHaveAttribute("placeholder", /Search/);
    // zurück auf DE
    await page.locator("#langDe").click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#go")).toHaveText("Suchen");
  });

  test("Landing: EN-Schalter übersetzt Texte und teilt sich die Wahl mit der App", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("#modeFun")).toHaveText("Stöbern");
    await page.locator("#langEn").click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#modeFun")).toHaveText("Browse");
    await expect(page).toHaveTitle(/Overview/);
    expect(await page.evaluate(() => localStorage.getItem("like_lang"))).toBe("en");
  });
});
