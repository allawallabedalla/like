#!/usr/bin/env node
// server.mjs — lokaler Zero-Dep-Server für die Map. Domänen-neutral und Multi-Pack:
// EINE App bedient alle Domänen. Das aktive Pack kommt pro Request aus ?pack=<id>
// (oder Header x-like-pack; Fallback: Default). So kann die App zur Laufzeit zwischen
// Musik, Büchern, Filmen … umschalten (ein Reload mit ?pack=), ohne Server-Neustart.
//
//   node server.mjs                  -> http://localhost:5173 (Default-Pack)
//   node server.mjs --pack=books     -> Default auf Bücher setzen (auch ENV LIKE_PACK)
//
// Endpunkte (alle Packs, jeweils mit ?pack=<id>):
//   GET  /                 „Kugeln"-Übersicht (Pack-Auswahl); mit ?pack=<id> die Karte selbst
//   GET  /api/packs        alle Packs (leichte Liste für den Umschalter)
//   GET  /api/graph        kompletter Graph des Packs
//   POST /api/explore      { name } -> Pack-Adapter, merged, gibt Graph zurück
//   POST /api/bridge       { from, to } -> verbindende Einträge (Meet-in-the-middle)

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
// Konstantzeit-Vergleich (gegen Timing-Angriffe aufs Unlock-Passwort); längenverschieden -> false.
const timingEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && timingSafeEqual(A, B); };
import { readFile, writeFile, access, rename } from "node:fs/promises";
// JSON atomar schreiben (tmp+rename) — kein zerhacktes digest.json bei Absturz/voller Platte.
const writeJsonAtomic = async (path, obj) => { const tmp = path + ".tmp"; await writeFile(tmp, JSON.stringify(obj), "utf8"); await rename(tmp, path); };
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, materialize, addEvent, emptyGraph, upsertArtist } from "./lib/store.mjs";
import { loadStats, saveStats, addSnapshot, growthPerMonth } from "./lib/stats.mjs";
import { loadPack, listPacks, resolvePackId, dataFile } from "./lib/packs.mjs";
import { clearKey } from "./lib/keys.mjs";
import { hasPushover, sendFeedback } from "./lib/pushover.mjs";
import { miniCluster, landingHtml } from "./lib/landing.mjs";
import { initAuth, register, verify, resetPassword, makeSession, userFromCookie } from "./lib/auth.mjs";

// Ungerichtete Kante hinzufügen/aktualisieren (dedupe über sortiertes from|to + type).
function addEdge(g, a, b, type, weight, source, shows) {
  if (a === b) return;
  const [from, to] = a < b ? [a, b] : [b, a];
  const e = g.edges.find((x) => x.type === type && x.from === from && x.to === to);
  if (e) {
    e.weight = Math.max(e.weight, weight);
    if (shows?.length) e.shows = mergeShows(e.shows, shows);
    return;
  }
  const edge = { from, to, type, weight, source };
  if (shows?.length) edge.shows = shows.slice(0, 12);
  g.edges.push(edge);
}
// Auftrittsorte zusammenführen (dedupe über event+date+venue, max 12)
function mergeShows(a = [], b = []) {
  const out = [], seen = new Set();
  for (const s of [...a, ...b]) {
    const k = `${s.event}|${s.date}|${s.venue}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LIKE_DATA_DIR || ROOT;
const PORT = process.env.PORT || 5173;
// Bind-Host: lokal/Desktop = loopback (Server + eingebetteter Key nicht im LAN sichtbar).
// Gehostet (Docker/Render) HOST=0.0.0.0 setzen, damit der Plattform-Proxy den Container erreicht.
const HOST = process.env.HOST || "127.0.0.1";

// „Coming soon"-Gate: nur das öffentliche Pack ist frei; alle anderen brauchen ein Passwort.
// Aktiv NUR wenn LIKE_UNLOCK_PASSWORD gesetzt ist -> lokal/Desktop bleibt alles offen.
const UNLOCK_PW = (process.env.LIKE_UNLOCK_PASSWORD || "").trim();
const GATING_ON = !!UNLOCK_PW;
const PUBLIC_PACK = (process.env.LIKE_PUBLIC_PACK || "music").trim();
const isLockedPack = (id) => GATING_ON && id !== PUBLIC_PACK;
// Cookie-Wert = Hash des Passworts (Passwort selbst steht nie im Cookie).
const unlockToken = () => createHash("sha256").update("like-unlock:" + UNLOCK_PW).digest("hex").slice(0, 32);
function isUnlocked(req) {
  if (!GATING_ON) return true;
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)like_unlock=([a-f0-9]+)/);
  return !!m && m[1] === unlockToken();
}

// Alle Packs beim Start laden (validiert sie gleich; Import ist netzfrei -> schnell).
const PACKS = new Map();
for (const id of await listPacks()) {
  try { PACKS.set(id, await loadPack(id)); }
  catch (e) { console.error(`Pack "${id}" übersprungen: ${e.message}`); }
}
const DEFAULT_PACK = PACKS.has(await resolvePackId()) ? await resolvePackId() : (PACKS.has("music") ? "music" : [...PACKS.keys()][0]);
if (!PACKS.size) { console.error("Keine Packs gefunden (packs/<id>/pack.mjs)."); process.exit(1); }
// Leichte Liste für den Umschalter (ohne die vollen Configs).
const PACK_LIST = [...PACKS.values()].map((p) => ({ id: p.id, title: p.config.title, item: p.config.item, brand: p.config.brand, locked: isLockedPack(p.id) }));

// Version aus package.json lesen (bleibt so automatisch synchron mit dem Release).
let APP_VERSION = "";
try { APP_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version || ""; } catch {}
// Deploy-Nachverfolgung (E1): zeigt, WELCHER Stand gerade live ist, verlinkt auf GitHub.
//  - LIKE_BUILD_PR (z. B. "17") gesetzt  -> „PR #17" mit Link auf den Pull Request.
//  - sonst der Deploy-Commit (LIKE_BUILD_REF oder Renders RENDER_GIT_COMMIT) -> Kurz-SHA + Commit-Link.
// So lässt sich jederzeit nachvollziehen, welche Änderungen deployed sind.
const REPO_URL = "https://github.com/allawallabedalla/like";
const _BUILD_PR = (process.env.LIKE_BUILD_PR || "").replace(/\D/g, "");
const _BUILD_SHA = (process.env.LIKE_BUILD_REF || process.env.RENDER_GIT_COMMIT || "").trim();
const BUILD_REF = _BUILD_PR ? { label: `PR #${_BUILD_PR}`, href: `${REPO_URL}/pull/${_BUILD_PR}` }
  : (_BUILD_SHA ? { label: _BUILD_SHA.slice(0, 7), href: `${REPO_URL}/commit/${_BUILD_SHA}` } : null);

// „Kugeln"-Landing (GET / ohne ?pack): eine Karte je Pack mit Mini-Netz aus dem Demo-Graphen.
// Der Demo-Graph dient nur der Vorschau-Optik; die echte Karte startet leer und füllt sich beim Suchen.
const LANDING_CARDS = [];
for (const p of PACKS.values()) {
  let g = { artists: {}, edges: [] };
  try { g = JSON.parse(await readFile(join(ROOT, "packs", p.id, "demo.json"), "utf8")); } catch {}
  LANDING_CARDS.push({
    id: p.id, title: p.config.title, item: p.config.item, locked: isLockedPack(p.id),
    n: Object.keys(g.artists || {}).length, e: (g.edges || []).length, mini: miniCluster(g),
  });
}
// Statisch ausgelieferte PWA-Dateien (Pfad -> Datei in public/ + Content-Type).
const PWA_ASSETS = {
  // Favicon: Browser fordern /favicon.ico automatisch an — auf ein vorhandenes Icon mappen,
  // damit es keinen 404 gibt (BUGS.md B1). PNG wird als Favicon problemlos akzeptiert.
  "/favicon.ico": { file: "icons/icon-192.png", type: "image/png", cache: "public, max-age=604800" },
  "/manifest.webmanifest": { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "no-cache" },
  "/sw.js": { file: "sw.js", type: "text/javascript; charset=utf-8", cache: "no-cache" },
  "/icons/icon-192.png": { file: "icons/icon-192.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/icon-512.png": { file: "icons/icon-512.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/icon-maskable-512.png": { file: "icons/icon-maskable-512.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/apple-touch-icon.png": { file: "icons/apple-touch-icon.png", type: "image/png", cache: "public, max-age=604800" },
};

function landingPage(unlocked) {
  return landingHtml(LANDING_CARDS, {
    hrefFor: (id) => `/?pack=${encodeURIComponent(id)}`,
    pageTitle: "like — Übersicht",
    heading: "like<b>.</b>",
    sub: "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.",
    cardSub: (c) => c.item.plur,
    footer: `${APP_VERSION ? `v${APP_VERSION} · alle Domänen in einer App · ` : ""}<a href="/impressum" style="color:inherit">Impressum</a> · <a href="/datenschutz" style="color:inherit">Datenschutz</a>${BUILD_REF ? ` · <a href="${BUILD_REF.href}" target="_blank" rel="noreferrer" style="color:inherit">${BUILD_REF.label}</a>` : ""}`,
    gated: GATING_ON && !unlocked,   // gesperrte Karten: „coming soon" + Passwort-Prompt statt Link
    lockLabel: "Coming soon",
  });
}

// Impressum (Pflicht in DE): minimale Angaben. Adresse ist als Platzhalter markiert und
// muss vom Betreiber ergänzt werden (per ENV LIKE_IMPRINT_ADDRESS / _NAME / _EMAIL überschreibbar).
function impressumPage() {
  const name = (process.env.LIKE_IMPRINT_NAME || "Nicolas R").trim();
  const addr = (process.env.LIKE_IMPRINT_ADDRESS || "").trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const addrHtml = addr ? esc(addr).replace(/\n/g, "<br>")
    : `<span class="todo">[Straße &amp; Hausnummer]</span><br><span class="todo">[PLZ Ort, Land]</span>`;
  const addrNote = addr ? "" : `<p class="muted todo">Bitte die ladungsfähige Anschrift ergänzen (ENV <code>LIKE_IMPRINT_ADDRESS</code>) — ohne sie ist das Impressum nicht vollständig.</p>`;
  // Name nur separat voranstellen, wenn die Anschrift ihn nicht ohnehin schon als erste Zeile trägt
  // (sonst stünde er doppelt — z. B. „Nicolas R" + „Nicolas R." aus der Adresse).
  const norm = (s) => s.toLowerCase().replace(/[.\s]+$/, "").trim();
  const addrFirst = addr.split("\n")[0] || "";
  const providerHtml = addr && norm(addrFirst) === norm(name) ? addrHtml : `${esc(name)}<br>${addrHtml}`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Impressum — like</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;background:radial-gradient(130% 90% at 72% -12%,#101c33,#0a0f1c 42%,#05070d);color:#e7e9ee;font:16px/1.6 system-ui,-apple-system,sans-serif}
  .wrap{max-width:640px;margin:0 auto;padding:52px 22px 60px}
  a{color:#ff8a3d} h1{font-size:28px;margin:0 0 4px} h2{font-size:15px;margin:24px 0 4px}
  p{margin:5px 0;opacity:.92} .muted{opacity:.6;font-size:13px} .todo{color:#ffcf99}
  code{background:#ffffff14;padding:1px 5px;border-radius:4px;font-size:12px}
  .back{display:inline-block;margin-bottom:22px;opacity:.7;text-decoration:none;color:inherit}
</style></head><body><div class="wrap">
  <a class="back" href="/">← zurück zu like</a>
  <h1>Impressum</h1>
  <p class="muted">Angaben gemäß § 5 TMG und § 18 Abs. 2 MStV.</p>
  <h2>Diensteanbieter</h2>
  <p>${providerHtml}</p>
  ${addrNote}
  <h2>Kontakt</h2>
  <p>Kontaktaufnahme über den Feedback-Knopf (✉) in der App.</p>
  <h2>Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</h2>
  <p>Der oben genannte Diensteanbieter.</p>
  <h2>Haftung für Inhalte &amp; Links</h2>
  <p class="muted">„like" ist ein privates, nicht-kommerzielles Projekt und verknüpft Daten aus externen Quellen (u. a. Last.fm, TMDB, Wikivoyage, Wikipedia); die Rechte daran liegen bei den jeweiligen Anbietern. Für die Richtigkeit, Vollständigkeit und Aktualität wird keine Gewähr übernommen. Für Inhalte verlinkter externer Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
  <p class="muted" style="margin-top:14px"><a href="/datenschutz">Datenschutzerklärung</a></p>
</div></body></html>`;
}

// Datenschutzerklärung — beschreibt die TATSÄCHLICHEN Datenflüsse der App (bewusst knapp und
// ehrlich). Vorlage: bei geändertem Betrieb / vor kommerzieller Nutzung juristisch prüfen lassen.
function datenschutzPage() {
  const name = (process.env.LIKE_IMPRINT_NAME || "Nicolas R").trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datenschutz — like</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;background:radial-gradient(130% 90% at 72% -12%,#101c33,#0a0f1c 42%,#05070d);color:#e7e9ee;font:16px/1.6 system-ui,-apple-system,sans-serif}
  .wrap{max-width:680px;margin:0 auto;padding:52px 22px 60px}
  a{color:#ff8a3d} h1{font-size:28px;margin:0 0 4px} h2{font-size:15px;margin:24px 0 4px}
  p,li{margin:5px 0;opacity:.92} .muted{opacity:.6;font-size:13px} ul{margin:5px 0;padding-left:20px}
  .back{display:inline-block;margin-bottom:22px;opacity:.7;text-decoration:none;color:inherit}
</style></head><body><div class="wrap">
  <a class="back" href="/">← zurück zu like</a>
  <h1>Datenschutzerklärung</h1>
  <p class="muted">„like" ist ein privates, nicht-kommerzielles Projekt. Es werden so wenig Daten wie möglich verarbeitet — kein Tracking, keine Werbung, keine Analyse-Cookies.</p>
  <h2>Verantwortlicher</h2>
  <p>${esc(name)} · Kontaktaufnahme über den Feedback-Knopf (✉) in der App. Näheres im <a href="/impressum">Impressum</a>.</p>
  <h2>Hosting &amp; Server-Logs</h2>
  <p>Die App läuft bei einem Hosting-Anbieter (Render). Beim Aufruf entstehen technisch notwendige Server-Logs (u. a. IP-Adresse, Zeitpunkt, angeforderte Ressource) zur Auslieferung und Sicherheit der Seite. Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO). Der Anbieter kann Server außerhalb der EU betreiben; entsprechende Übermittlungen erfolgen ggf. auf Grundlage geeigneter Garantien.</p>
  <h2>Cookies &amp; lokale Speicherung</h2>
  <ul>
    <li><b>sessionStorage</b> (anonyme Tab-Kennung): hält deine Karte innerhalb eines Browser-Tabs zusammen. Keine dauerhafte Speicherung, kein Cookie.</li>
    <li><b>localStorage</b> (Theme, Ansicht, gemerkter Kartenausschnitt): reine Komfort-Einstellungen, verbleiben auf deinem Gerät.</li>
    <li><b>Login-Cookie</b>: nur wenn du dir freiwillig ein Konto anlegst — hält dich angemeldet.</li>
  </ul>
  <h2>Konto (optional)</h2>
  <p>Legst du ein Konto an, werden Nutzername, ein <b>gehashtes</b> Passwort und ein Recovery-Code gespeichert, damit deine Karte auf mehreren Geräten gleich ist (Art. 6 Abs. 1 lit. b DSGVO). Ohne Konto bleibt alles an einen anonymen, temporären Tab gebunden.</p>
  <h2>Deine Karte</h2>
  <p>Die von dir aufgebaute Karte (gesuchte Acts, „Likes", Status, Notizen) wird serverseitig gespeichert — pro Konto bzw. pro anonymer Tab-Kennung.</p>
  <h2>Externe Dienste</h2>
  <p>Inhalte werden aus externen Quellen zusammengeführt (u. a. Last.fm, Resident Advisor, TMDB, MusicBrainz, Wikipedia/Wikivoyage). Diese Abfragen laufen <b>serverseitig</b> — deine IP-Adresse wird dabei <b>nicht</b> an diese Dienste weitergegeben. Ausnahmen, bei denen dein Browser direkt beim jeweiligen Anbieter lädt (und deine IP dorthin gelangt): die <b>30-Sekunden-Klangproben</b> (Deezer/iTunes-CDN) und der <b>Update-Hinweis</b> (GitHub). Es werden keine Analyse- oder Werbedienste eingebunden.</p>
  <h2>Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie ein Beschwerderecht bei einer Aufsichtsbehörde. Ein Konto lässt sich samt Daten auf Anfrage löschen; ohne Konto genügt das Leeren des Browser-Speichers.</p>
  <p class="muted" style="margin-top:16px">Stand: Vorlage — bei geändertem Betrieb bitte aktualisieren und juristisch prüfen lassen.</p>
</div></body></html>`;
}

// Radar ist teuer (viele Popularitäts-Lookups) -> 10 Min im Speicher cachen, PRO PACK.
const radarCache = new Map(); // packId -> { at, key, payload }
const RADAR_TTL = 10 * 60 * 1000;

// Feedback ist einmal beim Start bekannt (Credentials ändern sich zur Laufzeit nicht).
const FEEDBACK_ON = await hasPushover();
await initAuth(DATA_DIR); // Accounts (optional): Nutzer-Store + Session-Secret laden
// Datei-Cache beschränken: beim Start + täglich alte Einträge löschen (sonst füllt er die Platte).
import("./lib/cache.mjs").then(({ pruneCache }) => {
  pruneCache().catch(() => {});
  setInterval(() => pruneCache().catch(() => {}), 24 * 60 * 60 * 1000).unref?.();
}).catch(() => {});
// einfache In-Memory-Drossel gegen Auth-Brute-Force: pro IP max. 12 Versuche / 5 Min
const authHits = new Map();
let authGlobal = []; // globaler Backstop: greift auch, wenn X-Forwarded-For gefälscht/rotiert wird
function authThrottled(req) {
  const now = Date.now();
  authGlobal = authGlobal.filter((t) => now - t < 300000); authGlobal.push(now);
  // Rechtester XFF-Eintrag = vom vertrauenswürdigsten (nächsten) Proxy gesetzt; vom Client
  // vorangestellte Fake-Einträge stehen links und zählen so nicht.
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = xff[xff.length - 1] || req.socket.remoteAddress || "?";
  const arr = (authHits.get(ip) || []).filter((t) => now - t < 300000); arr.push(now);
  if (arr.length) authHits.set(ip, arr); else authHits.delete(ip);
  return arr.length > 12 || authGlobal.length > 240; // pro IP 12/5min; globaler Backstop 240/5min (gegen XFF-Rotation, ohne legitime Nutzer im Andrang auszusperren)
}
// Speicher-Leak vermeiden: IPs, die nicht wiederkommen, periodisch aus der Map werfen.
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of authHits) { const f = arr.filter((t) => now - t < 300000); if (f.length) authHits.set(ip, f); else authHits.delete(ip); }
}, 600000).unref?.();
function setCookie(res, name, val, req) {
  const secure = (req.headers["x-forwarded-proto"] === "https") ? " Secure;" : "";
  const clear = val === "";
  res.setHeader("set-cookie", `${name}=${val}; Path=/; Max-Age=${clear ? 0 : 60 * 60 * 24 * 180}; SameSite=Lax;${secure} HttpOnly`);
}
// simple In-Memory-Drossel gegen Spam: max. 6 Feedback-Nachrichten pro 5 Minuten (global).
let fbHits = [];

// Besuchs-Benachrichtigung: Pushover, wenn jemand ANDERES als du die Seite öffnet.
// Aktiv nur, wenn LIKE_OWNER_SECRET gesetzt ist (sonst aus). Du selbst schließt dich aus,
// indem du EINMAL die Seite mit ?owner=<secret> öffnest -> setzt ein like_owner-Cookie.
// Bewusst datensparsam: KEINE volle IP in der Nachricht (nur grob maskiert), nur Browser/Quelle.
const OWNER_SECRET = (process.env.LIKE_OWNER_SECRET || "").trim();
const visitNotified = new Map(); // ip -> letzter Push (Dedupe, damit Reloads nicht spammen)
const isOwnerReq = (req) => /(?:^|;\s*)like_owner=1(?:;|$)/.test(req.headers.cookie || "");
function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket.remoteAddress || "?";
}
function maskIp(ip) {
  if (ip.includes(".")) { const p = ip.split("."); return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : ip; }
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":…"; // IPv6 grob
  return "?";
}
async function notifyVisitMaybe(req, pack) {
  if (!OWNER_SECRET || isOwnerReq(req)) return;   // Feature aus / oder du selbst
  if (!(await hasPushover())) return;
  const ip = clientIp(req), now = Date.now();
  if (now - (visitNotified.get(ip) || 0) < 6 * 3600e3) return; // pro IP höchstens alle 6 h
  visitNotified.set(ip, now);
  if (visitNotified.size > 800) for (const [k, t] of visitNotified) if (now - t > 24 * 3600e3) visitNotified.delete(k);
  const ua = String(req.headers["user-agent"] || "").slice(0, 140);
  const ref = String(req.headers["referer"] || "").slice(0, 140);
  const where = pack.id !== "music" ? ` (${pack.id})` : "";
  const msg = `Jemand hat „like"${where} geöffnet.\nRegion: ${maskIp(ip)}${ua ? `\n${ua}` : ""}${ref ? `\nvon: ${ref}` : ""}`;
  sendFeedback({ title: "like — neuer Besuch", message: msg }).catch(() => {}); // best effort, blockiert die Seite nicht
}

function send(res, code, body, type = "application/json") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const headers = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (type.startsWith("text/html")) headers["x-frame-options"] = "SAMEORIGIN"; // Clickjacking-Schutz für die Seiten
  res.writeHead(code, headers);
  res.end(data);
}

// Serialisiert Lese-Ändern-Schreib-Zyklen PRO Graph-Datei. Ein Prozess -> ein In-Memory-
// Mutex genügt. Ohne das laden zwei gleichzeitige Requests denselben Stand, jeder ändert
// seine Kopie, jeder speichert -> das erste Update geht verloren (lost update). Verschiedene
// Nutzer haben verschiedene Pfade und blockieren sich daher nicht gegenseitig.
const graphGate = new Map();
function withGraphLock(path, fn) {
  const prev = graphGate.get(path) || Promise.resolve();
  const run = prev.then(fn, fn); // läuft unabhängig vom Ausgang des Vorgängers
  const tail = run.then(() => {}, () => {});
  graphGate.set(path, tail);
  // Kette leer -> Eintrag entfernen (kein unbegrenztes Wachstum bei vielen Anon-Namensräumen).
  tail.then(() => { if (graphGate.get(path) === tail) graphGate.delete(path); });
  return run;
}

// Sprachcode für Wikipedia-Hosts absichern: nur 2–3 Kleinbuchstaben (z. B. „de", „en").
// Verhindert SSRF, weil `lang` sonst roh in den Request-Host interpoliert würde.
const safeLang = (s) => (/^[a-z]{2,3}$/.test(String(s || "")) ? String(s) : "en");
// Ganzzahl aus Nutzereingabe auf sinnvolle Grenzen klemmen (gegen Amplification).
const clampInt = (v, def, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function readBody(req) {
  const MAX = 512 * 1024; // 512 KB: großzügig für Graph-Import, aber Deckel gegen Speicher-DoS
  return new Promise((resolve, reject) => {
    let s = "", len = 0, done = false;
    req.on("data", (c) => {
      if (done) return;
      len += c.length;
      if (len > MAX) { done = true; const e = new Error("Anfrage zu groß"); e.statusCode = 413; reject(e); return; } // ab hier nicht mehr sammeln
      s += c;
    });
    req.on("end", () => {
      if (done) return;
      try { resolve(s ? JSON.parse(s) : {}); }
      catch { const e = new Error("ungültiges JSON"); e.statusCode = 400; reject(e); }
    });
    req.on("error", reject);
  });
}

// Aktives Pack für diesen Request (Query > Header > Default).
function reqPackId(url, req) {
  return url.searchParams.get("pack") || req.headers["x-like-pack"] || DEFAULT_PACK;
}

// Datenraum pro Request: eingeloggt -> eigener dauerhafter Namensraum; anonym -> eigener
// temporärer Namensraum pro Tab (Client schickt x-like-anon aus dem sessionStorage);
// ganz ohne Kennung -> gemeinsamer Fallback (z. B. Desktop/lokal). So teilt sich niemand
// unbeabsichtigt eine Karte, und anonyme Views sind vergänglich.
const sanitizeId = (s) => String(s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
function dataRootFor(req, authUser) {
  if (authUser) return join(DATA_DIR, "users", sanitizeId(authUser));
  const anon = sanitizeId(req.headers["x-like-anon"]);
  if (anon) return join(DATA_DIR, "anon", anon);
  return DATA_DIR;
}

// Zwei Graphen verlustfrei vereinen (Union): fehlende Acts/Kanten übernehmen, vorhandene
// nur mit fehlenden Feldern ergänzen. So gehen weder die aktuelle Karte noch bereits im
// Konto gespeicherte Likes verloren.
function mergeGraphInto(dst, src) {
  for (const [id, a] of Object.entries(src.artists || {})) {
    const e = dst.artists[id];
    if (!e) { dst.artists[id] = a; continue; }
    e.seed = e.seed || a.seed;
    e.known = e.known || a.known;
    e.explored = e.explored || a.explored;
    if (!e.status && a.status) e.status = a.status;
    if (!e.note && a.note) e.note = a.note;
    if ((!e.genres || !e.genres.length) && a.genres?.length) e.genres = a.genres;
    if (!e.url && a.url) e.url = a.url;
    if (!e.mbid && a.mbid) e.mbid = a.mbid;
    if (a.booking && !e.booking) e.booking = a.booking;
  }
  const seen = new Set((dst.edges || []).map((x) => `${x.from}|${x.to}|${x.type}|${x.source}`));
  for (const ed of src.edges || []) {
    const k = `${ed.from}|${ed.to}|${ed.type}|${ed.source}`;
    if (!seen.has(k) && dst.artists[ed.from] && dst.artists[ed.to]) { dst.edges.push(ed); seen.add(k); }
  }
}

// Beim Anmelden/Registrieren: die anonyme Tab-Karte (falls vorhanden) in den Account
// übernehmen — damit der aktuelle Screen erhalten bleibt und dauerhaft gespeichert wird.
async function migrateAnonToUser(req, user) {
  const anon = sanitizeId(req.headers["x-like-anon"]);
  if (!anon || !user) return;
  const anonRoot = join(DATA_DIR, "anon", anon);
  const userRoot = join(DATA_DIR, "users", sanitizeId(user));
  for (const [id] of PACKS) {
    try {
      const anonG = await loadGraph(dataFile(anonRoot, id, "graph.json"));
      if (!Object.keys(anonG.artists || {}).length) continue; // nichts zu übernehmen
      const userPath = dataFile(userRoot, id, "graph.json");
      await withGraphLock(userPath, async () => { // unter Lock: kein Race mit gleichzeitigen Writes ins Konto
        const userG = await loadGraph(userPath);
        mergeGraphInto(userG, anonG);
        await saveGraph(userPath, userG);
      });
    } catch {}
  }
}

// Optionaler Heimatort für „Like Travel" aus dem Request (Header „x-like-home: lat,lon").
// Ermöglicht pro Nutzer einen eigenen Heimatort (Geolocation/Eingabe) statt der ENV.
function reqHome(req) {
  const h = req.headers["x-like-home"]; if (!h) return null;
  const [la, lo] = String(h).split(",").map(Number);
  return (isFinite(la) && isFinite(lo)) ? { lat: la, lon: lo } : null;
}

// Pack-Config ins Frontend injizieren (+ Pack-Liste für den Umschalter).
async function indexHtml(pack, unlocked, user) {
  const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
  const cfg = JSON.stringify(pack.config).replace(/</g, "\\u003c");
  const list = JSON.stringify(PACK_LIST).replace(/</g, "\\u003c");
  const u = JSON.stringify(user || null).replace(/</g, "\\u003c");
  return html.replace("<script>", `<script>window.LIKE_CFG = ${cfg};\nwindow.LIKE_PACKS = ${list};\nwindow.LIKE_UNLOCKED = ${unlocked ? "true" : "false"};\nwindow.LIKE_USER = ${u};</script>\n<script>`);
}

async function hasApiKey(pack) {
  if (!pack.key) return true; // Pack braucht keinen Key
  if (process.env[pack.key.envVar]) return true;
  try { await access(join(DATA_DIR, pack.key.file)); return true; } catch {}
  try { await access(join(ROOT, pack.key.file)); return true; } catch {}
  return false;
}

// "Ähnlich"-Nachbarn für die Brücke: nutzt das leichte pack.similar(), sonst explore().similar.
async function neighborsFor(pack, name, limit) {
  if (pack.similar) { const r = await pack.similar(name, { limit }); return { canonical: r.canonical || name, list: r.similar || [] }; }
  const r = await pack.explore(name); return { canonical: r.canonical || name, list: (r.similar || []).slice(0, limit) };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const authUser = userFromCookie(req.headers.cookie);      // eingeloggter Nutzer (oder null)
    const dataRoot = dataRootFor(req, authUser);              // Datenraum dieses Requests

    // Pack-Liste braucht keinen konkreten Pack-Kontext.
    if (req.method === "GET" && url.pathname === "/api/packs") {
      return send(res, 200, { ok: true, packs: PACK_LIST, default: DEFAULT_PACK });
    }

    // ---- Accounts (optional) ----
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      return send(res, 200, { ok: true, user: authUser });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const b = await readBody(req).catch(() => ({}));
      const r = await register(b.username, b.password);
      if (r.error) return send(res, 400, { ok: false, error: r.error });
      await migrateAnonToUser(req, r.user);
      setCookie(res, "like_session", makeSession(r.user), req);
      return send(res, 200, { ok: true, user: r.user, recovery: r.recovery });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const b = await readBody(req).catch(() => ({}));
      if (!verify(b.username, b.password)) return send(res, 401, { ok: false, error: "Name oder Passwort falsch" });
      const uid = String(b.username).trim().toLowerCase();
      await migrateAnonToUser(req, uid);
      setCookie(res, "like_session", makeSession(uid), req);
      return send(res, 200, { ok: true, user: uid });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/reset") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const b = await readBody(req).catch(() => ({}));
      const r = await resetPassword(b.username, b.recovery, b.password);
      if (r.error) return send(res, 400, { ok: false, error: r.error });
      await migrateAnonToUser(req, r.user);
      setCookie(res, "like_session", makeSession(r.user), req);
      return send(res, 200, { ok: true, user: r.user, recovery: r.recovery });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      setCookie(res, "like_session", "", req);
      return send(res, 200, { ok: true });
    }

    // Landing/Übersicht: nackte URL ohne ?pack= -> die „Kugeln"-Auswahlseite.
    // Mit ?pack=<id> geht es (weiter unten) direkt in die jeweilige Karte.
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html") && !url.searchParams.has("pack")) {
      return send(res, 200, landingPage(isUnlocked(req)), "text/html; charset=utf-8");
    }

    // Impressum (öffentlich, ohne Pack/Login).
    if (req.method === "GET" && (url.pathname === "/impressum" || url.pathname === "/impressum.html")) {
      return send(res, 200, impressumPage(), "text/html; charset=utf-8");
    }

    // Datenschutzerklärung (öffentlich, ohne Pack/Login).
    if (req.method === "GET" && (url.pathname === "/datenschutz" || url.pathname === "/datenschutz.html")) {
      return send(res, 200, datenschutzPage(), "text/html; charset=utf-8");
    }

    // „Coming soon"-Gate freischalten: richtiges Passwort -> Cookie setzen (Hash, HttpOnly).
    if (req.method === "POST" && url.pathname === "/api/unlock") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const body = await readBody(req).catch(() => ({}));
      if (GATING_ON && timingEq(String(body.password || ""), UNLOCK_PW)) {
        const secure = (req.headers["x-forwarded-proto"] === "https") ? " Secure;" : "";
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "set-cookie": `like_unlock=${unlockToken()}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax;${secure} HttpOnly`,
        });
        return res.end(JSON.stringify({ ok: true }));
      }
      return send(res, 401, { ok: false, error: "falsches Passwort" });
    }

    // PWA-Assets (Manifest, Service-Worker, Icons) — statisch aus public/, ohne Pack-Kontext.
    if (req.method === "GET" && PWA_ASSETS[url.pathname]) {
      const a = PWA_ASSETS[url.pathname];
      try {
        const buf = await readFile(join(ROOT, "public", a.file));
        res.writeHead(200, { "content-type": a.type, "cache-control": a.cache });
        return res.end(buf);
      } catch { return send(res, 404, { error: "not found" }); }
    }

    // Geschmacks-Fingerabdruck: Likes + Top-Themen ÜBER ALLE Domänen (nur lokale Graphen,
    // kein Netz). Plus "verbindende Themen": Genres, die in ≥2 Domänen vorkommen.
    if (req.method === "GET" && url.pathname === "/api/taste") {
      const unlocked = isUnlocked(req);
      const per = [];
      const genrePacks = new Map(); // genreLower -> { name, packs:Set }
      for (const [id, pk] of PACKS) {
        if (isLockedPack(id) && !unlocked) continue; // gesperrte Packs nicht mitzählen
        const g = await loadGraph(dataFile(dataRoot, id, "graph.json"));
        const liked = Object.values(g.artists).filter((a) => a.seed || a.known || (a.status && a.status !== "declined"));
        const gc = new Map();
        for (const a of liked) for (const gn of a.genres || []) {
          const k = gn.toLowerCase();
          gc.set(k, { name: gn, count: (gc.get(k)?.count || 0) + 1 });
          let e = genrePacks.get(k);
          if (!e) { e = { name: gn, packs: new Set() }; genrePacks.set(k, e); }
          e.packs.add(pk.config.title);
        }
        const topGenres = [...gc.values()].sort((a, b) => b.count - a.count).slice(0, 6);
        // die "wichtigsten" Likes zuerst: kuratierte (Status) vor bloß gesuchten
        const topItems = liked.sort((a, b) => (b.status ? 1 : 0) - (a.status ? 1 : 0)).slice(0, 5).map((a) => a.name);
        per.push({ id, title: pk.config.title, item: pk.config.item, count: liked.length, topGenres, topItems });
      }
      const overlaps = [...genrePacks.values()].filter((e) => e.packs.size >= 2)
        .map((e) => ({ name: e.name, packs: [...e.packs] })).slice(0, 10);
      return send(res, 200, { ok: true, packs: per, overlaps });
    }

    // Cross-Pack-Brücke: gibt es diesen Eintrag (Adaption/Namensvetter) in anderen Domänen?
    // Fragt die suggest()-Adapter der ANDEREN Packs mit dem bereinigten Namen und matcht
    // tolerant über Namens-Token. "Dune (2021)" findet so "Dune (Frank Herbert)" im Bücher-Pack.
    if (req.method === "POST" && url.pathname === "/api/crossbridge") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      const currentId = reqPackId(url, req);
      const clean = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      const q = norm(clean);
      const tokens = new Set(q.split(" ").filter((t) => t.length > 3));
      const matches = (cand) => {
        const c = norm(String(cand).replace(/\s*\([^)]*\)\s*$/, ""));
        if (!c) return false;
        if (c.includes(q) || q.includes(c)) return true;
        return [...tokens].some((t) => c.split(" ").includes(t));
      };
      const unlocked = isUnlocked(req);
      const others = [...PACKS.values()].filter((p) => p.id !== currentId && p.suggest && (unlocked || !isLockedPack(p.id)));
      const hits = (await Promise.all(others.map(async (p) => {
        try {
          const names = await Promise.race([
            p.suggest(clean),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
          ]);
          const hit = (names || []).find(matches);
          return hit ? { pack: p.id, packTitle: p.config.title, name: hit } : null;
        } catch { return null; }
      }))).filter(Boolean);
      return send(res, 200, { ok: true, hits });
    }

    const packId = reqPackId(url, req);
    const pack = PACKS.get(packId);
    if (!pack) return send(res, 400, { error: `Unbekanntes Pack: ${packId}` });
    // „Coming soon"-Gate: gesperrtes Pack ohne Freischaltung -> Seite zurück zur Landing, API 401.
    if (isLockedPack(packId) && !isUnlocked(req)) {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(302, { location: "/" }); return res.end();
      }
      return send(res, 401, { error: "locked", pack: packId });
    }
    const GRAPH = dataFile(dataRoot, pack.id, "graph.json");
    const DIGEST = dataFile(dataRoot, pack.id, "digest.json");
    // Hörer-Historie GLOBAL (nicht pro Namensraum): Hörerzahlen sind öffentliche Fakten und die
    // Act-IDs sind überall identisch (Namens-Slug). So tragen die Aktualisierungen ALLER Nutzer
    // zur gemeinsamen Zeitreihe bei -> der Trend wird viel schneller belastbar. (Die eigenen
    // Karten/Graphen bleiben natürlich pro Namensraum privat.)
    const STATS = dataFile(DATA_DIR, pack.id, "stats.json");
    // Graph speichern UND den Radar-Cache dieses Packs verwerfen (nie veraltete Vorschläge).
    const persist = (g) => { radarCache.delete(pack.id); return saveGraph(GRAPH, g); };

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // Owner meldet sich einmalig per ?owner=<secret> ab -> Cookie setzen, sauber weiterleiten.
      if (OWNER_SECRET && url.searchParams.get("owner") === OWNER_SECRET) {
        setCookie(res, "like_owner", "1", req);
        res.writeHead(302, { location: "/" }); return res.end();
      }
      notifyVisitMaybe(req, pack); // Besuch melden (nur Fremde, gedrosselt) — läuft nebenher
      return send(res, 200, await indexHtml(pack, isUnlocked(req), authUser), "text/html; charset=utf-8");
    }

    // Heimatort-Eingabe (Like Travel) zu Koordinaten auflösen — fürs geräteübergreifende „Zuhause".
    if (req.method === "GET" && url.pathname === "/api/geocode") {
      if (!pack.geocodeHome) return send(res, 400, { ok: false, error: "nicht unterstützt" });
      const q = url.searchParams.get("q") || "";
      const r = q ? await pack.geocodeHome(q) : null;
      return r ? send(res, 200, { ok: true, ...r }) : send(res, 404, { ok: false, error: "Ort nicht gefunden" });
    }

    // Selbstauskunft: Pack + Key-Status + ob Feedback verfügbar ist (fürs Frontend beim Start)
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, key: await hasApiKey(pack), version: APP_VERSION, build: BUILD_REF, pack: pack.id, feedback: FEEDBACK_ON });
    }

    // Testuser-Feedback -> Pushover an den Betreiber. Nur wenn Credentials hinterlegt sind.
    if (req.method === "POST" && url.pathname === "/api/feedback") {
      if (!FEEDBACK_ON) return send(res, 400, { error: "Feedback ist auf diesem Build nicht eingerichtet." });
      const { message } = await readBody(req);
      const msg = String(message || "").trim();
      if (msg.length < 2) return send(res, 400, { error: "Bitte etwas mehr Text." });
      const now = Date.now();
      fbHits = fbHits.filter((t) => now - t < 5 * 60 * 1000);
      if (fbHits.length >= 6) return send(res, 429, { error: "Zu viele Nachrichten — bitte kurz warten." });
      fbHits.push(now);
      try {
        await sendFeedback({ message: `[${pack.id} v${APP_VERSION}] ${msg.slice(0, 900)}` });
        return send(res, 200, { ok: true });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Quellen-Diagnose: alle Datenquellen des Packs live anpingen.
    if (req.method === "POST" && url.pathname === "/api/diag") {
      const probes = pack.diag ? await pack.diag() : [];
      const sources = await Promise.all(probes.map(async ({ name, probe, note = "" }) => {
        const t0 = Date.now();
        try {
          const ok = await probe();
          return { name, status: ok ? "ok" : "leer", ms: Date.now() - t0, note };
        } catch (e) {
          return { name, status: "fehler", ms: Date.now() - t0, note: String(e.message || e).slice(0, 80) };
        }
      }));
      return send(res, 200, { ok: true, sources });
    }

    // Key aus der App heraus speichern (Erststart ohne eingebetteten Key). Nur im lokalen
    // Tool: auf dem gehosteten Multi-User-Deploy (Gate aktiv) dürfen anonyme Besucher den
    // gemeinsamen Key nicht überschreiben — dort kommt der Key aus der ENV.
    if (req.method === "POST" && url.pathname === "/api/key") {
      if (GATING_ON) return send(res, 403, { error: "Auf diesem Deploy nicht verfügbar (Key kommt aus der Umgebung)." });
      if (!pack.key) return send(res, 400, { error: "Dieses Pack braucht keinen API-Key." });
      const { key } = await readBody(req);
      const k = String(key || "").trim();
      if (!new RegExp(pack.key.pattern).test(k)) {
        return send(res, 400, { error: `Das sieht nicht wie ein ${pack.key.name}-API-Key aus.` });
      }
      await writeFile(join(DATA_DIR, pack.key.file), k, "utf8");
      clearKey(pack.key.file);
      pack.clearKeyCache?.();
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/graph") {
      const g = await loadGraph(GRAPH);
      return send(res, 200, materialize(g));
    }

    // Haupt-Flow: einen Eintrag erkunden -> ähnlich + zusammen + Genres (via Pack).
    if (req.method === "POST" && (url.pathname === "/api/explore" || url.pathname === "/api/expand")) {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      let r;
      // Netz-Aufruf BEWUSST außerhalb des Graph-Locks (langsame I/O soll den Mutex nicht halten).
      try { r = await pack.explore(name, { home: reqHome(req) }); }
      catch (err) { return send(res, 502, { error: err.message }); }
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const src = upsertArtist(g, { name: r.canonical || name, url: r.url || null, seed: true });
        src.explored = true;
        if (r.genres?.length) src.genres = r.genres.slice(0, 6);
        if (r.meta) { src.booking = r.meta; }
        if (r.active !== undefined) src.active = r.active;
        for (const s of (r.similar || []).slice(0, 25)) {
          const t = upsertArtist(g, { name: s.name, url: s.url, mbid: s.mbid || null });
          addEdge(g, src.id, t.id, "similar", s.match || 0.5, r.similarSource || pack.id);
        }
        for (const c of (r.together || []).slice(0, 25)) {
          const t = upsertArtist(g, { name: c.name, url: c.url });
          addEdge(g, src.id, t.id, "together", c.weight || 1, r.togetherSource || pack.id, c.shows);
        }
        await persist(g);
        return send(res, 200, {
          ok: true, name: src.name, similar: (r.similar || []).length, together: (r.together || []).length,
          sources: r.sources || [], graph: materialize(g),
        });
      });
    }

    // Brücke suchen: welcher Eintrag verbindet zwei (noch) getrennte Knoten? Meet-in-the-
    // middle über die „ähnlich"-Relation des Packs (funktioniert in ALLEN Domänen): erst
    // gemeinsame direkte Nachbarn (A—X—B), sonst eine Ebene tiefer (A—X—Y—B). Popularität
    // der Zwischen-Einträge kommt mit, damit der Client nach „naheliegend ↔ klein" sortieren
    // kann. Nur Suche — nichts wird gespeichert.
    if (req.method === "POST" && url.pathname === "/api/bridge") {
      const { from, to } = await readBody(req);
      if (!from || !to) return send(res, 400, { error: "from/to fehlt" });
      try {
        const [ra, rb] = await Promise.all([neighborsFor(pack, from, 60), neighborsFor(pack, to, 60)]);
        const A = ra.canonical, B = rb.canonical;
        const lc = (s) => String(s).toLowerCase();
        const skip = new Set([lc(A), lc(B), lc(from), lc(to)]);
        const NA = ra.list, NB = rb.list;
        const inA = new Map(NA.map((s) => [lc(s.name), s]));
        const inB = new Map(NB.map((s) => [lc(s.name), s]));
        let mode = "direct", cands = [];

        // 1) direkt: X ist Nachbar von A UND B  (A—X—B)
        for (const s of NA) {
          const t = inB.get(lc(s.name));
          if (t && !skip.has(lc(s.name)))
            cands.push({ via: [{ name: s.name, url: s.url || t.url || null }], strength: ((s.match || 0.5) + (t.match || 0.5)) / 2 });
        }
        cands.sort((x, y) => y.strength - x.strength);
        cands = cands.slice(0, 25);
        // Mehr-Stationen-Brücken deduped an die direkten anhängen (E4: mehr Ergebnisse behalten,
        // statt sie zu ersetzen).
        const appendCands = (extra) => {
          const seenVia = new Set(cands.map((c) => c.via.map((v) => lc(v.name)).join("|")));
          for (const c of extra) { const k = c.via.map((v) => lc(v.name)).join("|"); if (seenVia.has(k)) continue; seenVia.add(k); cands.push(c); }
          cands = cands.slice(0, 20);
        };

        // Zu WENIGE direkte Brücken (E4: nicht erst bei 0): von beiden Seiten eine Ebene expandieren
        // und in der Mitte treffen — findet auch Brücken ohne gemeinsamen direkten Nachbarn.
        if (cands.length < 5) {
          const K = 10;
          const topA = NA.slice(0, K), topB = NB.slice(0, K);
          const [expA, expB] = await Promise.all([
            Promise.all(topA.map((x) => neighborsFor(pack, x.name, 40).then((r) => ({ x, list: r.list })).catch(() => null))),
            Promise.all(topB.map((y) => neighborsFor(pack, y.name, 40).then((r) => ({ y, list: r.list })).catch(() => null))),
          ]);
          const AX = expA.filter(Boolean), BY = expB.filter(Boolean);

          // 2) zwei Stationen: A—X—Y—B  (Y Nachbar von X und von B; oder X Nachbar von Y und von A)
          const two = [], seen2 = new Set();
          const addTwo = (X, Y, sMatch) => {
            const key = lc(X.name) + "|" + lc(Y.name);
            if (seen2.has(key)) return; seen2.add(key);
            two.push({ via: [{ name: X.name, url: X.url || null }, { name: Y.name, url: Y.url || null }], strength: sMatch });
          };
          for (const { x, list } of AX) for (const y of list) {
            const t = inB.get(lc(y.name));
            if (t && !skip.has(lc(y.name)) && lc(y.name) !== lc(x.name)) addTwo(x, y, ((x.match || 0.5) + (y.match || 0.5) + (t.match || 0.5)) / 3);
          }
          for (const { y, list } of BY) for (const x of list) {
            const s = inA.get(lc(x.name));
            if (s && !skip.has(lc(x.name)) && lc(x.name) !== lc(y.name)) addTwo(s, y, ((s.match || 0.5) + (x.match || 0.5) + (y.match || 0.5)) / 3);
          }
          if (two.length) {
            if (!cands.length) mode = "two"; two.sort((a, b) => b.strength - a.strength); appendCands(two.slice(0, 15));
          } else {
            // 3) drei Stationen: A—X—M—Y—B  (M gemeinsamer Nachbar einer A-seitigen und einer B-seitigen Station)
            if (!cands.length) mode = "three";
            const bSets = BY.map(({ y, list }) => ({ y, set: new Map(list.map((m) => [lc(m.name), m])) }));
            const three = [], seen3 = new Set();
            for (const { x, list } of AX) for (const m of list) {
              if (skip.has(lc(m.name)) || lc(m.name) === lc(x.name)) continue;
              for (const { y, set } of bSets) {
                if (lc(y.name) === lc(x.name) || lc(y.name) === lc(m.name)) continue;
                const mm = set.get(lc(m.name));
                if (!mm) continue;
                const key = lc(x.name) + "|" + lc(m.name) + "|" + lc(y.name);
                if (seen3.has(key)) continue; seen3.add(key);
                three.push({ via: [{ name: x.name, url: x.url || null }, { name: m.name, url: m.url || mm.url || null }, { name: y.name, url: y.url || null }],
                  strength: ((x.match || 0.5) + (m.match || 0.5) + (mm.match || 0.5) + (y.match || 0.5)) / 4 });
              }
            }
            three.sort((a, b) => b.strength - a.strength); appendCands(three.slice(0, 12));
          }
        }

        // Genres + Popularität der Zwischen-Einträge (gebündelt via enrich; sonst nur Popularität).
        // Genres wandern mit an die Kandidaten, damit sie am Geist mit angezeigt werden.
        const names = [...new Set(cands.flatMap((c) => c.via.map((v) => v.name)))];
        const meta = {};
        await Promise.all(names.map(async (n) => {
          try {
            if (pack.enrich) { const e = await pack.enrich({ name: n }); meta[n] = { genres: e.genres || [], listeners: e.popularity ?? null }; }
            else if (pack.popularity) { meta[n] = { genres: [], listeners: (await pack.popularity(n)) ?? null }; }
            else meta[n] = { genres: [], listeners: null };
          } catch { meta[n] = { genres: [], listeners: null }; }
        }));
        for (const c of cands) for (const v of c.via) { const m = meta[v.name]; if (m) { v.listeners = m.listeners; v.genres = m.genres; } }

        return send(res, 200, { ok: true, from: A, to: B, mode, candidates: cands });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Gewählte Brücke in den Graphen einfügen: Zwischen-Einträge anlegen und die Kette
    // A — via… — B als „similar"-Kanten verbinden. from/to existieren schon auf der Karte.
    if (req.method === "POST" && url.pathname === "/api/bridge/add") {
      const { from, to, via = [], fromId, toId } = await readBody(req);
      if (!from || !to || !via.length) return send(res, 400, { error: "from/to/via fehlt" });
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const aNode = (fromId && g.artists[fromId]) || upsertArtist(g, { name: from });
        const bNode = (toId && g.artists[toId]) || upsertArtist(g, { name: to });
        const chain = [aNode, ...via.map((name) => upsertArtist(g, { name })), bNode];
        for (let i = 0; i < chain.length - 1; i++) addEdge(g, chain[i].id, chain[i + 1].id, "similar", 0.5, "bridge");
        await persist(g);
        return send(res, 200, { ok: true, graph: materialize(g) });
      });
    }

    if (req.method === "POST" && url.pathname === "/api/delete") {
      const { id } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        if (!g.artists[id]) return send(res, 404, { error: "Eintrag unbekannt" });
        delete g.artists[id];
        g.edges = g.edges.filter((e) => e.from !== id && e.to !== id);
        await persist(g);
        return send(res, 200, { ok: true, graph: materialize(g) });
      });
    }

    if (req.method === "POST" && url.pathname === "/api/restore") {
      const { artist, edges = [] } = await readBody(req);
      if (!artist?.id) return send(res, 400, { error: "artist fehlt" });
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        g.artists[artist.id] = artist;
        for (const e of edges) {
          if (!g.edges.find((x) => x.type === e.type && x.from === e.from && x.to === e.to)) g.edges.push(e);
        }
        await persist(g);
        return send(res, 200, { ok: true, graph: materialize(g) });
      });
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      const { scope = "all" } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        let g;
        if (scope === "all") {
          g = emptyGraph();
        } else if (scope === "lineups") {
          g = await loadGraph(GRAPH);
          g.events = [];
          for (const a of Object.values(g.artists)) { delete a.bl; delete a.wikiChecked; delete a.wiki; }
          g.sources = (g.sources || []).filter((s) => s.id !== "wikipedia");
        } else if (scope === "discovered") {
          g = await loadGraph(GRAPH);
          const keep = new Set();
          for (const e of g.edges) { keep.add(e.from); keep.add(e.to); }
          for (const a of Object.values(g.artists)) {
            if (!a.seed && !a.known && !a.note && !a.status && !keep.has(a.id)) delete g.artists[a.id];
          }
        } else {
          return send(res, 400, { error: "scope muss all|lineups|discovered sein" });
        }
        await persist(g);
        return send(res, 200, { ok: true, graph: materialize(g) });
      });
    }

    // Ganzen Graphen importieren (Backup wiederherstellen / auf anderen Rechner mitnehmen).
    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readBody(req);
      const incoming = body?.graph ?? body;
      if (!incoming || typeof incoming !== "object" || typeof incoming.artists !== "object" || !Array.isArray(incoming.edges)) {
        return send(res, 400, { error: "Keine gültige Graph-Datei (erwartet { artists, edges })." });
      }
      return withGraphLock(GRAPH, async () => {
        try {
          const cur = await readFile(GRAPH, "utf8");
          await writeFile(dataFile(dataRoot, pack.id, "graph.bak.json"), cur, "utf8");
        } catch { /* noch kein Graph vorhanden -> nichts zu sichern */ }
        const g = { meta: incoming.meta || { version: 1 }, artists: incoming.artists, edges: incoming.edges,
          events: incoming.events || [], sources: incoming.sources || [] };
        await persist(g);
        const loaded = await loadGraph(GRAPH); // durch Migration/Bereinigung schicken
        return send(res, 200, { ok: true, artists: Object.keys(loaded.artists).length, graph: materialize(loaded) });
      });
    }

    // Legacy (nur Musik): Wikipedia-Lineups / Auto-Entdeckung.
    if (req.method === "POST" && url.pathname === "/api/auto" && pack.id === "music") {
      const b = await readBody(req);
      const lang = safeLang(b.lang);                                  // SSRF-Schutz: nur echte Sprachcodes
      const maxArtists = clampInt(b.maxArtists, 60, 1, 200);          // Amplification-Deckel
      const minArtists = clampInt(b.minArtists, 2, 1, 50);
      const maxFestivals = clampInt(b.maxFestivals, 30, 1, 100);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        try {
          const { discoverAndScrape } = await import("./lib/discover.mjs");
          const summary = await discoverAndScrape(g, { lang, maxArtists, minArtists, maxFestivals });
          await persist(g);
          return send(res, 200, { ok: true, summary, graph: materialize(g) });
        } catch (err) {
          return send(res, 502, { error: err.message });
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/scrape" && pack.id === "music") {
      const { target, lang: langRaw, name, date, place } = await readBody(req);
      const lang = safeLang(langRaw); // SSRF-Schutz: nur echte Sprachcodes im Wikipedia-Host
      if (!target) return send(res, 400, { error: "target (URL oder Titel) fehlt" });
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        try {
          const { fetchLineup } = await import("./lib/wikipedia.mjs");
          const r = await fetchLineup(target, { lang });
          if (!r.lineup.length) return send(res, 200, { ok: false, error: "Kein Lineup gefunden", eventName: r.eventName });
          const { event, artistCount } = addEvent(g, {
            name: name || r.eventName, date, place, lineup: r.lineup, sourceUrl: r.sourceUrl,
          });
          await persist(g);
          return send(res, 200, { ok: true, eventName: event.name, artistCount, graph: materialize(g) });
        } catch (err) {
          return send(res, 502, { error: err.message });
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/artist") {
      const { id, known, note, status } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const a = g.artists[id];
        if (!a) return send(res, 404, { error: "Eintrag unbekannt" });
        if (typeof known === "boolean") a.known = known;
        if (typeof note === "string") a.note = note;
        if (typeof status === "string") { a.status = status; a.known = status !== ""; } // known bleibt abgeleitet
        await persist(g);
        return send(res, 200, { ok: true, artist: a });
      });
    }

    // Steckbrief beim Anklicken nachladen: Genres + Popularität (+ Momentum) + Ort.
    if (req.method === "POST" && url.pathname === "/api/enrich") {
      const { id } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const a = g.artists[id];
        if (!a) return send(res, 404, { error: "unbekannt" });
        let changed = false, growth = null;
        let patch = {};
        try { patch = await pack.enrich(a, { home: reqHome(req) }) || {}; } catch {}
        if (patch.genres?.length && (!a.genres || !a.genres.length)) { a.genres = patch.genres; changed = true; }
        if (patch.url && !a.url) { a.url = patch.url; changed = true; }
        if (patch.popularity) {
          if (a.listeners !== patch.popularity) { a.listeners = patch.popularity; changed = true; }
          const stats = await loadStats(STATS);
          if (addSnapshot(stats, id, patch.popularity)) await saveStats(STATS, stats);
          growth = growthPerMonth(stats, id);
        }
        if (patch.location && !a.booking?.area && !a.bcLocation) { a.bcLocation = patch.location; a.bcUrl = patch.locationUrl || null; changed = true; }
        if (changed) await persist(g);
        return send(res, 200, { ok: true, genres: a.genres || [], listeners: a.listeners ?? null, growth, location: a.booking?.area || a.bcLocation || null, bcUrl: a.bcUrl || null });
      });
    }

    // Vorschau/Klangprobe — nur, wenn das Pack eine liefert.
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { name, listeners } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      if (!pack.preview) return send(res, 200, { ok: false });
      let p = null;
      try { p = await pack.preview(name, { listeners: typeof listeners === "number" ? listeners : null }); } catch {}
      if (!p?.url) return send(res, 200, { ok: false });
      return send(res, 200, { ok: true, url: p.url, track: p.track, artist: p.artist });
    }

    // Umfeld eines Eintrags. /api/labelmates bleibt als Alias.
    if (req.method === "POST" && (url.pathname === "/api/context" || url.pathname === "/api/labelmates")) {
      const { id } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const a = g.artists[id];
      if (!a) return send(res, 404, { error: "unbekannt" });
      if (!pack.context) return send(res, 200, { ok: true, note: null, groups: [] });
      try {
        const r = await pack.context(a.name);
        return send(res, 200, { ok: true, note: r.note || null, groups: r.groups || [] });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Radar: Geheimtipp-Score — kleine Einträge nah an deinen Likes, mit Begründung.
    if (req.method === "POST" && url.pathname === "/api/radar") {
      const { limit = 10, extraLikes = [], visible = null, force = false } = await readBody(req);
      const g = await loadGraph(GRAPH);
      const extra = new Set(extraLikes);
      // C8: Sind sichtbare Acts mitgegeben, leitet das Radar seine Vorschläge NUR aus dem gerade
      // sichtbaren Ausschnitt ab (plus explizite Likes). Sonst wie bisher aus allen gesuchten/
      // gemerkten Acts.
      const fromVisible = Array.isArray(visible) && visible.some((id) => g.artists[id]);
      const likes = fromVisible
        ? new Set([...visible.filter((id) => g.artists[id]), ...[...extra].filter((id) => g.artists[id])])
        : new Set(Object.values(g.artists)
            .filter((a) => a.seed || a.known || (a.status && a.status !== "declined") || extra.has(a.id))
            .map((a) => a.id));
      if (!likes.size) return send(res, 400, { error: "Erst ein paar Einträge suchen oder liken — dann hat das Radar einen Geschmack, an dem es sich orientieren kann." });

      const cacheKey = [...likes].sort().join(",") + "|" + limit;
      const cached = radarCache.get(pack.id);
      if (!force && cached && cached.key === cacheKey && Date.now() - cached.at < RADAR_TTL) {
        return send(res, 200, { ...cached.payload, cached: true, computedAt: cached.at });
      }

      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const inGraph = new Set(Object.values(g.artists).map((a) => norm(a.name)));
      const likeName = (id) => g.artists[id]?.name || id;
      const popLabel = pack.config.popularity?.label || "";

      // (a) Graph-Nachbarn: Nähe = Summe der Kantengewichte zu Likes
      const cand = new Map();
      for (const e of g.edges) {
        const [l, o] = likes.has(e.from) && !likes.has(e.to) ? [e.from, e.to]
                     : likes.has(e.to) && !likes.has(e.from) ? [e.to, e.from] : [null, null];
        if (!o || !g.artists[o]) continue;
        const c = cand.get(o) ?? { id: o, closeness: 0, together: false, vias: new Set() };
        c.closeness += e.type === "similar" ? (e.weight || 0.5) : Math.min(1, 0.4 + 0.1 * (e.weight || 1));
        if (e.type !== "similar") c.together = true;
        c.vias.add(likeName(l));
        cand.set(o, c);
      }
      const graphCands = [...cand.values()].sort((x, y) => y.closeness - x.closeness).slice(0, 30);

      const stats = await loadStats(STATS);
      let statsChanged = false;
      const popById = new Map();
      if (pack.popularity) {
        for (const c of graphCands.slice(0, 25)) {
          const a = g.artists[c.id];
          try {
            const p = await pack.popularity(a.name, { mbid: a.mbid || undefined });
            if (p) {
              if (a.listeners !== p) a.listeners = p; // nur in-memory: fürs Scoring/die Ausgabe unten
              popById.set(c.id, p);
              if (addSnapshot(stats, c.id, p)) statsChanged = true;
            }
          } catch { /* ohne Popularität weiter */ }
        }
      }
      if (statsChanged) await saveStats(STATS, stats);
      // Hörerzahlen NACH id in den AKTUELLEN Graph mergen (unter Lock) — nie die alte Kopie
      // zurückschreiben, sonst überschriebe man parallel dazwischen erkundete Acts (lost update).
      if (popById.size) await withGraphLock(GRAPH, async () => {
        const gCur = await loadGraph(GRAPH);
        let ch = false;
        for (const [id, p] of popById) { const a = gCur.artists[id]; if (a && a.listeners !== p) { a.listeners = p; ch = true; } }
        if (ch) await persist(gCur);
      });

      // (b) Pack-spezifische Zusatzkandidaten (Musik: Deezer-Related + Bandcamp-Releases)
      let extras = [];
      if (pack.radarExtras) {
        const deg = {};
        for (const e of g.edges) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; }
        const topLikeNames = [...likes].sort((a, b) => (deg[b] || 0) - (deg[a] || 0)).slice(0, 4).map(likeName);
        const genreCount = new Map();
        for (const id of likes) for (const gn of g.artists[id]?.genres || []) {
          const k = gn.toLowerCase(); genreCount.set(k, (genreCount.get(k) || 0) + 1);
        }
        const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
        try { extras = await pack.radarExtras({ topLikeNames, topGenres, isKnown: (k) => inGraph.has(k) }) || []; } catch {}
      }

      const small = (n) => n == null ? 0.5 : n < 3000 ? 1 : n < 10000 ? 0.85 : n < 30000 ? 0.65 : n < 100000 ? 0.4 : n < 300000 ? 0.2 : 0.08;
      const fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);
      const out = [];
      for (const c of graphCands) {
        const a = g.artists[c.id];
        const growth = growthPerMonth(stats, c.id);
        const mom = growth == null ? 1 : growth >= 25 ? 1.25 : growth >= 10 ? 1.12 : growth < 0 ? 0.92 : 1;
        const score = Math.min(c.closeness, 3) / 3 * small(a.listeners) * mom * (c.together ? 1.15 : 1) * (a.active ? 1.1 : 1);
        const reasons = [`nah an ${[...c.vias].slice(0, 2).join(" & ")}`];
        if (a.listeners != null && popLabel) reasons.push(`${fmtNum(a.listeners)} ${popLabel}`);
        if (growth != null && growth >= 10) reasons.push(`▲ +${growth}%/Monat`);
        if (c.together) reasons.push(pack.config.radarTogetherReason || "direkt verbunden");
        if (a.active && pack.config.activeLabel) reasons.push(pack.config.activeLabel);
        out.push({ name: a.name, id: c.id, inGraph: true, listeners: a.listeners ?? null, growth, score, reasons, url: a.bcUrl || a.url || null });
      }
      for (const x of extras) {
        out.push({ name: x.name, id: null, inGraph: false, score: x.score ?? 0.5, reasons: x.reasons || [], url: x.url || null });
      }
      out.sort((x, y) => y.score - x.score);
      const radar = out.slice(0, Math.max(3, Math.min(30, limit)));
      try {
        let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
        dg.seenRadar = [...new Set([...(dg.seenRadar || []), ...radar.map((r) => r.name)])].slice(-400);
        await writeJsonAtomic(DIGEST, dg);
      } catch {}
      const payload = { ok: true, likes: likes.size, fromVisible, radar, computedAt: Date.now() };
      radarCache.set(pack.id, { at: payload.computedAt, key: cacheKey, payload });
      return send(res, 200, payload);
    }

    // Beim App-Start: Popularität der markierten Einträge still snapshotten.
    if (req.method === "POST" && url.pathname === "/api/snapshot") {
      if (!pack.popularity) return send(res, 200, { ok: true, snapshotted: 0, marked: 0 });
      const g0 = await loadGraph(GRAPH);
      const marked = Object.values(g0.artists).filter((a) => a.seed || a.known || a.status).map((a) => ({ id: a.id, name: a.name, mbid: a.mbid || undefined }));
      // Netz-Aufruf außerhalb des Locks; Ergebnisse nach id sammeln.
      const popById = new Map();
      for (const m of marked) {
        try { const p = await pack.popularity(m.name, { mbid: m.mbid }); if (p) popById.set(m.id, p); } catch { /* ohne Popularität weiter */ }
      }
      let n = 0;
      if (popById.size) {
        const stats = await loadStats(STATS);
        let statsChanged = false;
        for (const [id, p] of popById) if (addSnapshot(stats, id, p)) { statsChanged = true; n++; }
        if (statsChanged) await saveStats(STATS, stats);
        // Hörerzahlen nach id in den AKTUELLEN Graph mergen (unter Lock) — nicht die alte Kopie clobbern.
        await withGraphLock(GRAPH, async () => {
          const g = await loadGraph(GRAPH);
          let changed = false;
          for (const [id, p] of popById) { const a = g.artists[id]; if (a && a.listeners !== p) { a.listeners = p; changed = true; } }
          if (changed) await persist(g);
        });
      }
      return send(res, 200, { ok: true, snapshotted: n, marked: marked.length });
    }

    // Hörerzahlen für noch nicht befüllte Knoten nachladen -> Kugelgröße/Glow richten sich
    // auch für (noch nicht geöffnete) Nachbarn nach der Popularität. Gedrosselt + gecacht;
    // pro Aufruf gedeckelt, der Client ruft bei Bedarf mehrmals. Gibt nur die neuen Werte zurück.
    if (req.method === "POST" && url.pathname === "/api/popfill") {
      if (!pack.popularity) return send(res, 200, { ok: true, filled: 0, remaining: 0, listeners: {} });
      const g0 = await loadGraph(GRAPH);
      const all = Object.values(g0.artists).filter((a) => !a.venue && a.listeners == null);
      const batch = all.slice(0, 40).map((a) => ({ id: a.id, name: a.name, mbid: a.mbid || undefined }));
      const popById = new Map();
      for (const m of batch) {
        let p = null; try { p = await pack.popularity(m.name, { mbid: m.mbid }); } catch {}
        popById.set(m.id, p ?? 0); // 0 = versucht, aber keine Zahl -> wird nicht endlos neu geholt
      }
      if (popById.size) await withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        for (const [id, p] of popById) { const a = g.artists[id]; if (a && a.listeners == null) a.listeners = p; }
        await persist(g);
      });
      const out = {}; for (const [id, p] of popById) out[id] = p;
      return send(res, 200, { ok: true, filled: popById.size, remaining: Math.max(0, all.length - batch.length), listeners: out });
    }

    // Genres für alle noch nicht befüllten Knoten gedrosselt nachladen -> der Genre-Filter greift
    // dann auch auf (noch nicht geöffnete) Nachbarn, nicht nur auf angeklickte Acts. Gedrosselt +
    // gecacht; pro Aufruf gedeckelt, der Client ruft bei Bedarf mehrmals. `genresChecked` verhindert,
    // dass Acts ohne gefundene Tags endlos neu abgefragt werden.
    if (req.method === "POST" && url.pathname === "/api/genrefill") {
      const g0 = await loadGraph(GRAPH);
      const all = Object.values(g0.artists).filter((a) => !a.venue && !(a.genres && a.genres.length) && !a.genresChecked);
      const batch = all.slice(0, 20);
      const byId = new Map();
      for (const a of batch) {
        let genres = []; try { genres = (await pack.enrich(a))?.genres || []; } catch {}
        byId.set(a.id, genres.slice(0, 6));
      }
      if (byId.size) await withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        for (const [id, genres] of byId) {
          const a = g.artists[id]; if (!a) continue;
          if (genres.length && !(a.genres && a.genres.length)) a.genres = genres;
          a.genresChecked = true; // versucht — auch wenn nichts gefunden -> kein endloses Neuholen
        }
        await persist(g);
      });
      const out = {}; for (const [id, gs] of byId) if (gs.length) out[id] = gs;
      return send(res, 200, { ok: true, filled: byId.size, remaining: Math.max(0, all.length - batch.length), genres: out });
    }

    // Wochen-Digest: welche markierten Einträge sind gewachsen/geschrumpft.
    if (req.method === "POST" && url.pathname === "/api/digest") {
      const g = await loadGraph(GRAPH);
      const stats = await loadStats(STATS);
      const marked = Object.values(g.artists).filter((a) => a.seed || a.known || a.status);
      const grown = [], shrunk = [];
      let oldest = Date.now();
      for (const a of marked) {
        const arr = stats[a.id];
        if (arr?.length) oldest = Math.min(oldest, arr[0].t);
        const gr = growthPerMonth(stats, a.id);
        if (gr == null) continue;
        if (gr >= 10) grown.push({ name: a.name, id: a.id, growth: gr, listeners: a.listeners ?? null });
        else if (gr < 0) shrunk.push({ name: a.name, id: a.id, growth: gr });
      }
      grown.sort((x, y) => y.growth - x.growth);
      shrunk.sort((x, y) => x.growth - y.growth);
      const historyDays = Math.round((Date.now() - oldest) / 864e5);
      let dg = {}; try { dg = JSON.parse(await readFile(DIGEST, "utf8")); } catch {}
      const sinceDays = dg.lastOpen ? Math.round((Date.now() - dg.lastOpen) / 864e5) : null;
      dg.lastOpen = Date.now();
      try { await writeJsonAtomic(DIGEST, dg); } catch {}
      return send(res, 200, { ok: true, grown: grown.slice(0, 6), shrunk: shrunk.slice(0, 3), marked: marked.length, historyDays, sinceDays });
    }

    // Genres für einen bereits vorhandenen Eintrag nachladen — beim Anklicken.
    if (req.method === "POST" && url.pathname === "/api/genres") {
      const { id } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const a = g.artists[id];
        if (!a) return send(res, 404, { error: "unbekannt" });
        if (a.genres && a.genres.length) return send(res, 200, { ok: true, genres: a.genres });
        let genres = [];
        try { genres = (await pack.enrich(a))?.genres || []; } catch {}
        a.genres = genres;
        await persist(g);
        return send(res, 200, { ok: true, genres });
      });
    }

    // Suchvorschläge (Autocomplete).
    if (req.method === "GET" && url.pathname === "/api/suggest") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return send(res, 200, { names: [] });
      let names = [];
      try { names = pack.suggest ? await pack.suggest(q) : []; } catch {}
      return send(res, 200, { names });
    }

    // „Überrasch mich" (leere Seite): ein zufälliger, eher unbekannter Eintrag zum Reinstolpern.
    if (req.method === "GET" && url.pathname === "/api/surprise") {
      if (!pack.surprise) return send(res, 200, { ok: false });
      let name = null;
      try { name = await pack.surprise(); } catch {}
      return name ? send(res, 200, { ok: true, name }) : send(res, 200, { ok: false });
    }

    // Markierte Einträge als CSV exportieren (Shortlist).
    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const g = await loadGraph(GRAPH);
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const music = pack.config.features?.booking;
      const rows = [music
        ? ["Name", "Status", "Genres", "Region", "Aktiv", "Booking/Kontakt", "Notiz", "RA", "Soundcloud", "Instagram", "Website"]
        : ["Name", "Status", "Genres", "Notiz", "URL"]];
      for (const a of Object.values(g.artists)) {
        if (!a.status && !a.known && !a.note) continue; // nur kuratierte Einträge
        const b = a.booking || {};
        rows.push(music
          ? [a.name, a.status || (a.known ? "shortlist" : ""), (a.genres || []).join("; "),
             [b.area, b.country].filter(Boolean).join(", "), a.active ? "ja" : "", b.details || "", a.note || "",
             b.ra || "", b.soundcloud || "", b.instagram || "", b.website || ""]
          : [a.name, a.status || (a.known ? "shortlist" : ""), (a.genres || []).join("; "), a.note || "", a.url || ""]);
      }
      const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="like-shortlist.csv"' });
      return res.end(csv);
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    // Erwartete Client-Fehler (ungültiges JSON 400, zu große Anfrage 413) sauber melden;
    // unerwartete Fehler NICHT im Klartext nach außen geben (kein Info-Leak) — nur loggen.
    if (err && err.statusCode) return send(res, err.statusCode, { error: err.message });
    console.error("Unerwarteter Fehler:", err && err.stack || err);
    send(res, 500, { error: "interner Fehler" });
  }
});

// Browser plattformübergreifend öffnen (Windows/macOS/Linux), wenn mit --open gestartet.
function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  import("node:child_process").then(({ exec }) => exec(cmd, () => {}));
}

// Default loopback (Desktop/lokal); gehostet via HOST=0.0.0.0 (siehe oben).
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${server.address().port}`;
  console.log(`Like läuft auf ${url} (Packs: ${[...PACKS.keys()].join(", ")}; Default: ${DEFAULT_PACK})`);
  if (process.argv.includes("--open") || process.env.LIKE_OPEN) openBrowser(url);
});
