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
