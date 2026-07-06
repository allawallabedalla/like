# BUGS — E2E-Befunde

Dokumentation der bei den Playwright-E2E-Tests gefundenen Probleme.
**Nicht gefixt** (per Auftrag), nur dokumentiert. Schweregrad + Repro je Eintrag.

Legende: 🟥 hoch · 🟧 mittel · 🟨 niedrig · ℹ️ umgebungsbedingt (kein App-Bug)

---

## 🟨 B1 — `/favicon.ico` liefert 404
- **Wo:** alle Seiten (Browser fordert Favicon automatisch an).
- **Repro:** `curl -s -o /dev/null -w "%{http_code}" http://<host>/favicon.ico` → `404`.
- **Wirkung:** kosmetisch — Browser-Tab ohne Icon; eine 404-Zeile in der Konsole/Netzwerk.
- **Ursache:** `server.mjs` liefert nur die in `PWA_ASSETS` gelisteten Icons; `/favicon.ico`
  ist nicht dabei und es gibt kein `<link rel="icon">` in den Seiten.
- **Vorschlag (nicht umgesetzt):** `/favicon.ico` auf ein vorhandenes Icon mappen
  oder ein `<link rel="icon">` setzen.
- **Test-Umgang:** in der Allowlist (siehe `NOTES.md`), damit „keine 404s" die echten
  same-origin-Fehler prüft, ohne am fehlenden Favicon zu scheitern.

---

## ℹ️ E1 — Externer GitHub-Release-Check schlägt fehl (umgebungsbedingt)
- **Wo:** `/?pack=music` (App) lädt beim Start `https://api.github.com/repos/…/releases/latest`.
- **Repro:** App öffnen → `requestfailed net::ERR_CERT_AUTHORITY_INVALID` für api.github.com.
- **Wirkung:** in dieser Test-/Agent-Umgebung scheitert der Aufruf an der TLS-Prüfung des
  Proxys; **in Produktion (https, echtes Netz) funktioniert er**. Kein App-Bug.
- **Test-Umgang:** cross-origin-Responses/-Failures werden ignoriert (nur same-origin zählt).

<!-- Weitere Einträge werden von den restlichen Testfiles ergänzt. -->
