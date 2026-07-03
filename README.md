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

## Mehrere Domänen: ein Kern, viele „Packs"
like ist nicht mehr nur Musik. Der **Kern** (Server, Graph-Speicher, die klickbare Karte)
ist domänen-neutral; alles Inhaltliche steckt in einem **Domain-Pack** unter `packs/<id>/`.
Ein Pack bündelt zwei Dinge: die **Datenquellen-Adapter** (Suche, „ähnlich", „zusammen",
Popularität) und eine **Config** (Begriffe, Kantenfarben, Feature-Schalter fürs Frontend).

Verfügbare Packs (Musik ist Standard):

| Pack | Was | Quellen (offen, sofern nicht anders vermerkt) | „ähnlich" (blau) / „zusammen" (orange) |
|------|-----|-----------------------------------------------|----------------------------------------|
| `music` | Künstler:innen | Last.fm (Key), RA, Deezer, MusicBrainz, Bandcamp | ähnlicher Stil / zusammen aufgetreten |
| `books` | Bücher | Open Library, TasteDive (optional) | thematisch ähnlich / vom selben Autor |
| `movies` | Filme | TMDB (**Gratis-Key**) | inhaltlich ähnlich / „Leute schauten auch" |
| `plants` | Pflanzen | iNaturalist, GBIF | botanisch verwandt / kommt am selben Ort vor |
| `papers` | Forschung | OpenAlex | inhaltlich verwandt / von denselben Autor:innen |
| `boardgames` | Brettspiele | BoardGameGeek | geteilte Mechaniken / vom selben Designer |
| `podcasts` | Podcasts | Apple/iTunes, TasteDive (optional) | gleiches Genre / vom selben Anbieter |
| `games` | (Indie-)Games | Steam, SteamSpy, TasteDive (optional) | geteilte Tags / vom selben Entwickler |

Pack starten:
```
node server.mjs                 # Musik (Default)
node server.mjs --pack=books    # Bücher (auch: ENV LIKE_PACK=books)
```

**Keys je Pack** (nur wo nötig): `movies` braucht einen kostenlosen TMDB-Key
(`.tmdb-key` oder ENV `TMDB_API_KEY`). `music` braucht den Last.fm-Key wie bisher.
`books`/`podcasts`/`games` funktionieren ohne Key; ein optionaler TasteDive-Key
(`.tastedive-key`) schaltet zusätzlich ein „Leute mochten auch"-Signal frei und versorgt
diese drei Packs gemeinsam. Jedes Pack legt seinen Bestand in eigenen Dateien ab
(`graph-books.json`, `stats-movies.json`, …), sodass sich die Domänen nie vermischen.

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
vergleichen, Pfade, Filter, PNG/CSV) — nur Live-Suche/Erweitern fehlt, weil das den Server
mit den Keys braucht. Ideal, um die Oberfläche und die Inhalte eines Packs von jedem Rechner
im Browser anzusehen, ohne etwas zu installieren.

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

**Einmalig einrichten:** Repo → Settings → Secrets and variables → Actions → *New repository secret*.
Je nach Pack: `LASTFM_KEY` (Musik), `TMDB_KEY` (Filme), `TASTEDIVE_KEY` (optional, für
Bücher/Podcasts/Games). Sie werden beim Bauen in die jeweilige Key-Datei geschrieben und in die
Apps eingebettet. Fehlt ein Secret, wird trotzdem gebaut — dann ohne eingebetteten Key.

**Getrennte Tags pro Pack**, damit klar ist, welches Tool welchen Stand hat:
```
git tag v1.9.0        && git push origin v1.9.0        # Musik (klassischer Name)
git tag books-v0.2.0  && git push origin books-v0.2.0  # Bücher
git tag movies-v0.1.0 && git push origin movies-v0.1.0 # Filme  usw.
```
Jeder Tag baut **genau sein Pack** (Windows + macOS) und hängt die Downloads ans Release.

**Deine Release-Logik** setzt der Workflow so um:
- **Pack-Änderung** → nur dieses Pack neu bauen: dessen Tag pushen (siehe oben). Die anderen
  Packs und Previews bleiben unberührt.
- **Kern-/Frontend-Änderung** („alle neu") → *Actions → Build & Release → Run workflow* mit
  `pack = all`. Das baut alle Packs auf beiden Plattformen. Die Previews aktualisiert der
  Pages-Workflow ohnehin bei jedem `main`-Push automatisch.

Manueller Testlauf ohne Release: *Run workflow* mit leerem Tag → Dateien landen nur als
Build-Artefakte.

**Lokal bauen** (optional): `npm ci`, dann `node scripts/build-pack.mjs <pack> <mac|win>`
(z.B. `node scripts/build-pack.mjs books win`). Ergebnis liegt in `dist/`.

## Roadmap
- [x] Suche + Durchklicken, zwei Kantenfarben, Genres
- [x] „Zusammen aufgetreten" via Resident Advisor (Songkick/Bandsintown optional)
- [x] Kern + Domain-Packs: Bücher, Filme, Pflanzen, Paper, Brettspiele, Podcasts, Games
- [x] Read-only-Previews pro Pack auf GitHub Pages (ohne Installation testbar)
- [x] Venue-Ebene im Musik-Pack (Spielorte als Knoten)
- [ ] Pack-spezifische Kurz-Touren (aktuell nur Musik)
- [ ] Eigene Icons pro Pack (`packs/<id>/icon.icns|png`)
- [ ] Umstieg `graph.json` → SQLite bei wachsendem Bestand
