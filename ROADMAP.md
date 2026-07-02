# Like — Roadmap

Stand: Suche + Doppelklick-Durchhangeln, Last.fm (ähnlicher Stil) + RA (zusammen aufgetreten),
Genres, Einzel-/Massen-Löschen, bekannt/Notiz, flaches s/w-Design mit zwei Kantenfarben.

---

## ✅ Erledigt (autonom, ohne Keys/Kosten)
- Booking-Infos aus RA im Panel (Agentur/Kontakt, Region, Socials, Website)
- „tritt auf?"-Badge (RA upcoming events) + grüner Punkt am Knoten
- Genres für alle Acts (beim Anklicken via Last.fm-Tags nachgeladen)
- Lade-Indikator am Knoten (pulsierender Ring)
- Caching-Layer (RA + Last.fm, Datei-Cache mit TTL)
- Status-Pipeline (Shortlist/angefragt/bestätigt/abgesagt) als farbige Ringe
- Genre-Filter (Topbar), CSV-Export der markierten Acts (inkl. Kontakt/Region)
- Karte als PNG exportieren
- Einzel-Act löschen mit **Undo**, Datenputz-Migration alter Stände
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

### Offen (braucht Keys/OAuth → nicht autonom)
- Spotify Audio-Features (OAuth), Songkick/Bandsintown aktivieren (Key/app_id) — Adapter liegen bereit

### Offen (größer, später)
- Quadtree/Barnes-Hut fürs Layout (erst ab ~800 Knoten nötig), SQLite, Mobile/Touch,
  Zeitachse, mehrere Projekte, Alias-/Dublettenabgleich

---

## 🟢 Quick Wins (klein, hoher Nutzen)

- **Booking-Infos aus RA ins Panel.** RAs Artist-Schema hat `bookingDetails` (Kontakt/Agentur),
  `website`, `soundcloud`, `instagram`. Direkt im Panel anzeigen → vom Entdecken zum Kontaktieren.
- **„Tritt auf?"-Signal.** RA `events(type:UPCOMING)` abfragen → Badge „aktiv / kommende Shows" vs.
  „keine Termine". Für Booking entscheidend: wer ist überhaupt buchbar?
- **Genres für ALLE Knoten.** Aktuell nur für geöffnete Acts. Last.fm-Tags beim Hinzufügen
  (lazy, gedrosselt) nachladen → das ganze Netz wird lesbar.
- **Lade-Indikator am Knoten.** Während Explore läuft, Spinner/Puls am Knoten statt nur Toast.
- **Datenputz.** Alte `a.bl`-Backlink-Caches (aus dem früheren Auto-Lauf) + verwaiste Knoten
  aus graph.json entfernen → kleiner, schneller.

## 🔵 Booking-Power (macht es zum echten Werkzeug)

- **Caching-Layer.** RA/Last.fm-Antworten lokal cachen (z.B. `cache/`) → Re-Explore sofort,
  weniger Requests, robuster gegen RA-Aussetzer. Wichtigster Robustheits-Hebel.
- **Status-Pipeline statt nur „bekannt".** Mehrere Stati: Shortlist / angefragt / bestätigt / abgesagt.
  Farbcodierte Ringe. Plus Freitext-Notiz (gibt's schon).
- **Genre-Filter & -Highlight.** Per Genre filtern oder einfärben → „zeig mir alle Downtempo-Acts
  im Umfeld von X".
- **Region/Szene-Fokus.** RA `area` nutzen → „Acts, die zuletzt in Berlin/UK aufgetreten sind".
- **Export.** Markierte Acts als CSV/Liste rausziehen (Name, Genre, Kontakt, Notiz) fürs Booking.
- **Upcoming-Events-Ansicht.** Pro Act: wann/wo spielt er als Nächstes (RA) → Verfügbarkeit/Touring-Fenster.

## 🟣 Datenqualität & weitere Quellen

- **Spotify Audio-Features.** Echte Klang-Ähnlichkeit (tempo, energy, valence) als dritte Kantenart.
  Braucht OAuth-Setup.
- **Songkick/Bandsintown aktivieren.** Adapter sind eingebaut — nur Key/app_id hinterlegen, dann
  fließen sie automatisch in „zusammen aufgetreten" ein (breitere, nicht nur elektronische Abdeckung).
- **Alias-/Dublettenabgleich.** RA `aliases`, MusicBrainz-IDs → denselben Act nicht doppelt.
- **Blended Score.** Ähnlicher Stil + zusammen aufgetreten zu einer Relevanz verrechnen
  (z.B. Knotengröße = wie stark mit deinem Kosmos verbunden).

## ⚙️ Skalierung & Robustheit

- **Quadtree fürs Force-Layout.** Aktuell O(n²) – ab ~800 Knoten ruckelig. Barnes-Hut → tausende
  Knoten flüssig.
- **SQLite statt graph.json.** Bei wachsendem Bestand; Schema ist schon 1:1 vorbereitet.
- **Undo für Löschen.** Versehentliches Entfernen rückgängig machen.

## 🟡 Später / ambitioniert

- **Mobile/Touch.** Aktuell Desktop (Maus). Pinch-Zoom, Tap=Details, Doppeltap=hangeln.
- **Zeitachse.** „Wer trat 2023 vs. 2024 zusammen auf" – Szene-Entwicklung über Zeit.
- **Teilen/Export der Map** als Bild oder interaktiver Snapshot.
- **Mehrere Graphen/Projekte** (z.B. pro Festival/Event, das du kuratierst).

---

### Empfehlung als Nächstes
1. **RA-Booking-Infos + „tritt auf?"-Badge** (Quick Win, direkt booking-relevant)
2. **Caching** (macht alles schneller & robuster gegen RA-Aussetzer)
3. **Status-Pipeline + Export** (vom Entdecken zur Aktion)
