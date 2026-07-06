// cron.mjs — Hintergrund-Crawl im Server-Prozess. Hält das Momentum-Signal
// (stats.json) aktuell, auch wenn die App tagelang NICHT geöffnet wird: statt nur
// beim App-Start (/api/snapshot) schnappt der Server die Hörer-/Popularitätszahlen
// selbstständig ~einmal am Tag. Nach ein paar Wochen füllt sich so „▲ +38 %/Monat"
// von allein — ohne dass jemand die App öffnen muss.
//
// Zero-Dep (nur Timer + fs). Der Lauf-Zeitstempel wird persistiert, damit
// Neustarts (Redeploys) weder doppelt crawlen noch einen Tag verschlucken.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const HOUR = 36e5;

// Pure Entscheidung: ist ein Lauf fällig? (ausgelagert, damit testbar).
export function isDue(lastRun, intervalMs, now) {
  if (!lastRun) return true;             // noch nie gelaufen -> Baseline setzen
  return now - lastRun >= intervalMs;
}

async function loadState(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { return {}; }
}

async function saveState(file, state) {
  try {
    await mkdir(dirname(file), { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, file);
  } catch { /* Persistenz ist best-effort; ein verlorener Zeitstempel crawlt höchstens einmal doppelt */ }
}

// Startet den wiederkehrenden Task. Gibt eine stop()-Funktion zurück.
//
//   startScheduler({ stateFile, intervalMs, warmupMs, task, log, now })
//     stateFile  Pfad für den lastRun-Zeitstempel (JSON)
//     intervalMs Abstand zwischen zwei Läufen (Default 24 h)
//     warmupMs   Verzögerung des ersten (fälligen) Laufs nach dem Boot — blockiert
//                den Serverstart nicht und lässt Redeploys erst zur Ruhe kommen
//     task       async () => any  — der eigentliche Crawl
//     log        (msg) => void
//     now        () => number      — injizierbar für Tests
export function startScheduler({
  stateFile,
  intervalMs = 24 * HOUR,
  warmupMs = 60_000,
  task,
  log = () => {},
  now = () => Date.now(),
} = {}) {
  if (typeof task !== "function") throw new Error("startScheduler: task fehlt");
  let timer = null;
  let running = false;
  let stopped = false;

  async function tick() {
    if (stopped || running) return;
    running = true;
    try {
      await task();
    } catch (e) {
      log(`Crawl fehlgeschlagen: ${e.message}`);
    } finally {
      running = false;
      if (!stopped) {
        const st = await loadState(stateFile);
        st.lastRun = now();
        await saveState(stateFile, st);
        schedule(intervalMs); // nächster Lauf ein volles Intervall später
      }
    }
  }

  function schedule(delay) {
    if (stopped) return;
    timer = setTimeout(tick, Math.max(0, delay));
    // Den Prozess nicht künstlich am Leben halten — der HTTP-Server tut das ohnehin.
    if (typeof timer.unref === "function") timer.unref();
  }

  (async () => {
    const st = await loadState(stateFile);
    const due = isDue(st.lastRun, intervalMs, now());
    // Fällig -> nach kurzer Warmup-Phase; sonst exakt zum nächsten Termin.
    const delay = due ? warmupMs : st.lastRun + intervalMs - now();
    const hrs = Math.round((delay / HOUR) * 10) / 10;
    log(`Auto-Crawl aktiv (alle ${Math.round(intervalMs / HOUR)} h) — nächster Lauf in ~${hrs} h`);
    schedule(delay);
  })();

  return function stop() {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
}
