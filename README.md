# Like — Künstler-Nachbarschaften

Persönliches Booking-/Kurations-Tool. Findet ähnliche Musiker\*innen und zeigt sie als
klickbare Karte. **Zero Dependencies** — nur Node (eingebautes `fetch` + `http`), kein npm install.

## App herunterladen (Windows & Mac)
**[Neueste Version →](https://github.com/allawallabedalla/like/releases/latest)** — eigenständige
Downloads, **kein Node.js nötig** (Server + Browser sind eingebaut):

- **Windows (empfohlen):** `Like-<version>-setup.exe` — normaler Installer (pro Benutzer,
  kein Admin nötig). Wird von Virenscannern seltener fehl-erkannt als die Portable-Variante.
- **Windows (portable):** `Like-<version>-portable.exe` — Doppelklick, ohne Installation.
- **macOS:** `Like-<version>-universal.dmg` — läuft auf Apple Silicon **und** Intel.
  Nicht signiert: nach dem Öffnen der `.dmg` per Rechtsklick auf `Like.app` → „Öffnen" bestätigen.

Der Last.fm-Key ist in den Release-Builds eingebettet — Suche funktioniert sofort, ohne eigenen Key.

> **Warnung beim ersten Start?** Die Builds sind (noch) **nicht code-signiert** — daher zeigt
> Windows evtl. „Windows hat Ihren PC geschützt" (SmartScreen) → „Weitere Informationen" →
> „Trotzdem ausführen". Das ist **kein Virusfund**, nur die fehlende Signatur + fehlende
> Reputation einer neuen Datei. Zu jeder Datei liegt eine `.sha256`-Prüfsumme im Release
> (unter *Assets*) zum Verifizieren. Ein echter Fehlalarm eines Scanners lässt sich bei
> Microsoft kostenlos melden: https://www.microsoft.com/wdsi/filesubmission

## So funktioniert's
**Einen Act suchen → durch das Netz klicken.** Jeder Klick auf einen Punkt lädt seine
Nachbarn. Zwei Kantenfarben:
- **blau** = ähnlicher Stil (Last.fm `artist.getSimilar`)
- **orange** = zusammen aufgetreten (Resident Advisor: gemeinsame vergangene Events)

Dazu **Genres** pro Act (von RA) als Chips im Panel. Kanten werden direkt in `graph.json`
gespeichert (`similar` / `together`).

### Quellen für „zusammen aufgetreten"
- **Resident Advisor** — Default, kein Key nötig (inoffizielle GraphQL-API, Nutzung auf
  eigenes Risiko / ToS). Am relevantesten für Elektronik, liefert auch Genres.
- **Songkick** — optional, Key in `like/.songkick-key` (https://www.songkick.com/api_key_requests/new)
- **Bandsintown** — optional, app_id in `like/.bandsintown-appid`
  (https://artists.bandsintown.com/support/api-installation)

Sind Key/app_id hinterlegt, werden diese Quellen automatisch mit RA zusammengeführt.

**Empfehlung für die Produktivinstanz:** mindestens einen der optionalen Keys (Songkick/
Bandsintown/Setlist.fm) hinterlegen — die „zusammen aufgetreten"-Kante ist das
Alleinstellungsmerkmal und hängt sonst allein an der inoffiziellen RA-API. Fällt RA aus,
meldet sich der Server per Pushover (sofern eingerichtet) nach 5 Fehlschlägen in Folge,
statt still zu degradieren.

*(Die früheren Wikipedia-/Auto-Lineup-Funktionen sind noch im Code (`scrape.mjs`,
`auto.mjs`), aber aus der Oberfläche genommen.)*

## Kleine Acts finden: Radar, Hörerzahlen, Label-Umfeld
**like** ist auf das Entdecken *kleiner* Künstler:innen ausgelegt — alles ohne laufende Kosten:

- **Hörerzahlen + Momentum**: Beim Anklicken lädt jeder Act seine Last.fm-Hörerzahl.
  Die Zahlen werden lokal historisiert (`stats.json`) — nach ein paar Wochen zeigt das
  Panel Wachstum („▲ +38 %/Monat") = Acts im Aufwind, bevor es alle wissen.
- **📡 Radar** (Topbar): Geheimtipp-Score aus Nähe zu deinen Likes × Kleinheit ×
  Momentum × Boni (zusammen aufgetreten, tritt auf). Kandidaten kommen aus deinem
  Graphen, von **Deezer** (Related Artists inkl. Fananzahl, ganz ohne Key) und aus
  frischen **Bandcamp**-Releases in deinen dominanten Genres. Jeder Vorschlag mit
  Klartext-Begründung.
- **Label-Umfeld** (Panel): Labels des Acts + wer dort noch veröffentlicht — via
  **MusicBrainz** (offene Daten). Kleine Labels signen kleine Acts.
- **Ort**: Fehlt die RA-Region, springt die Bandcamp-Ortsangabe ein (📍 im Panel).
- **„Große dämpfen"** (Topbar): blendet Acts mit ≥20k Hörern aus — nur die Kleinen leuchten.
- **Radar-Cache + Aktualisieren**: Vorschläge werden 10 Min gecacht (mit Zeitstempel);
  der ↻-Button rechnet mit frischen Hörerzahlen neu. Aus jedem Radar-Eintrag direkt
  **like!** (ins Lineup), **▶** (30-Sekunden-Klangprobe direkt in der App) oder das Profil öffnen.
- **Auto-Snapshot + Wochen-Digest**: Beim Start snapshottet like still die Hörerzahlen
  deiner markierten Acts (füttert das Momentum) und zeigt oben einen Digest-Streifen
  („▲ Act X +38 %/Monat und 2 weitere im Aufwind").
- **Klangprobe (30 s)**: Ein ▶-Knopf im Panel (neben dem Namen) und an jedem
  Radar-Eintrag spielt eine 30-Sekunden-Vorschau direkt in der App — über
  **Deezer** (kein Key), Fallback **iTunes**. Beides gratis; nochmal klicken stoppt.
- **Setlist.fm (optional, Gratis-Key)**: „Wer hat mit X gespielt / für X geöffnet?" —
  geteilte Bühnen fließen in „zusammen aufgetreten" ein. Key in `.setlistfm-key` oder
  ENV `SETLISTFM_KEY`; ohne Key ist das Feature einfach aus.

Quellen-Hinweis: Deezer und MusicBrainz sind offizielle, offene APIs. Bandcamp läuft
(wie RA) über inoffizielle öffentliche Endpoints — nur lesend, gedrosselt, gecacht,
Nutzung auf eigenes Risiko; fällt bei Formatänderungen still auf „aus" zurück.

## Mehr Komfort
- **„Überrasch mich"** (leere Karte): zieht in **jeder Domäne** einen zufälligen, eher
  unbekannten Eintrag aus einem kuratierten Pool — von vier Kandidaten gewinnt der
  unbekannteste (kleinste Popularität). Bücher, Filme, Pflanzen, Spiele … inklusive.
- **Dark Mode** (Kopfzeile, ◐): hell/dunkel umschalten, Wahl wird gemerkt (Standard folgt dem System).
- **Graph-Backup** (Hilfe „?" → Daten): den ganzen Bestand als JSON exportieren und wieder
  importieren — z.B. um ihn auf einen anderen Rechner mitzunehmen. Beim Import wird der alte
  Stand automatisch als `graph.bak.json` gesichert.
- **Quellen-Diagnose** (Hilfe „?" → Quellen testen): pingt alle Datenquellen live an und zeigt,
  welche antworten — praktisch, wenn im Betrieb mal etwas klemmt.
- **Update-Hinweis**: die App prüft beim Start still, ob eine neuere Version verfügbar ist, und
  zeigt sie dezent neben dem Logo.
- **Kurz-Tour**: Beim ersten Öffnen erklären 4 kurze, animierte Slides die Bedienung;
  später jederzeit über „?“ → „Kurz-Tour ansehen“ erneut aufrufbar.
- Neu geladene Acts **fächern sich im Ring um den angeklickten Act auf** statt sich zu überlagern;
  die letzte Ansicht (Zoom/Position) wird über Neustarts gemerkt.

## Lokal starten (Windows & Mac)
Voraussetzung: [Node.js](https://nodejs.org) installiert.

- **Windows:** Doppelklick auf **`start.cmd`**
- **macOS:** Doppelklick auf **`start.command`** (einmalig vorher im Terminal: `chmod +x start.command`)

Beide starten den Server und öffnen den Browser auf http://localhost:5173 (voll funktionsfähig).
Manuell geht immer: `node server.mjs` (optional `--open` öffnet den Browser).

> **Nur `index.html` doppelklicken funktioniert NICHT** („failed to fetch") — die Live-App
> braucht den Server. Für eine reine Doppelklick-Datei ohne Server: `docs/index.html`
> (read-only Snapshot, siehe unten).

## Schnellstart (manuell)
```
node server.mjs            # bzw. voller Pfad: "C:\Program Files\nodejs\node.exe" server.mjs
```

### 1. Ohne Key ausprobieren (Demo)
```
node ingest.mjs --demo
node server.mjs
```
→ http://localhost:5173

### 2. Echte Daten (Last.fm)
1. Gratis API-Key holen: https://www.last.fm/api/account/create
2. Key ablegen — entweder als Datei `like/.lastfm-key` (nur der Key, eine Zeile),
   oder als Umgebungsvariable `LASTFM_API_KEY`.
3. Graph füttern:
   ```
   node ingest.mjs "Bonobo" "Floating Points"
   node ingest.mjs "Bonobo" --depth 2     # Nachbarn mit-expandieren
   ```
4. `node server.mjs` und im Browser erkunden.

## Mehrere Domänen in EINER App
like ist nicht mehr nur Musik. Der **Kern** (Server, Graph-Speicher, die klickbare Karte)
ist domänen-neutral; alles Inhaltliche steckt in einem **Domain-Pack** unter `packs/<id>/`.
Ein Pack bündelt zwei Dinge: die **Datenquellen-Adapter** (Suche, „ähnlich", „zusammen",
Popularität) und eine **Config** (Begriffe, Kantenfarben, Feature-Schalter fürs Frontend).

**Eine App, alle Domänen:** In der Topbar gibt es einen **Umschalter** — Musik, Bücher,
Filme, Pflanzen … sind alle im selben Programm. Jede Domäne hat ihre eigene, getrennte
Sammlung; die zuletzt gewählte wird gemerkt. (Technisch: der Server lädt alle Packs und
bedient pro Anfrage das aktive über `?pack=<id>` bzw. den Header `x-like-pack`.)

Verfügbare Packs (Musik ist Standard):

| Pack | Was | Quellen (offen, sofern nicht anders vermerkt) | „ähnlich" (blau) / „zusammen" (orange) |
|------|-----|-----------------------------------------------|----------------------------------------|
| `music` | Künstler:innen | Last.fm (Key), RA, Deezer, MusicBrainz, Bandcamp | ähnlicher Stil / zusammen aufgetreten |
| `books` | Bücher | Open Library, TasteDive (optional) | thematisch ähnlich / vom selben Autor |
| `movies` | Filme | TMDB (**Gratis-Key**) | inhaltlich ähnlich / „Leute schauten auch" |
| `plants` | Pflanzen | iNaturalist, GBIF | botanisch verwandt / gedeiht am selben Standort |
| `papers` | Forschung | OpenAlex | inhaltlich verwandt / von denselben Autor:innen |
| `boardgames` | Brettspiele | BoardGameGeek | geteilte Mechaniken / vom selben Designer |
| `podcasts` | Podcasts | Apple/iTunes, TasteDive (optional) | gleiches Genre / vom selben Anbieter |
| `games` | (Indie-)Games | Steam, SteamSpy, TasteDive (optional) | geteilte Tags / vom selben Entwickler |
| `travel` | Reiseziele | Wikivoyage, OpenStreetMap/Nominatim | ähnlicher Reisestil / gut kombinierbar (in der Nähe) |
| `anything` | Alles (Universal) | Wikipedia | thematisch ähnlich (morelike) / eng verknüpft |

Starten (eine App, im Fenster umschalten):
```
node server.mjs                 # startet mit Musik; Domäne oben umschaltbar
node server.mjs --pack=books    # anderes Start-Pack setzen (auch: ENV LIKE_PACK=books)
```

**Keys je Pack** (nur wo nötig): `movies` braucht einen kostenlosen TMDB-Key
(`.tmdb-key` oder ENV `TMDB_API_KEY`). `music` braucht den Last.fm-Key wie bisher.
`books`/`podcasts`/`games`/`plants`/`papers`/`boardgames`/`travel` funktionieren ohne Key;
ein optionaler TasteDive-Key (`.tastedive-key`) schaltet für `books`/`podcasts`/`games`
zusätzlich ein „Leute mochten auch"-Signal frei. Jedes Pack legt seinen Bestand in eigenen
Dateien ab (`graph-books.json`, `stats-movies.json`, …), sodass sich die Domänen nie vermischen.

**Like Travel** trennt bewusst zwei Achsen: *Reisestil* (blau — Strand/Berge/Kultur/Party/…,
via Wikivoyage) und *Nähe* (orange — kombinierbare Nachbarziele). Die **Heimat-Distanz** (Luftlinie
zum Heimatort) steht als Chip am Ziel; Standard ist `Berlin, Deutschland`, überschreibbar per
ENV `LIKE_TRAVEL_HOME="München, Deutschland"`. So liegen Türkei-All-inclusive und Alpen-Bergtour
geografisch nah, im Stil aber weit auseinander — genau wie es sich anfühlt.

Zur „auch gekauft / auch gelesen"-Idee: echte Verkaufszahlen und Amazons „wurde zusammen
gekauft" sind **nicht** frei zugänglich. Das beste freie Äquivalent ist *verhaltensbasiert*
und steckt schon in den Packs — bei Filmen sind es TMDBs `recommendations` (aus echtem
Nutzerverhalten abgeleitet, die orange Kante), bei Büchern/Podcasts/Games optional TasteDive.
Als Nachfrage-Indikator statt Verkaufszahlen dienen Merklisten (Open Library „want to read"),
Bewertungszahlen (TMDB/BGG) oder Besitzer-Schätzungen (SteamSpy).

### Neues Pack anlegen
1. `packs/<id>/pack.mjs` mit `default export { id, config, explore, enrich, … }` (siehe
   `packs/music/pack.mjs` als Referenz — das Interface ist oben in `lib/packs.mjs` dokumentiert).
2. Optional `packs/<id>/demo.json` für die Preview (`node scripts/gen-demos.mjs` erzeugt die mitgelieferten).
3. Fertig — Server, Frontend, Radar, Export und CI ziehen das Pack automatisch mit.

## Brücke bauen: was verbindet zwei Einträge?
Rechtsklick auf einen Knoten → **Brücke bauen…**, dann einen zweiten Knoten wählen. like
sucht dann wie ein **Routenplaner**: von beiden Enden gleichzeitig (bidirektionale
Breitensuche über die „ähnlich"-Relation der Domäne) — die erste Begegnung der Suchfronten
ist damit automatisch die **kürzestmögliche Verbindung**. Während der Suche zeigt die
Brückenleiste einen **Fortschrittsbalken** samt Live-Stand (erreichte Einträge, Abfragen,
Suchtiefe); nach 5 Sekunden fragt ein Dialog **„Weitersuchen?"**, danach wieder nach 10,
15, … Sekunden — so gräbt like auf Wunsch beliebig tief (bis zu 7 Zwischenstationen),
bricht aber nie unbemerkt in eine Endlos-Suche aus. Die Kandidaten schweben als helle
**Geister-Kugeln** zwischen den beiden (kürzeste Route zuerst); ein Regler mischt von
**naheliegend** (kürzeste, stärkste Verbindung) zu **klein/spannend** (Geheimtipp). Klick
auf einen Geist fügt die ganze Kette samt Kanten ein. Funktioniert in allen Packs.
Wo eine Domäne eine zweite Beziehung besitzt, sucht die Brücke über **beide Straßen**:
- **Like Music** verbindet nicht nur über ähnlichen **Stil**, sondern auch über
  **zusammen aufgetreten** (geteilte Bühnen/Festivals) — so wird „welcher kleine Act
  verbindet zwei Szenen über gemeinsame Auftritte?" findbar, was reine Klangähnlichkeit
  nie zeigt (Ketten wie „A —spielte mit— X —ähnlich— B").
- **Like Anything** sucht zusätzlich über die **Artikel-Links** (nicht nur „thematisch
  ähnlich") — so werden typübergreifende Verbindungen gefunden (z.B. „Mario Basler ↔
  Istanbul" über gemeinsam verlinkte Themen), die die reine Ähnlichkeitssuche nie
  zusammenbringen würde.

## Feedback-Knopf (Pushover, optional)
Ist ein **Pushover**-Zugang hinterlegt, erscheint oben ein **✉-Knopf**: Testuser können dir
direkt eine Nachricht schicken (mit Domäne + Version). Die Keys liegen server-seitig, nie im
Browser. Einrichten: ENV `PUSHOVER_TOKEN` + `PUSHOVER_USER`, oder Datei `.pushover`
(`{"token":"…","user":"…"}`). Fehlt beides, ist der Knopf einfach aus. Für die Release-Builds
als GitHub-Secrets `PUSHOVER_TOKEN` / `PUSHOVER_USER` hinterlegen.

## Musik-Erweiterung: Venues einblenden
Im Musik-Pack lässt sich über den **Venues**-Schalter (Topbar) eine zusätzliche Ebene
einblenden: Spielorte, an denen mindestens zwei deiner Acts aufgetreten sind, erscheinen als
violette Knoten. Das zeigt, welche Venues (und damit welches Booking-Umfeld) deine Acts
verbinden — rein aus den ohnehin gespeicherten Auftrittsdaten abgeleitet, ohne neue Anfrage.

## Bedienung der Karte
- **Act suchen** (oben) / Enter: lädt den Act (ähnlicher Stil + Auftritte + Genres), zentriert ihn
- **Klick auf einen Punkt**: lädt dessen Nachbarn → so hangelst du dich durch
- **Panel** (bei Auswahl): Genres, ähnlicher Stil (% Match), zusammen aufgetreten (×Events),
  Last.fm-Link, „Weiter erkunden"
- **Als bekannt markieren** + **Booking-Notiz**: deine Kuration, in `graph.json` gespeichert
- **Bekannte abdunkeln**: blendet Gebuchtes aus → reine Entdeckung
- **Leeren…**: „Entdeckte Acts" (nur Ungeöffnetes raus) oder „Alles"
- Ziehen = verschieben, Mausrad = zoom, Knoten ziehen = fixieren

## Farben
- Knoten: schwarz = gesucht · weiß mit Ring = bekannt/gebucht · grau = noch nicht geöffnet
- Kanten: **blau** = ähnlicher Stil (Last.fm) · **orange** = zusammen aufgetreten (RA; dicker = mehr Events)

## Statische Vorschau / GitHub Pages (von überall testen, ohne Installation)
Jedes Pack hat eine **read-only-Preview**, die rein statisch funktioniert (zoomen, klicken,
vergleichen, Filter, PNG/CSV) — nur Live-Suche/Erweitern/Brücke fehlt, weil das den Server
mit den Keys braucht. Ideal, um die Oberfläche und die Inhalte eines Packs von jedem Rechner
im Browser anzusehen, ohne etwas zu installieren. Die **Landing** (`docs/index.html`) zeigt
alle Domänen mit einem lebendigen Kugelnetz und je einem Mini-Cluster pro Karte.

```
node export-static.mjs             # nur Musik -> docs/index.html
node export-static.mjs --pack=books# ein Pack  -> docs/books/index.html
node export-static.mjs --all       # alle Packs + Landing-Seite -> docs/
node serve-docs.mjs                # lokal ansehen: http://localhost:5174
```

**Automatisch auf GitHub Pages:** der Workflow `.github/workflows/pages.yml` baut bei jedem
Push auf `main` (der Kern, Frontend oder ein Pack berührt) **alle** Previews und deployt sie:
```
https://<user>.github.io/like/           # Landing mit allen Packs
https://<user>.github.io/like/books/     # Bücher-Preview
```
Einmalig aktivieren: Repo → Settings → Pages → Source: **GitHub Actions**.

> Hinweis: Bei einem öffentlichen Repo ist die Pages-Seite öffentlich. Die Previews betten
> **kuratierte Demo-Graphen** ein (`packs/<id>/demo.json`), nicht deinen persönlichen Bestand —
> `graph*.json` bleibt lokal (per `.gitignore`).

## Neue Downloads bauen (Release)
Die `.exe` und `.dmg` werden **automatisch von GitHub Actions** auf echten Windows-/Mac-Runnern
gebaut (`.github/workflows/release.yml`) — du brauchst dafür weder einen Mac noch eine lokale
Toolchain.

Es entsteht **eine App**, die alle Domänen enthält (Umschalter im Fenster) — also je ein
`Like-<version>-setup.exe`, ein `-portable.exe` und ein `-universal.dmg`, nicht mehr zehn
getrennte Downloads.

**Einmalig einrichten:** Repo → Settings → Secrets and variables → Actions → *New repository secret*.
Eingebettete Keys (alle optional, fehlt einer läuft das betroffene Pack ohne):
`LASTFM_KEY` (Musik), `TMDB_KEY` (Filme), `TASTEDIVE_KEY` (Bücher/Podcasts/Games),
sowie `PUSHOVER_TOKEN` + `PUSHOVER_USER` (Feedback-Knopf).

**Release auslösen:** einen Versions-Tag pushen —
```
git tag v2.0.0 && git push origin v2.0.0
```
Actions baut beide Plattformen und hängt die Downloads ans GitHub-Release. Ein manueller
Testlauf (*Actions → Build & Release → Run workflow*, Tag-Feld leer) legt die Dateien nur als
Build-Artefakte ab, ohne Release.

**Lokal bauen** (optional): `npm ci`, dann `npm run dist:win` (auf Windows) bzw. `npm run
dist:mac` (auf einem Mac). Ergebnis liegt in `dist/`.

## iPhone / Android als PWA (installierbar, ohne App Store)

Das Frontend ist eine reine Web-App und lässt sich als **PWA** aufs Handy legen: Server
einmal hosten → URL in Safari öffnen → **„Teilen → Zum Home-Bildschirm"**. Dann liegt like
mit eigenem Icon am Homescreen, startet im Vollbild (ohne Browser-Leiste) und funktioniert
touch-first (ein Finger schieben, zwei Finger zoomen, Tippen = wählen, Doppeltipp = erkunden,
langes Drücken = Menü). Ein Service-Worker cached die Shell, sodass zuletzt besuchte Karten
auch offline sichtbar sind. Läuft genauso auf Android und am Desktop.

**Hosten (1× nötig):** Der Server ist zero-dependency, das mitgelieferte `Dockerfile` braucht
kein `npm install`.
- **Render:** Repo verbinden → *New +* → *Blueprint* → dieses Repo. `render.yaml` macht den
  Rest; Keys (optional, für Musik/Filme) im Dashboard eintragen. Gratis-Tier schläft bei
  Inaktivität ein (Kaltstart ~30 s).
- **Fly.io / Railway / eigener Server:** `docker build -t like . && docker run -p 8080:8080 -v like-data:/data like`.

Die key-losen Packs (Reisen, Wikipedia-Universal, Pflanzen, Bücher, Paper, Brettspiele,
Podcasts, Indie-Games) laufen ohne jeden Key; Musik (Last.fm) und Filme (TMDB) brauchen ihren Key als
ENV. Hinweis: der Kartenbestand liegt serverseitig — ein gehosteter Server teilt eine Karte;
für getrennte Sammlungen mehrere Instanzen betreiben.

## Roadmap
- [x] Suche + Durchklicken, zwei Kantenfarben, Genres
- [x] iPhone/Android als installierbare PWA (Touch-Gesten, Manifest, Service-Worker) + Docker/Render-Deploy
- [x] „Zusammen aufgetreten" via Resident Advisor (Songkick/Bandsintown optional)
- [x] Kern + Domain-Packs: Bücher, Filme, Pflanzen, Paper, Brettspiele, Podcasts, Games
- [x] Eine App, alle Domänen (Umschalter in der Topbar)
- [x] Read-only-Previews pro Pack auf GitHub Pages (ohne Installation testbar), animierte Landing
- [x] „Brücke bauen" (verbindende Einträge finden) in allen Packs
- [x] Brücke als Routenplaner: bidirektionale Suche (kürzeste Verbindung zuerst), Fortschrittsbalken + „Weitersuchen?"-Dialog (5 s, 10 s, 15 s, …)
- [x] „Überrasch mich" + leichter „ähnlich"-Zugriff (Brücke) in allen Domänen
- [x] Kollisionserkennung (Kugeln überlappen nicht) + pro-Pack kalibrierte Kugelgröße
- [x] Venue-Ebene im Musik-Pack (Spielorte als Knoten)
- [x] Feedback-Knopf (Pushover)
- [x] Kurz-Tour in allen Domänen (generisch aus der Pack-Config; Musik handgetextet)
- [ ] Umstieg `graph.json` → SQLite bei wachsendem Bestand
