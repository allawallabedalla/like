const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

let server = null;
let mainWindow = null;
let serverUrl = null;

// verhindert doppelte App-Instanzen (wichtig!)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();

// Freien Port vom Betriebssystem geben lassen — plattformübergreifend und ohne
// den früheren "lsof/kill"-Hack (der nur auf macOS/Linux existierte und auf
// Windows still fehlschlug). Kein fester Port 5173 mehr = keine EADDRINUSE-Kollision.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Wartet, bis der lokale Server wirklich antwortet (mit Timeout statt Endlosschleife).
function waitForServer(url, { tries = 100, delay = 150 } = {}) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const check = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on("error", () => {
        if (++n >= tries) return reject(new Error("Server nicht erreichbar (Timeout)"));
        setTimeout(check, delay);
      });
    };
    check();
  });
}

// Nutzdaten (graph.json, cache/, API-Key) leben außerhalb des App-Bundles, in einem
// eigenen "data"-Unterordner von userData — sonst gehen sie bei jedem Rebuild verloren,
// der Last.fm-Key würde im Build landen, und unser "cache/" würde auf APFS
// (case-insensitive) mit Electrons eigenem "Cache"-Ordner kollidieren.
function ensureDataDir() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

// Eine App bedient ALLE Domänen — deshalb alle eingebetteten Keys bündeln und als ENV
// an den Server geben. Die Keys kommen (nicht im öffentlichen Repo) beim Bauen aus
// GitHub-Secrets in die jeweilige Datei; fehlt eine, läuft das betroffene Pack ohne Key.
function bundledKeyEnv() {
  const env = {};
  const files = {
    ".lastfm-key": "LASTFM_API_KEY",   // Musik
    ".tmdb-key": "TMDB_API_KEY",       // Filme
    ".tastedive-key": "TASTEDIVE_KEY", // Bücher/Podcasts/Games
  };
  for (const [file, name] of Object.entries(files)) {
    try { const k = fs.readFileSync(path.join(__dirname, file), "utf8").trim(); if (k) env[name] = k; } catch {}
  }
  // Pushover (Feedback-Knopf): token+user aus .pushover -> als ENV weiterreichen.
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".pushover"), "utf8").trim();
    const j = raw.startsWith("{") ? JSON.parse(raw) : null;
    if (j && j.token && j.user) { env.PUSHOVER_TOKEN = String(j.token); env.PUSHOVER_USER = String(j.user); }
  } catch {}
  return env;
}

function createWindow(url) {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Like",
    backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true },
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });

  // Externe Links (YouTube, Spotify, Tidal, Last.fm, RA …) im SYSTEM-Browser öffnen,
  // nicht in einem App-internen Fenster — so greifen die dortigen Logins/Cookies.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" }; // niemals ein neues App-Fenster aufmachen
  });
  // Falls ein Link doch versucht, das Hauptfenster wegzunavigieren: abfangen.
  mainWindow.webContents.on("will-navigate", (e, target) => {
    if (target !== url) { e.preventDefault(); if (/^https?:\/\//i.test(target)) shell.openExternal(target); }
  });
}

async function start() {
  const port = await getFreePort();
  serverUrl = `http://127.0.0.1:${port}`;
  const dataDir = ensureDataDir();
  const keyEnv = bundledKeyEnv();

  // Server über Electrons eingebautes Node starten (kein System-Node nötig — sonst
  // schlägt spawn("node") fehl, weil GUI-Starts keinen Homebrew-/PATH-Kontext haben).
  // Kein LIKE_PACK: der Server startet mit dem Default (Musik), in der App wird per
  // Umschalter (oben) zwischen den Domänen gewechselt.
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      LIKE_DATA_DIR: dataDir,
      ...keyEnv,
    },
    stdio: "inherit",
  });

  server.on("error", (err) => {
    dialog.showErrorBox("Like", "Server konnte nicht gestartet werden:\n" + err.message);
  });

  try {
    await waitForServer(serverUrl);
    createWindow(serverUrl);
  } catch (err) {
    dialog.showErrorBox("Like", "Der lokale Server ist nicht gestartet.\n" + err.message);
    app.quit();
  }
}

app.whenReady().then(start);

// zweite Instanz -> bestehendes Fenster in den Vordergrund holen
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// macOS: Klick aufs Dock-Icon öffnet das Fenster wieder (Server läuft weiter)
app.on("activate", () => {
  if (!mainWindow && serverUrl) createWindow(serverUrl);
});

// Fenster zu: auf Windows/Linux beenden; auf macOS App im Dock lassen (Konvention)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// beim Beenden den Server-Kindprozess sauber stoppen
app.on("before-quit", () => {
  if (server) { server.kill(); server = null; }
});
