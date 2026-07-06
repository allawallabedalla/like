# BUGS — E2E-Befunde

Dokumentation der bei den Playwright-E2E-Tests gefundenen Probleme.
**Nicht gefixt** (per Auftrag), nur dokumentiert. Schweregrad + Repro je Eintrag.

Legende: 🟥 hoch · 🟧 mittel · 🟨 niedrig · ℹ️ umgebungsbedingt (kein App-Bug)

---

## ✅ B1 — `/favicon.ico` liefert 404 — BEHOBEN
- **Wo:** alle Seiten (Browser fordert Favicon automatisch an).
- **Repro:** `curl -s -o /dev/null -w "%{http_code}" http://<host>/favicon.ico` → `404`.
- **Wirkung:** kosmetisch — Browser-Tab ohne Icon; eine 404-Zeile in der Konsole/Netzwerk.
- **Ursache:** `server.mjs` liefert nur die in `PWA_ASSETS` gelisteten Icons; `/favicon.ico`
  ist nicht dabei und es gibt kein `<link rel="icon">` in den Seiten.
- **Fix:** `/favicon.ico` in `server.mjs` (`PWA_ASSETS`) auf `icons/icon-192.png` gemappt →
  liefert jetzt `200 image/png`. Verifiziert. (Allowlist bleibt defensiv bestehen.)

---

## ℹ️ E1 — Externer GitHub-Release-Check schlägt fehl (umgebungsbedingt)
- **Wo:** `/?pack=music` (App) lädt beim Start `https://api.github.com/repos/…/releases/latest`.
- **Repro:** App öffnen → `requestfailed net::ERR_CERT_AUTHORITY_INVALID` für api.github.com.
- **Wirkung:** in dieser Test-/Agent-Umgebung scheitert der Aufruf an der TLS-Prüfung des
  Proxys; **in Produktion (https, echtes Netz) funktioniert er**. Kein App-Bug.
- **Test-Umgang:** cross-origin-Responses/-Failures werden ignoriert (nur same-origin zählt).

---

## ✅ B2 — Kachel-Label ragt bei 375 px über den rechten Rand — BEHOBEN
- **Wo:** Landing bei 375 px Breite, breiteste Beschriftung („Like Board Games").
- **Repro:** Landing bei 375×812 laden → Bounding-Box der Kachel `.planet` für Board Games
  hat `right ≈ 389 px` (Viewport 375) → ~14 px Label-Überhang rechts.
- **Wirkung:** rein kosmetisch — die **interaktive Kugel (`.orb`) bleibt vollständig sichtbar
  und tappbar**; nur der Text-Teil des Labels wird am Rand leicht beschnitten.
- **Ursache:** Planeten liegen auf festen Ringradien (`base*ring.f`) um die Bildschirmmitte;
  die Kachelbreite folgt der Labelbreite, ein langes Label auf dem Außenring kann so den
  Viewport-Rand überschreiten. Kein Clamping an die Fensterbreite.
- **Fix:** `.plabel` in `lib/landing.mjs` bei `≤480px` auf `max-width:90px` + `white-space:normal`
  (Umbruch statt nowrap) gedeckelt → keine Kachel ragt mehr über den Viewport. Verifiziert bei 375.
- **Test:** `responsive.spec.js` prüft jetzt, dass **ganze Kacheln** (inkl. Label) bei 375 & 1440
  vollständig im Viewport liegen.

<!-- Weitere Einträge werden von den restlichen Testfiles ergänzt. -->
