// Spenden-Popup (freiwillig): erscheint nach 10 Minuten AKTIVER Nutzung, ist wegdrückbar
// („Später" -> nach weiteren 10 Minuten wieder), „Spenden"-Klick schafft 72 Stunden Ruhe.
// Aktiv nur mit injizierter Spenden-URL (window.LIKE_DONATE) — ohne sie existiert das Modul
// nicht (Desktop/lokal/Static bleiben unberührt). Läuft im STATIC-Modus mit Zeit-Hooks
// (window.__support bei ?e2e=1), damit keine echten 10 Minuten vergehen müssen.
const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const APP = pathToFileURL(path.join(__dirname, "..", "public", "index.html")).href + "?e2e=1";
const GRAPH = { artists: { a: { id: "a", name: "Bob Marley", seed: true, genres: ["reggae"], listeners: 500000 } }, edges: [] };

async function openApp(page, withDonate) {
  await page.addInitScript(({ g, donate }) => {
    window.LIKE_GRAPH = g;
    if (donate) window.LIKE_DONATE = { url: "https://paypal.me/beispiel" };
    try { localStorage.setItem("like_intro_seen", "1"); } catch {}
  }, { g: GRAPH, donate: withDonate });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}
const useMinutes = (page, min) => page.evaluate((m) => { for (let i = 0; i < m * 2; i++) window.__support.tick(30e3); }, min);

test.describe("Spenden-Popup (freiwillig)", () => {
  test("nach 10 Nutzungs-Minuten da; Später -> 10 Min später wieder; Spenden -> 72 Std Ruhe", async ({ page }) => {
    await openApp(page, true);
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/); // Start: kein Popup
    await useMinutes(page, 10);
    await expect(page.locator("#supportModal")).toHaveClass(/show/);
    await expect(page.locator("#supportDonate")).toHaveAttribute("href", /paypal\.me/);
    // Später -> zu, nach weiteren 10 Minuten wieder da
    await page.locator("#supportLater").click();
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/);
    await useMinutes(page, 10);
    await expect(page.locator("#supportModal")).toHaveClass(/show/);
    // Spenden-Klick (Navigation unterdrückt) -> zu + 72 Std Ruhe
    await page.evaluate(() => {
      const a = document.getElementById("supportDonate");
      a.addEventListener("click", (e) => e.preventDefault(), { once: true });
      a.click();
    });
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/);
    await useMinutes(page, 30);
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/);
    const quietH = await page.evaluate(() => Math.round((window.__support.state().quietUntil - Date.now()) / 3600e3));
    expect(quietH).toBe(72);
  });

  test("ohne Spenden-URL existiert das Modul nicht", async ({ page }) => {
    await openApp(page, false);
    const r = await page.evaluate(() => ({ hook: typeof window.__support, shown: !!document.querySelector("#supportModal.show") }));
    expect(r.hook).toBe("undefined");
    expect(r.shown).toBeFalsy();
  });
});
