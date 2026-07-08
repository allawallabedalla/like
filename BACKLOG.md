# BACKLOG — Runde 4 (Layout & Venues)

**Angelegt:** 2026-07-08 07:52 CEST (05:52 UTC)
**Branch:** `claude/chat-crash-unresponsive-aya13j` → PR #16 (offen). Runde 4 kommt oben drauf.

---

## Punkte

- [x] **D1 (Frage) — Planetenskalierung absolut oder relativ?** BEANTWORTET: **absolut** (globale
  Skala), nicht relativ zu den Nachbarn. `radiusTarget = 4 + min(16, Grad^0.68·2.6) + Popularität·5`
  — Grad = feste Formel (gedeckelt), Popularität = feste log-Skala (~1k–10M Hörer). Ein Act ist
  überall gleich groß. (Popularität liest sich zusätzlich über den Glow.)

- [x] **D2 — „Netz sortieren"-Funktion.** Ein Knopf, der das Layout aufräumt, sodass sich möglichst
  wenige Linien kreuzen. Ansatz: Communities/Szenen in getrennte Sektoren um die Mitte legen +
  innerhalb gleichmäßig streuen, dann sanft settlen (Kollision/Abstände, kein Zappeln).

- [x] **D3 — Venues-Ansicht überarbeiten.** Aktuell erscheinen Venues als eigene Planeten, deren
  Position und Größe nicht zum Artist-Gedanken passen. Sinnvoller: Venue sitzt am **Schwerpunkt der
  Acts**, die dort gespielt haben (Position = „mitten unter seinen Acts"), und ist als **Ort** klar
  von Artists unterscheidbar (Form/Größe), ohne die Artists umherzuschieben.

- [x] **D4 (Folgefrage) — Abstand zur Sonne: kombinierte Bindung.** Abstand kommt aus der
  Kantenstärke (Ruhelänge), nicht nur aus Ähnlichkeit. Neu (Option A): beide Kantenarten pro Paar
  zu EINER Bindungsstärke verrechnet (prob. ODER: `bond = 1 − ∏(1−strength)`), Feder-Ruhelänge nutzt
  `bond`. Zusätzlich sind Single-Nachbar-Satelliten auch mit zwei Kantenarten jetzt Monde. Ergebnis:
  „ähnlich UND zusammen" = am nächsten. Verifiziert: Space both 70 (< 71), Flat both 135 (< 169).

---

## Arbeitsweise
1. Punkt für Punkt, Haken setzen. Im Browser verifizieren wo möglich.
2. Sinnvolle Commits; Runde 4 geht auf denselben Branch (PR #16 wächst mit) — nicht ungefragt mergen.
