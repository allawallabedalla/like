# BACKLOG — Runde 5 (Spawn, Suche, Brücken, Quellen, Sortier-Knopf)

**Angelegt:** 2026-07-08 08:36 CEST (06:36 UTC)
**Branch:** `claude/chat-crash-unresponsive-aya13j` → PR nach `main` (nicht ungefragt mergen).

---

## Punkte

- [ ] **E1 — Landing-Footer / „PR#" (RÜCKFRAGE).** Footer zeigt „v2.4.0 · alle Domänen in einer App ·
  Impressum · Datenschutz". Unklar, was „überall den PR# einfügen" meint — mit dir klären.

- [x] **E2 — Spawn-Stagger kontinuierlich.** Der zeitversetzte Fade-in klappt noch nicht: aktuell
  sind zwei sofort da und der Rest fadet als Klumpen rein. Es soll ein KONTINUIERLICHES, nach-
  einander „Mehr-Erscheinen" sein (Kaskade), nicht Batch.

- [x] **E3 — Neuer Such-Artist landet teils sehr weit weg.** Suche zentriert zwar schön, aber der
  neu eingefügte Artist liegt manchmal weit draußen. Platzierung prüfen & korrigieren (Seed +
  seine neuen Nachbarn sinnvoll um die Mitte gruppieren).

- [x] **E4 — Brücke bauen defekt + findet wenig.** Brücke zwischen zwei noch unverknüpften Acts
  klappt nicht: Meldung „sind schon auf der Karte", aber kein verbindendes Netz sichtbar. Zudem
  findet der Brückenbauer wenig — nachschärfen.

- [x] **E5 — Co-Auftritt-Quellen für nicht-elektronische Acts.** RA ist elektronik-lastig; für
  andere Genres große Lücken bei „zusammen aufgetreten". Woher sonst? (Setlist.fm/Songkick/
  Bandsintown prüfen — was ohne Key/kostenlos geht.)

- [x] **E6 — „Netz sortieren" in die Titelleiste.** Aktuell im Entdecken-Menü (schwer zu finden,
  wirkt „hinter den Venues"). Als eigener Knopf oben in die Topbar (zu ?/⋯ usw.).

---

## Arbeitsweise
Punkt für Punkt, Haken setzen, im Browser verifizieren wo möglich. Sinnvolle Commits, dann PR.
