// Playwright-E2E-Konfiguration für die like-Website.
// Startet den echten Node-Server (server.mjs) mit aktivem „Coming soon"-Gate
// (LIKE_UNLOCK_PASSWORD gesetzt) — so wie in Produktion (likelife.info) — gegen
// ein isoliertes, gitignoriertes Datenverzeichnis. Zwei gleichwertige Projekte:
// Desktop (1440px) und Mobile (375px, Touch).
const { defineConfig } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const PORT = process.env.E2E_PORT || "5199";
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Testpasswort fürs Gate — reine Test-Fixture (kein echtes Geheimnis), siehe NOTES.md.
const UNLOCK_PW = "test-secret-pw";
const DATA_DIR = path.join(__dirname, ".e2e-data");

// Vorinstalliertes Chromium (chromium-1194) explizit ansteuern, falls vorhanden —
// vermeidet einen Browser-Download in dieser Umgebung.
const PINNED_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = fs.existsSync(PINNED_CHROME) ? PINNED_CHROME : undefined;

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1, // ein gemeinsamer Server + gemeinsames Datenverzeichnis -> deterministisch sequenziell
  forbidOnly: !!process.env.CI,
  // Flaky-Schutz nur auf CI: E2E über eine Canvas-rAF-Seite mit echten Taps kann auf lahmen
  // Runnern vereinzelt in Timeouts laufen. 2 Wiederholungen fangen solche Ausrutscher ab; ein
  // ECHTER Fehler fällt auch nach 3 Versuchen. Lokal weiter 0 (Flakes sollen hier auffallen).
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: BASE_URL,
    // Deutsch ist die Quellsprache der Oberfläche; ohne Pin liefe Chromium mit en-US und die
    // App startete auf Englisch (Browser-Sprache bestimmt den Default) — Text-Assertions und
    // Visual-Baselines prüfen aber das deutsche Original. EN deckt i18n.spec.js explizit ab.
    locale: "de-DE",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    ignoreHTTPSErrors: true,
    // Landing-Planeten und App-Monde respektieren prefers-reduced-motion und stoppen dann
    // die JS-Umlaufbewegung -> Elemente sind stabil (klick-/tap-bar) und deterministisch fürs
    // Visual-Testing (CSS-Animationen deckt zusätzlich screenshot animations:'disabled' ab).
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--no-sandbox"], executablePath },
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    },
    {
      name: "mobile",
      use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "node server.mjs",
    url: BASE_URL + "/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      LIKE_UNLOCK_PASSWORD: UNLOCK_PW,
      LIKE_DATA_DIR: DATA_DIR,
      LIKE_SESSION_SECRET: "e2e-fixed-session-secret-do-not-use-in-prod",
      LIKE_PUBLIC_PACK: "music",
      HOST: "127.0.0.1",
      PORT: String(PORT),
    },
  },
});
