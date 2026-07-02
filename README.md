# Like — Künstler-Nachbarschaften

Persönliches Booking-/Kurations-Tool. Findet ähnliche Musiker\*innen und zeigt sie als
klickbare Karte. **Zero Dependencies** — nur Node (eingebautes `fetch` + `http`), kein npm install.

## App herunterladen (Windows & Mac)
**[Neueste Version →](https://github.com/allawallabedalla/like/releases/latest)** — eigenständige
Downloads, **kein Node.js nötig** (Server + Browser sind eingebaut):

- **Windows:** `Like-<version>-portable.exe` — Doppelklick, läuft ohne Installation.
  Beim ersten Start warnt SmartScreen (unsigniert) → „Weitere Informationen" → „Trotzdem ausführen".
- **macOS:** `Like-<version>-universal.dmg` — läuft auf Apple Silicon **und** Intel.
  Nicht signiert: nach dem Öffnen der `.dmg` per Rechtsklick auf `Like.app` → „Öffnen" bestätigen.

Der Last.fm-Key ist in den Release-Builds eingebettet — Suche funktioniert sofort, ohne eigenen Key.

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

Quellen-Hinweis: Deezer und MusicBrainz sind offizielle, offene APIs. Bandcamp läuft
(wie RA) über inoffizielle öffentliche Endpoints — nur lesend, gedrosselt, gecacht,
Nutzung auf eigenes Risiko; fällt bei Formatänderungen still auf „aus" zurück.

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

## Statische Vorschau / GitHub Pages
„like" braucht im Normalbetrieb den Node-Server (Last.fm-Key, RA, schreibt graph.json) —
das läuft **nicht** auf GitHub Pages. Es gibt aber einen **read-only-Snapshot** der aktuellen
Karte, der rein statisch funktioniert (zoomen, klicken, vergleichen, Pfade, Genre-Filter,
Korb, PNG/CSV) — nur Live-Suche/Erweitern fehlt.

```
node export-static.mjs     # baut docs/index.html (Graph eingebettet) + docs/.nojekyll
node serve-docs.mjs        # lokal ansehen: http://localhost:5174
```

**Auf GitHub Pages veröffentlichen** (wie bei Abseits, eigenes Site-Repo):
1. `node export-static.mjs` ausführen.
2. Neues GitHub-Repo anlegen (z.B. `like`).
3. Den **Inhalt von `docs/`** ins Repo pushen (Branch `main`).
4. Repo → Settings → Pages → Source: `main` / root → speichern.
   (Alternativ Branch `gh-pages`.) Die `.nojekyll` verhindert Jekyll-Probleme.

Bei jedem neuen Stand einfach `export-static.mjs` neu laufen lassen und pushen.

## Neue Downloads bauen (Release)
Die `.exe` und `.dmg` werden **automatisch von GitHub Actions** auf echten Windows-/Mac-Runnern
gebaut (`.github/workflows/release.yml`) — du brauchst dafür weder einen Mac noch eine lokale
Toolchain.

**Einmalig einrichten:** Repo → Settings → Secrets and variables → Actions → *New repository secret*
`LASTFM_KEY` = dein Last.fm-Key (wird beim Bauen in `.lastfm-key` geschrieben und in die Apps
eingebettet). Ohne das Secret wird trotzdem gebaut, dann ohne eingebetteten Key.

**Release auslösen:** einen Versions-Tag pushen —
```
git tag v1.2.0
git push origin v1.2.0
```
Actions baut beide Plattformen und hängt `Like-1.2.0-portable.exe` + `Like-1.2.0-universal.dmg`
an das GitHub-Release des Tags. (Über *Actions → Build & Release → Run workflow* lässt sich der
Bau auch manuell testen — die Dateien landen dann als Build-Artefakte, ohne Release.)

**Lokal bauen** (optional, falls gewünscht): `npm ci` und dann `npm run dist:win` (auf Windows)
bzw. `npm run dist:mac` (auf einem Mac). Ergebnis liegt in `dist/`.

## Roadmap
- [x] Suche + Durchklicken, zwei Kantenfarben, Genres
- [x] „Zusammen aufgetreten" via Resident Advisor (Songkick/Bandsintown optional)
- [ ] Genres auch für noch nicht geöffnete Acts (Last.fm Tags lazy nachladen)
- [ ] Spotify Audio-Features → echte Klang-Ähnlichkeit
- [ ] Umstieg `graph.json` → SQLite bei wachsendem Bestand
