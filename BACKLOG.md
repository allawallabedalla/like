# BACKLOG — Runde 3 (Politur & Radar/Entdecken)

**Angelegt:** 2026-07-08 07:38 CEST (05:38 UTC)
**Branch:** `claude/chat-crash-unresponsive-aya13j` → danach PR nach `main` (nicht mergen ohne Freigabe).

Leitmotiv weiter: fließend/organisch, klares Feedback, sinnvolle Defaults.

---

## Offene Punkte

- [x] **C1 — Fade-in gestaffelt/random.** Der Planeten-Fade-in ist gut, aber alle blenden
  gleichzeitig ein. Stattdessen zeitlich minimal versetzt (leicht randomisiert) nacheinander.

- [x] **C2 — ＋ fokussiert das neue Sternensystem.** Klick auf ＋ an einem Mond soll den View auf
  den neu erzeugten „Sonne"-Act (den ausgebauten Artist im Zentrum) zentrieren/folgen — nur ohne
  das Info-Panel zu öffnen (das war C-alt B7). Also center=true, select=false.

- [x] **C3 — Kein Intro-Modal im Private-Tab.** Im privaten Fenster erscheint beim Start kein
  Onboarding-Intro. Prüfen, ob das am Browser (localStorage/Storage-Partitionierung) liegt oder an
  einer App-Bedingung — und ggf. so lösen, dass es im Private-Tab trotzdem beim Erststart kommt.

- [x] **C4 — Intro erklärt Linien + Größe/Abstand.** Im Intro-Modal erklären, was die beiden
  Linienfarben bedeuten (blau = ähnlicher Stil, orange = zusammen aufgetreten) UND was
  Planetengröße (Popularität/Hörer) und Abstand (Ähnlichkeit) aussagen.

- [x] **C5 — Vorschau-Indikator am Mond.** Der Knoten, dessen Klangprobe gerade läuft, soll wieder
  einen kleinen Indikator (Ring/Puls) bekommen (gab es früher schon mal).

- [x] **C6 — Preview-Plausi-Check gegen Genres.** In der Artist-Match/Preview kam wieder eine
  Klangprobe, die nicht zu den angezeigten Genres passt. Plausibilitätsprüfung einbauen (Track/
  Artist der Vorschau gegen den Act/seine Genres abgleichen, sonst keine bzw. bessere Vorschau).

- [x] **C7 — Scrub-Line konstante Größe.** Die Pille passt sich weiter dem Titel an (langer Name =
  breitere Pille), aber die Scrub-Leiste selbst soll IMMER gleich groß sein (feste Breite), nicht
  mit dem Titel mitwachsen.

- [x] **C8 — Radar nur im sichtbaren Bild.** Das Radar soll neue Artists nur im aktuell sichtbaren
  Ausschnitt auftun/platzieren, nicht irgendwo außerhalb.

- [x] **C9 — Entdecken als Dropdown.** Das „Entdecken"-Modul öffnet aktuell am rechten
  Bildschirmrand; es soll als Dropdown direkt unter dem „Entdecken"-Knopf erscheinen.

- [x] **C10 — Radar-Knopf-Feedback + Schließen.** Der Radar-Knopf gibt kein Feedback (aktiv/offen),
  und man weiß nicht, wie man das Radar-Fenster wieder schließt. Aktiv-Zustand am Knopf + klare
  Schließen-Möglichkeit.

---

## Arbeitsweise
1. Punkt für Punkt, Haken setzen.
2. Wo möglich im vorinstallierten Chromium verifizieren (Server + Playwright; Graph via /api/import).
3. Sinnvolle Commits, am Ende PR nach `main` — nicht ungefragt mergen.
