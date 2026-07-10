# BACKLOG — Runde 6 & 7 (Audit-Reste · Quellen-Challenge)

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

---

## Runde 7 — Quellen-Challenge über alle Domains (2026-07-10)

Systematischer Review der Datenquellen aller 10 Packs. Ergebnis: die meisten
Quellen sind die richtige Wahl (Music, Movies, Anything, Travel, Books,
Podcasts — geprüft, bewusst so lassen). Fünf Punkte, wo es eindeutig besser geht.

**Vorbehalt:** Die Agent-Umgebung blockiert externe API-Hosts — die genannten
Endpoints vor dem Umbau lokal kurz gegentesten.

- [ ] **Q1 — Boardgames: „Fans Also Like" statt Franchise-Familie (blau).**
  `boardgamefamily` findet für Catan nur *Catan: Seefahrer* — Serien-Ableger,
  keine Geschmacksnachbarn. BGGs verhaltensbasiertes „Fans Also Like" liegt auf
  derselben inoffiziellen geekdo-JSON-API, die das Pack für Designer-Spiele schon
  nutzt: `api.geekdo.com/api/geekitemrecs?ajax=1&objectid=<id>&objecttype=thing`.
  Gleiche Risikoklasse, defensiv auf `[]` zurückfallen; Familie als Fallback behalten.

- [ ] **Q2 — Games: exakte Review-Zahl statt SteamSpy-Besitzer-Bucket (Popularität).**
  `ownersMid` = Mitte der Besitzer-Spanne („500k–1M" → 750000) — ändert sich fast
  nie, damit ist die Momentum-Zeitreihe (stats.json → „▲ +x %/Monat") im Games-Pack
  praktisch tot. Steams offizieller Endpoint liefert live und ohne Key:
  `store.steampowered.com/appreviews/<appid>?json=1&num_per_page=0`
  → `query_summary.total_reviews`. SteamSpy bleibt für Tags.

- [ ] **Q3 — Papers: Semantic-Scholar-Recommendations statt `related_works` (blau).**
  OpenAlex `related_works` ist eine statische ~10er-Konzept-Überlappungsliste —
  die schwächste Ähnlichkeitsquelle im Produkt. Standard für „ähnliche Paper":
  `api.semanticscholar.org/recommendations/v1/papers/forpaper/DOI:<doi>`
  (SPECTER-Embeddings, gratis, ohne Key; Rate-Limit → drosseln + cachen wie beim
  MusicBrainz-Muster). OpenAlex bleibt für Identität, Ko-Autoren (orange) und
  `counts_by_year` (Momentum).

- [ ] **Q4 — Games: Tag-Schnittmenge statt Top-Tag-Chart (blau, gleiche Quelle).**
  Aktuell Top-20 des EINEN stärksten Tags, popularitätssortiert — jedes Roguelike
  bekommt dieselben Mega-Hits als Nachbarn (widerspricht der Kleine-Acts-DNA).
  Mit denselben SteamSpy-Daten: Top-3-Tags schneiden (Rang = Anzahl geteilter
  Tags), Mega-Seller dämpfen.

- [ ] **Q5 — Plants: Ko-Okkurrenz über mehrere Fundorte (orange, gleiche Quelle).**
  `sameHabitat` zählt die Flora 60 km um EINEN repräsentativen Fundort — bei
  Kosmopoliten (Löwenzahn) willkürlich. Robuster: 3 verteilte Research-Grade-
  Fundorte ziehen und die Schnittmenge nehmen. Nebenbei: Kopf-Kommentar nennt
  GBIF als Datenquelle, im Code ist GBIF nur ein Suchlink — Kommentar anpassen.
