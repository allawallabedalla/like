# USABILITY — Funktions- & UI-Referenz

**Zweck:** Eine gepflegte Bestandsaufnahme *aller* Funktionen von „like" und *wo* sie in der
Oberfläche sitzen — als Single Source für Intro-Tour, Hilfe und künftige Änderungen (Idee aus
Feedback #87/FB20). Bei UI-Änderungen bitte hier mitpflegen.

Legende der Pack-Spalten weiter unten: ✅ = vorhanden, — = nicht in diesem Pack.
Die maßgeblichen Schalter stehen in `packs/<id>/pack.mjs` unter `features: { … }`.

---

## 1. Grundkonzept

- **Karte statt Feed:** Einträge sind klickbare Punkte (Knoten) auf einer Zoom-/Schwenk-Fläche
  (`<canvas>`), keine Liste. Quelle & Begriffe je Pack aus der Pack-Config (`CFG`).
- **Zwei Kantenarten:**
  - <span style="blue">blau</span> = **inhaltlich ähnlich** (`CFG.edges.similar.label`, z. B. „ähnlicher Stil").
  - <span style="orange">orange</span> = **zusammen/miteinander** (`CFG.edges.together.label`, z. B. „zusammen aufgetreten", bei Travel „in der Nähe").
- **Größe** eines Punkts = Popularität (`CFG.popularity.label`, z. B. Hörer/Bewertungen/Zitationen).
- **Nähe** zweier Punkte = Ähnlichkeit/Verbundenheit (räumlich kodiert, FB4). Dickere Linie = stärker.
- **Ansichten:** *Space* (Domänen/Monde kreisen, dunkel) und *Flat* (klassisches Netz). Umschaltbar
  im ⋯-Menü bzw. über den Space/Flat-Toggle.

## 2. Zwei Modi (Segmented Control `#modeSeg`, Topbar)

- **Stöbern** (`MODE = "fun"`): aufgeräumte Ansicht — suchen, erkunden, anhören, merken. „Weiter
  erkunden" ist als Primär-Knopf hervorgehoben; „Entdecken" löst direkt den **Streifzug** aus.
- **Profi** (`MODE = "work"`; bei Musik „Booking" genannt): voller Werkzeugkasten — Status, Notizen,
  Vergleich (Shift-Klick), Szenen, Brücken, Export. Profi-only-Elemente tragen die Klasse `.workonly`.

## 3. Topbar (oben)

| Element | ID | Funktion | Sichtbar |
|---|---|---|---|
| Suche | `#q` / `#go` | Eintrag laden: lädt Nachbarn (ähnlich + zusammen + Genres). Autocomplete mit Hörerzahl + Verifizier-Link (Musik, N1). | immer |
| Radar | `#radarBtn` (Desktop) / `#mRadar` (⋯) | Geheimtipp-Radar: kleine Einträge nah am Geschmack, mit Begründung (§7). | `features.radar` |
| Entdecken | `#discoverBtn` / `#mDiscover` | Öffnet das Entdecken-Popover (§6). Im Stöbern-Modus = direkt **Streifzug**. | immer |
| Aufräumen | `#tidyBtn` / `#mTidy` | Netz ordentlich anordnen (Szenen gruppieren, wenige Kreuzungen). Monde bleiben in der Umlaufbahn (FB7). | immer |
| Feedback | `#feedbackBtn` (Desktop) / `#mFeedback` (⋯) | ✉ Feedback / Fehler melden (§13). Auf schmalen Screens (≤1180px) sitzt der Topbar-Knopf kein Platz mehr — dort öffnet der Eintrag „✉ Feedback" im ⋯-Menü denselben Dialog. | nur wenn Pushover/Issues eingerichtet |
| Hilfe | `#helpBtn` / `#mHelp` | Hilfe-Popover mit Bedienung + Shortcuts (§14). | immer |
| Hell/Dunkel | Theme-Toggle | Light/Dark. | immer |
| Sprache | DE/EN | UI-Sprache; Layout bleibt beim Wechsel erhalten (FB5). | immer |
| ⋯-Menü | `#moreBtn` | Sammelmenü: Space/Flat, ★ Meine Listen (N7), Konto-Box (FB9), Export, Löschen, Backup, Hilfe … | immer |

> **Hinweis:** Der frühere ◈ Geschmacks-Fingerabdruck-Knopf wurde entfernt (FB17). Der Endpoint
> `/api/taste` bleibt (Read-only), hat aber keine UI mehr.

## 4. Karte / Knoten-Interaktionen (`<canvas>`)

| Aktion | Wirkung |
|---|---|
| **Klick** auf Punkt | Info-Panel öffnen (§5). |
| **Doppelklick** | Nachbarn laden — Schritt für Schritt weiterhangeln. |
| **▶ an der Kugel** | 30-Sek-Klangprobe (öffnet bewusst kein Panel). Nur `features.preview`. |
| **„+N"-Chip** | Geparkte, zur Übersicht ausgeblendete Nachbarn einblenden (kein Netz-Aufruf). Skaliert mit der Kugel (FB11/FB18), Tooltip erklärt das „warum versteckt" (FB10). |
| **Punkt ziehen** | Position fixieren; verbundene Knoten folgen über die Kanten-Federn (Flat wie Space, FB7). |
| **Rechtsklick** | Kontextmenü: Fokus, Brücke bauen, Lineup/Merken … |
| **Shift-Klick** | Einträge vergleichen (Schnittmenge). Nur Profi. |
| **Fläche ziehen / Mausrad** | Verschieben / zoomen. Pinch auf Touch. |

## 5. Info-Panel (rechts, `#panel`)

- **Name** (`#pName`) + „gesucht"-Badge · **Unterzeile** (`#pSub`): Popularität, Ort (Musik/Booking) usw.
- **Standort-Mini-Karte** (`#pMap`, FB29): nur **Travel** mit Koordinaten — key-/netzfreie Weltkarte
  mit Marker aus Lat/Lon; Klick öffnet die Stelle auf OpenStreetMap.
- **Genres** (`#pGenres`): klickbare Pills = Karten-Filter.
- **Booking-Block** (`#pBooking`), **Status** (`#status`), **Gage** (`#fee`): nur `features.booking` (Musik).
- **Notiz** (`#note`), **like-Knopf** (`#likeBtn` → Liste), **Brücken in andere Welten** (`#crossBtn`,
  wenn mehrere Packs live): gibt es diesen Eintrag auch als Buch/Film/Spiel?
- **Weiter erkunden / Fokus / Teilen / Entfernen (×)**: Aktionszeile (teils Profi).

## 6. Entdecken-Popover (`#discoverbox`)

| Eintrag | ID | Funktion | Sichtbar |
|---|---|---|---|
| **Streifzug** | `#discSurprise` | Zufalls-Sprung durch das **bestehende** Netz (braucht ≥2 Knoten). *(Früher „Überrasch mich" — umbenannt in FB25, um die Verwechslung mit dem Empty-State-Knopf zu beenden.)* | immer |
| **Szenen zeigen** | `#discScenes` | Hebt zusammengehörige Gruppen als Farbflächen hervor (Namen in der Legende). | Profi |
| **Brückenbauer** | `#discBridges` | Welche Einträge halten deine Szenen zusammen? Baut den ganzen Pfad A→B (FB8/FB12). | Profi |

## 7. Radar (`#radarbox`)

Schlägt **kleine, noch unentdeckte** Einträge nah am Geschmack vor — mit Klartext-Begründung und
Merken in einem Klick. Bei Musik zusätzlich 30-Sek-Hörprobe. Neu berechnen: `#radarRefresh`.

## 8. Listen / Merken

- **like! / Merken** (`#basketBtn`, Label = `CFG.likeLabel`): Favoriten wandern in die aktive Liste
  (`CFG.basketLabel`, bei Musik „Lineup"). Ohne Konto nur lokal — Hinweis beim ersten Mal (N4/FB13).
- **★ Meine Listen** (⋯-Menü, N7): Listen ansehen/wechseln/umbenennen/neu.

## 9. Leerer Zustand (`#empty`)

- Zentrale Suche (`#q2`) mit Beispiel (`CFG.exampleSeed`).
- **✦ Überrasch mich** (`#surpriseBtn`): lädt einen **neuen, eher unbekannten** Eintrag (serverseitig,
  `/api/surprise`). Bei Musik optionales **Genre-Feld** (`#surpriseGenre`, FB14).
  *(Nicht mit dem „Streifzug" verwechseln — der springt durchs vorhandene Netz; §6.)*

## 10. Export & Teilen (⋯-Menü)

- **PNG** (`#exportPng`), **CSV** der markierten Einträge (`#exportCsv`, Formel-Injection-sicher).
- **HTML-Snapshot** (`#exportHtml`, FB16): eigenständige Datei, offline ansehen/zoomen/filtern; die
  Klangprobe läuft über die Live-Instanz (CORS nur für `/api/preview`).
- **Karte als Link teilen** (`#shareMap`): unveränderliche Read-Only-Kopie (ohne Notizen/Status/Gagen).

## 11. Löschen-Dialog (`#resetModal`, N6/FB8)

Drei Umfänge: **Ganze Karte leeren** · **Nur unverknüpfte Einträge aufräumen** (Gemerkte/Notierte
bleiben) · **Auftritts- & Wiki-Zusatzdaten zurücksetzen** — je mit umfangsspezifischer Sicherheitsabfrage.

## 12. Einstellungen / Daten

- **Backup** (Export/Import JSON, ⋯-Menü, Profi).
- **API-Key-Dialog** (`#keyModal`): nur Packs mit `CFG.key`.
- **Heimatort** (Travel): fürs geräteübergreifende „km ab Zuhause" (`/api/geocode`).

## 13. Feedback (✉ `#feedbackBtn`)

Anonymes Feedback an den Betreiber (Pushover und/oder GitHub-`feedback`-Issues). Keine IP, kein Konto,
keine Session. Nur sichtbar, wenn der Build Credentials hat (`/api/health` → `feedback:true`).

## 14. Tastatur-Shortcuts

`/` Suche · `e` gewählten Eintrag weiter erkunden · `f` Fokus auf Nachbarschaft ·
`b` merken (in die Liste) · `Entf` Eintrag entfernen (mit Undo) · `+` `−` `0` zoomen / alles zeigen ·
`Esc` Modus/Panel schließen.

## 15. Packs & Feature-Matrix

`?pack=<id>` wählt das Pack. IDs bleiben stabil (auch wenn der Anzeigename abweicht — z. B.
`papers` heißt sichtbar **„Like Science"**, FB26).

| Pack (Anzeige) | Klangprobe | Radar | Booking/Status/Gage | Live-Status | Auftrittsorte | Überrasch/Streifzug |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Music | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Podcasts | ✅ | ✅ | — | — | — | ✅ |
| Movies | — | ✅ | — | — | — | ✅ |
| Books | — | ✅ | — | — | — | ✅ |
| Games | — | ✅ | — | — | — | ✅ |
| Board Games | — | ✅ | — | — | — | ✅ |
| Science (papers) | — | ✅ | — | — | — | ✅ |
| Plants | — | ✅ | — | — | — | ✅ |
| Travel | — | ✅ | — | — | — | ✅ |
| Anything | — | ✅ | — | — | — | ✅ |

*Booking/Status/Gage/Live-Status/Auftrittsorte sind Musik-spezifisch (`features.booking/active/venues`).*
*Travel hat zusätzlich die Standort-Mini-Karte im Info-Panel (§5).*

## 16. Beta-Hinweis & Freischaltung

- **Beta-Hinweis** (FB19): dauerhafter Fuß-Vermerk „Diese Seite entsteht gerade" (App `#betaFlag` +
  Landing-Footer, DE/EN).
- **„Coming soon"-Gate:** In Produktion ist nur das öffentliche Pack (`LIKE_PUBLIC_PACK`, i. d. R.
  `music`) frei; andere Packs brauchen ein Passwort (`/api/unlock`). Ein 401 `{error:"locked"}` löst
  jetzt den Freischalt-Dialog statt eines rohen Fehlers aus (FB21).

---

## Pflege-Hinweis
Diese Datei ist die Referenz für die **Intro-Tour** (`#tour*` in `public/index.html`, pack-neutral
aus `CFG`) und das **Hilfe-Popover** (`#helpbox`). Ändert sich eine Funktion oder ihr Ort, hier und
dort gleichziehen. Feedbackrunden & Entscheidungen stehen in `BACKLOG.md`.
