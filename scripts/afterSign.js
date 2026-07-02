// electron-builder afterSign-Hook: signiert das fertig gepackte .app-Bundle ad-hoc
// (kostenlos, kein Apple-Developer-Account). Ohne das ist die Signatur des rohen
// Electron-Binaries inkonsistent mit den später hinzugefügten Resources (main.js,
// server.mjs, lib/, .lastfm-key, …) — macOS meldet dann beim Öffnen "ist beschädigt"
// statt der harmlosen "nicht verifizierter Entwickler"-Warnung.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  console.log(`✓ ad-hoc signiert: ${appPath}`);
};
