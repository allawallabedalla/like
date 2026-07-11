# BACKLOG — Runde 6, 7 & 8 (Audit-Reste · Quellen-Challenge · Live-UX-Audit) — ✅ ERLEDIGT

**Angelegt:** 2026-07-10 (UTC) · **Abgeschlossen & auf `main` gemergt:** 2026-07-10 (UTC)
**Kontext:** Befunde aus dem Code-Audit vom 10.07. F1–F8 und Q1–Q5 sind umgesetzt, verifiziert
(Playwright-Suite + gemockte Logik-Tests für Q1–Q5, da externe API-Hosts in der Agent-
Umgebung blockiert waren) und via Merge-Commit `8a776d6` auf `main`. F8 war bereits durch
PR #32 (Bridge-Routenplaner) vorab erledigt. Vor dem nächsten Deploy: Q1–Q3 einmal live
gegen die echten Endpoints prüfen (nicht in dieser Umgebung testbar).

---

## Punkte

- [x] **F1 — /api/auto & /api/scrape: Lock-Blockade + Ergebnis verpufft.** Beide Endpoints
  scrapen minutenlang Wikipedia **innerhalb** von `withGraphLock(GRAPH)` — solange stehen
  /api/explore, Notizen usw. für diesen Graphen in der Warteschlange (explore vermeidet das
  bewusst). Obendrein löscht `migrate()` in `lib/store.mjs` bei jedem `loadGraph` genau die
  Felder wieder (`events`, `a.bl`, `a.wikiChecked`), die diese Endpoints persistieren — sie
  liefern `ok:true`, aber das Ergebnis taucht nie dauerhaft auf. Entscheiden: Endpoints
  entfernen ODER reparieren (Netzaufrufe vor den Lock ziehen, migrate() nicht mehr wischen).

- [x] **F2 — Login blockiert den Event-Loop.** `scryptSync` in `lib/auth.mjs` friert den
  Single-Process-Server bei jedem Register/Login/Reset für zig Millisekunden ein (Register
  hasht doppelt, Reset bis zu dreifach) — die Drossel lässt global 240 Versuche/5 min zu.
  Auf promisified `scrypt` (async) umstellen; Call-Sites in `server.mjs` mitziehen.

- [x] **F3 — „Gemerkte Ansicht" ist Schreib-Leiche (v1.6-Regression).** `like_view` wird bei
  unload/hide in localStorage gespeichert, aber nirgends mehr eingelesen — der Start ruft
  immer `fitAll()`. Entweder nach dem ersten `rebuild()` wiederherstellen (fitAll dann
  überspringen) oder Speichern + ROADMAP-Eintrag entfernen.

- [x] **F4 — Tote Arbeit auf jedem Landing-Aufruf.** `server.mjs` und `export-static.mjs`
  berechnen pro `GET /` für ALLE Packs Mini-Cluster-SVGs (`miniCluster`) und übergeben
  `mini`, `lib/landing.mjs` rendert sie aber nie (auch `cardSub` ungenutzt). Dazu tote
  `.themetgl`-CSS-Regeln und ein `#egBtn`-Listener ohne zugehöriges Element in
  `public/index.html`. Rausnehmen — oder die Minis tatsächlich rendern (hübsch wär's).

- [x] **F5 — Modal-Zugänglichkeit.** Kein Modal hat `role="dialog"`/`aria-modal`; Tab wandert
  hinter dem Overlay durch die Seite. Außerdem blockiert `user-scalable=no, maximum-scale=1`
  im Viewport-Meta das Pinch-Zoomen der Text-Panels (Android) — die Canvas-Gesten sind über
  `touch-action: none` ohnehin abgedeckt, die Einschränkung ist unnötig.

- [x] **F6 — Radar-Kandidaten: Popularitäts-Lookups drosseln/parallelisieren.** Der Radar
  holt bis zu 25 Hörerzahlen **sequenziell** pro Aufruf (nach Cache-Miss) — das ist der
  Hauptgrund, warum er sich träge anfühlt. Mit `Promise.allSettled` in 4er-Häppchen (Last.fm-
  Drossel beachten) wäre er spürbar schneller.

- [x] **F7 — Flat-Modus: Nachbarschaft zieht beim Verschieben mit (wie im Space-Modus).**
  Im Space-Modus wandern die Monde mit, wenn man ihre Sonne verschiebt — im Flat-Modus
  bleibt beim Ziehen eines Knotens sein ganzes Umfeld liegen, die Struktur reißt optisch
  auseinander. Auch im Flat-Modus sollen verbundene Knoten dem gezogenen folgen.
  **Wichtig: über die physikalischen Verknüpfungen lösen**, nicht als starres
  Gruppen-Verschieben — d. h. die Kanten-Federn während des Drags wirken lassen
  (Nachbarn folgen proportional zur Verbindungsstärke und pendeln sich natürlich ein),
  damit unverbundene Knoten liegen bleiben und sich Cluster nicht verzerren.

- [x] **F8 — Brückenbauer: ganze Brücke einfügen + im Anything-Pack reparieren.**
  Zwei Baustellen: (1) Im Music-Pack scheint der Brückenbauer zu funktionieren, im
  Anything-Pack (Wikipedia) findet er nichts — Ursache klären (vermutlich nutzt die
  Brückensuche pack-spezifische Ähnlichkeits-Aufrufe, die bei „anything" fehlen oder
  anders heißen) und für alle Packs lauffähig machen. (2) Sobald eine Brücke gefunden
  ist, soll die **komplette Kette** von A nach B dargestellt und in den Graphen
  eingefügt werden — alle Zwischenglieder mit ihren Kanten, nicht nur ein einzelner
  „Missing-Link"-Act. Auf eine ansprechende, zur App passende Umsetzung achten:
  die Brücke als zusammenhängender Pfad sichtbar machen (z. B. Glieder nacheinander
  einblenden und den Pfad kurz hervorheben, im Stil der bestehenden Spawn-Kaskade),
  damit sie sich wie ein gebauter Weg anfühlt und nicht wie lose neue Knoten.

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

- [x] **Q1 — Boardgames: „Fans Also Like" statt Franchise-Familie (blau).**
  `boardgamefamily` findet für Catan nur *Catan: Seefahrer* — Serien-Ableger,
  keine Geschmacksnachbarn. BGGs verhaltensbasiertes „Fans Also Like" liegt auf
  derselben inoffiziellen geekdo-JSON-API, die das Pack für Designer-Spiele schon
  nutzt: `api.geekdo.com/api/geekitemrecs?ajax=1&objectid=<id>&objecttype=thing`.
  Gleiche Risikoklasse, defensiv auf `[]` zurückfallen; Familie als Fallback behalten.

- [x] **Q2 — Games: exakte Review-Zahl statt SteamSpy-Besitzer-Bucket (Popularität).**
  `ownersMid` = Mitte der Besitzer-Spanne („500k–1M" → 750000) — ändert sich fast
  nie, damit ist die Momentum-Zeitreihe (stats.json → „▲ +x %/Monat") im Games-Pack
  praktisch tot. Steams offizieller Endpoint liefert live und ohne Key:
  `store.steampowered.com/appreviews/<appid>?json=1&num_per_page=0`
  → `query_summary.total_reviews`. SteamSpy bleibt für Tags.

- [x] **Q3 — Papers: Semantic-Scholar-Recommendations statt `related_works` (blau).**
  OpenAlex `related_works` ist eine statische ~10er-Konzept-Überlappungsliste —
  die schwächste Ähnlichkeitsquelle im Produkt. Standard für „ähnliche Paper":
  `api.semanticscholar.org/recommendations/v1/papers/forpaper/DOI:<doi>`
  (SPECTER-Embeddings, gratis, ohne Key; Rate-Limit → drosseln + cachen wie beim
  MusicBrainz-Muster). OpenAlex bleibt für Identität, Ko-Autoren (orange) und
  `counts_by_year` (Momentum).

- [x] **Q4 — Games: Tag-Schnittmenge statt Top-Tag-Chart (blau, gleiche Quelle).**
  Aktuell Top-20 des EINEN stärksten Tags, popularitätssortiert — jedes Roguelike
  bekommt dieselben Mega-Hits als Nachbarn (widerspricht der Kleine-Acts-DNA).
  Mit denselben SteamSpy-Daten: Top-3-Tags schneiden (Rang = Anzahl geteilter
  Tags), Mega-Seller dämpfen.

- [x] **Q5 — Plants: Ko-Okkurrenz über mehrere Fundorte (orange, gleiche Quelle).**
  `sameHabitat` zählt die Flora 60 km um EINEN repräsentativen Fundort — bei
  Kosmopoliten (Löwenzahn) willkürlich. Robuster: 3 verteilte Research-Grade-
  Fundorte ziehen und die Schnittmenge nehmen. Nebenbei: Kopf-Kommentar nennt
  GBIF als Datenquelle, im Code ist GBIF nur ein Suchlink — Kommentar anpassen.

---

## Runde 8 — Live-UX-Audit mit echtem Browser (2026-07-10) — ✅ ERLEDIGT

Auf Wunsch: gründlicher Usability-Check für einfache UND komplexe Nutzer, dazu ein
"innovativer technischer Check" — die App tatsächlich in einem Headless-Browser gefahren
(Playwright, echter Server + synthetischer Graph, da externe APIs in der Agent-Umgebung
blockiert sind), statt nur den Code zu lesen. Drei Verdachtsfälle live geprüft:

- [x] **B1 — Last.fm-Key-Dialog sprang nicht an (bestätigt & behoben).** Bei fehlendem Key
  zeigte die erste Live-Suche einen rohen, technischen Fehlertext statt des vorgesehenen
  freundlichen Dialogs ("Hier in 1 Minute erstellen ↗"). Ursache: `server.mjs` liefert den
  Fehler mit HTTP 502; der Client-Fetch-Wrapper (`parseRes`) wirft dann eine Exception, bevor
  die `if (res.error)`-Prüfung mit der API-Key-Erkennung je erreicht wird — toter Code. Fix:
  die Prüfung in den `catch`-Block von `exploreByName` verschoben (public/index.html). Live
  verifiziert: Dialog öffnet jetzt zuverlässig, Toast ist der freundliche Text.

- [x] **B2 — „Radar schlägt Venues als Geheimtipp vor" — Fehlalarm, zurückgezogen.** Erster
  Live-Test zeigte einen Festival-Knoten in den Radar-Ergebnissen. Ursache war aber ein Fehler
  in der eigenen Testvorbereitung: Venue-Knoten sind rein clientseitig aus `shows`-Metadaten
  auf echten Kanten synthetisiert (public/index.html) und existieren serverseitig nie als
  `g.artists`-Eintrag mit `venue`-Flag oder als `"venue"`-Kantentyp — der Testgraph hatte
  genau das künstlich nachgebaut. Der ursprüngliche Fix (serverseitiger Venue-Filter im
  Radar) war dadurch wirkungslose tote Prüfung und wurde wieder entfernt. Kein Bug in der
  echten Datenlage.

- [x] **B3 — Klick auf Knotenmitte löste Klangprobe statt Info-Panel aus (bestätigt &
  entschärft).** Präzise vermessen: Der Play-Button-Trefferbereich deckte ~66 % des
  Knotenradius ab und hatte Vorrang vor der Knoten-Auswahl — ein Klick nahe der Mitte
  (der naheliegendste Zielpunkt) spielte eher eine Klangprobe ab, als das Info-Panel zu
  öffnen. Auf Touch/Mobile ist das bewusst anders gelöst (Code-Kommentar: „Tipp = nur
  Info-Karte öffnen; Abspielen über den ▶ im Panel") — Desktop widersprach der eigenen
  Absicht. Fix: Trefferradius/gezeichneter Kreis von `rr·0.66` auf `rr·0.4` verkleinert
  (public/index.html, zwei Stellen, bleiben deckungsgleich). Live vermessen: Grenze
  verschob sich von ~21,5px auf ~15,5px Bildschirm-Radius (≈ 49 % weniger Fehlklick-Fläche),
  Play-Button bleibt komfortabel treffbar.

### Beobachtet, aber nicht umgesetzt (kleinere UX-Ideen für eine spätere Runde)
- Leerer Zustand zeigt zwei redundante Suchleisten gleichzeitig (Topbar + zentrale
  Empty-State-Box) — für Erstnutzer unnötig doppelt.
- Radar/Aufräumen/Überrasch-mich in der Topbar sind auf leerer Karte sichtbar, aber wirkungslos.
- Auf Mobile keine sichtbaren Node-Labels bei Standard-Zoom (evtl. LOD-bedingt, nicht
  abschließend verifiziert — vor Umsetzung erst genauer prüfen).

**Methodik-Hinweis:** Live-Test lief gegen einen manuell zusammengestellten Graphen
(`slug()`-IDs, Playwright-Klicks über `__e2e.screenPos()`), da externe APIs (Last.fm, Deezer
etc.) in dieser Agent-Umgebung nicht erreichbar sind. B2 zeigt, warum das Vorsicht braucht:
eine Testfixture kann Situationen erzeugen, die die echte Datenlage nie hervorbringt — jeder
so gefundene Befund wurde gegen den tatsächlichen Server-/Client-Code zurückverfolgt, bevor
er als Bug galt bzw. hier bestätigt/zurückgezogen wurde.

---

## Runde 9 — Zweite Live-Runde: tiefere Feature-Abdeckung (2026-07-10) — ✅ ERLEDIGT

Auf Wunsch: noch eine intensive Usability-/Debug-Runde, diesmal mit einem reichhaltigeren
synthetischen Graphen (2 Cluster + Brückenfigur, Booking-Metadaten, Status/Notizen) und
gezielt gegen bisher ungeprüfte Bereiche (Genre-Filter, Booking-Modus, Kontextmenü, Undo,
CSV-Export, Space-Modus, Mobile-Tap, Konto-Validierung).

- [x] **B4 — Genre-gefilterte Knoten blieben klick-/hoverbar (bestätigt & behoben).** Ein
  Knoten, der durch den Genre-Filter auf Deckkraft 0 ausgeblendet wird (`genT=0` in
  `stepNodeAnims`), reagierte weiterhin auf Hover/Klick an seiner alten Bildschirmposition:
  `pick()`, `onPlayBtn()` und `isMoonHover()` prüften nur `lodHiddenNode()`, nicht den
  Genre-Filter. Sichtbar wurde das über einen hängengebliebenen Tooltip/Badge für einen gar
  nicht mehr gezeichneten Knoten — und ein Klick auf die alte Position hätte ihn trotzdem
  auswählen können. Fix: neue `interactionHidden()`-Hilfsfunktion (LOD ODER Genre-Filter,
  außer der Knoten ist gerade ausgewählt) an allen vier Hit-Test-Stellen; zusätzlich
  `dropHoverIfFiltered()` beim Ändern des Filters (Topbar-Input, Mobile-Menü-Input,
  Panel-Genre-Pills), damit ein bereits eingeblendeter Tooltip sofort verschwindet, auch
  ohne nachfolgende Mausbewegung. Live verifiziert (Tooltip verschwindet sofort, Klick auf
  alte Position trifft nichts mehr, Regressionssuite weiter grün).

- [x] **Startup-Key-Dialog kann mitten in einer Aktion unangekündigt aufploppen — geklärt,
  bewusst NICHT verändert.** Fund während des Tests: der Last.fm-Key-Dialog kann (unabhängig
  vom in dieser Runde gefixten Such-Fehler-Pfad, B1) auch über den separaten Start-Health-Check
  (`startupTasks()`) aufgehen — asynchron, sobald das Intro weg ist, als Vollbild-Overlay.
  **Klärung:** Auf der echten Instanz ist `LASTFM_API_KEY` als Render-Secret hinterlegt
  (`render.yaml`) — der Fall „kein Key" tritt für echte Nutzer der Produktivseite gar nicht
  ein, betrifft nur Selbst-Hoster ohne eigenen Key (von der README als Anwendungsfall
  vorgesehen). Auf Betreiber-Entscheidung: **so lassen wie es ist.**

### Geprüft, aber kein Bug (Fehlalarme dieser Runde — zur Nachvollziehbarkeit dokumentiert)
- „Status-Feld leer bei Klick auf declined-Act" — Testartefakt: Klick landete (a) zunächst
  im o.g. Startup-Key-Modal-Overlay, (b) danach in der (seit B3 kleineren, aber weiterhin
  vorhandenen) Play-Zone eines kleinen Knotens. Mit radius-proportionalem Klick-Versatz
  funktioniert die Status-Auswahl einwandfrei.
- „Act entfernen"-Button „außerhalb des Sichtbereichs" — derselbe Startup-Modal-Overlay,
  keine echte Layout-/Scroll-Überlappung (Position lag klar innerhalb von 900px Höhe).
- CSV-Export „Booking/Kontakt"-Spalte leer — eigener Test-Fixture-Fehler (`contact` statt
  `details` als Feldname gesetzt), keine Export-Logik betroffen.
- Undo/Entfernen, Space-Modus-Monde-Umlauf, Mobile-Tap-auf-Knotenmitte (öffnet zuverlässig
  die Info-Karte, nie Play — wie im Code dokumentiert), Kontextmenü, Hilfe-Popover,
  Konto-Formular-Validierung: alle live geprüft, keine Auffälligkeiten.

**Methodik-Lehre:** Ein fester Bildschirm-Pixel-Versatz zum "sicheren" Klicken auf einen
Knoten reicht nicht — er muss proportional zum Radius des jeweiligen Knotens sein (kleine
Knoten haben eine proportional kleine, aber nicht verschwindende Play-Zone). Ohne Weiteres
lassen sich sonst App-Verhalten und Test-Artefakte verwechseln (s. o.).

---

## Runde 10 — Optimierungs-Workshop (2026-07-11)

Auf Wunsch: ein Workshop mit 6 unabhängigen Fachrollen (Performance, SEO, Analytics,
Accessibility, Security, Retention), die je 6-8 Ideen mit konkreten Tools entwickelt haben,
danach von einem Moderator gemeinsam dedupliziert, thematisch gruppiert und priorisiert.
Alle Punkte sind gegen den echten Code verifiziert (nicht nur brainstormt). Reihenfolge nach
Priorität; Pro/Contra pro Punkt.

- [ ] **W1 — Meta-Tags/OG-Karten je Pack + robots.txt/sitemap.xml/llms.txt.** `index.html`
  hat nur `<title>Like</title>`, keine Description/OG/Twitter-Tags, kein canonical, keine
  robots.txt/sitemap.xml im Repo. Reine Server-Template-Ergänzung in `server.mjs`, betrifft
  alle 10 Packs gleichzeitig. **Pro:** kein Risiko für Bestandsfunktionalität, sofort messbar
  (Rich-Results-Test, Search-Console-Indexierung), höchster Impact/Aufwand-Hebel im ganzen
  Workshop. **Contra:** Wirkung zeigt sich erst über Wochen/Monate; bei eher direktem/
  Community-Traffic ungewiss, wie viel realer Zuwachs dabei rausspringt.

- [ ] **W2 — Antwort-Kompression (gzip/brotli) via `node:zlib`.** `send()` in `server.mjs`
  setzt nur cache-control/content-type, keine Content-Encoding-Verhandlung — die 368 KB
  große `index.html` geht unkomprimiert raus. `node:zlib` ist eingebaut (kein npm nötig).
  **Pro:** 70-80 % kleinere Antworten, verbessert Ladezeit bei jedem Aufruf sofort messbar.
  **Contra:** Falls Render selbst schon komprimiert (viele PaaS-Anbieter tun das am Edge),
  ist der Zusatznutzen kleiner als gedacht — vor dem Bauen mit
  `curl -H "Accept-Encoding: gzip" -I https://likelife.info` verifizieren.

- [ ] **W3 — Dependabot + `npm audit` + CodeQL in CI.** Kostenlos für Public Repos,
  GitHub-nativ, automatisiert die Dependency-/CVE-Wartung, die als Solo-Maintainer leicht
  durchrutscht (z. B. veraltete Electron-Version). **Pro:** kein Server-/Betriebsaufwand,
  fängt genau die Wartung ab, die sonst vergessen wird. **Contra:** erzeugt laufend PRs/
  Alerts, die jemand triagieren muss — Dauer- statt Einmalaufwand; CodeQL kann auf einer so
  großen Single-File-`index.html` viele False Positives werfen.

- [ ] **W4 — ARIA-Live-Region + `aria-label` für den Canvas.** Der Force-Graph (`#cv`) hat
  keine DOM-Repräsentation — für Screenreader ist die Kernfunktion unsichtbar. **Pro:** sehr
  kleiner Patch, kein Rendering-Umbau nötig, echter Sofort-Nutzen. **Contra:** nur ein
  Pflaster — löst nicht die eigentliche Lücke (keine Tastaturnavigation); ohne W15
  (Listenansicht) bleibt der Graph trotzdem nicht wirklich bedienbar, nur "beschriftet".

- [ ] **W5 — axe-core in die bestehende Playwright-Suite (`test:ci`) integrieren.**
  **Pro:** Infrastruktur existiert schon, verhindert künftige A11y-Regressionen (z. B. an den
  kürzlich gefixten Modals) automatisch, geringer Einrichtungsaufwand. **Contra:** findet nur
  automatisch prüfbare Verstöße (Kontrast, fehlende Labels) — die strukturelle
  Canvas-Bedienbarkeit erkennt kein automatisches Tool, das bleibt manuelle Arbeit.

- [ ] **W6 — `prefers-reduced-motion` auch auf die Physik-Simulation anwenden.** Das Flag
  (`REDUCE_MOTION`) existiert im Code bereits, wird aber nur für Deko-Animationen ausgewertet,
  nicht für die Force-Simulation selbst. **Pro:** echter WCAG-2.3.3-Bezug, sehr lokal
  begrenzter Fix. **Contra:** reiner Nischen-Fix für eine kleine Zielgruppe, verbessert die
  Kernerfahrung für alle anderen Nutzer nicht.

- [ ] **W7 — Aggregierte, anonyme Nutzungszähler via `node:sqlite`.** Schließt die einzige
  echte blinde Stelle: niemand weiß, welche Packs/Features (Radar, Brücke, Klangprobe)
  tatsächlich genutzt werden. `node:sqlite` ist ab Node 22 eingebaut (verifiziert vorhanden),
  passt zur ohnehin geplanten SQLite-Migration. **Pro:** bleibt technisch aggregiert/anonym,
  bricht das Zero-Tracking-Versprechen nicht. **Contra:** erfordert eine bewusste, öffentlich
  kommunizierte Entscheidung — selbst harmlose Zähler können bei Nutzern, die die App gerade
  WEGEN "keine Analyse" gewählt haben, Vertrauen kosten, wenn die Kommunikation misslingt.

- [ ] **W8 — Cache-Control-Split: statische Assets von dynamischer Config trennen.**
  `send()` setzt aktuell pauschal `cache-control: no-store` für jede Antwort, auch für den
  großen unveränderlichen CSS/JS/Font-Block. **Pro:** löst nebenbei ein zweites Problem
  (Service-Worker liefert nach Login/Logout/Pack-Freischaltung sonst veraltete Config aus),
  spürbar schnellere Wiederbesuche für Stammnutzer. **Contra:** mittlerer Umbauaufwand —
  braucht Versionierung/Content-Hashing der ausgelagerten Datei plus Anpassung der Deploy-
  Logik, nicht in 10 Minuten erledigt.

- [ ] **W9 — Security-Header ergänzen (CSP, HSTS, Referrer-Policy, Permissions-Policy).**
  `nosniff`/`X-Frame-Options` sind laut Code bereits gesetzt — echt offen sind CSP/HSTS/
  Referrer-Policy/Permissions-Policy. **Pro:** schließt eine echte, verifizierte Lücke,
  kostenlos extern prüfbar (Mozilla Observatory, securityheaders.com) als Vorher/Nachher-
  Beweis. **Contra:** echtes CSP ist wegen der Inline-`<script>`/`<style>`-Blöcke kein
  Zehn-Zeilen-Job — braucht eine Nonce-Strategie pro Request; falsch konfiguriert blockt es
  die Inline-Scripts und bricht die App komplett.

- [ ] **W10 — Öffentliches Changelog + Feedback über GitHub Discussions öffnen.**
  **Pro:** kostenlos, GitHub-nativ, macht Fortschritt sichtbar, reaktiviert wiederkehrende
  Nutzer ohne Push/E-Mail-Infrastruktur. **Contra:** nutzt nur, wenn es gepflegt wird — ein
  Changelog, das nach zwei Einträgen einschläft, wirkt schlechter als gar keins; zusätzlicher
  Redaktionsaufwand pro Release.

- [ ] **W11 — In-Memory-LRU-Schicht vor dem Disk-Cache (`lib/cache.mjs`).** `cached()` liest
  bei jedem Aufruf synchron eine JSON-Datei von der Platte, auch bei wiederholten Anfragen
  in derselben Prozesslaufzeit. **Pro:** kleiner, risikoarmer Patch (~50-100 Zeilen, kein
  npm nötig), reduziert Disk-I/O bei heißen Keys spürbar. **Contra:** Nutzen hängt vom
  tatsächlichen I/O-Anteil ab — ohne Profiling (clinic.js/0x) vorab ist unklar, ob das
  gemessen überhaupt ins Gewicht fällt.

- [ ] **W12 — Canvas-Viewport-Culling beim Zeichnen.** Nach dem bereits erledigten
  Spatial-Grid-Fix für die Physik zeichnet `draw()` weiterhin jeden Frame ALLE Knoten/Kanten,
  auch außerhalb des sichtbaren Ausschnitts. **Pro:** wird konkret relevant, sobald
  Booking-Nutzer über mehrere Explore/Expand-Runden große Graphen anhäufen. **Contra:**
  mittlerer Aufwand für einen Effekt, der bei der aktuellen (eher kleinen) Graphgröße noch
  nicht spürbar ist — Investition in eine noch nicht akute Zukunft.

- [ ] **W13 — GitHub Sponsors/Open Collective + Downloads-Badge.** Aktuell läuft die gesamte
  Finanzierung über einen einzigen PayPal.me-Link. **Pro:** Minutenaufwand (`FUNDING.yml`,
  ein Badge), macht die "keine Gewinnabsicht"-Aussage der Datenschutzseite nachprüfbar statt
  nur behauptet. **Contra:** zusätzlicher Kanal bedeutet auch zusätzliche Konten/Pflege
  (Open Collective erfordert ein geführtes öffentliches Ledger) — nur sinnvoll, wenn das
  wirklich gepflegt wird.

- [ ] **W14 — Öffentliche, teilbare Karten-Schnappschüsse (bereits in ROADMAP.md offen).**
  Der Share-Button teilt aktuell nur EINEN Act, nicht die kuratierte Nachbarschaft als Ganzes.
  **Pro:** stärkster organische Wachstumshebel, den eine werbefreie App haben kann —
  `export-static.mjs` liefert bereits eine Rendering-Basis. **Contra:** größtes Aufwand-Item
  in der Liste (Snapshot-Renderer, OG-Bild-Generierung, Read-Only-Link-Infrastruktur) — eher
  ein eigenes Feature-Projekt als ein Workshop-Punkt.

- [ ] **W15 — Synchronisierte Listenansicht als zugängliche Alternative zum Canvas-Graphen.**
  Größter A11y-Lift im ganzen Workshop. **Pro:** liefert Tastaturnavigation praktisch
  kostenlos mit und löst Screenreader- UND Tastatur-Zugang in einem Rutsch, statt zusätzlich
  eine separate roving-tabindex-Lösung direkt auf dem Canvas zu bauen. **Contra:** größter
  strukturelle Umbau der Liste — eigene View, eigenes State-Sync mit dem Graphen, nicht
  nebenbei erledigt.

### Themen-Cluster (zur Einordnung)
Performance/Ladezeit (W2, W8, W11, W12) · SEO/Auffindbarkeit (W1) · Privacy-first Analytics
(W7, unabhängig von 3 Rollen vorgeschlagen) · Canvas-Barrierefreiheit (W4, W5, W6, W15) ·
Security-Härtung (W3, W9) · Community/Retention/Monetarisierung (W10, W13, W14).

### Dedupliziert (mehrfach von unterschiedlichen Rollen genannt, hier einmal gezählt)
- Lighthouse CI/Performance-Budget (Performance- UND SEO-Rolle unabhängig vorgeschlagen).
- Aggregierte Nutzungszahlen (Analytics: `node:sqlite`: SEO/Docs: GoatCounter; Retention:
  Plausible/Umami) — im Kern derselbe Bedarf für unterschiedliche Infrastruktur-Teile.
- Listenansicht vs. separate Tastatur-Navigation — dieselbe Grundlösung (→ W15 statt zwei
  getrennter Punkte).
- Web-Push- vs. E-Mail-Wochen-Digest — konkurrierende Kanäle fürs selbe Ziel
  (Reengagement); für ein Solo-Projekt nur einer sinnvoll, hier bewusst nicht aufgenommen.

**Arbeitsweise:** Wie bisher — Punkt für Punkt, Haken setzen, verifizieren, sinnvolle Commits,
PR nicht ungefragt mergen. Empfehlung als Einstieg: W1 und W2 (geringstes Risiko, sofort
verifizierbar, kein Umbau bestehender Abläufe).
