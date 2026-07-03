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

// Welches Domain-Pack ist eingebaut? (.pack wird beim Pack-Build geschrieben; fehlt es,
// ist es der klassische Musik-Build.)
function bundledPack() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, ".pack"), "utf8")).id || "music";
  } catch {
    return "music";
  }
}

// Eingebettete API-Keys kommen fertig mit der App (nicht im öffentlichen Repo; werden
// beim Bauen aus GitHub-Secrets in die jeweilige Key-Datei geschrieben). Je Pack die
// passende ENV setzen, damit Tester:innen ohne eigenen Key loslegen können.
function bundledKeyEnv(pack) {
  const map = {
    music: [".lastfm-key", "LASTFM_API_KEY"],
    movies: [".tmdb-key", "TMDB_API_KEY"],
  };
  const env = {};
  const entry = map[pack];
  if (entry) {
    try {
      const k = fs.readFileSync(path.join(__dirname, entry[0]), "utf8").trim();
      if (k) env[entry[1]] = k;
    } catch {}
  }
  // TasteDive versorgt mehrere Packs (Bücher/Podcasts/Games) — mitgeben, falls vorhanden.
  try {
    const td = fs.readFileSync(path.join(__dirname, ".tastedive-key"), "utf8").trim();
    if (td) env.TASTEDIVE_KEY = td;
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
  const pack = bundledPack();
  const keyEnv = bundledKeyEnv(pack);

  // Server über Electrons eingebautes Node starten (kein System-Node nötig — sonst
  // schlägt spawn("node") fehl, weil GUI-Starts keinen Homebrew-/PATH-Kontext haben).
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      LIKE_DATA_DIR: dataDir,
      LIKE_PACK: pack,
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
