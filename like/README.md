# Like — Künstler-Nachbarschaften

Persönliches Booking-/Kurations-Tool. Findet ähnliche Musiker\*innen und zeigt sie als
klickbare Karte. **Zero Dependencies** — nur Node (eingebautes `fetch` + `http`), kein npm install.

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

## Roadmap
- [x] Suche + Durchklicken, zwei Kantenfarben, Genres
- [x] „Zusammen aufgetreten" via Resident Advisor (Songkick/Bandsintown optional)
- [ ] Genres auch für noch nicht geöffnete Acts (Last.fm Tags lazy nachladen)
- [ ] Spotify Audio-Features → echte Klang-Ähnlichkeit
- [ ] Umstieg `graph.json` → SQLite bei wachsendem Bestand
