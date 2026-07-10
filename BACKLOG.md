# BACKLOG — Runde 6 (Audit-Reste: Locks, Auth, tote Pfade, A11y)

**Angelegt:** 2026-07-10 (UTC)
**Kontext:** Befunde aus dem Code-Audit vom 10.07. Die dringlichen Fixes (Radar-Cache-Leak,
Session-Reset, stats.json-Lock, CSV-Injection, Cache-Kollisionen, UI-Races) liegen bereits
auf `claude/pitch-markdown-review-e78so1` → PR nach `main` (nicht ungefragt mergen).
Hier stehen die bewusst zurückgestellten, größeren Punkte.

---

## Punkte

- [ ] **F1 — /api/auto & /api/scrape: Lock-Blockade + Ergebnis verpufft.** Beide Endpoints
  scrapen minutenlang Wikipedia **innerhalb** von `withGraphLock(GRAPH)` — solange stehen
  /api/explore, Notizen usw. für diesen Graphen in der Warteschlange (explore vermeidet das
  bewusst). Obendrein löscht `migrate()` in `lib/store.mjs` bei jedem `loadGraph` genau die
  Felder wieder (`events`, `a.bl`, `a.wikiChecked`), die diese Endpoints persistieren — sie
  liefern `ok:true`, aber das Ergebnis taucht nie dauerhaft auf. Entscheiden: Endpoints
  entfernen ODER reparieren (Netzaufrufe vor den Lock ziehen, migrate() nicht mehr wischen).

- [ ] **F2 — Login blockiert den Event-Loop.** `scryptSync` in `lib/auth.mjs` friert den
  Single-Process-Server bei jedem Register/Login/Reset für zig Millisekunden ein (Register
  hasht doppelt, Reset bis zu dreifach) — die Drossel lässt global 240 Versuche/5 min zu.
  Auf promisified `scrypt` (async) umstellen; Call-Sites in `server.mjs` mitziehen.

- [ ] **F3 — „Gemerkte Ansicht" ist Schreib-Leiche (v1.6-Regression).** `like_view` wird bei
  unload/hide in localStorage gespeichert, aber nirgends mehr eingelesen — der Start ruft
  immer `fitAll()`. Entweder nach dem ersten `rebuild()` wiederherstellen (fitAll dann
  überspringen) oder Speichern + ROADMAP-Eintrag entfernen.

- [ ] **F4 — Tote Arbeit auf jedem Landing-Aufruf.** `server.mjs` und `export-static.mjs`
  berechnen pro `GET /` für ALLE Packs Mini-Cluster-SVGs (`miniCluster`) und übergeben
  `mini`, `lib/landing.mjs` rendert sie aber nie (auch `cardSub` ungenutzt). Dazu tote
  `.themetgl`-CSS-Regeln und ein `#egBtn`-Listener ohne zugehöriges Element in
  `public/index.html`. Rausnehmen — oder die Minis tatsächlich rendern (hübsch wär's).

- [ ] **F5 — Modal-Zugänglichkeit.** Kein Modal hat `role="dialog"`/`aria-modal`; Tab wandert
  hinter dem Overlay durch die Seite. Außerdem blockiert `user-scalable=no, maximum-scale=1`
  im Viewport-Meta das Pinch-Zoomen der Text-Panels (Android) — die Canvas-Gesten sind über
  `touch-action: none` ohnehin abgedeckt, die Einschränkung ist unnötig.

- [ ] **F6 — Radar-Kandidaten: Popularitäts-Lookups drosseln/parallelisieren.** Der Radar
  holt bis zu 25 Hörerzahlen **sequenziell** pro Aufruf (nach Cache-Miss) — das ist der
  Hauptgrund, warum er sich träge anfühlt. Mit `Promise.allSettled` in 4er-Häppchen (Last.fm-
  Drossel beachten) wäre er spürbar schneller.

---

## Arbeitsweise
Punkt für Punkt, Haken setzen, im Browser bzw. per Suite (`npm run test:ci`) verifizieren.
Sinnvolle Commits, dann PR — nicht ungefragt mergen.
