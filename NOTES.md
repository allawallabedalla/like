# NOTES — E2E-Testannahmen & Entscheidungen

Konservative Annahmen und Setup-Entscheidungen für die Playwright-E2E-Suite.
Bei Unklarheiten wurde die jeweils konservativste Annahme gewählt (per Auftrag).

## Setup
- **Runner:** `@playwright/test@^1.61.1` (lokal als devDependency, `--ignore-scripts`
  installiert, damit Electrons Postinstall den Proxy nicht mit einem 403 blockiert).
  Vorinstalliertes Chromium (`/opt/pw-browsers/chromium-1194`) wird via `executablePath`
  angesteuert — kein Browser-Download.
- **Server:** `playwright.config.js` startet `node server.mjs` selbst (`webServer`) gegen ein
  isoliertes, gitignoriertes Datenverzeichnis `.e2e-data/`.
- **Projekte (gleichwertig):** `desktop` (1440×900) und `mobile` (375×812, `isMobile`,
  `hasTouch`). Desktop nutzt `click`/Hover, Mobile `tap`.
- **Start:** `npx playwright test`. Erfolg = komplett grün.

## Gate / Lock (bewusst AN)
- Die Suite läuft mit **aktivem „Coming soon"-Gate** (`LIKE_UNLOCK_PASSWORD` gesetzt) —
  so wie Produktion (likelife.info). Nur `music` (`LIKE_PUBLIC_PACK`) ist frei; die anderen
  9 Packs sind gesperrt.
- **Testpasswort `test-secret-pw`** ist eine reine Test-Fixture (kein echtes Geheimnis) und
  steht bewusst in `playwright.config.js`/`tests/helpers.js`, damit der Unlock-Flow prüfbar ist.

## Determinismus / Animationen
- Global `reducedMotion: "reduce"`: Landing-Planeten und App-Monde stoppen dann ihre
  JS-Umlaufbewegung → Elemente stabil und Screenshots deterministisch. Zusätzlich bei
  Screenshots `animations: "disabled"` (CSS).
- **Kachel-Interaktion mit `force`:** Die Landing ist eine Canvas-rAF-Seite; Playwrights
  „stable"-Heuristik flaggt die Kacheln, obwohl ihre Position unter `reducedMotion`
  nachweislich statisch ist (0 px Bewegung über 600 ms gemessen). Daher `click/tap({force:true})`
  auf die `<a class="planet">`-Links — ein echter Klick, der navigiert.

## „Keine Console-Errors / keine 404s"
- Zwei Ebenen: (1) **Netzwerk** — nur **same-origin** 4xx/5xx (ohne `/favicon.ico`) gelten als
  Fehler (präzise, URL-basiert). (2) **Console** — Errors ohne Allowlist-Treffer gelten als Fehler.
- Allowlist (siehe `tests/helpers.js` → `CONSOLE_ALLOW`): Favicon, generische
  „Failed to load resource" (externe Ressourcen; same-origin fängt Ebene 1), TLS-/Netz-Fehler
  externer Hosts (`ERR_CERT*`, `net::ERR_*`, `api.github.com`). Begründung: siehe `BUGS.md` B1/E1.

## Netzwerk-Abhängigkeiten
- Externe Such-APIs (Last.fm/TMDB/…) sind in der Testumgebung **nicht erreichbar**; echte
  „Explore"-Flows (einen Artist laden) sind daher nicht deterministisch testbar. Getestet wird
  die App **ohne** Live-Daten (Empty-State, Topbar, Navigation, Lock, PWA, Persistenz-Schicht).
- **Kritische API-Endpoints** werden nur **read-only** geprüft (Status + Schema): `/api/packs`,
  `/api/health`, `/api/graph`, `/api/auth/me`, `/api/taste`, `/api/suggest`. Keine schreibenden
  oder netz-abhängigen Aufrufe.

## PWA
- Beide Seiten registrieren den Service Worker **nur über https** (`location.protocol==="https:"`).
  Der Testserver läuft über http, daher registriert der PWA-Test den SW **explizit**
  (`navigator.serviceWorker.register('/sw.js')`), um das Offline-/Cache-Verhalten zu prüfen.
- **Cache-Update nach Deploy** ist in einer einzelnen Umgebung nicht end-to-end nachstellbar;
  geprüft wird die zugrunde liegende **Network-first-Strategie** von `sw.js` (Live-Daten unter
  `/api/*` werden nie gecacht; Shell wird network-first geholt). Bewertung: Deploy-Updates werden
  dadurch bei Online-Zugriff automatisch übernommen.

## Visual Regression
- `toHaveScreenshot` bei **375/768/1440 px** für Landing, App (music) und Impressum. Läuft nur
  im **desktop-Projekt** (der Test setzt die Breite selbst) — sonst doppelte Baselines.
- **Determinismus:** `reducedMotion` (global) stoppt die JS-Umlaufbewegung, `animations:"disabled"`
  friert CSS ein, und **`Math.random` wird pro Seite deterministisch geseedet** (addInitScript vor
  den Seiten-Skripten) — sonst wären Sternenfeld und Planeten-Startwinkel bei jedem Lauf anders.
  Über zwei aufeinanderfolgende Läufe verifiziert: 0 Pixel-Differenz.
- **Baselines** liegen unter `tests/visual.spec.js-snapshots/` und sind **umgebungsspezifisch**
  (linux + Chromium-1194, Software-Rendering). Auf anderer Plattform ggf. mit
  `--update-snapshots` neu erzeugen. `maxDiffPixelRatio: 0.02` fängt marginale Abweichungen ab.

## Persistenz
- Serverseitige „Likes" (Graph pro Nutzer/Anon-Tab) brauchen geladene Live-Daten (Netz) und sind
  hier nicht deterministisch. Geprüft wird die **clientseitige Persistenzschicht**
  (localStorage: Theme/Ansicht; sessionStorage: Anon-ID) — sie überlebt einen Reload.
