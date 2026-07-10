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
