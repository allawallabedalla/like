// Spenden-Popup (freiwillig): erscheint HÖCHSTENS EINMAL PRO SESSION nach ein paar Minuten
// AKTIVER Nutzung (E12), ist wegdrückbar und kommt in derselben Session NICHT wieder;
// „Spenden"-Klick schafft 72 Stunden Ruhe. Aktiv nur mit injizierter Spenden-URL
// (window.LIKE_DONATE) — ohne sie existiert das Modul nicht (Desktop/lokal/Static bleiben
// unberührt). Läuft im STATIC-Modus mit Zeit-Hooks (window.__support bei ?e2e=1), damit
// keine echten Minuten vergehen müssen.
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
  test("einmal pro Session nach ein paar aktiven Minuten; Später -> bleibt für die Session weg", async ({ page }) => {
    await openApp(page, true);
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/); // Start: kein Popup
    await useMinutes(page, 5);                                           // > SHOW_AFTER (4 Min)
    await expect(page.locator("#supportModal")).toHaveClass(/show/);
    await expect(page.locator("#supportDonate")).toHaveAttribute("href", /paypal\.me/);
    // Später -> zu, und in DIESER Session NICHT wieder (E12: nur 1× pro Session)
    await page.locator("#supportLater").click();
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/);
    await useMinutes(page, 20);
    await expect(page.locator("#supportModal")).not.toHaveClass(/show/);
  });

  test("Spenden-Klick beim ersten Zeigen -> 72 Std Ruhe", async ({ page }) => {
    await openApp(page, true);
    await useMinutes(page, 5);
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

  // Konto-Kopplung (echter Server): Spenden-Klick wird am Konto vermerkt und beim nächsten
  // Laden auf JEDEM Gerät injiziert (window.LIKE_SUPPORT) — anonym gibt es nur localStorage.
  test("Spendenstatus hängt am Konto (geräteübergreifend); anonym account:false", async ({ request }) => {
    const anon = await (await request.post("/api/support/donated", { data: {} })).json();
    expect(anon.ok).toBeTruthy();
    expect(anon.account).toBeFalsy();
    // Konto anlegen (Cookie bleibt im request-Context) -> donated -> Status kommt im HTML an
    const name = "sup" + Date.now().toString(36);
    const reg = await (await request.post("/api/auth/register", { data: { username: name, password: "test-passwort-1" } })).json();
    expect(reg.ok, JSON.stringify(reg)).toBeTruthy();
    const don = await (await request.post("/api/support/donated", { data: {} })).json();
    expect(don.account).toBeTruthy();
    expect(don.quietUntil).toBeGreaterThan(Date.now() + 71 * 3600e3);
    const html = await (await request.get("/?pack=music")).text();
    const m = html.match(/window\.LIKE_SUPPORT = (\{[^;]*\});/);
    expect(m, "LIKE_SUPPORT muss injiziert sein").toBeTruthy();
    expect(JSON.parse(m[1]).quietUntil).toBe(don.quietUntil);
    // Status-Endpoint (für den Login-Weg im Popup ohne Neuladen)
    const st = await (await request.get("/api/support")).json();
    expect(st.quietUntil).toBe(don.quietUntil);
  });

  test("Popup bietet nicht eingeloggten Nutzern den Anmelde-Weg an", async ({ page }) => {
    await openApp(page, true);
    const r = await page.evaluate(() => {
      for (let i = 0; i < 20; i++) window.__support.tick(30e3);
      const row = document.getElementById("supportLogin");
      // STATIC-Modus blendet die Zeile aus (kein Server) -> fürs Sichtbarkeits-Verhalten
      // den Live-Fall simulieren, dann klicken
      const out = { hiddenInStatic: row.style.display === "none" };
      document.getElementById("supportLoginLink").click();
      out.supportClosed = !document.querySelector("#supportModal.show");
      out.authOpen = !!document.querySelector("#authModal.show");
      return out;
    });
    expect(r.hiddenInStatic).toBeTruthy(); // file:// = STATIC -> Login-Zeile aus
    expect(r.supportClosed).toBeTruthy();
    expect(r.authOpen).toBeTruthy();
  });
});
