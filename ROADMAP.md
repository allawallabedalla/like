# Like — Roadmap

Stand **v2.7.0**: Website unter [likelife.info](https://likelife.info) mit 10 Packs — **Like Music**
als Produkt öffentlich, die 9 Labs-Packs hinter dem „Coming soon"-Gate. Kern: klickbare Knoten-Karte
(Space/Flat), Suche + Durchhangeln, zwei Kantenfarben, Radar, Brücke-als-Routenplaner, Listen,
Export/Snapshot, PWA/Docker-Deploy.

> **Aktueller Arbeitsstand:** Die detaillierte, laufend gepflegte Planung steht in `BACKLOG.md`.
> Maßgeblich ist **Runde 24** (Domänen-Reife-Bewertung + Phase-2-Abarbeitung): Reifegrad-Matrix aller
> 10 Packs/Querschnitt-Aspekte, priorisiert nach „Music-Produktionsqualität vor Labs-Parität, plus
> Ehrlichkeits-/Rechts-/Sicherheits-Defizite ranghoch". Diese Datei hält nur den groben Kurs.

## Fokus-Entscheidung (2026-07)

**Like Music ist das Produkt. Die neun anderen Packs sind Labs.** Booking, Klangprobe,
Radar-Momentum und die orange „zusammen aufgetreten"-Kante existieren nur bzw. primär im
Musik-Pack; in Produktion sind die übrigen Packs hinter dem „Coming soon"-Gate gesperrt.
Deshalb fließt gezielte Feature-/Qualitätsarbeit zuerst in Musik — die Labs-Packs bleiben
funktionsfähig und erreichbar, bekommen aber keine Parity-Runden mehr, solange sie gesperrt
sind. Wird ein Labs-Pack entsperrt, werden seine aufgeschobenen Punkte (siehe BACKLOG,
z. B. E14) zusammen mit der Freischaltung angegangen.

---

## ✅ Erledigt (autonom, ohne Keys/Kosten)
- **v2.6: Like-Listen** — mehrere benannte Sammel-Listen statt einem Einzel-Korb. Es gibt immer
  genau eine *aktive* Liste (Umschalter im Korb-Kopf, Farbe am „like!"-Button) — dorthin landet
  „like!"; das ▾ am Button bzw. langes Drücken öffnet einen Picker, um einen Act bewusst in
  mehrere Listen zu legen. Listen-Zugehörigkeit als farbige Punkte am Knoten. Der alte Korb
  (`a.basket`) wandert verlustfrei in die Default-Liste (Server-Migration + localStorage-Übernahme).
  Datenmodell „klein": Mitgliedschaft je Act in `a.lists[]`, Listen-Definitionen in `graph.lists`;
  Status/Gage/Notiz bleiben global (Pro-Liste-Status wäre die spätere Ausbaustufe).
- Brücke als **Routenplaner**: bidirektionale Breitensuche mit Server-Sitzung
  (/api/bridge + /step + /stop) — kürzeste Verbindung zuerst, bis zu 7 Zwischenstationen;
  Fortschrittsbalken in der Brückenleiste, „Weitersuchen?"-Dialog nach 5/10/15/… Sekunden
- Feature-Parität der Packs mit Like Music: leichtes `similar()` (schnellere Brücke)
  und „Überrasch mich" (`surprise()` mit kuratiertem Seed-Pool) in allen 10 Domänen
- Booking-Infos aus RA im Panel (Agentur/Kontakt, Region, Socials, Website)
- „tritt auf?"-Badge (RA upcoming events) + grüner Punkt am Knoten
- Genres für alle Acts (beim Anklicken via Last.fm-Tags nachgeladen)
- Lade-Indikator am Knoten (pulsierender Ring)
- Caching-Layer (RA + Last.fm, Datei-Cache mit TTL)
- Status-Pipeline (Shortlist/angefragt/bestätigt/abgesagt) als farbige Ringe
- Genre-Filter (Topbar), CSV-Export der markierten Acts (inkl. Kontakt/Region)
- Karte als PNG exportieren
- Einzel-Act löschen mit **Undo**, Datenputz-Migration alter Stände
- v1.8: Streaming-Logo-Buttons (YouTube/Spotify/Tidal-Suche, flach/rahmenlos), externe
  Links öffnen im System-Browser (shell.openExternal statt In-App-Fenster), Label-Halo
  gegen Text-Überlappung bei Hubs, dezente Knotengröße nach Hörerzahl, Topbar-Buttons
  ohne Rahmen-Überlappung
- v1.7.2: Robustheit/Performance-Review — Last.fm-Drossel (kein 429 bei Radar/Snapshot),
  Radar-Cache wird bei jeder Graph-Mutation geleert (persist-Wrapper), Karten-Shortcuts
  bei offenem Modal deaktiviert, Render-on-Demand (Leerlauf ~7 statt 60 fps -> weniger CPU/Akku)
- v1.7: Onboarding-Kurz-Tour beim Erststart (4 animierte SVG/CSS-Slides, kein GIF-File),
  wieder aufrufbar über „?“
- v1.6: Dark Mode, Graph-Backup (Export/Import mit Auto-Sicherung), Quellen-Diagnose
  (Live-Ping aller Quellen), Update-Hinweis, Ring-Auffächerung neu geladener Acts,
  gemerkte Ansicht; CI-Gate (Config-Schema-Check + Server-Smoke-Test vor dem Build)
- v1.5.1: Windows auch als NSIS-Installer (weniger AV-Fehlalarme als Portable),
  Publisher-Metadaten, SHA256-Prüfsummen im Release, Verifizieren-/Meldehinweise
- v1.5: 30-Sekunden-Klangprobe (Deezer-Preview, Fallback iTunes) — ▶ im Panel
  und je Radar-Eintrag; Versionsnummer im Header
- v1.4: Radar-Cache + Aktualisieren-Button + Zeitstempel, like!/▶(YouTube) je
  Radar-Eintrag, Auto-Snapshot beim Start, Wochen-Digest (Momentum-Zusammenfassung),
  Setlist.fm-Adapter (geteilte Bühnen/Opener, optionaler Gratis-Key), Space-Grotesk-
  Schrift (offline eingebettet), flache monochrome Icons statt Emoji, Millionen-Formatierung
- Kleine-Acts-Paket (v1.3): Hörerzahlen (Last.fm getInfo) + Momentum-Zeitreihe
  (stats.json), 📡 Radar mit Geheimtipp-Score 2.0 (Nähe × Kleinheit × Momentum × Boni,
  Kandidaten aus Graph + Deezer-Related + Bandcamp-New-Arrivals), Label-Umfeld via
  MusicBrainz, Bandcamp-Ort als Fallback, „Große dämpfen"-Filter
- UX-Politur (v1.2): Karte startet zentriert + „Alles zeigen", Zoom-Buttons, Empty-State
  beim Erststart, Hilfe-Popover (alle Shortcuts), API-Key-Dialog in der App (Erststart ohne
  eingebetteten Key), Systemschrift statt Google Fonts (offline-fähig), responsive Topbar,
  Korb/Legende ohne Überlappung, Tooltip/Kontextmenü bleiben im Fenster

### Offen (braucht Keys → nicht autonom)
- Bandsintown aktivieren (app_id) als zweite „zusammen aufgetreten"-Quelle neben RA — Adapter liegt
  bereit. (Songkick ist inzwischen real tot und aus der Kette genommen, siehe BACKLOG Runde 24.)
- Zweite **offizielle** together-Quelle (ListenBrainz) als Absicherung der orange Kante gegen
  RA-Ausfall — in Runde 24 (Phase 2a) geparkt, weil Key/Aufwand nötig.

> **Spotify Audio-Features gestrichen.** Spotify hat die dafür nötigen Endpoints
> (`audio-features`, `audio-analysis`, `recommendations`, `related-artists`) am
> 27.11.2024 für neu angelegte Apps abgeschaltet — ein frischer App-Key käme nicht
> mehr an die Daten. Als dritte Klang-/Ähnlichkeitsquelle wäre stattdessen
> **ListenBrainz** (gratis, MusicBrainz-basiert, kein OAuth) die realistische Option.

### Offen (größer, später)
- Quadtree/Barnes-Hut fürs Layout (erst ab ~800 Knoten nötig), SQLite, Mobile/Touch,
  Zeitachse, mehrere Projekte, Alias-/Dublettenabgleich

---

## Offene Richtungen (grob; Details & Priorisierung in BACKLOG Runde 24)

Die früher hier gepflegten Quick-Win-/Booking-Power-Listen sind abgearbeitet (siehe „Erledigt") bzw.
in die feinkörnige BACKLOG-Planung übergegangen. Was als größere Richtung offen bleibt:

- **Music-Produktionshärtung** (Flaggschiff zuerst): orange Kante gegen RA-Ausfall absichern
  (zweite offizielle Quelle), MBID-Schärfe durch die Adapter-Kette, Namensvetter-Robustheit.
- **Labs-Reife → Freischaltung:** je Labs-Pack die in der Reifegrad-Matrix genannten Blocker
  schließen, dann Gate öffnen. „Like Anything" ist der freischalt-nächste Pack.
- **Ehrlichkeit, Recht & Sicherheit** ranghoch: Impressum-Pflichtangaben, CSP/Rate-Limits,
  Quellen-Attribution, DSGVO-Selbstlöschung/Export.
- **Skalierung:** Quadtree/Barnes-Hut fürs Layout (ab ~800 Knoten), SQLite statt `graph.json`
  bei wachsendem Bestand.
- **Datenquellen:** ListenBrainz als dritte Ähnlichkeits-/together-Relation (ersetzt die von
  Spotify am 27.11.2024 abgeschalteten Audio-Feature-Endpoints), Alias-/Dublettenabgleich.
