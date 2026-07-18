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

- [x] **W1 — Meta-Tags/OG-Karten je Pack + robots.txt/sitemap.xml/llms.txt.** `index.html`
  hat nur `<title>Like</title>`, keine Description/OG/Twitter-Tags, kein canonical, keine
  robots.txt/sitemap.xml im Repo. Reine Server-Template-Ergänzung in `server.mjs`, betrifft
  alle 10 Packs gleichzeitig. **Pro:** kein Risiko für Bestandsfunktionalität, sofort messbar
  (Rich-Results-Test, Search-Console-Indexierung), höchster Impact/Aufwand-Hebel im ganzen
  Workshop. **Contra:** Wirkung zeigt sich erst über Wochen/Monate; bei eher direktem/
  Community-Traffic ungewiss, wie viel realer Zuwachs dabei rausspringt.

- [x] **W2 — Antwort-Kompression (gzip/brotli) via `node:zlib`.** `send()` in `server.mjs`
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

- [x] **W4 — ARIA-Live-Region + `aria-label` für den Canvas.** Der Force-Graph (`#cv`) hat
  keine DOM-Repräsentation — für Screenreader ist die Kernfunktion unsichtbar. **Pro:** sehr
  kleiner Patch, kein Rendering-Umbau nötig, echter Sofort-Nutzen. **Contra:** nur ein
  Pflaster — löst nicht die eigentliche Lücke (keine Tastaturnavigation); ohne W15
  (Listenansicht) bleibt der Graph trotzdem nicht wirklich bedienbar, nur "beschriftet".

- [ ] **W5 — axe-core in die bestehende Playwright-Suite (`test:ci`) integrieren.**
  **Pro:** Infrastruktur existiert schon, verhindert künftige A11y-Regressionen (z. B. an den
  kürzlich gefixten Modals) automatisch, geringer Einrichtungsaufwand. **Contra:** findet nur
  automatisch prüfbare Verstöße (Kontrast, fehlende Labels) — die strukturelle
  Canvas-Bedienbarkeit erkennt kein automatisches Tool, das bleibt manuelle Arbeit.

- [x] **W6 — `prefers-reduced-motion` auch auf die Physik-Simulation anwenden.** Das Flag
  (`REDUCE_MOTION`) existiert im Code bereits, wird aber nur für Deko-Animationen ausgewertet,
  nicht für die Force-Simulation selbst. **Pro:** echter WCAG-2.3.3-Bezug, sehr lokal
  begrenzter Fix. **Contra:** reiner Nischen-Fix für eine kleine Zielgruppe, verbessert die
  Kernerfahrung für alle anderen Nutzer nicht.

- [x] **W7 — Aggregierte, anonyme Nutzungszähler via `node:sqlite`.** Schließt die einzige
  echte blinde Stelle: niemand weiß, welche Packs/Features (Radar, Brücke, Klangprobe)
  tatsächlich genutzt werden. `node:sqlite` ist ab Node 22 eingebaut (verifiziert vorhanden),
  passt zur ohnehin geplanten SQLite-Migration. **Pro:** bleibt technisch aggregiert/anonym,
  bricht das Zero-Tracking-Versprechen nicht. **Contra:** erfordert eine bewusste, öffentlich
  kommunizierte Entscheidung — selbst harmlose Zähler können bei Nutzern, die die App gerade
  WEGEN "keine Analyse" gewählt haben, Vertrauen kosten, wenn die Kommunikation misslingt.

- [x] **W8 — Cache-Control-Split: statische Assets von dynamischer Config trennen.**
  `send()` setzt aktuell pauschal `cache-control: no-store` für jede Antwort, auch für den
  großen unveränderlichen CSS/JS/Font-Block. **Pro:** löst nebenbei ein zweites Problem
  (Service-Worker liefert nach Login/Logout/Pack-Freischaltung sonst veraltete Config aus),
  spürbar schnellere Wiederbesuche für Stammnutzer. **Contra:** mittlerer Umbauaufwand —
  braucht Versionierung/Content-Hashing der ausgelagerten Datei plus Anpassung der Deploy-
  Logik, nicht in 10 Minuten erledigt.

- [x] **W9 — Security-Header ergänzen (CSP, HSTS, Referrer-Policy, Permissions-Policy).**
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

- [x] **W12 — Canvas-Viewport-Culling beim Zeichnen.** Nach dem bereits erledigten
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

- [x] **W14 — Öffentliche, teilbare Karten-Schnappschüsse (bereits in ROADMAP.md offen).**
  Der Share-Button teilt aktuell nur EINEN Act, nicht die kuratierte Nachbarschaft als Ganzes.
  **Pro:** stärkster organische Wachstumshebel, den eine werbefreie App haben kann —
  `export-static.mjs` liefert bereits eine Rendering-Basis. **Contra:** größtes Aufwand-Item
  in der Liste (Snapshot-Renderer, OG-Bild-Generierung, Read-Only-Link-Infrastruktur) — eher
  ein eigenes Feature-Projekt als ein Workshop-Punkt.

- [x] **W15 — Synchronisierte Listenansicht als zugängliche Alternative zum Canvas-Graphen.**
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

---

## Runde 11 — Externer Berater-Workshop (2026-07-11)

Auf Wunsch: zweiter Workshop mit 8 komplett neuen, "externen" Berater-Rollen (Produktstratege,
Onboarding-UX, Markt-/Wettbewerbsanalyst, Graph-/Dataviz-Experte, Open-Source-Stratege,
Mobile/PWA, Content-/Kuration, Booking-Branchen-Insider), jeweils mit Blick über den Horizont
auf vergleichbare Dienste (Gnoosic/Music-Map, Every Noise at Once, Radio Garden, Connected
Papers, Obsidian, Letterboxd, Excalidraw, Obscurify, Prism.fm …). Ein Moderator hat
dedupliziert, Behauptungen stichprobenartig am Code verifiziert und Kontroversen entschieden.
Vergleichsangaben sind Wissensstand der Rollen (externe Seiten in der Agent-Umgebung nicht
erreichbar), Code-Befunde sind verifiziert.

**Gesamtbild (einstimmig):** Das Produkt ist deutlich besser als sein Schaufenster. Technik,
Graph-Engine, Release-Hygiene und Touch-Fundament werden durchweg als ungewöhnlich reif für
ein Solo-Zero-Budget-Projekt eingestuft. Die Schwächen liegen fast alle bei Erstkontakt,
Sichtbarkeit und Persistenz — fast alle Empfehlungen verschalten Vorhandenes neu, statt Neues
zu bauen.

- [x] **E1 — Nie mit leerer Karte starten: Demo-Nachbarschaft beim Erstbesuch (4× unabhängig
  — stärkstes Signal der Runde).** Der Aha-Moment (lebendiges Netz) kommt heute erst nach
  eigener, gelingender Sucheingabe; dabei liegt in allen 10 Packs ein kuratiertes `demo.json`,
  das nur für Landing-Zählwerte genutzt wird. Demo-Graph als gelabelte Beispiel-Karte laden,
  erste eigene Suche ersetzt sie. Vergleich: Radio Garden/Every Noise/Connected Papers starten
  alle gefüllt; Obsidian liefert einen Demo-Vault. **Pro:** Time-to-Wow fällt auf null,
  Verschaltung statt Neubau. **Contra:** kann sich "vorgekaut" anfühlen und den Moment der
  eigenen ersten Suche entwerten; braucht klares Labeling + saubere Ersetzen-Logik.
  *(Impact hoch / Aufwand niedrig)*

- [x] **E2 — Anonyme Karten sterben mit dem Tab: localStorage statt sessionStorage (2×).**
  `like_anon` liegt in sessionStorage — 30 Minuten Kuration sind beim Tab-Schließen weg, und
  genau der Moment mit aufgebautem Wert wäre der stärkste Konto-Konversionshebel (Muster:
  Excalidraw/tldraw/Figma). Migrations- und Aufräumlogik existieren. **Pro:** wenige Zeilen,
  direkter Effekt auf Wiederkehr UND Registrierungen. **Contra:** kollidiert mit der
  Datenschutzseite (verspricht keine dauerhafte Speicherung) — nur mit ehrlicher Textanpassung,
  sichtbarem Hinweis ("Karte bleibt 30 Tage auf diesem Gerät") und serverseitiger TTL machen;
  auf geteilten Geräten sieht der Nächste die Karte des Vorgängers.
  *(Impact hoch / Aufwand niedrig)*

- [x] **E3 — Landing verkauft das Produkt nicht: Pitch-Headline sichtbar, Musik als Hero (3×).**
  Einziger Untertitel ist "Wähle, wonach du heute stöbern willst" (lib/landing.mjs); die
  erklärende Zeile steckt im Hover-Tooltip (auf Touch unsichtbar), und in Produktion tragen
  9 von 10 Planeten ein Schloss — die Landing verkauft einen gesperrten Katalog. Pitch-Zeile
  aus PITCH.md als Heading, Musik-Planet zentral, gesperrte Packs als kleine "Labs"-Reihe.
  **Pro:** reine Copy/CSS-Änderung, besteht endlich den 5-Sekunden-Test aus dem eigenen
  PITCH.md. **Contra:** degradiert die 9 anderen Packs sichtbar — zementiert die
  Fokus-Entscheidung (E5), die vorher bewusst getroffen sein sollte.
  *(Impact hoch / Aufwand niedrig)*

- [x] **E4 — LICENSE-Datei hinzufügen (MIT oder AGPL-3.0).** Verifiziert: keine LICENSE, kein
  `license`-Feld in package.json — rechtlich "all rights reserved", obwohl das README zu Fork,
  Docker-Self-Hosting und Render-Deploy einlädt. **Pro:** Minutenaufwand, zwingende Grundlage
  für alles Community-Hafte. **Contra:** die Wahl bindet: MIT erlaubt kommerzielle
  Closed-Source-Forks (auch mit Tracking), AGPL schreckt manche Nachnutzer ab — schwer
  rückgängig zu machen, sobald Dritte beitragen. Vorbilder: Plausible (privacy-first → AGPL),
  linkding (Solo-Maintainer → MIT). **Entscheidung liegt beim Betreiber.**
  *(Impact hoch / Aufwand niedrig)*

- [x] **E5 — Fokus-Entscheidung dokumentieren: Musik ist das Produkt, die 9 anderen Packs sind
  Labs (2×, identisches Warnbeispiel).** Booking, Klangprobe, Radar-Momentum und die orange
  Kante existieren nur/primär im Musik-Pack; die anderen Packs sind produktiv gesperrt, bekamen
  aber in Runde 7 Qualitätsarbeit. **Pro:** kostet einen Absatz in ROADMAP.md, verhindert
  künftige Parity-Opportunitätskosten; beide Berater nennen unabhängig Gnod/TasteDive als
  Warnbeispiel (breit + flach = stagnierend) und Letterboxd/BGG als Gegenmodell. **Contra:**
  die Packs sind auch persönlicher Spielplatz und Projektcharme — ein offizieller Freeze kann
  sich wie Selbstbeschneidung anfühlen und steht im Weg, falls ein Pack später doch zündet.
  *(Impact hoch / Aufwand niedrig)*

- [x] **E6 — RA-Abhängigkeit absichern: Gratis-Keys aktivieren, Health-Check-Alarm, UPCOMING.**
  Verifiziert: lib/ra.mjs fragt nur `type:PREVIOUS` ab; Songkick-/Bandsintown-/Setlist.fm-
  Adapter liegen fertig in lib/, sind ohne Keys aber inaktiv. Das wichtigste Datenmonopol
  (orange Kante) hängt an einer inoffiziellen API, die still degradiert. Keys beschaffen,
  Pushover-Alarm bei leerer RA-Antwort (Anbindung existiert seit heute), RA-Query um UPCOMING
  erweitern (Routing-Argument für Booker). **Pro:** Adapter fertig, Alarm-Infrastruktur da.
  **Contra:** Key-Beschaffung liegt außerhalb des Codes (Songkick vergibt teils zögerlich —
  prüfen); mehr Quellen = mehr Wartungs- und Drosselungsfläche.
  *(Impact hoch / Aufwand mittel)*

- [x] **E7 — Mobile: Suche nicht hinter dem ⋯-Menü verstecken.** Verifiziert: unter 640px wird
  `.search` per `display:none` entfernt — die Kern-Aktion braucht zwei Taps in ein generisches
  Menü. Lupen-Icon in der Topbar → Fullscreen-Such-Overlay mit Autofokus (Empty-State-Markup
  als Basis). Vergleich: Google Maps/Spotify halten die Suche mobil primär. **Pro:** teuerste
  einzelne Mobile-Hürde eines Discovery-Produkts. **Contra:** Topbar-Platz ist knapp;
  Fullscreen-Overlay ist neues UI mit eigenen Zuständen (Fokus, Zurück-Verhalten).
  *(Impact hoch / Aufwand mittel)*

- [x] **E8 — Erste Suche absichern: Suggest-Dropdown auch an #q2 + klickbare Seed-Chips.**
  Verifiziert: der Suggest-Handler hängt nur an #q; die Empty-State-Suche #q2 (Eingabe mit der
  höchsten Absprung-Konsequenz) hat kein Autocomplete — Tippfehler enden im Fehler-Toast.
  Seed-Daten (`exampleSeed`, `SURPRISE_SEEDS`) existieren. **Pro:** kleiner Fix an der
  kritischsten Funnel-Stelle. **Contra:** wird durch E1 teils obsolet; zweite
  Suggest-Instanz = doppelte Verkabelung, Autocomplete-Race (Runde 1-Fix) mitdenken.
  *(Impact mittel / Aufwand niedrig)*

- [x] **E9 — Booking-Pipeline-Basics: Gagenfeld + Summenzeile, Status-Zeitstempel, Lineup-Korb
  serverseitig.** Verifiziert: kein Fee-/Budget-Feld, kein `statusChangedAt`; der Lineup-Korb
  lebt nur in localStorage und wird bei der Anon-zu-Konto-Migration NICHT mitgenommen
  (Datenverlust-Risiko im "Booking-Tool"). Vergleich: Prism.fm/Gigwell hängen Deal-Terms an
  jeden Hold. **Pro:** die drei Lücken, deretwegen parallel Excel offen bleibt — vom einzigen
  Branchen-Insider. **Contra:** Gagen sind sensible Daten (Verantwortung steigt); ohne belegte
  Booker-Nutzung baut man evtl. für ein Publikum von einer Person. Große Event-Dimension
  (Status pro Festival) explizit NICHT jetzt.
  *(Impact mittel / Aufwand niedrig)*

- [x] **E10 — Kanten zu Bürgern erster Klasse: Parallelkanten trennen + Kanten inspizierbar.**
  Verifiziert: draw() zeichnet similar- und together-Kante desselben Paares als identische
  Gerade — die spätere übermalt die erste; ausgerechnet der wertvollste Fall (ähnlich UND
  zusammen aufgetreten) ist unlesbar. pick() prüft nur Knoten, obwohl Belegdaten (`l.shows`)
  am Link liegen. Gegenläufig gebogene Kurven + Hover-Tooltip ("3 gemeinsame Events").
  Vergleich: Cytoscape/Neo4j Bloom. **Pro:** macht die "Geheimwaffe" erstmals sichtbar und
  belegbar; echter Rendering-Bug. **Contra:** Kanten-Hit-Testing auf Canvas ist fummelig
  (Kurven-Abstand, Zoom, Konkurrenz zum Node-Hover); Kurven machen dichte Graphen unruhiger.
  *(Impact mittel / Aufwand niedrig)*

- [x] **E11 — Service-Worker: App-Shell nicht bei jedem Start am Netz aufhängen.** Verifiziert:
  sw.js fährt netz-zuerst ohne Timeout — die Shell liegt im Cache, wird aber erst nach
  komplettem Fetch-Fehlschlag genutzt; auf schlechtem Mobilfunk hängt jeder Start.
  `Promise.race` mit ~3s-Timeout + Cache-Fallback, versionierter Cache-Name (Muster: Workbox
  `networkTimeoutSeconds`). **Pro:** kleiner Eingriff, spürbar für jeden PWA-Nutzer.
  **Contra:** Cache-Fallback kann die veraltete personalisierte Shell liefern — ohne den
  Cache-Control-Split (W8) kuriert man ein Symptom ("eingeloggt, aber alte Config").
  *(Impact mittel / Aufwand niedrig)*

- [ ] **E12 — Spenden-Popup entschärfen: sessionsbasiert statt alle 10 Minuten.** Verifiziert:
  `NAG_EVERY` = 10 Nutzungs-Minuten, "Später" bringt nur 10 weitere, erst Spenden-Klick 72h
  Ruhe — die längsten, wertvollsten Sessions werden am häufigsten unterbrochen
  (Markenwiderspruch zu "kein Feed, keine Werbung"). "Später" ≥ 7 Tage, Nag an
  Wiederkehr-Sessions koppeln, dezenter Herz-Button in der Topbar (Muster:
  Wikipedia/Signal). **Pro:** behebt echten Markenwiderspruch. **Contra:** Spenden sind die
  einzige Einnahme — seltener nerven kann real weniger Spenden bedeuten; ohne Zahlen
  (W7-Zähler) ist der Trade-off blind.
  *(Impact mittel / Aufwand niedrig)*

- [x] **E13 — Kaltstart-Import: Last.fm-Username als Seed für die eigene Karte.** Verifiziert:
  /api/import akzeptiert nur das eigene JSON-Backup; lib/lastfm.mjs kennt kein
  `user.getTopArtists` — dabei ist es dieselbe API mit demselben Key. "Meine 50 Lieblings-Acts
  als fertige Landkarte" löst zugleich den Radar-Kaltstart (ohne Likes tot). Vergleich:
  Obscurify/LibraryThing leben vom Profil-Import. **Pro:** stärkstes denkbares
  Erstnutzer-Erlebnis für die Zielgruppe. **Contra:** erreicht nur die (schrumpfende)
  Last.fm-Nische; 50 Acts + Nachbarn = API-Lastspike (Drosselung!) und ggf. überfordernder
  Dichte-Graph. BGG/Goodreads/Steam-Importe erst bei Nachfrage.
  *(Impact hoch / Aufwand mittel)*

- [x] **E14 — Ehrliche Daten statt Pseudo-Präzision (Books/Podcasts, nur das Nötigste).**
  Verifiziert: Books vergibt hartkodierte match-Werte 0.55/0.75 und holt Top-12 pro Subject
  (populärste zuerst → jedes Sci-Fi-Buch bekommt denselben Kanon); Podcasts lädt hartkodiert
  die `/de/`-iTunes-Storefront (EN-Nutzer bekommen deutsche Charts); das Frontend übersetzt
  match in Dicke UND Deckkraft. Games macht es seit Q4 richtig (Tag-Schnittmenge). Wegen E5
  nur Sofort-Fixes: Storefront an UI-Sprache koppeln, uniforme Kanten wo keine echten Scores
  existieren; volle Schnittmengen-Umstellung erst bei Entsperrung. **Pro:** kleine, lokale
  Wahrheits-Fixes. **Contra:** betrifft gesperrte Packs (Spannung zu E5); uniforme Kanten
  sehen ehrlicher, aber langweiliger aus.
  *(Impact mittel / Aufwand mittel)*

- [ ] **E15 — Stöbern/Booking-Schalter neu schneiden: generisches "Einfach/Profi" + Booking
  nur bei `features.booking`.** Verifiziert: `.workonly` versteckt im Stöbern-Modus auch
  Genre-Filter, Szenen, Shift-Klick-Vergleich, Fingerabdruck, Backup und Diagnose — in ALLEN
  Domänen, obwohl `features.booking` nur im Musik-Pack true ist; ein Bücher-Nutzer klickt nie
  auf "Booking", die halbe Funktionstiefe bleibt unauffindbar. Vergleich: Spotify for
  Artists/Letterboxd Pro als getrennte Schichten. **Pro:** Flag-/CSS-Infrastruktur existiert,
  im Kern Umbenennung + zweites Flag. **Contra:** bei konsequenter Labs-Entscheidung (E5)
  zählt fast nur Musik — dort ist "Booking" der richtige Name; mehr UI-Zustände,
  Bestandsnutzer müssen umlernen.
  *(Impact mittel / Aufwand niedrig)*

### Kontroversen (vom Moderator entschieden)
- **Web-Push vs. Runde-10-Entscheidung:** Produktstratege: Radar/Momentum sind "ein Discover
  Weekly ohne Zustellkanal" — höchster Retention-Hebel. Moderator: analytisch richtig, aber
  falsche Reihenfolge — erst E1/E2, sonst pusht man Nutzer in ein Produkt zurück, das ihre
  Karte vergessen hat. Runde-12-Kandidat.
- **Content-Qualität vs. Labs-Freeze:** Fokus-Fraktion gewinnt (2× unabhängig, konsistentes
  Warnbeispiel); vom Content-Berater nur die Ehrlichkeits-Fixes (E14) übernehmen.
- **Anon-Persistenz vs. Privacy-Versprechen:** lösbar und den Trade-off wert, aber NUR mit
  ehrlicher Datenschutz-Anpassung — stillschweigend umstellen wäre Bruch des Kernversprechens.
- **Tour reparieren vs. ersetzen:** kurzfristig den nachweislich falschen Satz "Nähe zeigt
  Verwandtschaft" korrigieren (das Force-Layout hält das Versprechen nicht — Kollisions-
  Padding, Mond-Halo-Federn), mittelfristig Learn-by-Doing statt 5-Slide-Tour.
- **Kreisende Monde:** Teil des Wow-Effekts, aber Dauerbewegung zerstört das räumliche
  Gedächtnis ("Rabbit-Hole mit Gedächtnis"). Kompromiss: Orbit als Spawn-Choreografie, nach
  dem Einpendeln einfrieren.
- **Single-File vs. Contributor-Zugänglichkeit:** 5.275-Zeilen-index.html aufbrechen?
  Aufschieben — erst LICENSE/englisches README/CONTRIBUTING würden zeigen, ob überhaupt
  Contributor kommen.

### Weitere Quick Wins aus den Einzel-Gutachten (klein, unstrittig)
- Kamerafahrten-Tween für centerOn/fitAll/Minimap (~30 Zeilen im requestDraw-Loop).
- Hover hebt inzidente Kanten/Nachbarn hervor (adj-Map existiert).
- Media Session API für Deezer-Previews (~20 Zeilen, Metadaten vorhanden).
- CSV-Export um Hörerzahl/Momentum/Profil-URL ergänzen; `statusChangedAt` beim
  Status-Speichern setzen (Teil von E9).
- Anything-Pack: Ausschlussfilter für Listen-/Jahres-/Begriffsklärungsseiten.
- GHCR-Job in release.yml + docker-compose.yml (kleiner CI-Zusatz).

### Empfohlene Reihenfolge
Sofort-Kandidaten (risikoarm): E4 (LICENSE — Betreiber-Entscheidung MIT vs. AGPL nötig),
E3 (Landing-Copy), E8, E11, E14-Sofort-Fixes. Größte Hebel mit Abstimmungsbedarf: E1
(Demo-Karte — Geschmacksfrage), E2 (localStorage — Datenschutztext!), E5 (Fokus — strategische
Betreiber-Entscheidung).


---

## Runde 12 — Review-Abstimmung + Komplettumsetzung (2026-07-11) — ✅ ERLEDIGT

Ein 10-köpfiges Review-Team (Solo-Dev, Endnutzer, Bookerin, Datenschutz, Ökonom, Tech-Lead,
Growth, Inklusion, Risiko, Advocatus Diaboli) hat alle 30 Punkte aus Runde 10+11 bewertet
(300 Einzelurteile). Auf Betreiber-Entscheidung wurden anschließend ALLE Machen- und
Später-Punkte umgesetzt — mit vier Vorgaben: AGPL-3.0 als Lizenz (E4), Musik-Fokus offiziell
(E5), E2+W7 beide mit ehrlicher Datenschutz-Anpassung, **E12 (Spenden-Popup) bewusst NICHT
angefasst**.

**Umgesetzt und einzeln live verifiziert** (Details in den Commits auf
`claude/pitch-markdown-review-e78so1`):
W1 (Meta/OG/robots/sitemap/llms.txt) · W2 (brotli/gzip, ~66 % kleiner) · W4 (aria-live +
Canvas-Label) · W6 (reduced-motion für Physik) · W7 (anonyme Tageszähler + /api/usage nur
für Betreiber + Datenschutztext) · W8 (Statik-Split: app.<hash>.js/css immutable, Hülle
39 KB) · W9 (Referrer-/Permissions-Policy, HSTS; CSP bewusst vertagt — Nonce-Strategie) ·
W12 (Viewport-Culling) · W14 (Karte als Read-Only-Link /s/<id>, private Felder bereinigt) ·
W15 (Listenansicht, Taste l) · E1 (Beispiel-Karte beim Erstbesuch) · E2 (Anon-ID in
localStorage + 30-Tage-Aufräumung + Datenschutztext) · E3 (Landing: Pitch-Headline,
Musik-Hero, Labs) · E4 (AGPL-3.0) · E5 (Fokus-Absatz in ROADMAP) · E6 (RA-Health-Alarm via
Pushover + kommende Auftritte im Panel) · E7 (Mobile-Such-Overlay) · E8 (Suggest an #q2 +
Seed-Chips) · E9 (Gagenfeld+Summe, statusChangedAt, Korb serverseitig inkl. einmaliger
localStorage-Übernahme) · E10 (Parallelkanten gebogen + Kanten-Tooltip mit Belegen) ·
E11 (SW-Netz-Timeout 3 s, Cache v2) · E13 (Last.fm-Import als Start-Karte) · E14
(Podcasts-Storefront folgt Sprache, Pseudo-Matches raus).

**Bewusst NICHT umgesetzt** (Team-Votum "Weglassen" bzw. Betreiber-Entscheidung):
- E12 Spenden-Popup entschärfen — Betreiber: unverändert lassen (einzige Einnahmequelle).
- E15 Booking-Schalter umbauen (1:1:8) — nach Fokus-Entscheidung zählt Musik, dort passt der Name.
- W3 Dependabot/CodeQL (2:2:6) — Dauer-Triage ohne Futter bei Zero-Dependency.
- W5 axe-core-CI (3:2:5) — prüft das Hauptproblem (Canvas) nicht; W15 löst es strukturell.
- W10 Changelog/Discussions (0:4:6) — schläft ohne Pflege ein und schadet dann.
- W11 In-Memory-LRU (0:3:7) — Optimieren ohne Messung ist Bastelei.
- W13 Spendenkanäle (3:2:5) — mehr Kanäle ≠ mehr Spenden.
- W9-CSP — vertagt: braucht Nonce-Strategie, falsch konfiguriert legt es die App lahm.

**Verifiziert:** `npm run check` grün, `npm run test:ci` 73 passed / 0 failed (+
interactions.spec 7 passed separat), dazu Live-Smoke-Tests jedes Features im
Headless-Browser (Desktop + Mobile). **Hinweise für den Betrieb:** neue optionale ENV
`LIKE_PUBLIC_URL` (canonical/OG-Basis), `LIKE_ANON_TTL_DAYS` (Default 30);
DATA_DIR bekommt `usage.json` und `shares/`; nach Deploys ändert sich der app.<hash>-Name
automatisch mit dem Inhalt.


---

## Runde 13 — ＋-Latenz: 6-stufiger Verbesserungszyklus (2026-07-11) — ✅ ERLEDIGT

Kundenfeedback: „Ladezeiten nach dem ＋ sind viel zu lang." Bearbeitet als DMAIC-Zyklus
(+ Standardisieren), fachliche Grundlage: Taskforce aus 6 gleichberechtigten Agents mit
Challenge-Runde (Vorschläge -> gegenseitige Kritik -> Konsens-Protokoll; mehrere Ideen
wurden dabei von ihren Autoren selbst zurückgezogen).

1. **Definieren:** kalt ~3,1 s -> Ziel ≈2 s; Hover+Klick ohne Doppel-Requests; kein
   einziger externer Request mehr als vorher (RA-/Last.fm-Drosseln unangetastet).
2. **Messen:** neues Standard-Werkzeug `scripts/bench-explore.mjs` (gemocktes fetch,
   feste Modell-RTTs, Fetch-Zählung). Baseline: kalt 3098 ms / 4 Fetches · warm 7 ms ·
   Hover+Klick 4854 ms / **7 Fetches** (Prefetch-Klick-Race belegt).
3. **Analysieren (Taskforce-Konsens):** ~840 ms Drossel-Sleeps IM Antwortpfad · ~370-500 ms
   unnötige Serialisierung (Tags nach RA statt parallel) · doppelter Vollgraph-Roundtrip ·
   fehlendes In-Flight-Dedup in cached() (Prefetch verdoppelt Requests und stellt den Klick
   hinter sich selbst).
4. **Verbessern (4 Konsens-Maßnahmen, 0 zusätzliche externe Requests):**
   - Single-Flight in `lib/cache.mjs` (Klick teilt sich das Promise des Prefetchs;
     Rejections werden nie memoiert).
   - Drossel-Pausen zweiarmig in die Gate-Kette verlegt (`lfetch`, `gql`, `jfetch`,
     `setlistfm.api`) — der NÄCHSTE Request wartet, nicht der Klicker; Retry-Backoffs
     unangetastet.
   - `getTopTags` parallel zu `coAppearances` (packs/music, nach getSimilar/canonical;
     Schluck-Semantik und Genre-Reihenfolge unverändert).
   - Client nutzt `res.graph` aus der Explore-Antwort (reload mit optionalem Graph;
     Fallback auf GET /api/graph bleibt).
5. **Prüfen:** Benchmark nachher: kalt **2265 ms (−27 %)** · warm 2 ms · Hover+Klick
   **1795 ms (−63 %) / 4 Fetches** (Dedup belegt). Bann-Schutz-Test: Abstand zwischen zwei
   echten fetches je Host bleibt ≥ gap (Last.fm 121/121 ms, RA 300/300 ms), auch wenn der
   vorige Request FEHLSCHLÄGT. `npm run check` grün, Suite 73 passed / 0 failed,
   Browser-Test: Explore feuert keinen zweiten /api/graph-Request mehr.
   Ziel ≈2 s knapp verfehlt (2,27 s) — der Rest ist die unvermeidbare serielle RA-Kette
   (Search 0,6 s + Pflicht-Abstand 0,3 s + Events-Query 1,1 s).
6. **Standardisieren:** bench-explore.mjs liegt als Regressions-Werkzeug im Repo (vor
   künftigen Änderungen am ＋-Pfad laufen lassen); Erkenntnisse hier dokumentiert.

**Mittelfristig (aus dem Taskforce-Konsens, bewusst noch nicht gebaut):** zweiphasiger
Ausbau in der client-getriebenen Zwei-Request-Variante (gefühlt <1 s; „ähnlich" sofort,
RA-Kanten nachladen) · Negativ-Cache ≤15 min für RA-Störungen · Queue-Prefetch ·
„RA antwortet langsam…"-Hinweis nach 4 s · Retry-Kappung 4->2 nur im Klickpfad.
**Im Challenge verworfen:** optimistischer RA-Start (Autocorrect-Mismatch = verschwendete
RA-Requests), Delta-Antworten (doppelte Merge-Semantik), Long-Poll-Explore (Serverzustand),
Tap-Prefetch (30 Panels = 60 RA-Requests), Prioritäts-Gates (Prämisse hielt Code-Prüfung
nicht stand).


---

## Runde 14 — Zweiphasiger Ausbau (Progressive Reveal) (2026-07-11) — ✅ ERLEDIGT

Umsetzung des Mittelfristig-Punkts aus Runde 13 (client-getriebene Zwei-Request-Variante,
Taskforce-Konsens). Der ＋-Klick zeigt jetzt nach **~0,7 s** die ähnlichen Acts; die
„zusammen aufgetreten"-Kanten + Booking trudeln ~2 s später nach.

- **Pack (Musik):** `exploreFast()` (Last.fm: Identität + ähnlich + Tags) und
  `exploreTogether()` (RA-Kette + kuratierte Genres + Booking); `explore()` bleibt für
  Prefetch/Brücke/Cross-Pack unverändert und wärmt beide Phasen-Caches.
- **Server:** `/api/explore` mit `staged:true` antwortet nach Phase 1 (`pending:true`);
  neuer `POST /api/explore2` merged Phase 2 unter dem Graph-Lock nach (RA-Genres VOR die
  Tags gemischt — identische Chips wie einphasig). `explored` wird erst in Phase 2 gesetzt:
  ein halb geladener Act gilt nicht als fertig, ein Fehlschlag wird beim nächsten ＋
  automatisch erneut versucht. Packs ohne Staged-Support laufen unverändert einphasig.
- **Client:** ehrlicher Zwischen-Toast („3 ähnlich · suche gemeinsame Auftritte …"),
  ruhig weiterpulsierender Ring (`togetherPending`) bis Phase 2 da ist, Abschluss-Toast
  („N verbunden" / „keine gemeinsamen Auftritte gefunden"), Fehler SICHTBAR per Toast
  (nie still). Läuft beim Eintreffen von Phase 2 bereits ein neuer Ausbau, wird der Graph
  nicht angefasst (Server-Stand kommt mit dessen reload ohnehin mit) — kein Doppel-Merge-
  Risiko im Client. Panel wird aufgefrischt, wenn der Act noch ausgewählt ist.
- **Verifiziert:** Benchmark (bench-explore.mjs, neues staged-Szenario): Phase 1 **624 ms**
  (Ziel <1 s ✓), Phase 2 +2005 ms nachlaufend, weiterhin exakt 4 externe Requests.
  End-to-End im Browser gegen den echten Server mit gemocktem Außen-Netz: Phase 1 nach
  706 ms sichtbar (4 Knoten, pending-Ring, explored=false), Phase 2 nach 2,7 s (together-
  Kante, explored=true, RA-Genres vor Tags, Booking inkl. kommender Auftritte am Knoten).
  `npm run check` grün, Suite 73 passed / 0 failed.


---

## Runde 15 — Latenz-Feinschliff: die letzten drei Konsens-Punkte (2026-07-11) — ✅ ERLEDIGT

Die verbliebenen kleinen Punkte aus dem Taskforce-Konsens (Runde 13, Mittelfristig):

- **RA-Abkühlphase (Negativ-Cache):** Ab 2 gql-Fehlschlägen in Folge überspringt
  coappearByName die RA-Quelle für 10 Minuten (wirft sofort, wird nicht gecacht, Erfolg
  hebt die Sperre auf). Vorher zahlte während einer RA-Störung JEDER Ausbau erneut die
  volle Retry-Kaskade. Test: nach 2 Fehlern löst der 3. Aufruf 0 Requests aus.
- **Queue-Prefetch:** ＋-Warteschlangen-Einträge werden beim Einreihen sofort per
  /api/prefetch vorgewärmt — sie werden ohnehin garantiert exploriert, und der
  Single-Flight-Cache (R13) dedupliziert mit dem späteren Explore. Test: Prefetch +
  zweiphasiger Ausbau = exakt 4 externe Requests (ohne Dedup wären es 8); Phase 1
  antwortet auf dem laufenden Prefetch reitend in ~370 ms.
- **Nachlade-Batches nachrangig:** fillSizes/fillGenres starten erst, wenn die
  ＋-Warteschlange leer ist — Folge-Klicks warten nicht mehr hinter popfill-Requests
  im Last.fm-Gate.

Verifiziert: beide Logik-Tests grün, `npm run check` grün, Suite 73 passed / 0 failed.
**Nicht umgesetzt (bewusst):** Retry-Kappung 4→2 — seit R14 laufen die Retries im
Hintergrund und blockieren keinen Klick mehr; die Abkühlphase deckelt den Störungsfall.
Damit ist der Latenz-Komplex (R13-R15) abgeschlossen.


---

## Runde 16 — Spawn-Physik: Wackeln/Zappeln beim Nachladen (2026-07-12) — ✅ ERLEDIGT

Kundenfeedback: „Physik der Kugeln beim Laden eines neuen Acts wackelt/zappelt." Bearbeitet
von einer 6-Kopf-Taskforce (Empiriker, Energie, Spawn, Integrator, Choreograf, UX) mit
Messungen statt Raten; Challenge-Runde einstimmig. Kernbefund: **~75 % des gefühlten
Zappelns war die KAMERA, nicht die Physik** (Screen- vs. Welt-Pixel getrennt gemessen).

Sechs Maßnahmen, alle am echten Mock-Server-Setup gemessen:
- **Kamera sanft statt Hard-Cut (größter Hebel):** Follow mit Deadzone (60 px) + Ease
  (~350 ms) statt Frame-Hardlock; `followNode` nach jedem rebuild aufs frische Objekt
  remappen (behob einen Stale-Object-Freeze nach R14-Phase-2); beim ＋ auf einen bereits
  sichtbaren Knoten wird gar nicht mehr hart re-zentriert.
- **Space-Fix:** `_moonAng/_moonSpeed/_moonTie/_rDraw` über `rebuild()` retten; neue Monde
  ihren Startwinkel aus der Ist-Position (atan2) ableiten statt aus dem Ring-Slot — die
  gemessenen 180-390-px-Mond-Teleports pro Frame verschwinden.
- **R14-Doppelwelle entschärft:** Phase-2-Reheat an die tatsächliche Änderung gekoppelt
  (neue Knoten 0.2, nur neue Kanten 0.08, nichts Neues = kein Reheat) — vorher zündete
  reload(0.35) sogar bei leerem Ergebnis.
- **Reheat harmonisiert:** Default von 1 auf 0.4 gesenkt (Suche/Doppelklick/„Weiter
  erkunden" liefen mit 5× der Energie des ＋-Badges).
- **Spawn in freie Sektoren:** neue Knoten in die größten Winkellücken um den Anker statt
  auf feste Ring-Winkel (verhindert Frame-0-Überlappungen = alpha-unabhängige Kollisions-Snaps).
- **alpha-adaptive Dämpfung** `DAMP = 0.86 − 0.18·alpha`: dämpft die frische Aufheizwelle
  (ζ von 0.45 auf ~1.0), lässt den ruhigen Ausklang lebendig.

**Gemessen (Bystander-Screen-Pixel-Bewegung pro ＋-Ausbau, scripts/bench-spawn-physik.cjs):**
Flat netto 161→108 px (−33 %), Space 307→207 px (−33 %); **Einzel-Frame-Ruckler (das
sichtbare „Zappeln") Flat 149→29 px, Space 307→42 px** — die physikalisch unmöglichen
Sprünge (Kamera-/Mond-Snaps) sind weg. Jitter-Verhältnis (Weg/Netto) 1.95→~1.07.
Verifiziert: F7-Drag-Test grün, Space-Monde kreisen weiter, `npm run check` grün, Suite
73 passed / 0 failed. **Verworfen** (per A/B falsifiziert): Kollisionsradius mit `appear`
einwachsen lassen — verschiebt die Bewegung nur zeitlich, Summe identisch (der Empiriker
zog die eigene Idee zurück).


---

## Runde 17 — Flat-Drag: Nachbarn sichtbar mitziehen (2026-07-12) — ✅ ERLEDIGT

Nutzerfeedback: Im Space-Modus folgen die Monde beim Verschieben des Planeten, im Flat-Modus
zog es die Nachbarn kaum mit. Ursache: F7 (Runde 6) ließ die Nachbarn nur über die weichen
Kanten-Federn folgen (bei DRAG_ALPHA=0.28) — gemessen folgte ein starker 1-Hop-Nachbar nur
zu 35 % der Zieh-Strecke, mit deutlichem Nachlauf.

Fix: Beim Ziehen werden die DIREKTEN Nachbarn zusätzlich um das Frame-Delta mitverschoben,
proportional zur Bindungsstärke (`0.5 + 0.45·bond`, 0.5 lose … 0.95 fest) — starke Bindungen
folgen fast starr wie ein Mond, schwache trailen organisch nach (kein starres
Gruppen-Verschieben; Monde/gepinnte/gezogene ausgenommen, pro Nachbar nur die stärkste
Bindung). Die 2-Hop+-Ringe folgen weiter über die Federn.

**Gemessen (Hub 219 px gezogen, 1-Hop-Nachbar):** Flat 0.35 → 0.90 (nahe an Space 1.00);
Space unverändert. Verifiziert: F7-Regressionstest grün (verbundener Nachbar folgt, fremder
nicht), `npm run check` grün, Bildserie bestätigt den zusammenhängenden Stern beim Ziehen.


---

## Runde 18 — Such-Seed spawnt nicht mehr auf einen Bestandsknoten (2026-07-12)  — ✅ ERLEDIGT

Nutzerfeedback (mit Screenshot): ein per Suche neu geladener Act landet manchmal sehr nah an
einem schon vorhandenen (zwei Hubs fast überlappend). Ursache: ein einzeln gesuchter Seed
wurde EXAKT in die Bildmitte (W/2,H/2) gesetzt — saß dort schon ein Knoten (typisch: ein
vorher gesuchter Hub, der zur Mitte gravitiert), spawnte der neue direkt darauf. R16s
Freie-Sektoren-Fix galt nur für Anker-Kinder, nicht für Seeds.

Fix (rebuild-Platzierung): Zielpunkt eines neuen Seeds = Schwerpunkt seiner bereits
platzierten Nachbarn (dorthin gehört er), sonst die Mitte; dann per Fermat-Spirale
(Goldwinkel) hinausrücken, bis kein Bestandsknoten mehr im Kollisionsabstand liegt.
Gemessen: unverbundener Zweit-Seed 723 px Abstand, verbundener Seed 198 px (Bedarf 73) —
vorher 0 (deckungsgleich). `npm run check` grün, Interactions/Pages 19 passed.
## Runde 19 — Brücke als semantische Suchmaschine (2026-07-13)

**Kontext:** Die Routenplaner-Brücke sucht bidirektional die kürzeste Verbindung
und nutzt bei Anything seit PR #40 zwei „Straßen" (morelike + Artikel-Links).
Nächster Schritt: die Verlinkungslogik wie eine **eigene kleine Suchmaschine**
ranken — seltene, spezifische Verbindungen bevorzugen statt generischer Naben —
**ohne** den Routenplaner-Kern zu brechen.

**Leitprinzip (Routenplaner bleibt intakt):** „Wenigste Stationen" bleibt die
**primäre** Sortierung; alle folgenden Signale wirken nur **sekundär** (welche der
gleich-kurzen Routen ist die beste) bzw. steuern die **Expansionsreihenfolge
innerhalb einer Tiefen-Ebene** (Tempo). Nie greedy quer über Ebenen. Naben werden
**abgewertet, nie hart gelöscht** — ein Hub darf Brücke sein, wenn er *wirklich* die
einzige kurze Verbindung ist, landet dann nur unten im Ranking. Das ist genau, wie
ein echtes Navi (Dijkstra/A\* mit Kantenkosten) arbeitet — mehr Routenplaner, nicht
weniger.

- [x] **B1 — IDF-/Hub-Gewichtung der Links (weiches Abwerten).** Umgesetzt in PR
  (siehe unten): generische Naben (Länder, Kontinente, Jahre/Zahlen, „Mensch",
  „Sprache" …) über eine Stoppliste + Heuristik als Brückenknoten abwerten statt
  entfernen. morelike wiegt am meisten, spezifische Links mittel, Hubs minimal. Das
  bestehende Pfad-`strength`-Mittel rankt sinnvolle Brücken über Hub-Brücken —
  während `via.length` (Stationen) die primäre Sortierung bleibt. Verhindert
  „Basler ↔ Istanbul über *Deutschland*", ohne je eine kürzere Route zu verschweigen.

- [ ] **B2 — Echte IDF nur an den Treffpunkten (billig, exakt).** Statt die Rarität
  jedes Links zu schätzen: für die *wenigen* Kandidaten-Zwischenknoten am Ende die
  echte Rückverlinkungszahl ziehen (`list=backlinks&bltitle=…&bllimit=max`, gecacht)
  und `1/log(backlinks)` als Feinschliff ins Ranking geben. Wenige Extra-Calls, nur
  dort, wo es zählt — die Suche selbst bleibt bei der billigen Heuristik aus B1.

- [x] **B3 — Best-first *innerhalb* der Ebene (A\*, Tempo).** ✅ umgesetzt. Frontier von FIFO auf
  Prioritäts-Queue mit Schlüssel `(Tiefe zuerst, Score danach)` umstellen: innerhalb
  einer Tiefe die vielversprechenden Knoten zuerst expandieren (weniger API-Calls,
  schnellerer Fund) — Ebenen nie überspringen, damit „kürzeste zuerst" erhalten
  bleibt. Score = Nähe zum Gegenziel (geteilte Links/Kategorien).

- [~] **B4 — Lokaler Merkmalsvektor-Index („Embeddings ohne ML").** ✅ Erste Stufe
  umgesetzt: `lib/vector.mjs` (Merkmalsliste → dünner Häufigkeitsvektor, Cosinus-
  Ähnlichkeit, key-/dependency-frei) + **Kohärenz-Bonus** in der Brücken-Bewertung —
  bevorzugt bei GLEICHER Länge Kandidaten, deren Zwischen-Einträge thematisch (Genres)
  zu BEIDEN Enden passen. Sanfter ≤15%-Faktor, ändert die via.length-Reihenfolge nie
  (Routenplaner bleibt), abschaltbar via `LIKE_BRIDGE_COHERENCE=0`. Offline verifiziert
  (Vektor-Mathematik-Unittests + Server-Reihung mit/ohne Flag).
  **Offen (spätere Stufen):** Vektoren im Datei-Cache persistieren; reichere Merkmale
  (Kategorien/Links/Titel-Tokens, IDF-gewichtet) statt nur Genres; die Vektoren auch B3s
  Frontier-Heuristik speisen (Nähe zum Gegenziel); Pfad-Kohärenz *zwischen aufeinander-
  folgenden* Knoten statt nur zu den Enden.

- [ ] **B5 — Personalisierung + „Warum".** Brücken, die durch Knoten *nahe deinen
  Likes* laufen, höher ranken (Teleport-Bias wie beim Radar). Und: den Treffpunkt
  begründen — „Basler ↔ Istanbul verbindet: **Türkei** (Land) · **Galatasaray**
  (Verein)", Typ aus der Kategorie abgeleitet. Reines Ranking/Anzeige — ändert die
  Pfadlänge nie.

- [ ] **B6 — Anchor-/Abschnitts-Kontext.** Links nach ihrem Wikitext-Abschnitt
  gewichten (Karriere/Werk > Weblinks/Einzelnachweise). `travel.mjs` parst Abschnitte
  bereits — dieselbe Technik für `pageLinks()` in `wiki.mjs`.

**Reihenfolge/Wirkung:** B1 (größter Qualitätssprung, kleinstes Risiko) → B2/B3
(Präzision + Tempo) → B4 (das „eigene Suchmaschine"-Herz) → B5/B6 (Politur).

---

## Runde 20 — Brücke über die ZWEITE Relation je Domäne (2026-07-13)

**Kontext:** Seit PR #40 fährt die Brücke bei **Anything** über zwei „Straßen"
(morelike + Artikel-Links). Bei allen anderen Domänen läuft sie weiterhin nur über
die **blaue** „ähnlich"-Relation (`pack.similar()`) — die **orange** „zusammen"-
Relation, die jedes Pack ohnehin schon berechnet (`explore().together`), bleibt für
die Brücke ungenutzt. Dabei ist die orange Relation oft die *eigentlich
interessante* Verbindung: eine ganz andere Achse als Klang/Thema.

**Leitprinzip (wie bei Anything):** je Domäne ein `bridgeNeighbors()`, das **blau +
orange** mischt; Routenplaner-Kern bleibt (kürzeste Route zuerst), Naben werden
**abgewertet, nie gelöscht** (die Domäne bringt dafür ihren Popularitäts-/
Kleinheits-Begriff `config.popularity.big` mit). Ergebnis: Brücken-Ketten dürfen
unterwegs zwischen den Achsen wechseln (A —blau— X —orange— B).

- [x] **M1 — Music: „zusammen aufgetreten" als zweite Brücken-Straße (Leitfall).** ✅ umgesetzt.
  Heute fragt die Music-Brücke nur „was klingt dazwischen?" (Last.fm-Stil). Die
  orange Relation (`coAppearances`: RA/Songkick/Setlist.fm — geteilte Bühnen) ist
  aber das Booking-Alleinstellungsmerkmal und verbindet Acts, die *nie ähnlich
  klingen*, aber dieselben Clubs/Festivals/Label-Nächte bespielen. `bridgeNeighbors()`
  = `getSimilar` (Stil) **+** `coAppearances` (Auftritte), sodass Ketten wie „A —spielte
  mit— X —ähnlich— B" möglich werden. **Naben-Strafe:** Mega-Headliner/Festivals, mit
  denen *jeder* gespielt hat, abwerten — Musics vorhandenes „Große dämpfen" (≥20k
  Hörer) als IDF-Analogon nutzen, damit die Brücke durch KLEINE, spezifische
  Bühnenpartner routet. Vorbehalt: RA & Co. sind langsamer/wackliger als Last.fm →
  die orange Straße gewichtet/begrenzt dazunehmen, damit die Suche nicht ausbremst.

**Analyse der übrigen Domänen — wie stark ist die zweite Straße?**

Die orange Relation zerfällt in zwei Klassen. **Verhaltens-/Netzwerk-Achse** (echte
zweite Dimension, verbindet quer durch die „ähnlich"-Cluster) — hier lohnt es am
meisten:

- [x] **M2 — Movies: „Leute schauten auch" (TMDB `recommendations`).** ✅ umgesetzt. Verhaltens-
  basiert statt genre-ähnlich → überbrückt Genregrenzen (Arthouse ↔ Blockbuster, die
  dasselbe Publikum teilen). Stärkste zweite Straße nach Music. Naben-Strafe:
  vote_count (`popularity.big` = 5000).
- [x] **M3 — Papers: Ko-Autorschaft (OpenAlex).** ✅ umgesetzt. Kollaborations-Netzwerk statt
  thematischer Nähe → verbindet Felder über gemeinsame Autor:innen (genau wie Auftritte
  bei Music). Naben-Strafe: hyper-produktive Autor:innen / Mega-Kollaborationen dämpfen.
- [x] **M4 — Plants: Ko-Okkurrenz am selben Standort (iNaturalist).** ✅ umgesetzt. Ökologische
  Nachbarschaft statt Taxonomie → verbindet botanisch Unverwandtes, das zusammen
  wächst. Naben-Strafe: Kosmopoliten (Löwenzahn & Co.) über Beobachtungszahl dämpfen.
- [x] **M5 — Travel: geografische Nähe (Wikivoyage-Geosuche).** ✅ umgesetzt. Travel trennt bewusst
  *Stil* (blau) und *Nähe* (orange) — die Brücke nur über Stil laufen zu lassen
  verschenkt die halbe Idee. Über Nähe: „welches Ziel liegt zwischen A und B?" Naben-
  Strafe: große Metropolen im Umkreis dämpfen.

**Katalog-Achse** (orange = „vom selben Ersteller" — bündelt nur den Katalog *einer*
Person/Firma; als Brücken-Straße schwächer, hilft aber via „A —selber Autor— A2
—ähnlich— B"). Zusätzlich steckt das Verhaltenssignal hier oft schon halb in `similar()`
(optionaler TasteDive-Key):

- [x] **M6 — Books (selber Autor), Games (selber Entwickler), Boardgames (selber
  Designer/Verlag), Podcasts (selber Anbieter).** Zweite Straße dünner, aber je
  ein `bridgeNeighbors()` = similar + together erweitert die Reichweite messbar.
  Naben-Strafe: Mega-Verlag/-Studio/-Netzwerk mit riesigem Katalog über die
  Popularitätszahl dämpfen. Für Boardgames zusätzlich prüfen, ob BGGs „Fans Also Like"
  (Backlog Q1) die bessere zweite Straße wäre als die Designer-Relation.

**Sekundär — Cache-Vergiftung gegenprüfen (Lehre aus PR #40):** Music/Deezer/
MusicBrainz sind sauber (werfen bei Netzfehlern aus `cached()` heraus, cachen nur
echte Leerergebnisse). Für die übrigen Domänen-Libs (`itunes`, `tastedive`, sowie die
jfetch-Aufrufe in movies/books/games/boardgames/papers/podcasts) kurz bestätigen, dass
kein `catch → return leer` *innerhalb* von `cached()` steht — sonst denselben Fix wie in
`wiki.mjs`/`travel.mjs` anwenden.

**Reihenfolge/Wirkung:** M1 (Music, größter Produktwert) → M2–M5 (starke zweite
Straße) → M6 (Katalog-Achse, geringerer Hebel). Jede Domäne isoliert testbar; der
Server nutzt `bridgeNeighbors()` bereits automatisch (`neighborsFor()`), sobald ein
Pack es anbietet — kein Server-Umbau nötig.

---

## Runde 21 — Nutzer-Feedback (2026-07-16)

Direktes Feedback aus der Nutzung. **Alle acht Punkte umgesetzt (2026-07-16);**
`npm run check` grün, Playwright-Suite grün.

- [x] **N1 — Act-Suche: Eindeutigkeit bei mehrdeutigen Namen.** ✅ Die Autocomplete zeigt
  jetzt je Vorschlag die **Hörerzahl** (1.2M / 4.3k) und einen kleinen **↗-Verifizier-Link**,
  der genau die Last.fm-Identität öffnet, die beim Klick geladen würde — so lässt sich vor
  der Auswahl prüfen, ob es der richtige Act ist. Umsetzung ohne Zusatzlast: die schon
  vorhandene `artist.search`-Antwort liefert Hörer + URL mit (neu `searchArtistsDetailed`
  in `lib/lastfm.mjs`, `suggestMeta` im Music-Pack, `/api/suggest` hängt optional `meta` an;
  Client rendert Namen + Hinweis). Der Bandcamp-Gedanke ist als Alternative notiert — die
  Last.fm-URL ist der ehrlichere „das wird geladen"-Vorschau-Link, weil `exploreByName` über
  genau diese Identität lädt.
  - **N1b (Nachtrag) — Namensvetter-Dialog.** ✅ Wenn es mehrere *exakt* gleichnamige Acts gibt,
    erscheint nach der Suche ein dezenter Hinweis („Mehrere Acts heißen „X" — Auswählen"). Der
    Dialog listet die Gleichnamigen mit **Unterscheidungs-Notiz, Genre, Herkunft, Jahren und
    Hörerzahl** (Quelle: MusicBrainz + Last.fm-Hörer je MBID). Die Auswahl lädt gezielt **diese
    MusicBrainz-Identität** (MBID durch die ganze Explore-Kette gereicht: `getSimilar`/
    `exploreFast`/`explore`/`/api/explore`), statt der zusammengeführten populären Last.fm-Seite.
    Weil der Graph namensbasiert ist, wird beim Wechsel der alte Quellknoten samt seiner losen,
    unmarkierten Entdeckungen entfernt und die gewählte Identität frisch geladen. Ausgelöst „auf
    Nachfrage" (kein Tempoverlust bei normalen Suchen; MusicBrainz ist auf 1 Anfrage/s gedrosselt).

- [x] **N2 — Song-Preview-Pill: Scrub-Line springt nicht zurück.** ✅ Die aufgeklappte
  Spulleiste klappt jetzt automatisch zurück zur Artist-/Titel-Ansicht: bei Pause/Ende, und
  auf Touch nach kurzer Ruhe (Auto-Collapse-Timer). Der klebrige Klick-Umschalter greift nur
  noch auf Touch — am Desktop steuert der Hover, ein Klick bleibt nicht mehr in der
  Scrub-Ansicht hängen.

- [x] **N3 — Schrift des Netzes am Desktop pixelig.** ✅ `DPR` wurde nur einmal beim Laden
  festgenagelt — Browser-Zoom/OS-Skalierung/Monitorwechsel änderten devicePixelRatio danach,
  ohne dass das Canvas-Backing neu vermessen wurde (→ hochskalierter, pixeliger Text). Jetzt
  wird DPR bei jedem `resize()` frisch berechnet, plus ein `matchMedia`-Listener auf
  DPR-Wechsel.

- [x] **N4 — Login-Hinweis beim ersten Ablegen ohne Konto.** ✅ Legt ein uneingeloggter Nutzer
  zum ersten Mal etwas auf eine Liste, erscheint (genau einmal pro Gerät, nach der
  Like-Bestätigung) ein dezenter Hinweis „Ohne Konto bleibt deine Liste nur auf diesem Gerät"
  mit „Jetzt anmelden"-Link direkt in die Registrierung.

- [x] **N5 — Leeres Netz: „Meistgehörtes von Last.fm importieren" entfernen.** ✅ Button samt
  Verdrahtung (und ungenutzter API-Client-Methode) aus dem Empty-State entfernt.

- [x] **N6 — Löschen-Knopf: Modal mit Optionen.** ✅ „Alles löschen" heißt jetzt „Löschen…"
  und öffnet einen Dialog mit drei Umfängen: **Ganze Karte leeren** (alles),
  **Nur unverknüpfte Acts aufräumen** (Gesuchte/Gebuchte/Notierte bleiben) und
  **Auftritts- & Wiki-Zusatzdaten zurücksetzen** — jeweils mit Erklärung + umfangsspezifischer
  Sicherheitsabfrage (nutzt die vorhandenen `/api/reset`-Scopes all/discovered/lineups).

- [x] **N7 — Gespeicherte Playlists auffindbar machen.** ✅ Neuer Eintrag „★ Meine Listen" im
  ⋯-Menü (in beiden Modi sichtbar) öffnet den Listen-Umschalter (ansehen/wechseln/umbenennen/
  neu) — vorher nur über das ▾ am Listen-Panel erreichbar.

- [x] **N8 — Startansicht: gesamtes Netz, nur Hauptsonnen.** ✅ Der Start passt jetzt immer die
  Gesamtübersicht ein (`fitAll`); die früher gemerkte Pan/Zoom-Ansicht (F3) wird auf
  Nutzerwunsch nicht mehr wiederhergestellt (Persistenz-Code entfernt).

---

## Runde 22 — Testnutzer-Feedback über den ✉-Knopf (2026-07-16)

**Kontext:** 16 echte Rückmeldungen aus der neuen Feedback-Sammlung (anonyme `feedback`-Issues
**#66–#81**, Music-Pack v2.6.0). Gegen die parallel umgesetzte Runde 21 (N1–N8) abgeglichen —
ein Teil war dort bereits erledigt (s. u.). IDs `FBn` verweisen 1:1 auf ihr Quell-Issue.

**Vorbehalt:** Roh-Rückmeldungen, überwiegend **noch nicht am Live-Verhalten verifiziert**. Die
offenen Punkte je einzeln am echten Code/Browser gegenprüfen, bevor umgesetzt wird.

### Schon durch Runde 21 abgedeckt (nur Querverweis)
- **FB8 (#75)** Löschen-Menü neu schneiden → **N6** (Modal mit drei Umfängen). ✅
- **FB13 (#79)** Hinweis auf temporäre Speicherung bei anonymem „like" → **N4**. ✅
- **FB9-Teil (#75)** Playlists auffindbar/geschützt → **N7** (★ Meine Listen) + N6. Der
  *Konto-Infos*-Teil (Profilübersicht) bleibt offen (s. FB9 unten).

### In dieser Runde umgesetzt
- [x] **FB3 — Redundanten Toast beim Vorschau-Start entfernen (#71).** ✅ Der Start-Toast
  „▶ … (30 s)" ist raus (`public/index.html`, `playPreview`); die Now-Playing-Pill zeigt Titel +
  Fortschritt ohnehin (über das audio-`play`-Event → `updateNowPlaying`), der Toast war reine
  Dopplung. Die Fehler-Toasts (keine Klangprobe / Wiedergabe blockiert) bleiben bewusst.

### Offen — klein, aber erst verifizieren/entscheiden (die „unklaren" ans Ende gestellt)
- [x] **FB2 — Falsches Audio gematcht (#81).** ✅ Ursache: `norm()` strippt Diakritika, also
  faltete „Magnüm" auf „magnum" und matchte „Magnum". Fix in `lib/deezer.mjs` + `lib/itunes.mjs`:
  **zuerst diakritik-sensitiv exakt** matchen (nur Groß-/Kleinschreibung + Leerraum egal), erst als
  Fallback die gefaltete Variante. Am echten Modul verifiziert (Trefferliste [Magnüm, Magnum] →
  wählt jetzt „Magnum").
- [x] **FB5 — Sprachwechsel ordnet das Netz neu an (#70).** ✅ Ursache: `setLang`/`setMode` machen
  `location.reload()`, danach vergab `rebuild()` frische Zufallspositionen. Fix: vor dem Reload die
  Knotenpositionen in `sessionStorage` sichern (`stashLayoutForReload`), beim Start als `prev` in
  `rebuild(prev, 0)` einspielen (kalt, kein Reheat) — die Anordnung bleibt erhalten. Gilt auch fürs
  Modus-Umschalten. (Frontend-Fix, im Browser noch gegenzusehen.)
- [x] **FB6 — „Schlagschatten nach innen auf die Kugel" beim Verschieben (#76).** ✅ Nutzer
  präzisiert: nur in Bewegung. Ursache: der weiche Hover-Schein (`shadowBlur 16`) — auf Touch gibt
  es „Hover" nur während des Ziehens, der blurred Schein wirkte dann wie ein Schlagschatten. Fix:
  Schein für den gerade gezogenen Knoten (`n !== dragNode`) nicht zeichnen; reines Hovern bleibt.
- [x] **FB11 — „+N"-Indikator mit dem Zoom skalieren (#68).** ✅ Geklärt: der `n.pending`-Chip
  („noch versteckte, zur Übersicht ausgeblendete Acts"). War bildschirm-konstant (`/view.k`) → winzig
  neben einer nah herangezoomten Kugel. Fix: Chip-Radius (in `pendingBadge`) + Schrift skalieren mit
  dem Kugelradius (Mindestgröße bleibt); Position & Trefferfläche ziehen automatisch mit.
- [x] **FB7 — „Aufräumen" schiebt Monde weg vom Planeten (#80).** ✅ `sortLayout()` behandelte
  Monde als Baumknoten und setzte `_moonAng=null` → sie flogen aus der Umlaufbahn. Fix: Monde
  (`_moon`) vom Sortieren ausnehmen; sie umkreisen weiter ihren Planeten (`updateMoons`).
  (Frontend-Fix, im Browser noch gegenzusehen.)
- [x] **FB10 — Den „+N"-Indikator erklären (#77).** ✅ Der Chip-Tooltip erklärt jetzt das „warum
  versteckt": „Ähnliche Acts, die zur Übersicht ausgeblendet sind — einblenden (kein Ladevorgang)"
  (DE+EN); zusammen mit dem größeren Chip aus FB11 ist der Indikator klarer. (Discovery auf Touch
  bleibt begrenzt — echter Onboarding-Hinweis wäre eine separate größere Sache.)
- [x] **FB12 — „Brücke bauen" blendet viele Acts aus (#78).** ✅ Zweifach: Nicht-Kandidaten im
  Brücke-Modus nicht mehr fast unsichtbar (0.15 → 0.28, Kontext bleibt), plus erklärender Hinweis
  in der Brücken-Leiste („Andere Acts sind kurz abgeblendet, damit der Weg sichtbar ist …", DE+EN).
  (Frontend-Fix, im Browser noch gegenzusehen.)
- [x] **FB9 — Profilmenü mit Konto-Infos (#75, Rest).** ✅ Die Konto-Box im ⋯-Menü zeigt jetzt neben
  „Angemeldet als …/abmelden" eine kleine Übersicht: Acts auf der Karte, davon in Listen, Anzahl
  Listen — client-seitig aus dem Graphen, ohne neuen Endpoint (auch für anonyme Nutzer). (Playlists
  waren über N7 schon erreichbar.)

### Offen — große Bretter (eigene Vorhaben)
- [x] **FB4 — Ähnlichkeit/Auftritts-Häufigkeit RÄUMLICH kodieren (#66).** ✅ Die Force-Ruhelänge
  hing schon an der kombinierten Bindung (ähnlich+zusammen), aber nur schwach. Jetzt steiler
  gespreizt (`66 + (1-bond)^1.35 * 168`): stark gebundene Paare enger, schwach gebundene deutlich
  weiter; Kollisions-/Halo-Clamp fängt unten ab. **Tuning-Wert — im Browser gegensehen/nachjustieren.**
- [x] **FB14 — „Überrasch mich" mit Genre-Eingabe (#74).** ✅ Optionales Genre-Feld unter dem Button
  (nur Musik). Mit Genre zieht der Server einen eher unbekannten Act AUS dem Genre (Last.fm
  `tag.gettopartists`, hintere Hälfte = Geheimtipp, garantiert ladbar); leer = wie bisher. Neu:
  `getTagArtists` (lib/lastfm.mjs), `surprise({genre})` (music-pack), `?genre=` an `/api/surprise`.
  Am echten Modul verifiziert.
- [x] **FB15 — Bandcamp als Quelle für kleine Acts (#72).** *Analyse:* `lib/bandcamp.mjs` bietet
  bereits `discoverTag(genre)` (kleine, neue Acts je Genre) + `searchBand` (Ort). Das Problem ist
  nicht die Quelle, sondern die **Einbindung**: der Graph ist namensbasiert über Last.fm — Bandcamp-
  *only*-Acts laden dort nicht (`exploreByName` findet sie nicht). Es braucht die „Eckverbinder"-
  Logik (Bandcamp-Act → nächster über Last.fm existierender Nachbar) ODER einen eigenen Bandcamp-
  Knotentyp im Graphen. Zusätzlich: bandcamp.mjs nutzt **inoffizielle Endpoints (ToS/Risiko)** — als
  Live-Feature eine **Betreiber-Entscheidung**. *Nächster Schritt/Entscheidung nötig:* (a) nur als
  Genre-Discovery-Vorschlagsliste (kein Graph-Knoten), (b) echter Bandcamp-Knotentyp, (c) vorerst aus.
  Teil-Nutzen ist über FB14 (Genre-Surprise) schon da — nur eben via Last.fm, nicht Bandcamp.
  - **✅ Entscheidung getroffen (2026-07-17) — LAZY Opt-in-Eckverbinder über den `pending`-Mechanismus.**
    Neue Erkenntnis: Bandcamp ist **schon live** (read-light) — `searchBand` liefert den Ort (`bcLocation`,
    `packs/music/pack.mjs:261`), `discoverTag` speist Genre-Discovery/Radar (`:356`) inkl. Health-Probe
    (`:377`). Die „dürfen wir überhaupt?"-Gate ist damit praktisch schon mit Ja beantwortet. FB15 wird
    daher als **opt-in, hidden-by-default, LAZY** umgesetzt — Default = **null** Bandcamp-Kosten (weder
    Fetch noch Force-Sim), exakt wie heute; Kosten entstehen nur, wenn der Nutzer den Toggle aktiv nutzt.
    Das entschärft ToS-Volumen **und** Performance **und** die „Karte zumüllen"-Sorge zugleich.
    - **Grundidee:** Bandcamp-only-Tipps als **Blätter am gerade erkundeten Act**, angebunden über
      **gemeinsames Genre** (leichter Eckverbinder, Variante b — aber nur auf Anfrage). Kein
      Graph-Modell-Umbau: wir **wiederverwenden den vorhandenen `pending`/`/api/reveal`-Mechanismus**
      (`server.mjs:1233/1282`), der Nachbarn ohne erneuten Netz-Aufruf einblendet.
    - **Bandcamp-Knoten sind View-only-Blätter:** kein Last.fm → kein „weiter erkunden" (`exploreByName`
      findet sie nicht). Im Info-Panel „weiter erkunden" durch **„auf Bandcamp öffnen ↗"** ersetzen
      (Flag `bandcampOnly` am Knoten prüfen, `#expand`/Taste `e`-Pfad abfangen).
    - **Umsetzungsschritte:**
      1. **Server — neuer Endpoint** `POST /api/bandcamp/reveal {id}` (nur `features.bandcamp`/music):
         zieht `discoverTag(genre)` für die `a.genres` des Acts, filtert auf **echten Bandcamp-Longtail**
         (Name noch nicht im Graph; optional Last.fm-Gegencheck via vorhandenem `searchArtistsDetailed`
         — auffindbare überspringen), legt Knoten mit `source:"bandcamp"`, `bandcampOnly:true`, `url` an
         und hängt sie per `addEdge(..., "similar", 0.4, "bandcamp")` an den Act. Analog zur
         `/api/reveal`-Logik, aber **holt** die Kandidaten live (nur hier, nie im normalen `explore()`).
         Gedrosselt/defensiv wie bei `discoverTag` schon (`throttled` + `.catch(()=>[])`).
      2. **Knoten-Flag** `bandcampOnly:true` (+ `url`) — überlebt `migrate` (Blacklist) + `materialize`;
         Client kennzeichnet solche Knoten optisch dezent (z. B. bc-Tönung/Badge).
      3. **Client — Toggle** „Bandcamp-Geheimtipps einblenden" im Entdecken-Popover (`#discoverbox`),
         Zustand in `localStorage`. An/aus ruft den Reveal-Endpoint für den gewählten Act bzw. blendet
         die schon geladenen Bandcamp-Blätter aus/ein (Ausblenden = kein erneuter Fetch).
      4. **Info-Panel** (`renderNodeImage`/`bookingHtml`-Umfeld): bei `bandcampOnly` die
         „weiter erkunden"-Aktion durch „auf Bandcamp öffnen ↗" (`n.url`) ersetzen.
      5. **Feature-Flag** `features.bandcamp` (nur music, Default im UI aus); Health-Probe existiert schon.
    - **Performance-Garantie:** **kein** `discoverTag` im `explore()`-Pfad — ausschließlich im
      Reveal-Endpoint auf Nutzeraktion. Ausgeblendete/nicht angeforderte Bandcamp-Knoten kosten weder
      Netz noch Force-Sim.
    - **Offen/Vorbehalt:** ToS (inoffizielle Endpoints — aber read-light, opt-in, gedrosselt, degradiert
      still); Qualität des Genre-Matchs (durch hidden-by-default entschärft); Heuristik „ist Bandcamp-only"
      (Name-Dedup + optionaler Last.fm-Gegencheck). *Optionaler Spike vorab:* `discoverTag` über ein paar
      Genres sampeln und die Last.fm-Auffindbarkeit messen (quantifiziert den Longtail) — nur auf einem
      echten Deploy lauffähig (externe Hosts hier blockiert).
    - **✅ Umgesetzt (2026-07-17):** Genau nach Plan. **Pack** `packs/music/pack.mjs`: neue Methode
      `bandcampNeighbors(name, {genres})` (Genre-Discovery via `discoverTag`, dedup, defensiv → `[]`)
      + `features.bandcamp:true`. **Server** `POST /api/bandcamp/reveal {id}`: nur wenn
      `pack.bandcampNeighbors` existiert (sonst 400), hängt die Tipps als Knoten mit `bandcampOnly:true`
      + `url` und `similar`-Kante (source „bandcamp") an den Act; **lazy** (nie im explore-/radar-Pfad).
      **Client:** Opt-in-Knopf „⊕ Bandcamp-Geheimtipps" im Info-Panel (`#bandcampRow`, nur `FEAT.bandcamp`,
      nicht für Bandcamp-Blätter, nicht STATIC) → ruft den Endpoint, spielt den Graphen wie `revealMore`
      ein. **Sackgassen-Handling:** Bandcamp-Blätter sind kein Last.fm → alle Explore-Auslöser
      (Doppelklick, e-Taste, Panel-Knopf, Kontextmenü) laufen über `expandOrOpen(n)`, das bei
      `bandcampOnly` die **Bandcamp-Seite öffnet** statt zu erkunden; der Panel-Knopf heißt dann
      „Auf Bandcamp öffnen ↗". DE+EN. **Verifiziert:** `bandcampOnly`+Kante überleben `migrate`+
      `materialize` (Unit-Test); Endpoint-Gate 404/400 (curl); volle Playwright-Suite grün.
      **Live-Vorbehalt:** die echte `discoverTag`-Qualität ist in dieser Umgebung nicht testbar
      (Bandcamp-Host blockiert) — auf einem echten Deploy einmal gegensehen (liefert sinnvolle Tipps?
      wie viele echte Bandcamp-only?). Der optionale Last.fm-Gegencheck (nur echter Longtail) bleibt
      ein möglicher Zusatz.
- [x] **FB16 — Interaktiver HTML-Snapshot-Export (#69).** ✅ Variante **c** umgesetzt: neuer
  Server-Endpoint `GET /api/export.html` bettet den aktuellen Nutzer-Graph + Pack-Config **voll-inline**
  ein (`APP_SPLIT.raw`, keine externen `app.<hash>`-Dateien) → ansehen/zoomen/filtern/Infos/PNG laufen
  **offline**. Die **Klangprobe** läuft über die Live-Instanz (`window.LIKE_API_BASE` = öffentliche URL;
  Client-`GET/POST` nutzen die Basis), CORS ist gezielt **nur für `/api/preview`** freigegeben
  (Preflight + `Access-Control-Allow-Origin: *`). Neuer „HTML"-Knopf im Export-Menü. End-to-end
  verifiziert (Endpoint self-contained, absolute Basis eingebettet, CORS greift). Voll-offline mit
  eingebetteten Vorschau-URLs (Variante b) bleibt bei Bedarf ein späterer Zusatz.

**Stand (2026-07-16):** 11 von 16 umgesetzt — FB3, FB5, FB7, FB12, FB6, FB9, FB10, FB11, FB4, FB14,
FB16 (plus FB8/FB13 via Runde 21). **Offen: nur noch FB15** (Bandcamp) — braucht eine Betreiber-/
Scope-Entscheidung (Bandcamp-Einbindung + ToS), kein reiner Bug. Alle Frontend-/Canvas-Fixes
(FB4/FB5/FB6/FB7/FB9/FB10/FB11/FB12/FB14-UI/FB16-Knopf) sind logik-/syntaxgeprüft, aber im Browser
noch gegenzusehen. Die `feedback`-Issues bleiben offen und werden beim Abhaken geschlossen.

---

## Runde 23 — Neues Testnutzer-Feedback über den ✉-Knopf (2026-07-17)

**Kontext:** 13 neue anonyme `feedback`-Issues **#84–#97** (Stand 17.07., Music-Pack v2.6.0,
aber diesmal packübergreifend: Music, Books, Boardgames, Podcasts, Papers, Plants, Travel).
Erfassen und analysieren — noch **nichts umgesetzt**. IDs `FBn` laufen ab Runde 22 (FB16) weiter
und verweisen 1:1 auf ihr Quell-Issue. (`#90` ist kein Feedback-Issue.)

**Vorbehalt:** Roh-Rückmeldungen, **nicht am Live-Verhalten verifiziert**. Jeder Punkt ist unten
mit einer ersten Code-Analyse hinterlegt; die offenen Punkte je einzeln am echten Code/Browser
gegenprüfen, bevor umgesetzt wird. Ein Teil sind reine Bugs, ein Teil braucht eine Betreiber-/
Scope-/Datenschutz-Entscheidung (unten markiert).

**Verifizierungs-Stand (2026-07-17):** Die code-nahen Punkte **FB18, FB21, FB22, FB25, FB28, FB29**
wurden per paralleler Read-only-Analyse am echten Code gegengeprüft — Ursachen bestätigt, Fixes je
Punkt skizziert (siehe „✓ Verifiziert"-Zeilen). Die Ursachen stehen; die reinen Verhaltensdetails
(Gate-Repro bei FB21, welche Podcast-Seeds bei FB28 durchfallen, Canvas-Optik bei FB22) sind noch
live/im Browser final zu bestätigen. Betreiber-Entscheidungen zu FB17/FB19/FB23/FB24/FB26 sind oben
eingetragen.

### Schnell & klar umrissen (Frontend-Tweaks)
- [x] **FB18 — „+N"-Kugel etwas kleiner, weiterhin dynamisch (#85).** Direkte Nachjustierung von
  FB11: der `pending`-Chip skaliert seit FB11 mit dem Kugelradius (`pendingBadge`:
  `r = max(8/view.k, rr*0.42)`, Position `rr*0.82`). Nutzer findet ihn jetzt *einen Tick zu groß*.
  Faktor `0.42` moderat senken (z. B. `0.34`) und die Mindestgröße beibehalten, damit er beim
  Rauszoomen lesbar bleibt. Trefferfläche (`onPendingBadge`) zieht automatisch mit. Reiner
  Tuning-Wert — im Browser gegensehen.
  - **✓ Verifiziert (2026-07-17, Konfidenz hoch):** Faktor zentral an genau einer Stelle
    (`public/index.html:3745`); Zeichnung/Schrift/Halo/Treffer leiten sich davon ab und skalieren
    automatisch mit. **Fix:** `0.42 → 0.34`, Mindestgröße (`8/view.k`) + Position (`rr*0.82`)
    bleiben. Keine Nebenwirkungen, kein Test-Bruch erwartet.

- [x] **FB19 — „Seite ist im Entstehen"-Hinweis (#86).** Nutzer fragt nach einem dezenten Beta-
  Hinweis („die Seite ist im Entstehen, es kann noch ab und zu was schiefgehen"). **Entscheidung
  getroffen (2026-07-17): dauerhafter Footer-Vermerk** — kleiner, immer sichtbarer Hinweis (DE+EN),
  nicht wegklickbar. Dezent stylen, damit er nicht mit der Bedienung konkurriert.

- [x] **FB22 — „Überrasch mich" lädt neues Buch → Zentralstern ruckelt (#89, Books).** Beim
  Nachladen über Surprise bekommt der neue Eintrag eine frische Position und der Force-Solver
  „reheatet" — der zentrale Knoten springt sichtbar. Vermutlich fehlt hier das kalte Einspielen
  (analog FB5: `rebuild(prev, 0)` statt Reheat) bzw. der neue Knoten sollte am Rand statt in der
  Mitte spawnen (vgl. R18-Kommentar „freien Startplatz suchen"). Am Books-Pack im Browser
  reproduzieren, dann Spawn/Reheat dämpfen. (Gilt sinngemäß für alle Nicht-Music-Packs.)
  - **✓ Verifiziert (2026-07-17, Konfidenz hoch für Ursache):** Zwei Kanäle zusammen: (1) Surprise ruft
    `exploreByName(name)` **ohne Optionen** → Default `reheatAmt=0.4` (`index.html:4452/6552`) → `reload`
    → `rebuild(prev, 0.4)` → `reheat(0.4)` (`index.html:2702`) weckt ALLE Knoten inkl. Zentralstern.
    (2) Ein unbekannter Surprise-Act hat keinen platzierten Nachbarn (`cnt===0`) und spawnt **exakt in
    der Bildmitte** auf dem Zentralstern (`index.html:2570`, Waisen `2628-2631`); `freeSpot` landet
    direkt daneben → starke Nahabstoßung (`REP/d²`) schießt die Sonne an. **Fix (pack-neutral):**
    unverbundene neue Seeds am **Rand** der Bounding-Box spawnen statt in der Mitte (`cnt===0`-Zweig
    ändern), optional FB5-analog Zentralstern kurz `pinned`. Nur `reheatAmt` senken reicht NICHT.
    **Im Browser (Space+Flat, Books + ein weiteres Nicht-Music-Pack) gegensehen.**

### Zu verifizieren / entscheiden (Bugs & UX)
- [x] **FB21 — „Überrasch mich" bei Boardgames: Fehler-401-Toast (#88).** `/api/surprise` liefert
  nur einen Namen (`surpriseFrom(SURPRISE_SEEDS, popularity)`); den lädt der Client anschließend
  über `/api/explore`. Der 401 kommt **nicht** aus `/api/surprise`, sondern sehr wahrscheinlich aus
  dem „Coming soon"-Gate: gesperrte Packs antworten mit `send(res, 401, {error:"locked"})`
  (`server.mjs`). Boardgames ist nicht das öffentliche Pack (`LIKE_PUBLIC_PACK=music`), d. h. ohne
  gültiges Unlock-Cookie schlägt der Folge-Call fehl. **Erst live prüfen:** (a) ob der Toast wirklich
  vom Gate stammt (dann Unlock-Zustand/Redirect sauberer behandeln, statt eines nackten 401-Toasts)
  oder (b) ob boardgames-`popularity`/`explore` selbst 401t. Gemeinsame Wurzel mit FB28.
  - **✓ Verifiziert (2026-07-17, Konfidenz hoch für Ursache):** Der 401 kommt aus dem **Gate**, nicht
    aus dem Pack. `server.mjs:986-991` blockt vor JEDER Pack-Route (`isLockedPack && !isUnlocked` →
    `401 {error:"locked"}`) — betrifft `/api/surprise` und den Folge-`/api/explore`. Der Pack kann
    kein 401 werfen (BGG-Fehler sind gefangen). Auslöser: boardgames-Seite war bei Ladezeit
    freigeschaltet, aber das `like_unlock`-Cookie fehlt/abgelaufen beim Klick; der `#surpriseBtn`
    wird bei gesperrtem Pack **nicht** ausgeblendet (`index.html:6544` prüft nur STATIC/FEAT).
    **Fix:** Gate-401 (`error:"locked"`) zentral in den API-Wrappern (`index.html:2013/2020`) abfangen
    → `unlockThen(CFG.id, reload)` statt nacktem Toast; zusätzlich `#surpriseBtn` bei `packLocked`
    deaktivieren. Deckt Surprise + Explore + alle gated Calls in einem Rutsch ab. **Live mit gesetztem
    `LIKE_UNLOCK_PASSWORD` + gelöschtem Cookie exakt reproduzieren.**

- [x] **FB28 — „Überrasch mich" bei Podcasts: nur Apple, Fehlermeldung nennt alle Quellen (#96).**
  Der Podcasts-Pack sucht ausschließlich über iTunes (`searchPodcast` → `itunes.apple.com/search`).
  Findet Apple den Surprise-Seed nicht, scheitert das Laden und der Fehler-Toast listet offenbar die
  Quellen auf. Zwei Teile: (1) **Quelle** — Fallback über eine zweite Quelle (z. B. TasteDive/
  Genre-Nachbarn, die der Pack schon für die Brücke nutzt) oder Seeds strikt auf iTunes-auffindbare
  beschränken; (2) **Fehlertext** — keine internen Quellennamen im Nutzer-Toast, nur eine neutrale
  Meldung („gerade keine Empfehlung gefunden, nochmal versuchen"). Live gegen die iTunes-Suche prüfen.
  - **✓ Verifiziert (2026-07-17, Konfidenz hoch für Codepfad):** `searchPodcast` (`packs/podcasts/
    pack.mjs:26-35`) ist der EINZIGE Resolver (iTunes, `limit=1`, ohne `country` → US-Store).
    Wurzel des geleakten Quellennamens: `surpriseFrom` (`lib/surprise.mjs:5-18`) gibt **nie null**
    zurück (`return best || pick()`) → ein bei Apple unauffindbarer Seed wird trotzdem als `name`
    durchgereicht, `/api/surprise` liefert `{ok:true}`, der Client ruft `exploreByName`, `explore()`
    wirft `„…" nicht bei Apple Podcasts gefunden` (`pack.mjs:220`) → 502 → `toast("Fehler: "+msg)`
    (`index.html:4489`). `null`-Treffer werden 14 Tage gecacht → „klebrig". **Fix (empfohlen):**
    (a) `surprise()` gibt nur einen von `searchPodcast` **auflösbaren** Seed zurück, sonst **null** →
    dann greift automatisch der schon vorhandene neutrale Toast (`index.html:6553`, Wortlaut ggf.
    anpassen); (b) den generischen Explore-Fehler (`pack.mjs:220`/`index.html:4489`) für getippte
    Suchen **nicht** anfassen. **Live prüfen:** welche der dt. Seeds im US-Store durchfallen und ob
    `country=de` (analog `byGenre`) hilft; Cache ggf. leeren.

- [x] **FB25 — „Entdecken"-Menü: redundante/verwirrend ähnliche Funktionen (#93, Music).** Bestand
  heute: der `#discoverBtn`-Popover (`discoverbox`) enthält **Überrasch mich · Szenen · Brückenbauer**,
  daneben gibt es separat **Radar** (`#radarBtn` bzw. `#mRadar` im Booking-Modus) und **✦ Überrasch
  mich** nochmal als Empty-State-Button (`#surpriseBtn`). „Überrasch mich" und „Radar" existieren also
  doppelt/parallel an verschiedenen Stellen — das ist die gemeinte Redundanz. **Entscheidung nötig:**
  Entdeck-Werkzeuge (Radar, Überrasch mich, Szenen, Brückenbauer) an *einem* Ort bündeln und die
  Dubletten entfernen; Beschriftungen schärfen. UX-Umbau, kein Bug — erst Konzept, dann umsetzen.
  - **✓ Verifiziert (2026-07-17):** Kern-Redundanz ist **nicht** bloße Doppelung, sondern **„Überrasch
    mich" zweimal mit gleichem Wortlaut, aber unterschiedlicher Funktion**: der Empty-State-Button
    `#surpriseBtn` (`index.html:974`) lädt serverseitig einen **neuen unbekannten Act** (`/api/surprise`,
    mit Genre-Feld), während `#discSurprise`/Fun-Modus-`#discoverBtn` (`5705`/`1964`) `surpriseMe()`
    aufruft = **Client-Streifzug durchs bestehende Netz** (braucht ≥2 Knoten, kein Genre). Weiter: Radar
    sitzt als eigener Topbar-Knopf **neben** statt **im** Entdecken-Popover (`#radarBtn` `850` vs.
    Popover `1035-1050`); `#mRadar`/`#mDiscover` sind nur Mobile-Proxys (keine echten Dubletten).
    **Konzept-Vorschlag:** (1) Radar als vierten `.ditem` ins Popover holen, `#radarBtn` aus der Topbar
    nehmen; (2) den Netz-Streifzug umbenennen (z. B. „Streifzug"), damit „Überrasch mich" eindeutig der
    Empty-State-Act-Lader bleibt; (3) Empty-State-Surprise + Genre-Feld bewusst getrennt lassen.
    **→ Entscheidung getroffen (2026-07-17): den Netz-Streifzug umbenennen** (Empty-State bleibt
    „✦ Überrasch mich" = Act laden; Popover-Eintrag `#discSurprise`/Fun-Modus wird zu „Streifzug",
    DE+EN). Radar zusätzlich ins Entdecken-Popover holen, `#radarBtn` aus der Topbar nehmen.
  - **✅ Umgesetzt (2026-07-17) — Namenskollision aufgelöst (Kern von #93):** Der Netz-Streifzug heißt
    jetzt überall **„Streifzug"** (Popover `#discSurprise`, Fun-Modus-`#discoverBtn`, `#mDiscover`,
    DE+EN); **„✦ Überrasch mich" bleibt allein dem Empty-State-Act-Lader** (`#surpriseBtn`). Damit tun
    die beiden nicht mehr Verschiedenes unter gleichem Namen.
  - **⏸ Offen (Design-Entscheidung, NICHT Teil der Naming-Frage):** Radar ins Popover holen +
    `#radarBtn` aus der Topbar nehmen. Zurückgestellt: Radar ist prominent (eigenes Tour-Slide) — es
    zu vergraben senkt die Sichtbarkeit. Braucht eine bewusste Entscheidung.

- [x] **FB26 — „like papers" ist missverständlich („Papier") → „like Science" (#94).**
  **Entscheidung getroffen (2026-07-17): Anzeigename → „Science"**, **Pack-ID/URL `?pack=papers`
  bleibt** (Kompatibilität). Nur das Label ändern: Landing-Kachel, Titel/`<title>`, Intro/Copy in
  DE+EN. Pack-interne IDs, Datenpfade und Endpoints unangetastet lassen.

- [x] **FB17 — Geschmacks-Knopf raus, „Aufräumen" kontextabhängig als Ecken-Nudge (#84, Music).**
  Zwei Wünsche: (1) ✅ **erledigt** — der **◈ Geschmacks-Fingerabdruck-Knopf** (`#tasteBtn`) samt
  Verdrahtung (Topbar-Button, `#mTaste`, Modal `#tasteModal`/`#tasteBody`, Handler, CSS `.tastebody`,
  i18n, `API.taste`, Escape-/Guard-Referenzen) wurde entfernt. Der Server-Endpoint `/api/taste` bleibt
  (Read-only, von der E2E-Suite geprüft), hat aber keine UI mehr. (2) ✅ **erledigt (2026-07-17):** der
  **Aufräumen-Knopf** (`#tidyBtn`) bleibt, aber zusätzlich erscheint ein **dezenter Ecken-Nudge**
  (`#tidyNudge`, unten mittig, wegklickbar) **erst bei Fülle**. Heuristik (einfach & günstig, nach
  jedem `rebuild`): **≥40 Knoten UND seit letztem Aufräumen/Ausblenden ≥12 dazugekommen**. „Aufräumen"
  im Nudge ruft `sortLayout()`; Aufräumen (Knopf oder Nudge) und „×" setzen die Baseline zurück
  (`ackTidy`), damit erst spürbares Weiterwachsen erneut hinweist. Unterdrückt bei offenem
  Modal/Listenansicht und im STATIC-Snapshot.

### Betreiber-/Datenschutz-Entscheidung (Pushover-Tracking)
- [x] **FB23 — Screen & Sprache ins Pushover-Signal (#91, Books).** `notifyVisitMaybe` meldet heute
  Pack, maskierte IP-Region, User-Agent, Referer. **Entscheidung getroffen (2026-07-17): Screen-Größe
  + UI-Sprache zusätzlich melden.** Beide liegen nur im Client → einmalig, dezent an den Visit-Ping
  mitgeben (Viewport-Größe + `navigator.language`), **ohne neuen Identifikator**, in `notifyVisitMaybe`
  an die bestehende Meldung anhängen. Kein Personenbezug über das bisherige Besuchs-Signal hinaus.
  - **⚠️ Beim Merge abgelöst (2026-07-17):** Parallel wurde auf `main` (PR #98) das Besuchs-Signal
    grundlegend umgebaut — statt der „neuer Besuch"-Meldung (`notifyVisitMaybe`) gibt es jetzt ein
    Sitzungs-Ende-Beacon (`/api/visit/end` → `notifyVisitEnd`), das **Sprache, Gerät/Browser, Pack,
    Konto-Status, Kartengröße, genutzte Funktionen und Verweildauer** erfasst. Das deckt FB23s Ziel
    (welche Sprache/welcher Screen) besser ab. Meine FB23-Ankunfts-Variante wurde beim Merge daher
    **verworfen** (main's System übernommen). Einziger nicht übernommener Teil: die **exakte
    Screen-Auflösung** — ließe sich bei Bedarf leicht in main's Beacon ergänzen (Follow-up).
- [ ] ~~**FB24 — Letzten Klick/letzte Aktion ins Pushover-Signal (#92, Books).**~~ **Entscheidung
  getroffen (2026-07-17): NICHT umsetzen.** Wäre Verhaltens-Tracking und kollidiert mit der „anonym,
  keine Session"-Zusage im Impressum. Bewusst verworfen — Issue #92 wird mit dieser Begründung
  geschlossen.

### Große Bretter (eigene Vorhaben)
- [x] **FB20 — Intro-Tour packübergreifend korrekt + USABILITY.md (#87, Boardgames).** Die Tour-Slides
  (`tourT1`–`tourT5` in `public/index.html`) sind musik-/„Act"-/„Last.fm"-/„Radar"-lastig formuliert
  und werden in **allen** Packs gleich gezeigt — für Boardgames/Books/… stimmen Begriffe und teils
  Funktionen nicht mehr mit der realen Bedienung überein. Zwei Stränge: (1) Tour-Copy an die reale,
  pack-neutrale Bedienung angleichen (Nomen aus der Pack-Config statt hart „Act"); (2) Nutzer-Idee
  einer **`USABILITY.md`** aufgreifen — eine gepflegte Funktions-/UI-Referenz (jede Funktion + wo sie
  sitzt), die als Single Source für Tour, Hilfe und künftige Änderungen dient. Empfehlung: `USABILITY.md`
  zuerst als Bestandsaufnahme anlegen, daraus die Tour korrigieren. Sinnvoll — ja.
  - **✅ Umgesetzt (2026-07-17):** (1) **`USABILITY.md`** angelegt — vollständige Funktions-/UI-Referenz
    (Konzept, beide Modi, Topbar, Canvas-Interaktionen, Info-Panel, Entdecken-Popover, Radar, Listen,
    Export, Löschen, Feedback, Shortcuts, **Pack-/Feature-Matrix**, Beta/Gate). In `CLAUDE.md` als
    Single Source verlinkt. (2) Tour pack-neutral vervollständigt: Slide 1–4 waren es schon (via `tf()`
    aus `CFG`), **Slide 5 (`tourT5`/`tourP5`) war noch hart „Acts"/„hören"** → jetzt aus `CFG.item.plur`
    (DE+EN); Slide 2 nennt jetzt auch den Einfach-Klick. Musik behält die handgetexteten Slides.
    **Hinweis/Regression gefixt:** Slide 5 ist der **Profi-Slide** (Szenen/Brücken) und wird im
    Fun-Modus (Default) bewusst entfernt (`.slide[data-s="4"].remove()`); das unbedingte Setzen von
    `tourT5`/`tourP5` warf dort einen null-Zugriff (PAGEERROR) → jetzt defensiv geguardet. Im
    Profi-Modus erscheint Slide 5 pack-neutral, im Fun-Modus bleibt er ausgeblendet.
    *Follow-up möglich:* ein tieferer Per-Pack-Wortlaut-Feinschliff, aber die faktischen Ungenauigkeiten
    (falsches Nomen, „hören" ohne Klangprobe) sind raus.
- [x] **FB27 — Bild im Info-Sidebar (#95, Plants; wirkt packübergreifend).** Das Info-Panel (`.panel`,
  rechts, 320px) zeigt heute Text/Kontext, kein Bild. Wunsch: ein Bild je Eintrag, für Plants
  idealerweise eine **historische Zeichnung (à la Haeckel/gemeinfrei)**. **Analyse/Entscheidung nötig:**
  woher das Bild kommt — Wikipedia-/Wikimedia-Thumbnail (schon per Kontext erreichbar, aber Lizenz je
  Bild prüfen) vs. gemeinfreie Illustrationsquellen (Haeckel-Tafeln liegen als PD auf Wikimedia). Sauber
  wäre ein optionales `image`/`thumb`-Feld pro Pack (nur wo es eine gute, lizenzklare Quelle gibt) +
  eine Bildzeile im Panel mit Quellen-/Lizenzhinweis. Scope: Bildquelle + Lizenz + Panel-Layout.
  - **✅ Umgesetzt (2026-07-17):** Generisches `image = { src, credit, href }` am Knoten + Panel-Widget
    `#pImg` (`renderNodeImage`, für **jeden** Pack, der ein Bild liefert) — mit **Pflicht-Attribution +
    Lizenz** als Caption und Link zur Quelle; `referrerpolicy=no-referrer`, `onerror` blendet aus.
    **Plants** liefert das Bild aus dem **iNaturalist-Standardfoto** (`default_photo.medium_url` +
    `attribution` + `license_code`) in `explore()` **und** `enrich()`; Server persistiert es
    (`src.image`/`a.image`), die Enrich-Response reicht `image`+`coord` an den Client, damit auch
    **Nachbarknoten** ohne Reload ein Bild bekommen. `renderNodeImage` unit-getestet. Statt der
    Haeckel-Zeichnung echte CC-Fotos (lizenzklar, automatisch, immer vorhanden) — Haeckel-Tafeln
    wären ein späterer kuratierten Zusatz. Live (Netz) im Browser noch gegenzusehen.

- [x] **FB29 — Kleine Karte im Info-Sidebar bei Travel (#97).** Wunsch: bei `travel` eine Mini-Karte
  „wo liegt das?" im Info-Panel — Nutzer selbst schlägt vor, dass notfalls **Land genügt**. **Analyse:**
  keine Google-API nötig; Optionen (a) statisches, gemeinfreies SVG-Weltkarten-Mini mit gesetztem
  Marker aus Lat/Lon (kein Netz, keine Keys — bevorzugt), (b) eingebettete OSM-/Wikimedia-Karte
  (externer Tile-Server, ToS/Netz), (c) nur Land + Flagge als Text/Emoji (minimal). Travel-Pack liefert
  vermutlich schon Koordinaten/Land über seine Quelle — erst prüfen, dann Variante (a) als
  key-/netzfreie Lösung. Scope: Datenverfügbarkeit (Lat/Lon) + Panel-Widget.
  - **✓ Verifiziert (2026-07-17, Konfidenz hoch):** **Lat/Lon existiert bereits im Backend, wird aber
    nicht ans Frontend geliefert.** `lib/travel.mjs:122-140` holt Wikivoyage-Koordinaten
    (`coord={lat,lon}`), `packs/travel/pack.mjs:196` nutzt sie schon für „km ab Zuhause"/`geoNearby` —
    aber der `explore()`-Return (`pack.mjs:213-222`) und `server.mjs` persistieren `coord` **nicht**.
    Land/Region sind unzuverlässig (Nominatim-`country` nur wenn Wikivoyage keine Koordinaten hat).
    Kein Weltkarten-SVG und kein Bild-Feld im Panel vorhanden; Einfügepunkt: neues `<div id="pMap">`
    nach `#pSub`/`#pGenres` (`index.html:1284-1285`), Render in `selectNode()` (`4054-4090`).
    **Empfehlung Variante (a):** (1) `coord` in `explore()`-Return + Server-Persistenz durchreichen
    (`materialize` reicht es dann automatisch weiter), (2) gemeinfreies Äquidistant-Weltkarten-SVG als
    Asset hinzufügen (Lizenz klären: Natural Earth / Wikimedia BlankMap, PD), Marker per
    Equirektangular-Projektion, (3) Land+Flagge als Fallback ohne Koordinaten. **Offen:** nur der Seed
    hat sicher `coord` (Nachbarknoten ggf. via `enrich` nachladen); SVG-Lizenz.
  - **✅ Umgesetzt (2026-07-17):** (1) `coord` wird jetzt durchgereicht — `explore()` **und** `enrich()`
    im Travel-Pack liefern `{lat,lon}`, der Server persistiert sie am Knoten (`src.coord`/`a.coord`,
    überlebt `migrate` (Blacklist) + `materialize`). (2) Info-Panel-Widget `#pMap` (`renderMiniMap`,
    nur `CFG.id==="travel"` mit Koordinaten): **key-/netzfrei** — inline gezeichnete äquidistante
    Weltkarte (Gradnetz + betonter Äquator/Nullmeridian) mit Marker aus Lat/Lon; Klick öffnet die
    genaue Stelle auf OpenStreetMap; Caption zeigt die Koordinaten. **Bewusst als self-contained v1
    ohne externes Asset** (keine Lizenzfrage). *Mögliches Follow-up:* das Gradnetz später durch ein
    gemeinfreies Küstenlinien-SVG (Natural Earth / Wikimedia BlankMap) ersetzen — dann ist die
    Kontinent-Silhouette erkennbar. Projektion + Branch-Logik per Unit-Test verifiziert; Live-Explore
    (Netz) im Browser noch gegenzusehen.

---

## Arbeitsweise (Runde 23)
Backlog erst vollständig erfasst. Umsetzung danach **Punkt für Punkt**, je einzeln am echten
Code/Browser verifizieren, sinnvolle Commits, PR — **nicht ungefragt mergen**. Reihenfolge-Vorschlag:
zuerst die klaren Frontend-Tweaks (FB18/FB19/FB22) und die Surprise-Bugs (FB21/FB28), dann die
UX-Umbauten (FB25/FB17) und die großen Bretter (FB20/FB27/FB29); FB23/FB24/FB26 warten auf eine
Betreiber-Entscheidung. Die `feedback`-Issues bleiben offen und werden beim Abhaken geschlossen.
## Runde 23 — Intro-Feinschliff: Kreuz-Fokuskasten + Login-Vorteil (2026-07-17)

Kleiner UX-Befund aus dem Testnutzer-Screenshot: beim Öffnen der Willkommens-Tour lag ein
brauner UA-Fokuskasten ums Schließen-„×" (rechts oben) — sah aus wie ein zweiter Rahmen.
Ursache: `openIntro()` setzte den Fokus direkt auf `#introSkip`. Zusätzlicher Wunsch: die Tour
soll warm mit „Viel Spaß!" enden UND dezent auf den Login-Vorteil hinweisen.

- [x] **Fokuskasten ums „×" weg.** `openIntro()` fokussiert jetzt die Dialog-Karte selbst
  (`.introcard` mit `tabindex="-1"`, `outline:none`) statt den Schließen-Knopf — Screenreader/
  Tastatur bekommen den Fokus weiterhin in den Dialog (der Tab-Trap greift unverändert), aber
  ohne sichtbaren Kasten. Das „×" bekam zudem einen dezenten Hover-Hintergrund + saubere
  `:focus-visible`-Umrandung (Tastatur-Nutzer sehen weiter einen Ring).
- [x] **„Viel Spaß!" auf dem letzten Slide.** Im Stöber-Modus (Standard) stand es schon auf dem
  jetzt letzten Slide „Sammeln & exportieren"; im Profi/Booking-Modus fehlte es auf dem
  Szenen-Slide (`tourP5`) — dort ergänzt (DE + EN-Fassung).
- [x] **Login-Vorteil-Hinweis am Tour-Ende.** Dezent abgesetzte Zeile auf dem letzten Slide
  (nur live & solange nicht angemeldet, nicht im STATIC-Export): „↗ Anmelden lohnt sich: dann
  bleiben Karte, Likes & Notizen dauerhaft — und auf allen Geräten gleich." Klick öffnet direkt
  die Registrierung (wie der Hinweis auf dem leeren Start-Screen), Enter/Space ebenso.

**Verifiziert:** `npm run check`-Smoke grün (10 Packs, ein Server). Zusätzlich mit echtem
Chromium gegen `server.mjs` gefahren: Tour öffnet automatisch, Fokus liegt auf `.introcard`
(nicht mehr am „×"), Login-Hinweis + „Viel Spaß!" erscheinen DE & EN auf dem letzten Slide,
keine neuen Konsolenfehler (nur der bekannte externe Zertifikatsfehler). Nur `public/index.html`
geändert.

---

## Runde 24 — Domänen-Reife-Bewertung (Phase 1: Assessment) (2026-07-17)

Diese Runde ist das Ergebnis einer vollständigen Reifegrad-Bewertung aller 10 Packs plus der Querschnitt-Aspekte (Landing, SEO, PWA, i18n, Recht, Sicherheit, Tests/CI, A11y, Doku, Betrieb). Grundlage ist die Fokus-Entscheidung aus ROADMAP.md: **Like Music ist DAS Produkt (Produktionsqualität), die übrigen 9 Packs sind Labs** — für Labs gilt „Reife = wie nah an einer ehrlichen Freischaltung", für Music die höhere Messlatte Produktionsqualität. Externe Such-APIs waren in der Bewertungsumgebung nicht erreichbar; bewertet wurde der Code/die Logik. Phase 2 (die Abarbeitung) ist unten priorisiert und phasiert. Reihenfolge: hoch/S zuerst, Music-Qualität vor Labs-Parität, aber Ehrlichkeits-, Rechts- und Sicherheits-Defizite ranghoch.

### Reifegrad-Matrix

| Domäne / Aspekt | Tier | Fazit |
| --- | --- | --- |
| Like Music (music) | **mature** | Referenz-Pack: echte blau/orange-Relationen, volle Feature-Tiefe, EN praktisch vollständig, starke Robustheit. Restrisiken: RA inoffiziell, Songkick tot, Detailpolitur. |
| Like Movies (movies) | solid | TMDB liefert echtes Blau + verhaltensbasiertes Orange, ehrliche Flags. Offen: de-DE-Verdrahtung, explore-Degradation, seedChips. |
| Like Board Games (boardgames) | solid | Ehrliche verhaltensbasierte Relationen, EN vollständig. Offen: irreführendes „Designer/Verlag"-Label, Politur. |
| Like Science (papers) | solid | Erstklassiges Blau (S2/SPECTER) + echte Ko-Autorschafts-Orange. Offen: falsche Demo-Kanten, radarExtras. |
| Like Plants (plants) | solid | Ehrlich auf iNaturalist, echte Relationen, EN vollständig. Offen: iNat-Ratelimit, „Merkmale"-Mislabel, seedChips. |
| Like Anything (anything) | solid | Freischalt-nächster Pack: keyfrei, EN vollständig, vorbildliche Cache-Disziplin. Offen: Knoten-Ausschlussfilter, Orange relevanz-ranken. |
| Like Podcasts (podcasts) | beta | Ehrlich etikettiert, echte Episoden-Preview. Blocker: Blau = Genre-Topcharts, Null-Caching, seedChips. |
| Like Books (books) | beta | Funktionsfähig, ehrlich, EN vollständig. Blocker: Blau = Genre-Kanon, Ausgaben-Dubletten. |
| Like Games (games) | beta | Live Review-Popularität, echte Tag-Schnittmenge. Blocker: Orange unpräzise (Textsuche), keine Dedup, SteamSpy ohne Retry. |
| Like Travel (travel) | beta | Beste Konzept-Passung. Blocker: Orange durch 10-km-Klemme degradiert (Labels lügen), Blau nur Rangproxy. |
| Landing-Page | solid | Kohärent, echter Konzept-Transfer. Offen: Baustellen-Footer, primärer CTA, echtes Share-Preview, Produkt-nahe Erst-Ansicht. |
| SEO / Meta / Social | solid | Durchdachtes Grundgerüst. Offen: JSON-LD, echte Share-Bilder, hreflang, SEO-Tests. |
| PWA & Offline | solid | Sauberer Service-Worker, vollständiges Manifest. Offen: „Update verfügbar"-UX, Share-Meta, Manifest-Politur. |
| i18n-System | solid | Vollständige Overlays. Offen: ~40 deutsche Server-Fehler, radarExtras-Reasons, CI-Absicherung. |
| Recht & Datenschutz | solid | Reife, ehrliche Basis. Offen: Impressum-E-Mail/Anschrift, AGPL-§13, Teilen/Feedback-Transparenz, ToS-Risiko. |
| Sicherheit & Server-Robustheit | solid | Starkes Fundament. Offen: CSP, Rate-Limits, anon-Namespaces, Security-Tests. |
| Test-Abdeckung & CI | solid | Überdurchschnittlich. Offen: CI-Gate nur 6/10 Specs, keine a11y-Automatisierung, keine Server-Unit-Tests. |
| Konsistenz & Doku | beta | Umfangreich, aber Drift: USABILITY (Radar/IDs), ROADMAP-Rumpf, Music-only-README, fehlende Wächter. |
| Accessibility (A11y) | beta | Solides Fundament. WCAG-A/AA-Blocker: Seiten-Zoom aus, kein Toolbar-Fokusring, keine Fokus-Rückgabe, null a11y-Tests. |

---

### Phase 2a — Music-Produktionshärtung (Flaggschiff zuerst)

- [ ] **Preview-Fallbacks umgehen den Namensvetter-Guard.** [mittel/S · music] plausibleFans greift nur im ersten preview-Zweig; trackPreviewSearch/previewByName können die Klangprobe des berühmten Gleichnamigen spielen. → fans/listeners-Plausi auf beide Fallback-Zweige anwenden (pack.mjs:304-311).
- [ ] **radarExtras-Begründungen hart deutsch im LIVE-Radar.** [mittel/S · music/i18n] server.mjs:1907 reicht Reasons ungefiltert durch, pack.mjs:371-387 erzeugt sie deutsch. → sprachneutral als {key,vars} zurückgeben und via trPack übersetzen (lang liegt in /api/radar vor).
- [ ] **Orange-Kante hängt einseitig an inoffizieller RA-Quelle.** [mittel/L · music] In Prod trägt fast nur RA das Booking-USP; bei Ausfall still auf blau-only. → zweite offizielle together-Quelle (ListenBrainz) einziehen und degradierte Quelle im UI signalisieren (coappear.mjs:26-38).
- [ ] **Songkick-Adapter real tot, aber als together-Quelle gelistet.** [niedrig/S · music] → entfernen oder als deprecated markieren; Quellenliste ehrlich halten (coappear.mjs:37).
- [ ] **MBID-Schärfe reicht nicht durch die Kette.** [niedrig/M · music] RA/Deezer/MB lösen nur namensbasiert auf → bei Namensvettern falsches Umfeld. → MBID durchreichen bzw. Fans-Plausi ergänzen; Doku ehrlich auf Last.fm einschränken.
- [ ] **Demo-Daten zu dünn fürs Flaggschiff.** [niedrig/M · music] Nur ein Cluster, keine Booking-/Status-/Lineup-Demo. → 2-3 Cluster, together-Kanten mit Show-Metadaten, Beispiel-Status/Notizen (demo.json).
- [ ] **MusicBrainz-Lucene-Query strippt Quote statt zu escapen.** [niedrig/S · music] → Quote sauber escapen, End-Backslash entfernen (musicbrainz.mjs:26,38).

### Phase 2b — Ehrlichkeit, Recht & Compliance (rang-hoch)

- [ ] **Impressum ohne E-Mail-Adresse (§ 5 Abs. 1 Nr. 2 TMG).** [hoch/S · Recht] → E-Mail aus LIKE_IMPRINT_EMAIL rendern (mailto, DE+EN), sonst todo-Hinweis; ENV als Pflicht dokumentieren (server.mjs:190,236).
- [ ] **Ladungsfähige Anschrift/Name standardmäßig Platzhalter.** [hoch/S · Recht] → LIKE_IMPRINT_NAME/_ADDRESS als Pflicht-ENV; npm run check/Deploy-Smoke schlägt fehl bei „[Straße]" im /impressum (server.mjs:192-197).
- [ ] **Baustellen-Footer widerspricht Music als Produktionsprodukt.** [hoch/S · Landing] → „🚧"-Vermerk aus dem globalen Footer entfernen, höchstens an gegatete Labs hängen (server.mjs:150; landing.mjs:427).
- [ ] **boardgames-Label „Designer/Verlag", Code nur Designer.** [mittel/S · boardgames] → Labels DE+EN auf „vom selben Designer" kürzen oder gamesByPublisher() nachrüsten (pack.mjs:81,95,121,135).
- [ ] **AGPL-§13-Quelltext-Angebot Netznutzern nicht sichtbar.** [mittel/S · Recht] → dauerhaften „Open Source (AGPL-3.0) — Quelltext: <Repo-URL>"-Hinweis in Footer/Impressum (REPO_URL existiert).
- [ ] **Teilen-Links (/s/) und Feedback-Repo intransparent.** [mittel/S · Recht] → DS um öffentlichen Snapshot ergänzen (+ noindex); Feedback-Repo garantiert privat oder Formulierung abschwächen (github-issues.mjs:14; server.mjs:272,306).
- [ ] **ToS-Risiko RA/Bandcamp im LIVE-Betrieb + Kill-Switch.** [mittel/L · Recht] → Feature-Degradation absichern, offizielle Quellen prüfen, ENV-Kill-Switch; Entscheidung in ROADMAP/NOTES dokumentieren.
- [ ] **Durchgängige Datenquellen-Attribution (CC-BY-SA Text/Daten).** [mittel/M · Recht] → pro Pack Quellen-/Lizenzzeile im Info-Panel + Rechtstexten (Wikipedia CC BY-SA inkl. Link/Share-Alike), zentral generiert.
- [ ] **Konto-Selbstlöschung + Datenexport (DSGVO Art. 17/20).** [niedrig/M · Recht] → „Konto löschen"-Endpoint/Button und „Meine Daten exportieren"; echte Kontakt-E-Mail (server.mjs:316).
- [ ] **Rechts-Konsistenz: Quellenliste, § 25 TTDSG, AGB.** [niedrig/M · Recht] → Impressum/DS-Quellenlisten angleichen; like_anon-Erforderlichkeit benennen; schlanke /nutzung (DE+EN) ergänzen.

### Phase 2c — Sicherheit & Betrieb (Produktions-Härtung)

- [ ] **Render-PR-Previews laufen mit offenem Labs-Gate.** [hoch/S · Deploy] LIKE_UNLOCK_PASSWORD sync:false = „alles offen" in Previews. → Passwort für Previews setzen oder LIKE_PREVIEW=1 erzwingt Gate; X-Robots noindex auf Nicht-Prod; test:ci-Regression.
- [ ] **Keine Content-Security-Policy.** [hoch/M · Sicherheit] → restriktive Basis-CSP (object-src none; base-uri self; frame-ancestors self; connect-src auf genutzte Hosts), Report-Only zuerst; script-src via Nonce statt unsafe-inline (server.mjs:471).
- [ ] **Kein Rate-Limit auf teuren Endpoints; /api/preview ACAO:\*.** [hoch/M · Sicherheit] → Pro-IP-Token-Bucket vor explore/radar/preview/geocode/context/bridge; ACAO:* auf Snapshot-Origins einschränken (server.mjs:1331,1749,1784).
- [ ] **Unbegrenzte anonyme Namensräume (Disk-Fill-DoS).** [mittel/M · Robustheit] → Anon-Writes pro IP drosseln + harte Obergrenze Ordnerzahl/Bytes; TTL senken (server.mjs:549-583).
- [ ] **Crash-Handler + Graceful-Shutdown fehlen.** [mittel/S · Ops] → uncaughtException/unhandledRejection-Handler; SIGTERM → usage-flush() + server.close mit Draining.
- [ ] **Dockerfile ungehärtet.** [mittel/S · Deploy] → USER node; HEALTHCHECK gegen /api/health; .dockerignore um Secret-Muster (deny-by-default).
- [ ] **Feedback/clienterror: globale Drossel + Markdown-Injection.** [mittel/S · Sicherheit] → Drossel pro IP; Nutzertext in Codeblock/neutralisieren (server.mjs:1194-1240; github-issues.mjs:70).
- [ ] **Keine Observability (Fehler/Quellenausfall).** [mittel/M · Betrieb] → strukturierte Request-Logs + Fehlerraten-/Quellenausfall-Alarm über Pushover; clienterror auswertbar.
- [ ] **Backup/Disaster-Recovery.** [mittel/M · Datenhaltung] → Off-Disk-Snapshot von /data + Disk-Auslastungsalarm.
- [ ] **Sicherheits-Regressionstests fehlen.** [mittel/M · Test] → CSV-Formel-Escaping, Security-Header/Cookie-Flags, Auth-429, 413/400 assertieren.
- [ ] **Auth-/Session-Härtung.** [niedrig/M · Sicherheit] → Origin-Check auf POSTs; Zeitstempel/Session-Version in Signatur; .session-secret mode 0600 + LIKE_SESSION_SECRET erzwingen; generische Reset-Antwort; shares/-TTL-Sweep.

### Phase 2d — Labs: Ehrlichkeit, Inhalt & Freischalt-Blocker

- [ ] **travel: Geosuch-Radius auf 10 km gekappt — Orange verfehlt Tagesausflüge, Region-Labels lügen.** [hoch/M · travel] → mehrere versetzte Geosuchen + Haversine-Filter oder Link-Hierarchie ranken; Minimum: Kommentare/Labels ehrlich (travel.mjs:190; pack.mjs:210,272).
- [ ] **games: Orange per Storefront-Textsuche statt Feld-Match.** [hoch/M · games] → Treffer via spy(appid).developer gegenfiltern (exakter Match), sonst [] (pack.mjs:108-119).
- [ ] **podcasts & books: Blau liefert generischen Genre-Kanon.** [hoch/M · podcasts,books] → auf echte Genre-/Subject-Schnittmenge ranken (wie Games/E14), TasteDive bei Key höher; bis dahin ehrliche „ähnlich = Genre"-Etikettierung.
- [ ] **anything: Listen-/Jahres-/Begriffsklärungsseiten ungefiltert.** [mittel/M · anything] → hubPenalty/SKIP_LINK_RE auch in explore(); Stoppliste (Liste/Kategorie/Jahre/BKS) (wiki.mjs:98-163; BACKLOG:544).
- [ ] **anything: Orange alphabetisch verzerrt / kippt still auf einseitige Links.** [mittel/M · anything] → nach Backlinks/Aufrufen ranken; Fallback <4 transparent als „verlinkt"; falsche Kommentare korrigieren (wiki.mjs:112-131).
- [ ] **movies: explore() degradiert nicht (hartes 502).** [mittel/S · movies] → jeden Call einzeln .catch(()=>null), defensiv zugreifen, nur bei fehlendem hit werfen (pack.mjs:178-198).
- [ ] **movies: Sprache hart de-DE, Server-lang ignoriert.** [mittel/S · movies] → lang durch explore/similar/context/enrich reichen, api() language=en-US bei EN (pack.mjs:35; server.mjs:1328).
- [ ] **podcasts: leere Apple-Treffer 14 Tage als null gecacht.** [mittel/S · podcasts] → Leerergebnisse nicht memoisieren (werfen/kurze TTL) (pack.mjs:25-34).
- [ ] **games: SteamSpy-Tag-Chart ohne Retry/Backoff — Blau kann still wegfallen.** [mittel/M · games] → Retry/Backoff bei 429/503; bei leerem Ergebnis Diag-/UI-Hinweis (pack.mjs:88-97).
- [ ] **plants: iNat-Requests zu dicht getaktet (gapMs 250).** [mittel/S · plants] → gapMs 700–1000 (Wrapper analog boardgames).
- [ ] **plants: „Merkmale"-Label oversellt Taxonomie.** [mittel/S · plants] → Label „Systematik"; englischen rank-Chip weglassen/mappen (pack.mjs:178,296).
- [ ] **papers: Demo-ORANGE-Kanten faktisch falsch.** [mittel/S · papers] → durch echte Ko-Autoren-Werke ersetzen oder auf „similar" umlabeln (demo.json:85-98).
- [ ] **travel: Blaue Stil-Ähnlichkeit ist Stichwort-Rangproxy.** [mittel/L · travel] → über den vorhandenen styleTags-vector re-ranken (Kosinus) (travel.mjs:151,156-181).
- [ ] **travel: Vibe-Tags/Distanz-Chip hart deutsch.** [mittel/M · travel] → Tags mit DE/EN-Schlüssel; „{km} km from home"; Fehlermeldung über t() (travel.mjs:19-32; pack.mjs:54,193).
- [ ] **books: Ausgaben-/Übersetzungs-Dubletten unbehandelt.** [mittel/M · books] → Dedup über OL work-key statt Titel-String; optional namesakes-Variante (pack.mjs:39,239,249).
- [ ] **Cross-Pack: Namensvetter/Editionen nicht disambiguiert (searchX limit=1).** [mittel/M · podcasts,games,boardgames,plants,papers,movies,anything] → mehrere Treffer, nach Popularität/Jahr/exaktem Match wählen bzw. an suggest()-UI übergeben.
- [ ] **Cross-Pack: fehlende seedChips.** [niedrig/S · podcasts,movies,books,games,plants,travel] → je 3 kontrastierende seedChips (DE/EN) ergänzen (index.html:6778).
- [ ] **Cross-Pack: Demo-Daten inkonsistent zur Live-Domäne.** [niedrig/M · 7 Packs] → Genres/Skalen/Kantensemantik an Live angleichen, Cluster verbreitern.
- [ ] **Cross-Pack: context()/Laufzeit-Strings ohne EN-Overlay.** [niedrig/S · books,boardgames,papers] → über Config-Keys führen und ins en-Overlay aufnehmen.
- [ ] **Cross-Pack: radar:true ohne radarExtras (Music-Parität).** [niedrig/M · movies,books,games,boardgames,papers,plants] → optional radarExtras je Pack oder radarTitle ehrlicher fassen; nicht blockierend.
- [ ] **Labs-Politur: Null-Guards, Skalen, Tippfehler, Match-Spreizung.** [niedrig/S · movies,travel,boardgames,plants,podcasts] → diag/popularity Null-Guards; „Pflanzenliste"; similar-match spreizen; books-Skala; podcasts similar() { lang }.
- [ ] **papers: Momentum-Kommentar tot; BLAU-Degradation transparent.** [niedrig/S · papers] → counts_by_year verdrahten oder Kommentar streichen; similarSource im UI anzeigen (pack.mjs:8,224-256).

### Phase 2e — Website, Auffindbarkeit & Erstkontakt

- [ ] **Kein primärer CTA / keine Desktop-Downloads auf der Landing.** [mittel/M · Landing] → CTA nahe der Tagline (→ /?pack=music) + „Als App laden" (W13); DE+EN.
- [ ] **Schwaches Share-Preview: OG-Bild = App-Icon.** [mittel/M · SEO] → echtes 1200×630-Bild; twitter:card=summary_large_image + image; og:image:width/height/alt (server.mjs:673).
- [ ] **Keine strukturierten Daten (JSON-LD).** [mittel/M · SEO] → WebSite/Organization (+ SoftwareApplication für Music) mit absoluten URLs.
- [ ] **EN für Crawler unsichtbar — kein hreflang/og:locale.** [mittel/L · SEO/i18n] → og:locale de_DE + alternate en_US; mittelfristig serverseitig sprachvariante Auslieferung mit hreflang/canonical.
- [ ] **Erst-Eindruck zeigt abstrakte Kugeln statt des Karten-Produkts.** [mittel/L · Landing] → produktnahes Vorschau-Element (Screenshot oder echtes Demo-Netz mit beiden Kantenarten).
- [ ] **Labs-Freischaltung nutzt native prompt()/alert().** [mittel/M · Landing] → gestyltes Inline-Panel, das Labs erklärt; Fehler inline (landing.mjs:447-463).
- [ ] **PWA: keine „Update verfügbar"-UX.** [mittel/M · PWA] → updatefound/controllerchange-Listener + Reload-Toast (sw.js:14-27).
- [ ] **Onboarding-Tour music-lastig und pack-unneutral.** [mittel/M · UX] → Tour-Texte pack-neutral bzw. per config-Overlay; Verständlichkeit als eigenen Prüfpunkt (auch EN) (index.html:1099).
- [ ] **Meta-/SEO-Konfig-Robustheit und Thin-Content.** [mittel/S · SEO] → LIKE_PUBLIC_URL erzwingen + Startup-Warnung; meta description; noindex,follow auf Rechtstexte/​/s; lastmod (server.mjs:651-660,1018).
- [ ] **Landing-/PWA-Politur und No-JS-Fallback.** [niedrig/M · Landing/PWA] → noscript-Text-Links; BUILD_REF nur Staging; Manifest id/screenshots/shortcuts; gestylte /offline.html; background_color angleichen.
- [ ] **Marken-/Namenskonsistenz „like" vs. „Like".** [niedrig/S · Branding] → verbindliche Schreibweise festlegen und durchziehen.

### Phase 2f — A11y, Tests/CI, Doku & große Bretter

- [ ] **A11y: Seiten-Zoom komplett deaktiviert.** [hoch/M · A11y] user-scalable=no/maximum-scale=1 sperrt die ganze Seite (WCAG 1.4.4). → entfernen; nur Canvas gegen Pinch abschotten (index.html:10).
- [ ] **A11y: kein sichtbarer Tastatur-Fokus auf Toolbar-Buttons.** [hoch/S · A11y] → globale :focus-visible-Regel + .iconbtn/button mit klarem Ring (index.html:135).
- [ ] **A11y: keine Fokus-Rückgabe nach Modal-Schließen + fehlende aria-Zustände.** [mittel/M · A11y] → opener merken/​focus(); aria-expanded/haspopup an Toggles; Close-Buttons ≥24×24px.
- [ ] **A11y: Canvas role=application ohne Tastatur-Knoten; Kontrast Legal/Landing.** [mittel/L · A11y] → role=img + Listen-Einstieg bewerben (mittelfristig Pfeil-Navigation); Muted-Text ≥4.5:1; Planeten-Fokusring (index.html:2142; server.mjs:226; landing.mjs:92).
- [ ] **CI-Gate führt nur 6 von 10 Specs.** [hoch/S · Test] i18n/support/expand-queue ungegatet. → volle Suite (visual als eigener Job) bzw. mindestens diese drei aufnehmen.
- [ ] **Keine a11y-Automatisierung (W5 offen).** [hoch/M · Test] → @axe-core/playwright gegen /, /impressum, /datenschutz + Modale; erst nicht-blockierend, dann hochziehen.
- [ ] **USABILITY.md nicht auf v2.7.0 nachgezogen (Radar/tote IDs).** [hoch/S · Doku] → Radar in §6 mit #discRadar; IDs korrigieren (#export/#bExport, #resetAll); Pflege-Regel in DoD.
- [ ] **ROADMAP.md-Rumpf veraltet; README Music-only.** [hoch/M · Doku] → ROADMAP auf Runde-24+/Labs-Bedingung kürzen (v2.7.0); README-Kopf um Website-/Labs-Framing; papers-Quelle auf Semantic Scholar korrigieren.
- [ ] **Server-Fehlermeldungen hart deutsch, nie übersetzt.** [hoch/M · i18n] ~40 Endpoints; toast('Fehler: '+…) umgeht t(). → Fehler-i18n (Codes) für Music-Pfade; Client auf tf() umstellen (server.mjs:939ff; index.html:2046,4432ff).
- [ ] **Fehlende Config-/i18n-Wächter.** [mittel/M · Test/Doku] → scripts/check-packs.mjs (Pack-Schema) + EN-Vollständigkeits-Check über alle Packs, in npm run check/test:ci.
- [ ] **Keine Server-Unit-Tests; Visual-Regression ungegatet; keine Coverage.** [mittel/M · Test] → node:test für pure Helfer; Auth-/share-E2E; Visual-Job mit Playwright-Docker-Image; c8-Coverage informativ.
- [ ] **Große Bretter: Skalierung, Mobile-Touch, Konto-Sync, Demo-Katalog.** [mittel/L · Architektur/UX/Content] → Skalierungsgrenze dokumentieren + SQLite-Pfad einplanen; Mobile/Touch als Prüfpunkt (Safe-Area, Touch-Ziele, iOS-PWA); Merge-Verhalten dokumentieren/signalisieren/E2E; Demo-Mindestumfang (≥12) festlegen, travel/anything auffüllen.
- [ ] **Doku-Kleinigkeiten: NOTES-Playwright-Version, PITCH-Scope.** [niedrig/S · Doku] → NOTES an ^1.61.1 angleichen; PITCH.md-Kopf „Bezieht sich auf Like Music".

### Arbeitsweise

Punkt für Punkt abarbeiten, nicht bündeln: pro Aufgabe die Änderung machen, **verifizieren** (`npm run check` und `npm run test:ci`; bei UI-Änderungen USABILITY.md mitpflegen), dann committen. Sinnvolle, thematisch geschnittene Commits — keine Sammel-Commits über mehrere Phasen. Reihenfolge respektieren (hoch/S zuerst; Music-Qualität vor Labs-Parität, aber Ehrlichkeits-, Rechts- und Sicherheits-Defizite ranghoch). **PRs nie ungefragt mergen; keine Session-/Chat-Links in Commits/PRs.**
