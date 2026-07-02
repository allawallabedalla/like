const { app, BrowserWindow } = require("electron");
const { spawn, exec } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

let server;
let mainWindow = null;

// verhindert doppelte App-Instanzen (wichtig!)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Port ggf. freimachen (verhindert EADDRINUSE)
function killPort(port) {
  exec(`lsof -ti:${port} | xargs kill -9`, () => {});
}

// wartet bis Server wirklich läuft
function waitForServer(url, cb) {
  const check = () => {
    http.get(url, () => cb()).on("error", () => {
      setTimeout(check, 200);
    });
  };
  check();
}

// Nutzdaten (graph.json, cache/, API-Key) leben außerhalb des App-Bundles, in einem
// eigenen "data"-Unterordner von userData — sonst gehen sie bei jedem Rebuild verloren,
// der Last.fm-Key würde im DMG landen, und unser "cache/" würde auf APFS
// (case-insensitive) mit Electrons eigenem "Cache"-Ordner kollidieren.
function ensureDataDir() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

// Last.fm-Key kommt fertig mit der App (steht nicht im öffentlichen Git-Repo,
// nur im gebauten .dmg) — Freund:innen müssen nichts eintragen, um zu suchen.
function bundledApiKey() {
  try {
    return fs.readFileSync(path.join(__dirname, ".lastfm-key"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Like",
    webPreferences: {
      contextIsolation: true
    }
  });

  mainWindow.loadURL("http://localhost:5173");

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (server) server.kill();
  });
}

app.whenReady().then(() => {
  // verhindert Port-Konflikte
  killPort(5173);

  const dataDir = ensureDataDir();
  const apiKey = bundledApiKey();

  // startet Server über Electrons eingebautes Node (kein System-Node nötig,
  // sonst schlägt spawn("node") fehl, weil GUI-Starts kein Homebrew-PATH haben)
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: __dirname,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LIKE_DATA_DIR: dataDir,
      ...(apiKey ? { LASTFM_API_KEY: apiKey } : {})
    },
    stdio: "inherit"
  });

  server.on("error", (err) => {
    console.error("Server konnte nicht gestartet werden:", err);
  });

  // wartet sauber auf Server
  waitForServer("http://localhost:5173", createWindow);
});

app.on("before-quit", () => {
  if (server) server.kill();
});

app.on("window-all-closed", () => {
  if (server) server.kill();
  app.quit();
});

app.on("second-instance", () => {
  if (mainWindow) {
    mainWindow.focus();
  }
});
