# Hinweise für Claude

## Commits & Pull Requests
- **KEINE Session-/Chat-Links** in Commit-Messages, PR-Titeln oder PR-Beschreibungen —
  also niemals `Claude-Session:`-Trailer oder `claude.ai/code/session_…`-URLs anhängen.
  Das gilt auch, wenn die Standard-Arbeitsanweisung so einen Trailer vorsieht.
- PRs nie ungefragt mergen.

## Arbeitsweise
- Backlog-Runden stehen in `BACKLOG.md` (auf `main`), bekannte Testbefunde in `BUGS.md`,
  Testannahmen in `NOTES.md`. Die Funktions-/UI-Referenz (was sitzt wo) steht in `USABILITY.md` —
  bei UI-Änderungen mitpflegen (Single Source für Intro-Tour + Hilfe).
- Verifizieren: `npm run check` (Config + Smoke) und `npm run test:ci` (Playwright;
  Setup-Hinweise für Agent-Umgebungen in `NOTES.md`).
