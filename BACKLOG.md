# BACKLOG — Politur „fließend & organisch"

**Angelegt:** 2026-07-07 15:54 CEST (13:54 UTC)
**Autonomer Start geplant:** 2026-07-07 17:21 CEST
**Branch:** `claude/chat-crash-unresponsive-aya13j` → danach PR nach `main`.

Leitmotiv über allem: **alles soll fließend und organisch wirken — keine plötzlichen
Erscheinungen, kein Zappeln, keine hakeligen Trefferflächen.**

---

## Offene Punkte

- [x] **B1 — Nicht sichtbare Planeten haben keine Hover-Funktion.** Durch das Zoom-LOD
  ausgeblendete Grad-≤1-Blätter dürfen bei Hover **keine** Aktion/Badge/Tooltip auslösen.
  Erst wenn sie durch Reinzoomen sichtbar sind, reagieren sie. → `pick()`/Hover/Badges
  müssen dieselbe LOD-Sichtbarkeit respektieren wie `draw()` (heute nur visuell ausgeblendet,
  aber weiter pickbar).

- [ ] **B2 — Reinfaden statt reinploppen (LOD).** Wenn Blätter/Kanten durchs Zoomen wieder
  erscheinen, sollen sie **weich einblenden** (Alpha-Fade), nicht schlagartig aufpoppen.
  Analog beim Ausblenden. Zoom-Schwelle 0.85 mit weichem Übergangsband statt hartem Cutoff.

- [ ] **B3 — Preview-Pill: Größe bei Maus-Näherung konstant.** Aktuell fährt die Scrub-Leiste
  ein und die Pille wird breiter. Gewünscht: **Breite bleibt gleich**; bei Maus-Näherung
  **ersetzt die Scrub-Leiste den restlichen Inhalt** (Stop bleibt, statt EQ+Titel kommt die
  Spulleiste + Zeit). Maus weg → wieder die ursprüngliche Ansicht (EQ + Titel).

- [ ] **B4 — „+" an Planet zappelt.** Beim Klick auf ＋ (ausbauen/Nachbarn laden) zappelt das
  Layout noch spürbar. Reheat/Federn beruhigen, damit der Vorgang ruhig aussieht.

- [ ] **B5 — Abstands↔Ähnlichkeits-Korrelation prüfen.** Stimmt die Feder-Ruhelänge noch mit
  der %-Ähnlichkeit (Last.fm-`match`) überein? Näher = ähnlicher soll klar ablesbar sein.

- [x] **B6 — Manche Acts zeigen kein „+".** Warum fehlt bei manchen Planeten die ＋-Erweiterung?
  Bedingung in `isMoonHover()`/Badge-Logik prüfen (Grad, `_moon`, seed, appear).

- [x] **B7 — „+" öffnet auch die Info.** Klick auf ＋ ruft zusätzlich `selectNode` (öffnet Panel).
  Das soll ＋ **nicht** — ＋ nur ausbauen, Info bleibt dem ⓘ/Kugelklick vorbehalten
  (wie schon beim Play-Knopf getrennt).

- [x] **B8 — Hitboxen/Hover um ＋ und ⓘ verbessern.** Fühlt sich hakelig an. Trefferflächen,
  Hover-Persistenz und das „Badges zählen zum Hover"-Verhalten überarbeiten, damit das Anpeilen
  der Badges sauber und ruhig ist.

- [ ] **B9 — Zentrums-Planeten stillstellen.** Planeten nahe der Bildmitte (~50 % Screenhöhe/
  -breite) sollen ruhen (nicht umherwandern/kreisen), damit der Überblick erhalten bleibt.

- [ ] **B10 — Gesamt-Audit „keine plötzlichen Erscheinungen".** Alle Funktionen durchgehen
  (Spawn, Badges, Labels, Panel, Pille, Szenen, Brücken, Radar) und jedes schlagartige
  Erscheinen/Verschwinden in ein weiches Ein-/Ausblenden überführen.

- [x] **B11 — Legende: Datenquellen-Hinweise entfernen.** Auf dem Main-Screen die Quellenangaben
  in der Legende (z. B. „(Last.fm)", „(RA)") wegnehmen.

- [x] **B12 — Legende dynamisch.** Die Main-Screen-Legende soll nur zeigen, was **gerade sichtbar**
  ist (nur vorkommende Kantentypen/Zustände/Farben), statt statisch alles aufzulisten.

- [ ] **B13 — Intro-Modal: Hover-Zustand der Knöpfe prüfen.** Ist das Intro-Modal sauber
  (die zuletzt ergänzte Slide 5)? Insbesondere die **Button-Darstellung bei Hover** prüfen
  und ggf. korrigieren.

---

## Arbeitsweise für den autonomen Lauf
1. Jeden Punkt einzeln umsetzen, Haken setzen.
2. Wo möglich im vorinstallierten Chromium verifizieren (Server + Playwright, wie in `NOTES.md`).
3. In sinnvollen Commits bündeln, dann **PR nach `main`** (nicht ungefragt mergen — auf Freigabe warten).
4. Bei echter Mehrdeutigkeit kurz nachfragen statt raten.
