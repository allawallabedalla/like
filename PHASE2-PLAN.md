# PHASE 2 — Agentischer, iterativer Abarbeitungsplan

**Zweck:** Der in `BACKLOG.md` → „Runde 24" erhobene Reifegrad-Backlog (74 Punkte, Phasen 2a–2f)
wird hier in ein **autonom ausführbares, resumierbares** Abarbeitungsmodell übersetzt. Dieses Dokument
ist die Betriebsanleitung für die Umsetzung — sowohl für einen Agenten-Lauf als auch für eine:n Mensch:in.

**Autorisierung dieses Laufs (Betreiber-Entscheidung, 2026-07-17):**
1. **Umfang:** So viel wie möglich über ALLE Phasen — jeder autonom oder mit-konservativem-Default
   machbare Punkt wird umgesetzt, verifiziert, committet und im BACKLOG abgehakt. Nur echte
   *operator-only*-Punkte und *große Bretter* werden geparkt (siehe §7).
2. **Bei Unklarheit:** Konservativ die sicherste **reversible** Variante wählen, im Commit + gebündelt
   im PR transparent vermerken, weiterlaufen. Nur **Irreversibles** (Datenmigration, Löschen, externe
   Wirkung) wird geparkt und vorgelegt.
3. **Recht/ToS:** ENV-Verdrahtung + reversible Guards — echte Rechtsdaten sind KEIN Code-Blocker
   (siehe §6). RA/Bandcamp: ENV-Kill-Switch + UI-Degradations-Signal statt Entfernen.
4. **Branches:** Ein neuer Branch **je Phase** (`phase-2a` … `phase-2f`), abgezweigt von der
   Assessment-Branch; PR-Basis = Assessment-Branch (gestapelt), damit jeder Phasen-PR nur seine eigene
   Diff zeigt. PR #102 bleibt reines Assessment (+ dieses Plandokument). **Nie ungefragt mergen.**

---

## 1. Grundprinzipien

**P1 — Arbeitseinheit = „Work-Unit" (Datei-Konflikt-Topologie schlägt Phasen-Reihenfolge).**
Die 74 Punkte fassen wenige sehr große geteilte Dateien an (`server.mjs`, `public/index.html`) plus
je-Pack-Dateien. Eine Work-Unit bündelt Punkte, die **dieselbe Datei + dasselbe Thema** betreffen →
**ein Agent, ein fokussierter Commit**. So entstehen weder Merge-Konflikte auf den geteilten Dateien
noch Sammel-Commits. Disjunkte Per-Pack-Units dürfen parallel laufen (Worktree-Isolation).

**P2 — Resumierbar by design.** Der Lauf überspannt mehrere Kontextfenster/Session-Limits. Der
**Ledger ist der BACKLOG selbst**: `- [ ]` → `- [x]` wird MIT der jeweiligen Änderung committet. Beim
Wiederaufsetzen: BACKLOG lesen, beim ersten offenen Punkt der aktuellen Phase weitermachen. Git-History
+ Checkboxen sind die vollständige Zustandsmaschine — kein externer State nötig.

**P3 — Zwei-Stufen-Verifikation als Rückgrat (§4).** Nichts wird committet, das nicht mindestens die
schnelle Stufe besteht; nichts mit Laufzeit-Wirkung ohne die volle Stufe.

**P4 — Jeder Punkt ist vorab klassifiziert (§5-Legende):**
`[A]` autonom · `[D]` autonom mit konservativem Default · `[O]` operator-only (geparkt, §7) ·
`[B]` großes Brett (geparkt, §7).

**P5 — Konservativer Default & Transparenz.** Bei `[D]` immer die reversible Minimal-Variante; die
Entscheidung landet im Commit-Body UND gesammelt im „Entscheidungs-Log" des Phasen-PRs (§6).

---

## 2. Der iterative Loop (pro Work-Unit)

```
1. PICK    – nächste offene Work-Unit der aktuellen Phase (Reihenfolge §5).
2. BRANCH  – auf dem Phasen-Branch (einmal je Phase von der Assessment-Branch abgezweigt).
3. READ    – betroffene Datei(en) + Beleg-Zeilen aus dem BACKLOG lesen; Ist-Zustand bestätigen.
4. EDIT    – kleinste korrekte Änderung; Stil des Umfelds spiegeln (Kommentar-Dichte, i18n-Muster).
5. VERIFY↓ – node --check betroffene .mjs  →  npm run check  →  (bei Laufzeit-Wirkung) npm run test:ci.
6. DOC     – bei UI-Änderung USABILITY.md mitpflegen; BACKLOG-Checkbox abhaken.
7. COMMIT  – ein thematischer Commit; Body nennt Punkt(e), Default-Entscheidungen, Live-Vorbehalte.
8. LOOP    – zurück zu 1, bis die Phase leer ist  →  PUSH + PR (Basis = Assessment-Branch).
```

**Parallelisierung:** Nur disjunkte Per-Pack-Units (z. B. `packs/games/pack.mjs` vs.
`packs/plants/pack.mjs`) dürfen gleichzeitig laufen — dann je in eigenem Worktree, danach sequenziell
verifizieren. Alles, was `server.mjs` oder `public/index.html` anfasst, läuft **seriell**.

---

## 3. Reihenfolge über die Phasen (Risiko-/Abhängigkeits-Topologie)

Innerhalb der Betreiber-Vorgabe „hoch/S zuerst, Music vor Labs, aber Ehrlichkeit/Recht/Sicherheit
ranghoch" wird nach steigendem Blast-Radius sortiert:

1. **Reversibel & voll verifizierbar zuerst** — Doku, i18n, seedChips, Fokusring, Retry/Backoff,
   Dedup, Ehrlichkeits-Labels. Baut Momentum, minimales Risiko. (Teile von 2a/2d/2e/2f)
2. **Recht/Compliance als ENV-Verdrahtung** (2b) — mechanisch, reversibel, hoher Wert.
3. **Sicherheit/Ops** (2c) — größerer Blast-Radius: CSP **zuerst als Report-Only**, Rate-Limit mit
   großzügigen Grenzen; jede Änderung mit voller Test-Suite.
4. **Relations-Qualität der Labs** (2d-Kern) — größte Logik-Umbauten, meist mit „Live-Vorbehalt".
5. **Geparkt** — operator-only + große Bretter (§7).

---

## 4. Verifikations-Protokoll

| Stufe | Kommando | Wann | Dauer |
|---|---|---|---|
| Syntax | `node --check <datei>.mjs` | nach jeder .mjs-Änderung | Sekunden |
| Schnell | `npm run check` (Config-Schema + Server-Boot je Pack) | nach jeder Work-Unit | Sekunden |
| Voll | `npm run test:ci` (Playwright: API/Pages/PWA/Lock/Responsive/Interactions) | vor jedem Commit mit Laufzeit-Wirkung; immer vor PUSH | Minuten |

- **Umgebungsgrenze:** Externe Such-APIs (Last.fm/TMDB/…) sind hier **nicht erreichbar** — Live-Explore
  ist nicht end-to-end testbar (so wie CI). Änderungen an Quellen-Adaptern/Relations-Logik werden per
  **Logik-/Modul-Test** oder gezieltem Node-Skript geprüft und im Commit als **„Live-Vorbehalt"**
  gekennzeichnet (bestehende Repo-Konvention). Die CI auf GitHub fährt dieselbe Suite gegengeprüft.
- **Visual-Regression** (`tests/visual.spec.js`) ist umgebungsspezifisch (Baselines linux/Chromium-1194)
  und **nicht** Teil von `test:ci`; bei bewusst gewollten Layout-Änderungen Baselines separat erneuern.
- **Neue Wächter** (geplant in 2f): `scripts/check-packs.mjs` (Pack-Schema über alle 10 Packs) +
  EN-Overlay-Vollständigkeits-Check → in `npm run check` und CI. Danach sichern sie alle Folge-Units ab.

---

## 5. Work-Unit-Landkarte (Gruppierung je Phase)

Legende: `[A]` autonom · `[D]` Default · `[O]` operator-only · `[B]` großes Brett · Datei = Konflikt-Locus.

### Phase 2a — Music-Produktionshärtung
- **U-2a.1 `[A]` music-preview-guard** — `packs/music/pack.mjs` `preview()`: `plausibleFans` auch auf
  `trackPreviewSearch`/`previewByName`-Fallbacks anwenden.
- **U-2a.2 `[A]` musicbrainz-escape** — `lib/musicbrainz.mjs`: Lucene-Quotes sauber escapen statt strippen.
- **U-2a.3 `[A]` songkick-honest** — `lib/coappear.mjs` + `lib/songkick.mjs`: toten Adapter als
  deprecated markieren / aus der aktiven together-Quellenliste nehmen.
- **U-2a.4 `[D]` radar-i18n** — `packs/music/pack.mjs` `radarExtras` + `server.mjs` `/api/radar`:
  Begründungen sprachneutral als `{key,vars}` zurückgeben und serverseitig via `trPack` übersetzen.
  *(Default: bestehendes EN-Overlay-Muster nachziehen.)* — berührt `server.mjs` → seriell.
- **U-2a.5 `[D]` music-demo** — `packs/music/demo.json`: 2–3 Cluster, together-Kanten mit
  Show-Metadaten, Beispiel-Status/Notizen für die statische Preview.
- **U-2a.6 `[D]` mbid-throughchain** — MBID durch RA/Deezer/MB reichen bzw. Fans-Plausi ergänzen;
  Doku ehrlich auf Last.fm-Identität einschränken. *(Live-Vorbehalt.)*
- **U-2a.7 `[D]/[O]` orange-second-source** — Der Ausbau um eine zweite together-Quelle braucht einen
  **Key** (Setlist.fm gratis, operator) → `[O]`-Teil geparkt. **Autonom `[D]`:** UI-Signal, wenn
  together-Daten fehlen/degradiert sind (statt still auf blau-only zu fallen) + ENV-Kill-Switch für RA.

### Phase 2b — Ehrlichkeit, Recht & Compliance (ENV-Verdrahtung)
- **U-2b.1 `[A]` imprint-env** — `server.mjs`: Impressum-Name/Anschrift/E-Mail aus
  `LIKE_IMPRINT_*`-ENV rendern (mailto, DE+EN); `npm run check` schlägt fehl, wenn im gerenderten
  `/impressum` noch Platzhalter (`[Straße]` etc.) stehen. *(Echte Werte = späterer ENV-Eintrag.)*
- **U-2b.2 `[A]` agpl-source-notice** — dauerhafter „Open Source (AGPL-3.0) — Quelltext: <Repo>"-Hinweis
  in Footer/Impressum (`REPO_URL` existiert).
- **U-2b.3 `[A]` baustellen-footer** — `🚧`-Vermerk aus dem globalen Footer entfernen, höchstens an die
  gegateten Labs hängen (`server.mjs`, `lib/landing.mjs`).
- **U-2b.4 `[D]` boardgames-label** — Label „Designer/Verlag" ehrlich auf „vom selben Designer" kürzen
  (DE+EN) — Verlags-Code fehlt. *(Default: kürzen statt Feature nachrüsten.)*
- **U-2b.5 `[D]` share/feedback-transparenz** — Datenschutz um öffentlichen Snapshot (`/s/…`, +noindex)
  ergänzen; Feedback-Repo-Formulierung abschwächen bzw. Privatheit sicherstellen.
- **U-2b.6 `[D]` datenquellen-attribution** — pro Pack Quellen-/Lizenzzeile (Wikipedia CC BY-SA etc.),
  zentral generiert, im Info-Panel + Rechtstexten.
- **U-2b.7 `[O]` ToS-Kill-Switch-Politik / DSGVO-Konto-Löschung / AGB** — Kill-Switch-Mechanik `[A]`,
  aber die *Policy*-Entscheidung + echte Kontakt-E-Mail + Selbstlösch-Flow sind operator-nah → §7.

### Phase 2c — Sicherheit & Betrieb
- **U-2c.1 `[A]` render-preview-gate** — `render.yaml`: PR-Previews nicht mit offenem Gate; noindex auf
  Nicht-Prod; `test:ci`-Regression.
- **U-2c.2 `[D]` csp** — restriktive Basis-CSP **Report-Only zuerst** (`server.mjs`); mittelfristig
  Nonce statt `unsafe-inline`. *(Default: Report-Only, damit nichts still bricht.)*
- **U-2c.3 `[A]` rate-limit** — Pro-IP-Token-Bucket vor explore/radar/preview/geocode/context/bridge;
  `/api/preview` ACAO auf Snapshot-Origins einschränken.
- **U-2c.4 `[A]` anon-quota** — Anon-Writes pro IP drosseln + harte Obergrenze; TTL senken.
- **U-2c.5 `[A]` crash-handler** — `uncaughtException`/`unhandledRejection`; SIGTERM → usage-flush +
  Draining-`server.close`.
- **U-2c.6 `[A]` docker-harden** — `USER node`, `HEALTHCHECK`, `.dockerignore` deny-by-default.
- **U-2c.7 `[A]` feedback-injection** — Drossel pro IP; Nutzertext neutralisieren/Codeblock.
- **U-2c.8 `[A]` sec-regression-tests** — CSV-Escaping, Security-Header/Cookie-Flags, Auth-429, 413/400.
- **U-2c.9 `[D]` observability / backup / auth-hardening** — strukturierte Logs + Pushover-Alarm;
  Off-Disk-Snapshot + Disk-Alarm; Origin-Check auf POSTs, Session-Version, `.session-secret` 0600.

### Phase 2d — Labs (Ehrlichkeit, Inhalt, Freischalt-Blocker)
Per-Pack-Units, überwiegend **parallelisierbar** (disjunkte `packs/<id>/pack.mjs` + `lib`):
travel-geosuche `[D]`, games-orange-feldmatch `[A]`, podcasts/books-blau-ranking `[D]`,
anything-hub-filter `[A]`, movies-degradation `[A]` + lang `[A]`, podcasts-cache `[A]`,
games-steamspy-retry `[A]`, plants-ratelimit/label `[A]`, papers-demo/momentum `[A]`,
travel-vector-rerank `[D]` + i18n `[A]`, books-dedup `[D]`, cross-pack: searchX-disambig `[D]`,
seedChips `[A]`, demo-konsistenz `[A]`, context-EN `[A]`, radarExtras-parität `[D]`, politur `[A]`.

### Phase 2e — Website, Auffindbarkeit, Erstkontakt
CTA/Downloads `[A]`, OG-Bild `[D]`, JSON-LD `[A]`, hreflang/og:locale `[A]`+`[B]`(serverseitige
Sprachvarianten), Produkt-Vorschau `[D]`, Labs-Unlock-Panel `[D]`, PWA-Update-UX `[A]`, Onboarding
pack-neutral `[D]`, Meta-Robustheit `[A]`, No-JS-Fallback `[A]`, Marken-Schreibweise `[A]`(„like").

### Phase 2f — A11y, Tests/CI, Doku, große Bretter
Seiten-Zoom-Fix `[A]`, Fokusring `[A]`, Fokus-Rückgabe/aria `[A]`, canvas-role/Kontrast `[D]`,
CI-Gate-Vollsuite `[A]`, axe-Automatisierung `[A]`, USABILITY/ROADMAP/README-Sync `[A]`,
Server-Fehler-i18n `[D]`, Config-/i18n-Wächter `[A]`, Server-Unit-Tests `[A]`,
große Bretter (SQLite/Mobile-Touch/Konto-Sync/Demo-Katalog) `[B]` → §7.

---

## 6. Entscheidungs- & Commit-Konvention

- **Commit-Body:** nennt den/die BACKLOG-Punkt(e), die getroffene `[D]`-Entscheidung samt Alternative,
  die Verifikation (`npm run check`/`test:ci` grün) und ggf. den **Live-Vorbehalt**.
- **Entscheidungs-Log:** Jeder Phasen-PR-Body sammelt die `[D]`-Defaults als Liste „Getroffene
  Default-Entscheidungen (reversibel, bitte gegenlesen)" — so ist jede Annahme an einer Stelle prüfbar.
- **Keine Session-/Chat-Links** in Commits/PRs (CLAUDE.md). **Nie ungefragt mergen.**
- **Ein Commit = ein Thema.** Keine Sammel-Commits über Work-Units oder Phasen hinweg.

---

## 7. Geparkt — braucht Betreiber-Entscheidung oder ist ein eigenes Vorhaben

**Operator-only (Fakten/Policy, die ein Agent nicht erfinden darf):**
- Echte Impressums-Angaben (Name, ladungsfähige Anschrift, Kontakt-E-Mail) — Mechanik ist verdrahtet
  (U-2b.1), es fehlen nur die Werte als ENV.
- Feste ToS-Linie für RA/Bandcamp (behalten mit Kill-Switch vs. entfernen) — Kill-Switch ist gebaut,
  die *Policy* entscheidet der Betreiber.
- DSGVO-Konto-Selbstlöschung + Datenexport: Flow baubar, aber Kontakt-/Prozess-Entscheidung nötig.
- Ob überhaupt ein Labs-Pack **freigeschaltet** wird (das ist die eigentliche „Phase 3").
- Zweite together-/similar-Quelle mit Key (Setlist.fm/Songkick/Bandsintown app_id).

**Große Bretter (eigenes Vorhaben, nicht in diesem Lauf):**
- SQLite statt `graph.json`; Quadtree/Barnes-Hut fürs Layout (Skalierung ab ~800 Knoten).
- Mobile-/Touch-Reife der Canvas-App (Safe-Area, Touch-Ziele, iOS-PWA) als eigener Prüf-/Bauzyklus.
- Konto-/Geräte-Sync-Erlebnis (Merge-Verhalten) über die reine Persistenzschicht hinaus.
- Vollständiger Demo-Katalog (≥12 Einträge je Pack, travel/anything auffüllen) als Kurations-Aufgabe.
- Serverseitige Sprachvarianten-Auslieferung mit `hreflang`/`canonical` (SEO für EN).

---

## 8. Fortschritt

Der Fortschritt lebt in den **BACKLOG-Checkboxen** (Runde 24) und der Git-History. Diese Datei bleibt
die Methodik; sie wird nur angefasst, wenn sich das *Vorgehen* ändert, nicht bei jedem Punkt.
