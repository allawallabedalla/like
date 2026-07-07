// Gemeinsame E2E-Helfer: Console-/Netzwerk-Sammler mit Allowlist, Same-Origin-Filter,
// Gate-Freischaltung und Pack-Listen. Genutzt von allen *.spec.js.
const { expect } = require("@playwright/test");

// Testpasswort fürs „Coming soon"-Gate (muss zur playwright.config.js passen).
const UNLOCK_PW = "test-secret-pw";

// Öffentliches Pack + gesperrte Packs (Gate aktiv). „music" ist LIKE_PUBLIC_PACK.
const PUBLIC_PACK = "music";
const LOCKED_PACKS = [
  "anything", "boardgames", "books", "games", "movies",
  "papers", "plants", "podcasts", "travel",
];
const ALL_PACKS = [PUBLIC_PACK, ...LOCKED_PACKS];

// Bekannte, umgebungsbedingte Meldungen, die KEINE App-Bugs sind (siehe NOTES.md):
//  • favicon.ico 404 (die Seite liefert bewusst kein Favicon)
//  • Cross-Origin-Fehler: der optionale GitHub-Release-Check (api.github.com) scheitert
//    hinter dem Agent-Proxy an der TLS-Prüfung; externe Bild-/API-Hosts sind blockiert.
// Same-Origin-4xx/5xx werden davon NICHT verdeckt — die prüft die Netzwerk-Ebene separat.
const CONSOLE_ALLOW = [
  /favicon/i,
  /Failed to load resource/i,      // externe Ressourcen; same-origin 404 fängt die Netzwerk-Ebene
  /ERR_CERT/i,
  /net::ERR_/i,
  /api\.github\.com/i,
  /the server responded with a status of 404/i,
];

function isSameOrigin(url, baseURL) {
  try { return new URL(url).origin === new URL(baseURL).origin; }
  catch { return false; }
}

// Hängt Sammler an eine Page. Liefert { consoleErrors, badResponses, failedRequests }.
// badResponses: nur SAME-ORIGIN 4xx/5xx ohne favicon (die echten „keine 404s").
function collect(page, baseURL) {
  const consoleErrors = [];
  const badResponses = [];
  const failedRequests = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (CONSOLE_ALLOW.some((re) => re.test(t))) return;
    consoleErrors.push(t);
  });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + (e && e.message ? e.message : String(e))));
  page.on("response", (r) => {
    const url = r.url();
    const status = r.status();
    if (status < 400) return;
    if (!isSameOrigin(url, baseURL)) return;          // externe Hosts ignorieren
    if (/\/favicon\.ico$/.test(new URL(url).pathname)) return;
    badResponses.push({ status, url, method: r.request().method() });
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (!isSameOrigin(url, baseURL)) return;           // externe/geblockte Hosts ignorieren
    failedRequests.push({ url, error: r.failure() && r.failure().errorText });
  });
  return { consoleErrors, badResponses, failedRequests };
}

// Standard-Sauberkeitsprüfung: keine unerwarteten Console-Errors, keine same-origin 4xx/5xx.
function assertClean(sink) {
  expect(sink.consoleErrors, "unerwartete Console-Errors").toEqual([]);
  expect(sink.badResponses, "same-origin 4xx/5xx Responses").toEqual([]);
}

// Intro-Overlay (erste Slide-Tour) wegklicken, falls es offen ist — sonst verdeckt es Klicks.
async function dismissIntro(page) {
  const intro = page.locator("#intro.show");
  if (await intro.count()) {
    const skip = page.locator("#introSkip");
    if (await skip.count()) await skip.click({ timeout: 3000 }).catch(() => {});
    await page.locator("#intro.show").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  }
}

// Gate freischalten: setzt das HttpOnly-Cookie im BrowserContext (für alle Folge-Requests).
async function unlock(context, baseURL) {
  const res = await context.request.post(baseURL + "/api/unlock", { data: { password: UNLOCK_PW } });
  expect(res.ok(), "unlock sollte 200 liefern").toBeTruthy();
  return res;
}

module.exports = {
  UNLOCK_PW, PUBLIC_PACK, LOCKED_PACKS, ALL_PACKS,
  CONSOLE_ALLOW, isSameOrigin, collect, assertClean, unlock, dismissIntro,
};
