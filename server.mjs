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
//   POST /api/bridge       { from, to } -> Routenplaner-Suche starten (Sitzung; kürzeste Verbindung)
//   POST /api/bridge/step  { session } -> ein Suchpaket weitergraben (Fortschritt/Kandidaten)
//   POST /api/bridge/stop  { session } -> Suche abbrechen (Sitzung entsorgen)

import { createServer } from "node:http";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
// Konstantzeit-Vergleich (gegen Timing-Angriffe aufs Unlock-Passwort); längenverschieden -> false.
const timingEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && timingSafeEqual(A, B); };
import { readFile, writeFile, access, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
// JSON atomar schreiben (tmp+rename) — kein zerhacktes digest.json bei Absturz/voller Platte.
const writeJsonAtomic = async (path, obj) => { const tmp = path + ".tmp"; await writeFile(tmp, JSON.stringify(obj), "utf8"); await rename(tmp, path); };
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGraph, saveGraph, materialize, emptyGraph, upsertArtist, slug } from "./lib/store.mjs";
import { featureVec, cosine } from "./lib/vector.mjs"; // B4: Kohärenz-Bewertung der Brücken-Kandidaten
import { getUserTopArtists, getSimilar } from "./lib/lastfm.mjs"; // E13: Kaltstart-Import (nur Musik-Pack)
import { loadStats, saveStats, addSnapshot, growthPerMonth } from "./lib/stats.mjs";
import { loadPack, listPacks, resolvePackId, dataFile } from "./lib/packs.mjs";
import { clearKey } from "./lib/keys.mjs";
import { hasPushover, sendFeedback, notifyQuiet } from "./lib/pushover.mjs";
import { hasIssueSink, collectFeedbackQuiet, createFeedbackIssue, listFeedbackIssues, feedbackTarget } from "./lib/github-issues.mjs";
import { initUsage, countUsage, usageSnapshot } from "./lib/usage.mjs";
import { landingHtml } from "./lib/landing.mjs";
import { initAuth, register, verify, resetPassword, makeSession, userFromCookie, userCount } from "./lib/auth.mjs";

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
// Fan-out je ＋-Ausbau: so viele „ähnlich"-Nachbarn kommen sofort in die Karte; der Rest wartet
// als Warteliste (a.pending) und wird per „+K laden" nachgeholt. Klein halten hält die Karte lesbar.
const EXPLORE_SHOW = Math.max(1, Number(process.env.LIKE_EXPLORE_SHOW) || 10);
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
    n: Object.keys(g.artists || {}).length, e: (g.edges || []).length,
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

function landingPage(unlocked, req) {
  return landingHtml(LANDING_CARDS, {
    hrefFor: (id) => `/?pack=${encodeURIComponent(id)}`,
    pageTitle: "like — Übersicht",
    headExtra: metaTags({
      title: "like — die Landkarte für Entdeckungen",
      desc: "Spotify sagt dir, was du hören sollst. like zeigt dir die Landkarte: ähnliche Acts, Filme, Bücher & mehr als interaktives Netz — ohne Feed, ohne Werbung, ohne Tracking.",
      path: "/", base: publicBase(req),
    }),
    heading: "like<b>.</b>",
    sub: "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.",
    footer: `${APP_VERSION ? `v${APP_VERSION} · alle Domänen in einer App · ` : ""}<a href="/impressum" style="color:inherit">Impressum</a> · <a href="/datenschutz" style="color:inherit">Datenschutz</a>${BUILD_REF ? ` · <a href="${BUILD_REF.href}" target="_blank" rel="noreferrer" style="color:inherit">${BUILD_REF.label}</a>` : ""}`,
    gated: GATING_ON && !unlocked,   // gesperrte Karten: „Labs" + Passwort-Prompt statt Link
    lockLabel: "Labs",
    heroId: "music",                 // E3: Musik ist das Produkt — als Hero hervorheben
    tagline: {
      h: `Spotify sagt dir, was du hören sollst. <b>like</b> zeigt dir die Landkarte.`,
      p: `Kleine Acts, echte Verbindungen — ähnlicher Sound und „zusammen aufgetreten“ als begehbares Netz. Ohne Feed, ohne Werbung, ohne Tracking.`,
    },
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
    <li><b>localStorage</b> (anonyme Geräte-Kennung): hält deine Karte auf diesem Gerät zusammen, damit sie das Schließen des Tabs überlebt. Kein Cookie, keine Weitergabe; die zugehörige Karte wird serverseitig nach <b>30 Tagen ohne Besuch automatisch gelöscht</b>. Du kannst die Kennung jederzeit selbst entfernen (Browser-Speicher leeren).</li>
    <li><b>localStorage</b> (Theme, Ansicht, gemerkter Kartenausschnitt): reine Komfort-Einstellungen, verbleiben auf deinem Gerät.</li>
    <li><b>Login-Cookie</b>: nur wenn du dir freiwillig ein Konto anlegst — hält dich angemeldet.</li>
  </ul>
  <h2>Konto (optional)</h2>
  <p>Legst du ein Konto an, werden Nutzername, ein <b>gehashtes</b> Passwort und ein Recovery-Code gespeichert, damit deine Karte auf mehreren Geräten gleich ist (Art. 6 Abs. 1 lit. b DSGVO). Ohne Konto bleibt alles an eine anonyme Geräte-Kennung gebunden und verfällt nach 30 Tagen Inaktivität.</p>
  <h2>Deine Karte</h2>
  <p>Die von dir aufgebaute Karte (gesuchte Acts, „Likes", Status, Notizen) wird serverseitig gespeichert — pro Konto bzw. pro anonymer Geräte-Kennung (Letztere wird nach 30 Tagen ohne Besuch automatisch gelöscht).</p>
  <h2>Anonyme Nutzungszähler</h2>
  <p>Der Server zählt, wie oft Funktionen insgesamt genutzt werden (z. B. „Suche wurde heute 12-mal verwendet") — als reine Tagessummen, <b>ohne</b> IP-Adressen, Kennungen, Profile oder Reihenfolgen. Ein Rückschluss auf einzelne Personen ist damit nicht möglich; die Zahlen dienen allein dazu, die Weiterentwicklung sinnvoll zu priorisieren. Es sind keinerlei Analyse- oder Werbedienste Dritter eingebunden.</p>
  <h2>Feedback</h2>
  <p>Nutzt du freiwillig den <b>Feedback-Knopf</b> (✉), wird der von dir eingegebene Nachrichtentext zusammen mit der aktuell gewählten Domäne und der App-Version an den Server übermittelt und dort <b>zur Bearbeitung gespeichert</b> — je nach Konfiguration als Push-Nachricht an den Betreiber und/oder als Eintrag in einem privaten Aufgaben-/Ticket-System (GitHub). Die Speicherung erfolgt <b>anonym</b>: es werden <b>keine</b> IP-Adresse, Kennung oder Konto-Angabe mitgespeichert, und der Text wird keiner Person zugeordnet. Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung der App (Art. 6 Abs. 1 lit. f DSGVO); die Nutzung ist freiwillig. <b>Bitte gib im Freitext keine personenbezogenen Daten ein.</b> Da das Ticket-System (GitHub) seinen Sitz außerhalb der EU hat, kann dabei eine Übermittlung in ein Drittland erfolgen.</p>
  <h2>Externe Dienste</h2>
  <p>Inhalte werden aus externen Quellen zusammengeführt (u. a. Last.fm, Resident Advisor, TMDB, MusicBrainz, Wikipedia/Wikivoyage). Diese Abfragen laufen <b>serverseitig</b> — deine IP-Adresse wird dabei <b>nicht</b> an diese Dienste weitergegeben. Ausnahmen, bei denen dein Browser direkt beim jeweiligen Anbieter lädt (und deine IP dorthin gelangt): die <b>30-Sekunden-Klangproben</b> (Deezer/iTunes-CDN) und der <b>Update-Hinweis</b> (GitHub). Es werden keine Analyse- oder Werbedienste eingebunden.</p>
  <h2>Deine Rechte</h2>
  <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie ein Beschwerderecht bei einer Aufsichtsbehörde. Ein Konto lässt sich samt Daten auf Anfrage löschen; ohne Konto genügt das Leeren des Browser-Speichers.</p>
  <p class="muted" style="margin-top:16px">Stand: Vorlage — bei geändertem Betrieb bitte aktualisieren und juristisch prüfen lassen.</p>
</div></body></html>`;
}

// Radar ist teuer (viele Popularitäts-Lookups) -> 10 Min im Speicher cachen, PRO GRAPH-DATEI
// (= pro Nutzer-Namensraum UND Pack). Nur nach Pack gekeyt würde ein Nutzer den gecachten
// Radar eines anderen sehen, sobald die Like-Mengen-Schlüssel zufällig übereinstimmen.
const radarCache = new Map(); // Graph-Pfad -> { at, key, payload }
const RADAR_TTL = 10 * 60 * 1000;

// Feedback ist einmal beim Start bekannt (Credentials ändern sich zur Laufzeit nicht).
// Zwei unabhängige Senken: Pushover = Sofortmeldung ans Handy, GitHub-Issues = dauerhafte,
// anonyme Sammelstelle fürs Backlog. Der ✉-Knopf erscheint, sobald MINDESTENS eine aktiv ist.
const PUSHOVER_ON = await hasPushover();
const ISSUES_ON = hasIssueSink();
const FEEDBACK_ON = PUSHOVER_ON || ISSUES_ON;
await initAuth(DATA_DIR); // Accounts (optional): Nutzer-Store + Session-Secret laden
await initUsage(DATA_DIR); // W7: anonyme, rein aggregierte Tageszähler (siehe Datenschutzseite)
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
  const ua = String(req.headers["user-agent"] || "").slice(0, 140);
  // Crawler/Link-Preview-Bots nicht melden — seit dem SEO-Ausbau (W1) kommen die regelmäßig
  // und würden das "neuer Besuch"-Signal entwerten.
  if (/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|headless|lighthouse/i.test(ua)) return;
  // Dedupe pro GERÄT (IP + Browser), nicht nur pro IP — zwei Rechner im selben Netz (gleiche
  // öffentliche IP) melden so getrennt. Fenster 2 h, damit Reloads nicht spammen.
  const key = ip + "|" + ua;
  if (now - (visitNotified.get(key) || 0) < 2 * 3600e3) return;
  visitNotified.set(key, now);
  if (visitNotified.size > 800) for (const [k, t] of visitNotified) if (now - t > 24 * 3600e3) visitNotified.delete(k);
  const ref = String(req.headers["referer"] || "").slice(0, 140);
  const where = !pack ? " (Startseite)" : pack.id !== "music" ? ` (${pack.id})` : "";
  const msg = `Jemand hat „like"${where} geöffnet.\nRegion: ${maskIp(ip)}${ua ? `\n${ua}` : ""}${ref ? `\nvon: ${ref}` : ""}`;
  sendFeedback({ title: "like — neuer Besuch", message: msg }).catch(() => {}); // best effort, blockiert die Seite nicht
}

// Nur Text-Formate komprimieren — Bilder/Binärformate sind schon komprimiert.
const COMPRESSIBLE = /^(application\/(json|manifest\+json|xml)|text\/|image\/svg)/;
function send(res, code, body, type = "application/json", cacheControl = "no-store") {
  let data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const headers = {
    "content-type": type, "cache-control": cacheControl, "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
  if (type.startsWith("text/html")) headers["x-frame-options"] = "SAMEORIGIN"; // Clickjacking-Schutz für die Seiten
  // HSTS nur hinter dem HTTPS-Proxy (Render) — lokal/Electron (http://localhost) wäre es falsch.
  if (res.req?.headers["x-forwarded-proto"] === "https") headers["strict-transport-security"] = "max-age=31536000";
  // Antwort-Kompression (W2): brotli bevorzugt, gzip als Fallback. Sync ist hier okay —
  // gzip/brotli(q4) brauchen für die ~370-KB-Shell einstellige Millisekunden, und die
  // großen Antworten (HTML-Shell, Graph-JSON) dominieren die Übertragungszeit bei weitem.
  const ae = String(res.req?.headers["accept-encoding"] || "");
  if (code === 200 && data.length > 1024 && COMPRESSIBLE.test(type)) {
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (/\bbr\b/.test(ae)) {
        data = brotliCompressSync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
        headers["content-encoding"] = "br"; headers["vary"] = "accept-encoding";
      } else if (/\bgzip\b/.test(ae)) {
        data = gzipSync(buf);
        headers["content-encoding"] = "gzip"; headers["vary"] = "accept-encoding";
      }
    } catch {} // im Zweifel unkomprimiert ausliefern
  }
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
// Namensraum pro GERÄT (E2: Client schickt x-like-anon aus dem localStorage — die Karte
// überlebt das Tab-Schließen, wird aber serverseitig nach 30 Tagen Inaktivität aufgeräumt,
// s. sweepAnon + Datenschutzseite); ganz ohne Kennung -> gemeinsamer Fallback (Desktop/lokal).
// So teilt sich niemand unbeabsichtigt eine Karte, und verlassene Karten verfallen trotzdem.
const sanitizeId = (s) => String(s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
function dataRootFor(req, authUser) {
  if (authUser) return join(DATA_DIR, "users", sanitizeId(authUser));
  const anon = sanitizeId(req.headers["x-like-anon"]);
  if (anon) return join(DATA_DIR, "anon", anon);
  return DATA_DIR;
}

// Anonyme Namensräume aufräumen (E2): ein Anon-Ordner gilt als inaktiv, wenn KEINE Datei
// darin jünger als LIKE_ANON_TTL_DAYS (Default 30, 0 = aus) ist — dann wird er gelöscht.
// Läuft beim Start und danach alle 12 h; Fehler sind unkritisch (nächster Lauf räumt nach).
const ANON_TTL_DAYS = Math.max(0, Number(process.env.LIKE_ANON_TTL_DAYS ?? 30) || 0);
async function sweepAnon() {
  if (!ANON_TTL_DAYS) return;
  const cutoff = Date.now() - ANON_TTL_DAYS * 864e5;
  const base = join(DATA_DIR, "anon");
  let dirs = [];
  try { dirs = await readdir(base, { withFileTypes: true }); } catch { return; } // noch keine Anon-Daten
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const root = join(base, d.name);
    let newest = 0;
    try {
      // zwei Ebenen reichen: anon/<id>/<pack>/graph.json
      for (const p of await readdir(root, { withFileTypes: true })) {
        const pp = join(root, p.name);
        if (p.isFile()) { newest = Math.max(newest, (await stat(pp)).mtimeMs); continue; }
        for (const f of await readdir(pp)) newest = Math.max(newest, (await stat(join(pp, f))).mtimeMs);
      }
      if (newest && newest < cutoff) await rm(root, { recursive: true, force: true });
    } catch {}
  }
}
sweepAnon().catch(() => {});
setInterval(() => sweepAnon().catch(() => {}), 12 * 3600e3).unref();

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

// Spenden-Konfiguration aus der ENV: NUR wenn LIKE_DONATE_URL gesetzt ist (z. B. ein
// PayPal.me-Link), zeigt das Frontend das freiwillige Spenden-Popup. Ungesetzt = aus
// (lokal/Desktop/Tests bleiben komplett unberührt). Fehlt das Schema (z. B. nur
// „paypal.me/name"), wird https:// ergänzt — sonst würde der Browser den Link relativ zur
// eigenen Domain auflösen (…/paypal.me/name -> 404).
function normalizeDonateUrl(u) {
  u = String(u).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  return u;
}
const DONATE = process.env.LIKE_DONATE_URL ? { url: normalizeDonateUrl(process.env.LIKE_DONATE_URL) } : null;

// Öffentliche Basis-URL für canonical/OG-Links: bevorzugt ENV LIKE_PUBLIC_URL, sonst aus dem
// Request (Render setzt x-forwarded-proto/-host). Ohne Host-Header -> leer, dann keine URL-Tags.
function publicBase(req) {
  const env = (process.env.LIKE_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = req?.headers["x-forwarded-host"] || req?.headers.host;
  if (!host) return "";
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${String(host).split(",")[0].trim()}`;
}

// SEO/Share-Metadaten (W1): description + OG/Twitter-Karten pro Pack, canonical wenn Basis-URL
// bekannt. og:image nutzt das vorhandene 512er-App-Icon (kein eigener Renderer nötig).
const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function metaTags({ title, desc, path, base }) {
  const url = base && path != null ? `${base}${path}` : "";
  return [
    `<meta name="description" content="${escAttr(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="like" />`,
    `<meta property="og:title" content="${escAttr(title)}" />`,
    `<meta property="og:description" content="${escAttr(desc)}" />`,
    base ? `<meta property="og:image" content="${base}/icons/icon-512.png" />` : "",
    url ? `<meta property="og:url" content="${escAttr(url)}" />` : "",
    url ? `<link rel="canonical" href="${escAttr(url)}" />` : "",
    `<meta name="twitter:card" content="summary" />`,
  ].filter(Boolean).join("\n");
}
function packMeta(pack) {
  const plur = pack.config.item?.plur || "Einträge";
  return {
    title: `${pack.config.title} — like`,
    desc: pack.id === "music"
      ? `Entdecke kleine, spannende Acts als interaktive Landkarte: ähnlicher Sound und „zusammen aufgetreten" als Verbindungen — plus Booking-Werkzeuge für Veranstalter:innen.`
      : `${pack.config.title}: Entdecke ähnliche ${plur} als interaktive Landkarte — klick dich von Punkt zu Punkt durch die Nachbarschaft, ganz ohne Feed und Werbung.`,
    path: `/?pack=${encodeURIComponent(pack.id)}`,
  };
}

// W8: Statik-Split — der große, unveränderliche Teil der App (Haupt-Script ~270 KB und
// Styles ~80 KB) wird als versionierte, ein Jahr lang cachebare Dateien ausgeliefert
// (/app.<hash>.js, /app.<hash>.css). Nur die kleine HTML-Hülle mit der pro Request
// injizierten Config (LIKE_CFG/LIKE_USER/…) bleibt dynamisch (no-store). Der Hash ändert
// sich mit dem Inhalt -> neue Version wird sofort geladen, alte bleibt nie hängen.
// (Einmal beim Start gelesen; im Dev-Betrieb nach Änderungen an index.html Server neu starten.)
const APP_SPLIT = await (async () => {
  const html = await readFile(join(ROOT, "public", "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const main = scripts.reduce((a, m) => (m[1].length > (a ? a[1].length : 0) ? m : a), null);
  const style = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)][0] || null;
  const js = main ? main[1] : "", css = style ? style[1] : "";
  const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
  const jsPath = `/app.${h(js)}.js`, cssPath = `/app.${h(css)}.css`;
  let shell = html;
  if (main) shell = shell.replace(main[0], `<script src="${jsPath}"></script>`);
  if (style) shell = shell.replace(style[0], `<link rel="stylesheet" href="${cssPath}">`);
  return { shell, js, css, jsPath, cssPath };
})();

// Pack-Config ins Frontend injizieren (+ Pack-Liste für den Umschalter).
async function indexHtml(pack, unlocked, user, req) {
  const html = APP_SPLIT.shell;
  const cfg = JSON.stringify(pack.config).replace(/</g, "\\u003c");
  const list = JSON.stringify(PACK_LIST).replace(/</g, "\\u003c");
  const u = JSON.stringify(user || null).replace(/</g, "\\u003c");
  const d = JSON.stringify(DONATE).replace(/</g, "\\u003c");
  // Eingeloggt: Spendenstatus (72-h-Popup-Ruhe) vom Konto mitgeben -> gilt auf allen Geräten.
  let support = null;
  if (user) { try { support = JSON.parse(await readFile(join(DATA_DIR, "users", sanitizeId(user), "support.json"), "utf8")); } catch {} }
  const sup = JSON.stringify(support).replace(/</g, "\\u003c");
  // Titel + SEO/Share-Metadaten pro Pack (W1) — der statische <title>Like</title> bleibt als
  // Fallback-Muster erhalten und wird hier pro Request ersetzt.
  const m = packMeta(pack);
  const withMeta = html.replace("<title>Like</title>", `<title>${escAttr(m.title)}</title>\n${metaTags({ ...m, base: publicBase(req) })}`);
  return withMeta.replace("<script>", `<script>window.LIKE_CFG = ${cfg};\nwindow.LIKE_PACKS = ${list};\nwindow.LIKE_UNLOCKED = ${unlocked ? "true" : "false"};\nwindow.LIKE_USER = ${u};\nwindow.LIKE_DONATE = ${d};\nwindow.LIKE_SUPPORT = ${sup};</script>\n<script>`);
}

async function hasApiKey(pack) {
  if (!pack.key) return true; // Pack braucht keinen Key
  if (process.env[pack.key.envVar]) return true;
  try { await access(join(DATA_DIR, pack.key.file)); return true; } catch {}
  try { await access(join(ROOT, pack.key.file)); return true; } catch {}
  return false;
}

// Nachbarn für die Brücke. Reihenfolge der Präferenz:
//   1. pack.bridgeNeighbors() — BREITE Nachbarschaft eigens für die Brücke: neben „ähnlich"
//      auch die Verknüpfungs-Relation der Domäne (bei Anything: Artikel-Links). Erst dadurch
//      treffen sich getrennte „ähnlich"-Welten (Person ↔ Ort etc.).
//   2. pack.similar() — leichte „ähnlich"-Liste
//   3. explore().similar — Fallback
async function neighborsFor(pack, name, limit) {
  if (pack.bridgeNeighbors) { const r = await pack.bridgeNeighbors(name, { limit }); return { canonical: r.canonical || name, list: r.list || [] }; }
  if (pack.similar) { const r = await pack.similar(name, { limit }); return { canonical: r.canonical || name, list: r.similar || [] }; }
  const r = await pack.explore(name); return { canonical: r.canonical || name, list: (r.similar || []).slice(0, limit) };
}

// ---- Brücken-Suche als „Routenplaner": bidirektionale Breitensuche mit Sitzungen ----
// POST /api/bridge startet eine Sitzung, /api/bridge/step gräbt schrittweise weiter,
// /api/bridge/stop räumt auf. Es wird von BEIDEN Enden gleichzeitig gesucht (wie ein
// Routenplaner von Start und Ziel); die erste Begegnung der Suchfronten ist damit die
// KÜRZESTE Verbindung (in Stationen). Der Client steuert, wie lange gesucht wird
// (Progressbar + „weitersuchen?"-Nachfrage) — der Server hält nur den Suchstand.
const bridgeSessions = new Map();
const BRIDGE_TTL = 10 * 60 * 1000; // verwaiste Sitzungen (Client weg) nach 10 min entsorgen
const BRIDGE_DEPTH_MAX = 4;        // Suchtiefe pro Seite -> Verbindungen mit bis zu 7 Zwischenstationen
const BRIDGE_FANOUT = 40;          // Nachbarn pro Quell-Abfrage
const BRIDGE_STEP_CALLS = 6;       // Quell-Abfragen pro /step (parallel) — ein „Suchpaket"
const BRIDGE_COHERENCE = process.env.LIKE_BRIDGE_COHERENCE !== "0"; // B4: Kohärenz-Bonus (an, abschaltbar)

const bkey = (s) => String(s).toLowerCase();
function sweepBridges() { const now = Date.now(); for (const [id, s] of bridgeSessions) if (now - s.ts > BRIDGE_TTL) bridgeSessions.delete(id); }

// Eine Suchfront: seen = alles Erreichte (mit Elternzeiger für die Pfad-Rekonstruktion),
// queue = noch zu expandierende Einträge in BFS-Reihenfolge (nur Schlüssel).
function bridgeSide(rootName) {
  const seen = new Map([[bkey(rootName), { name: rootName, url: null, match: 1, parent: null, depth: 0, str: 1 }]]);
  return { root: bkey(rootName), seen, queue: [] };
}

// B3 — A* INNERHALB der Tiefen-Ebene: Index des als Nächstes zu expandierenden Knotens der
// Front. Primär die FLACHSTE Tiefe (Routenplaner-Garantie: kürzeste Route zuerst, nie eine
// flachere Ebene überspringen), sekundär die stärkste kumulative Pfadstärke `str` (stärker
// verknüpfte Zweige zuerst → die Suchfronten treffen sich mit weniger Abfragen). Reines
// Umsortieren gleicher Tiefe — die Menge der erreichbaren Treffpunkte ändert sich nicht.
function bridgeBestIndex(side) {
  if (!side.queue.length) return -1;
  let bi = 0, bn = side.seen.get(side.queue[0]);
  for (let i = 1; i < side.queue.length; i++) {
    const n = side.seen.get(side.queue[i]);
    if (n.depth < bn.depth || (n.depth === bn.depth && n.str > bn.str)) { bi = i; bn = n; }
  }
  return bi;
}

// Nachbarliste eines expandierten Knotens in eine Seite einarbeiten; Begegnungen mit der
// Gegenseite landen in s.meets (Schlüssel des Treffpunkts).
function bridgeAbsorb(s, side, fromNode, list) {
  const other = side === s.A ? s.B : s.A;
  for (const nb of list) {
    const k = bkey(nb.name);
    if (s.skip.has(k)) continue;
    if (!side.seen.has(k)) {
      const match = nb.match || 0.5;
      side.seen.set(k, { name: nb.name, url: nb.url || null, match, parent: bkey(fromNode.name), depth: fromNode.depth + 1, str: fromNode.str * match });
      if (fromNode.depth + 1 < BRIDGE_DEPTH_MAX) side.queue.push(k);
    }
    if (other.seen.has(k)) s.meets.add(k);
  }
}

// Pfad vom Treffpunkt zurück zur Wurzel (Wurzel selbst NICHT enthalten, Treffpunkt zuerst).
function bridgeWalkUp(side, key) {
  const out = [];
  for (let k = key; k != null && k !== side.root; k = side.seen.get(k)?.parent) {
    const n = side.seen.get(k); if (!n) break; out.push(n);
  }
  return out;
}

// Begegnung beider Suchfronten -> Kandidat { via, strength } (Form wie bisher).
function bridgeCandidate(s, key) {
  const upA = bridgeWalkUp(s.A, key);          // [Treffpunkt, …, Nachbar von A]
  const upB = bridgeWalkUp(s.B, key);          // [Treffpunkt, …, Nachbar von B]
  if (!upA.length || !upB.length) return null; // Treffpunkt muss auf beiden Seiten liegen
  const via = [...upA.reverse(), ...upB.slice(1)]; // A-seitig hin, B-seitig weiter (Treffpunkt nur 1×)
  const ms = via.map((v) => v.match || 0.5);
  ms.push(upB[0]?.match ?? 0.5); // die Anschluss-Kante des Treffpunkts Richtung B zählt mit
  return { via: via.map((v) => ({ name: v.name, url: v.url || null })), strength: ms.reduce((a, b) => a + b, 0) / ms.length };
}

// Ein Suchpaket abarbeiten: die Seite mit der aktuell FLACHEREN Front zuerst — das hält beide
// Suchtiefen im Gleichgewicht (klassisches bidirektionales BFS) und die Verbindung minimal.
async function bridgeRunStep(pack, s) {
  const picks = [];
  for (let i = 0; i < BRIDGE_STEP_CALLS; i++) {
    const ia = bridgeBestIndex(s.A), ib = bridgeBestIndex(s.B);
    const da = ia < 0 ? Infinity : s.A.seen.get(s.A.queue[ia]).depth;
    const db = ib < 0 ? Infinity : s.B.seen.get(s.B.queue[ib]).depth;
    if (da === Infinity && db === Infinity) break;
    // flachere Front zuerst (Balance beider Suchtiefen); innerhalb der Ebene der stärkste Zweig
    const side = da <= db ? s.A : s.B, idx = da <= db ? ia : ib;
    const key = side.queue.splice(idx, 1)[0];
    picks.push({ side, node: side.seen.get(key) });
  }
  await Promise.all(picks.map(async ({ side, node }) => {
    s.checked++;
    try { bridgeAbsorb(s, side, node, (await neighborsFor(pack, node.name, BRIDGE_FANOUT)).list); }
    catch { /* einzelner Eintrag nicht auflösbar -> Suche läuft weiter */ }
  }));
}

// Antwort für Start/Step bauen; bei Fund werden die Zwischen-Einträge angereichert
// (Genres + Popularität, wie bisher) und die Sitzung beendet.
async function bridgeResult(pack, s) {
  const frontDepth = (side) => {
    // aktuelle Front = flachste noch offene Tiefe (queue ist seit B3 nicht mehr FIFO-sortiert)
    if (side.queue.length) { let d = Infinity; for (const k of side.queue) { const dd = side.seen.get(k).depth; if (dd < d) d = dd; } return d; }
    let d = 0; for (const n of side.seen.values()) if (n.depth > d) d = n.depth;
    return Math.min(BRIDGE_DEPTH_MAX, d);
  };
  const exhausted = !s.A.queue.length && !s.B.queue.length;
  const done = s.meets.size > 0 || exhausted;
  const progress = {
    checked: s.checked,
    visited: s.A.seen.size + s.B.seen.size - 2,
    depthA: frontDepth(s.A), depthB: frontDepth(s.B),
    frontier: s.A.queue.length + s.B.queue.length,
  };
  if (!done) return { ok: true, session: s.id, from: s.from, to: s.to, done: false, candidates: [], progress };

  bridgeSessions.delete(s.id);
  // kürzeste zuerst (Routenplaner!), bei gleicher Länge die stärkste Verbindung
  let cands = [...s.meets].map((k) => bridgeCandidate(s, k)).filter(Boolean)
    .sort((x, y) => x.via.length - y.via.length || y.strength - x.strength);
  // Dieselbe Kette kann über zwei Treffpunkte (beide Enden EINER Kante) doppelt auftauchen —
  // nach Namensfolge deduplizieren, damit keine identischen Geister erscheinen. Dank Sortierung
  // bleibt je Kette die kürzeste/stärkste Variante erhalten.
  const seenVia = new Set();
  cands = cands.filter((c) => { const key = c.via.map((v) => v.name.toLowerCase()).join("|"); if (seenVia.has(key)) return false; seenVia.add(key); return true; });
  cands = cands.slice(0, 20);

  // via-Namen anreichern (Genres + Popularität) — plus die beiden Endpunkte für die Kohärenz.
  const names = [...new Set([s.from, s.to, ...cands.flatMap((c) => c.via.map((v) => v.name))])];
  const meta = {};
  await Promise.all(names.map(async (n) => {
    try {
      if (pack.enrich) { const e = await pack.enrich({ name: n }); meta[n] = { genres: e.genres || [], listeners: e.popularity ?? null }; }
      else if (pack.popularity) { meta[n] = { genres: [], listeners: (await pack.popularity(n)) ?? null }; }
      else meta[n] = { genres: [], listeners: null };
    } catch { meta[n] = { genres: [], listeners: null }; }
  }));
  for (const c of cands) for (const v of c.via) { const m = meta[v.name]; if (m) { v.listeners = m.listeners; v.genres = m.genres; } }

  // B4 — Kohärenz-Bonus: bevorzugt (bei GLEICHER Länge) Brücken, deren Zwischen-Einträge
  // thematisch zu BEIDEN Enden passen. Merkmalsvektor aus den Genres, Cosinus-Ähnlichkeit
  // zum Genre-Profil der Endpunkte. Sanfter ≤15%-Faktor auf strength -> ändert die
  // via.length-Reihenfolge (Routenplaner!) NIE, nur die Reihung gleich langer Kandidaten.
  // Abschaltbar via ENV LIKE_BRIDGE_COHERENCE=0.
  if (BRIDGE_COHERENCE) {
    const endVec = featureVec([...(meta[s.from]?.genres || []), ...(meta[s.to]?.genres || [])]);
    if (endVec.size) {
      for (const c of cands) {
        let sum = 0, n = 0;
        for (const v of c.via) { const g = v.genres || []; if (g.length) { sum += cosine(featureVec(g), endVec); n++; } }
        c.coherence = n ? sum / n : 0;
        c.strength = c.strength * (0.85 + 0.15 * c.coherence);
      }
      cands.sort((x, y) => x.via.length - y.via.length || y.strength - x.strength);
    }
  }

  const shortest = cands[0]?.via.length || 0;
  const mode = shortest <= 1 ? "direct" : shortest === 2 ? "two" : shortest === 3 ? "three" : "n";
  return { ok: true, session: s.id, from: s.from, to: s.to, done: true, exhausted: !s.meets.size, mode, candidates: cands, progress };
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
      // Betreiber-Hinweis (nur wenn Pushover eingerichtet ist); bewusst nicht awaited.
      notifyQuiet({ title: "like — neuer Nutzer", message: `„${r.user}" hat sich registriert (Konto Nr. ${userCount()}).` });
      await migrateAnonToUser(req, r.user);
      setCookie(res, "like_session", makeSession(r.user), req);
      return send(res, 200, { ok: true, user: r.user, recovery: r.recovery });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const b = await readBody(req).catch(() => ({}));
      if (!(await verify(b.username, b.password))) return send(res, 401, { ok: false, error: "Name oder Passwort falsch" });
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
      // Owner-Abmeldung funktioniert auch direkt auf der Startseite (?owner=<secret>).
      if (OWNER_SECRET && url.searchParams.get("owner") === OWNER_SECRET) {
        setCookie(res, "like_owner", "1", req);
        res.writeHead(302, { location: "/" }); return res.end();
      }
      notifyVisitMaybe(req, null); // Besuch der Startseite melden (nur Fremde, gedrosselt, keine Bots)
      return send(res, 200, landingPage(isUnlocked(req), req), "text/html; charset=utf-8");
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

    // W7: aggregierte Nutzungszähler — NUR für den Betreiber (like_owner-Cookie, s. ?owner=).
    if (req.method === "GET" && url.pathname === "/api/usage") {
      if (!OWNER_SECRET || !isOwnerReq(req)) return send(res, 404, { error: "not found" });
      return send(res, 200, { ok: true, days: usageSnapshot() });
    }

    // SEO-Grundgerüst (W1): robots.txt, sitemap.xml, llms.txt — alles aus Bordmitteln.
    if (req.method === "GET" && url.pathname === "/robots.txt") {
      const base = publicBase(req);
      const body = `User-agent: *\nAllow: /\nDisallow: /api/\n${base ? `\nSitemap: ${base}/sitemap.xml\n` : ""}`;
      return send(res, 200, body, "text/plain; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      const base = publicBase(req);
      if (!base) return send(res, 404, { error: "keine Basis-URL bekannt" });
      // Nur öffentlich erreichbare Seiten listen: Landing, entsperrte Packs, Rechtsseiten.
      const paths = ["/", ...PACK_LIST.filter((p) => !p.locked).map((p) => `/?pack=${encodeURIComponent(p.id)}`), "/impressum", "/datenschutz"];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${escAttr(base + p)}</loc></url>`).join("\n")}\n</urlset>\n`;
      return send(res, 200, xml, "application/xml; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/llms.txt") {
      const base = publicBase(req);
      const open = PACK_LIST.filter((p) => !p.locked).map((p) => `- ${p.title}${base ? ` (${base}/?pack=${encodeURIComponent(p.id)})` : ""}`).join("\n");
      const body = `# like\n\n> Interaktive Landkarte für Entdeckungen: ähnliche Acts/Filme/Bücher u. a. als Force-Graph.\n> Open Source (AGPL-3.0), ohne Tracking und Werbung. Für Musik zusätzlich Booking-Werkzeuge\n> (Status, Notizen, CSV-Export) und die Besonderheit „zusammen aufgetreten"-Verbindungen.\n\n## Offene Bereiche\n${open}\n\n## Rechtliches\n- Impressum: ${base}/impressum\n- Datenschutz: ${base}/datenschutz\n`;
      return send(res, 200, body, "text/plain; charset=utf-8");
    }

    // W14: Read-Only-Ansicht eines geteilten Karten-Snapshots (STATIC-Modus des Frontends).
    if (req.method === "GET" && /^\/s\/[a-f0-9]{12}$/.test(url.pathname)) {
      const sid = url.pathname.slice(3);
      let shared;
      try { shared = JSON.parse(await readFile(join(DATA_DIR, "shares", sid + ".json"), "utf8")); }
      catch { return send(res, 404, "Diesen geteilten Link gibt es nicht (mehr).", "text/plain; charset=utf-8"); }
      const sPack = PACKS.get(shared.meta?.pack) || PACKS.get(DEFAULT_PACK);
      const esc2 = (s) => JSON.stringify(s).replace(/</g, "\\u003c");
      const n = Object.keys(shared.artists || {}).length;
      const m = { title: `Geteilte Karte (${n} ${sPack.config.item?.plur || "Einträge"}) — like`, desc: `Eine kuratierte ${sPack.config.title}-Nachbarschaft auf like — schau dir das Netz an und bau deine eigene Karte.`, path: `/s/${sid}` };
      const withMeta = APP_SPLIT.shell.replace("<title>Like</title>", `<title>${escAttr(m.title)}</title>\n${metaTags({ ...m, base: publicBase(req) })}`);
      // STATIC-Modus: LIKE_GRAPH macht das Frontend read-only (Banner, keine Schreib-Aktionen).
      const html = withMeta.replace("<script>", `<script>window.LIKE_CFG = ${esc2(sPack.config)};\nwindow.LIKE_PACKS = ${esc2(PACK_LIST)};\nwindow.LIKE_GRAPH = ${esc2(materialize(shared))};</script>\n<script>`);
      return send(res, 200, html, "text/html; charset=utf-8", "public, max-age=300");
    }

    // W8: versionierte App-Statik (Haupt-Script/Styles) — unbegrenzt cachebar, weil der
    // Dateiname den Inhalts-Hash trägt. send() komprimiert wie üblich.
    if (req.method === "GET" && url.pathname === APP_SPLIT.jsPath) {
      return send(res, 200, APP_SPLIT.js, "text/javascript; charset=utf-8", "public, max-age=31536000, immutable");
    }
    if (req.method === "GET" && url.pathname === APP_SPLIT.cssPath) {
      return send(res, 200, APP_SPLIT.css, "text/css; charset=utf-8", "public, max-age=31536000, immutable");
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
    // Graph speichern UND den Radar-Cache dieses Graphen verwerfen (nie veraltete Vorschläge).
    const persist = (g) => { radarCache.delete(GRAPH); return saveGraph(GRAPH, g); };

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // Owner meldet sich einmalig per ?owner=<secret> ab -> Cookie setzen, sauber weiterleiten.
      if (OWNER_SECRET && url.searchParams.get("owner") === OWNER_SECRET) {
        setCookie(res, "like_owner", "1", req);
        res.writeHead(302, { location: "/" }); return res.end();
      }
      notifyVisitMaybe(req, pack); // Besuch melden (nur Fremde, gedrosselt) — läuft nebenher
      countUsage("view", pack.id); // W7: aggregierter Tageszähler, kein Personenbezug
      return send(res, 200, await indexHtml(pack, isUnlocked(req), authUser, req), "text/html; charset=utf-8");
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
    // Spendenstatus des Kontos abfragen (z. B. direkt nach dem Login, ohne Neuladen).
    if (req.method === "GET" && url.pathname === "/api/support") {
      let quietUntil = 0;
      if (authUser) { try { quietUntil = JSON.parse(await readFile(join(DATA_DIR, "users", sanitizeId(authUser), "support.json"), "utf8")).quietUntil || 0; } catch {} }
      return send(res, 200, { ok: true, quietUntil });
    }

    // Spenden-Klick am Konto vermerken: 72 Std Popup-Ruhe geräteübergreifend. Anonyme
    // Nutzer haben kein Konto -> Client nutzt dann nur localStorage (account: false).
    if (req.method === "POST" && url.pathname === "/api/support/donated") {
      if (!authUser) return send(res, 200, { ok: true, account: false });
      const dir = join(DATA_DIR, "users", sanitizeId(authUser));
      const quietUntil = Date.now() + 72 * 3600e3;
      try { await mkdir(dir, { recursive: true }); await writeJsonAtomic(join(dir, "support.json"), { quietUntil, donatedAt: Date.now() }); }
      catch { return send(res, 500, { error: "Konnte nicht speichern" }); }
      return send(res, 200, { ok: true, account: true, quietUntil });
    }

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
        if (PUSHOVER_ON) {
          // Anonym + dauerhaft fürs Backlog sammeln (best effort, blockiert die Sofortmeldung nie),
          // dann die Pushover-Sofortmeldung — deren Fehler meldet der Knopf als 502.
          collectFeedbackQuiet({ message: msg, pack: pack.id, version: APP_VERSION });
          await sendFeedback({ message: `[${pack.id} v${APP_VERSION}] ${msg.slice(0, 900)}` });
        } else {
          // Nur GitHub-Sink aktiv -> hier ist das Issue die einzige Senke, Fehler also melden.
          await createFeedbackIssue({ message: msg, pack: pack.id, version: APP_VERSION });
        }
        return send(res, 200, { ok: true });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Betreiber-Ansicht der gesammelten Feedback-Issues (Read-Through auf GitHub, dieselben
    // Issues wie dort — nur bequem in der App/per curl). Streng geschützt: nur mit dem
    // LIKE_OWNER_SECRET (konstantzeit verglichen). Ohne gesetztes Secret gibt es den Endpunkt
    // gar nicht (404), damit er nicht als Existenz-Orakel für den Secret-Namen dient.
    if (req.method === "GET" && url.pathname === "/api/feedback/log") {
      if (!OWNER_SECRET) return send(res, 404, { error: "Nicht gefunden." });
      const secret = url.searchParams.get("secret") || req.headers["x-like-owner"] || "";
      if (!timingEq(secret, OWNER_SECRET)) return send(res, 403, { error: "Kein Zugriff." });
      if (!ISSUES_ON) return send(res, 400, { error: "GitHub-Feedback-Sammlung ist nicht eingerichtet (GITHUB_FEEDBACK_TOKEN)." });
      const state = url.searchParams.get("state") || "open";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10) || 50;
      try {
        const issues = await listFeedbackIssues({ state, limit });
        return send(res, 200, { ok: true, ...feedbackTarget(), count: issues.length, issues });
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Client-Fehlerbericht (z. B. Brücke fehlgeschlagen) -> Pushover an den Betreiber, mit möglichst
    // viel Debug-Kontext. Nur wenn Pushover eingerichtet ist; sonst still (200, sent:false). Gleiche
    // Drossel wie Feedback, damit ein hängender Client keine Nachrichtenflut auslöst.
    if (req.method === "POST" && url.pathname === "/api/clienterror") {
      if (!PUSHOVER_ON) return send(res, 200, { ok: true, sent: false });
      const now = Date.now();
      fbHits = fbHits.filter((t) => now - t < 5 * 60 * 1000);
      if (fbHits.length >= 6) return send(res, 200, { ok: true, sent: false }); // still gedrosselt, kein Spam
      fbHits.push(now);
      const body = await readBody(req).catch(() => ({}));
      const kind = String(body.kind || "Client").slice(0, 40);
      const info = (body.info && typeof body.info === "object") ? body.info : {};
      // grobe IP-Maskierung (letztes Oktett / letzte v6-Gruppe raus), damit nichts Volles im Push landet
      const ipRaw = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";
      const ip = ipRaw.replace(/\.\d+$/, ".x").replace(/:[0-9a-f]+$/i, ":x") || "?";
      const lines = [
        `Pack ${pack.id} · v${APP_VERSION} · build ${BUILD_REF}`,
        `IP~ ${ip}`,
        ...Object.entries(info).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`),
      ].join("\n");
      sendFeedback({ title: `like — ${kind}-Fehler`, message: lines.slice(0, 1024) }).catch(() => {}); // best effort
      return send(res, 200, { ok: true, sent: true });
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

    // E1: kuratierte Beispiel-Karte des Packs (rein lesend, wird NIE in den Nutzer-Graphen
    // gemischt) — der Client zeigt sie beim leeren Erstbesuch, die erste eigene Suche ersetzt sie.
    if (req.method === "GET" && url.pathname === "/api/demo") {
      try {
        const g = JSON.parse(await readFile(join(ROOT, "packs", pack.id, "demo.json"), "utf8"));
        if (!Object.keys(g.artists || {}).length) return send(res, 200, { ok: false });
        return send(res, 200, { ok: true, graph: materialize(g) });
      } catch { return send(res, 200, { ok: false }); }
    }

    // Vorwärmen: die (langsamen) Ähnlich-/Zusammen-Fetches eines Namens schon mal in den Cache
    // holen, OHNE den Graphen zu ändern. Wird beim Hovern ausgelöst -> der spätere Ausbau ist
    // dann ein Cache-Hit und fühlt sich flott an. Nebenläufig, Antwort kommt sofort.
    if (req.method === "POST" && url.pathname === "/api/prefetch") {
      const { name } = await readBody(req);
      if (name) pack.explore?.(name, { home: reqHome(req) }).catch(() => {});
      return send(res, 200, { ok: true });
    }

    // Haupt-Flow: einen Eintrag erkunden -> ähnlich + zusammen + Genres (via Pack).
    if (req.method === "POST" && (url.pathname === "/api/explore" || url.pathname === "/api/expand")) {
      const { name, staged, mbid } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      countUsage(url.pathname === "/api/expand" ? "expand" : "explore", pack.id);
      // R14 — zweiphasiger Ausbau: Kann das Pack staged (nur Musik) und wünscht der Client
      // es, antwortet Phase 1 schon nach dem schnellen Last.fm-Teil (pending:true); der
      // Client holt die RA-Kanten danach über /api/explore2 nach. `explored` wird erst in
      // Phase 2 gesetzt — ein halb geladener Act gilt nicht als fertig.
      const usesStaged = !!(staged && pack.exploreFast && pack.exploreTogether);
      let r;
      // Netz-Aufruf BEWUSST außerhalb des Graph-Locks (langsame I/O soll den Mutex nicht halten).
      // lang: einzelne Packs richten Anbieter-Storefronts an der UI-Sprache aus (E14, Podcasts).
      try {
        r = usesStaged
          ? await pack.exploreFast(name, { mbid })
          : await pack.explore(name, { home: reqHome(req), lang: req.headers["x-like-lang"] === "en" ? "en" : "de", mbid });
      }
      catch (err) { return send(res, 502, { error: err.message }); }
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const src = upsertArtist(g, { name: r.canonical || name, url: r.url || null, mbid: mbid || null, seed: true });
        if (mbid) src.mbid = mbid; // gewählte Namensvetter-Identität festhalten (Enrich/Expand nutzen sie)
        if (!usesStaged) src.explored = true;
        if (r.genres?.length) src.genres = r.genres.slice(0, 6);
        if (r.meta) { src.booking = r.meta; }
        if (r.active !== undefined) src.active = r.active;
        // Fan-out drosseln: nur die Top-N stärksten „ähnlich"-Nachbarn kommen sofort in die
        // Karte, der Rest (bis zum bisherigen 25er-Deckel) wird als Warteliste am Act geparkt
        // und per „+K laden" (/api/reveal) nachgeholt — ohne erneuten Netz-Aufruf. Verhindert
        // das Zumüllen der Karte pro ＋, ohne Information zu verlieren. „zusammen aufgetreten"
        // bleibt voll (weniger Knoten, und die orange Kante ist das Alleinstellungsmerkmal).
        const sims = (r.similar || []);
        for (const s of sims.slice(0, EXPLORE_SHOW)) {
          const t = upsertArtist(g, { name: s.name, url: s.url, mbid: s.mbid || null });
          addEdge(g, src.id, t.id, "similar", s.match || 0.5, r.similarSource || pack.id);
        }
        const rest = sims.slice(EXPLORE_SHOW, 25)
          .filter((s) => { const tid = slug(s.name); return tid && tid !== src.id && !g.edges.some((e) => e.from === src.id && e.to === tid && e.type === "similar"); });
        if (rest.length) { src.pending = rest.map((s) => ({ name: s.name, url: s.url || null, mbid: s.mbid || null, match: s.match || 0.5 })); src.pendingSource = r.similarSource || pack.id; }
        else { delete src.pending; delete src.pendingSource; }
        for (const c of (r.together || []).slice(0, 25)) {
          const t = upsertArtist(g, { name: c.name, url: c.url });
          addEdge(g, src.id, t.id, "together", c.weight || 1, r.togetherSource || pack.id, c.shows);
        }
        await persist(g);
        return send(res, 200, {
          ok: true, name: src.name, similar: (r.similar || []).length, together: (r.together || []).length,
          sources: r.sources || [], pending: usesStaged, graph: materialize(g),
        });
      });
    }

    // R14 — Phase 2 des zweiphasigen Ausbaus: "zusammen aufgetreten" + kuratierte Genres +
    // Booking nachmergen. `name` ist das canonical aus der Phase-1-Antwort. Fehler kommen
    // als 502 zum Client (SICHTBARE Degradierung); da coAppearances-Fehler nicht gecacht
    // werden, versucht es der nächste Ausbau automatisch erneut.
    if (req.method === "POST" && url.pathname === "/api/explore2") {
      const { name } = await readBody(req);
      if (!name) return send(res, 400, { error: "name fehlt" });
      if (!pack.exploreTogether) return send(res, 400, { error: "nicht unterstützt" });
      let r2;
      try { r2 = await pack.exploreTogether(name); }
      catch (err) { return send(res, 502, { error: err.message }); }
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const src = upsertArtist(g, { name, seed: true });
        src.explored = true; // jetzt ist der Ausbau wirklich komplett
        // kuratierte RA-Genres VOR die Phase-1-Tags mischen — gleiche Reihenfolge wie der
        // einphasige Pfad (raGenres zuerst), damit die Genre-Chips identisch ausfallen.
        if (r2.genres?.length) {
          const seenG = new Set(), merged = [];
          for (const x of [...r2.genres, ...(src.genres || [])]) { const k = x.toLowerCase(); if (!seenG.has(k)) { seenG.add(k); merged.push(x); } }
          src.genres = merged.slice(0, 6);
        }
        if (r2.meta) src.booking = r2.meta;
        if (r2.active !== undefined) src.active = r2.active;
        for (const c of (r2.together || []).slice(0, 25)) {
          const t = upsertArtist(g, { name: c.name, url: c.url });
          addEdge(g, src.id, t.id, "together", c.weight || 1, r2.togetherSource || pack.id, c.shows);
        }
        await persist(g);
        return send(res, 200, { ok: true, name: src.name, together: (r2.together || []).length, sources: r2.sources || [], graph: materialize(g) });
      });
    }

    // „+K laden": die beim Ausbau geparkte Warteliste (a.pending) eines Acts in die Karte holen.
    // Rein aus gespeicherten Daten gemergt — KEIN Netz-Aufruf, sofort da.
    if (req.method === "POST" && url.pathname === "/api/reveal") {
      const { id } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const src = g.artists[id];
        if (!src) return send(res, 404, { error: "Eintrag unbekannt" });
        const pend = Array.isArray(src.pending) ? src.pending : [];
        const source = src.pendingSource || pack.id;
        for (const s of pend) {
          const t = upsertArtist(g, { name: s.name, url: s.url || null, mbid: s.mbid || null });
          addEdge(g, src.id, t.id, "similar", s.match || 0.5, source);
        }
        delete src.pending; delete src.pendingSource;
        await persist(g);
        return send(res, 200, { ok: true, revealed: pend.length, graph: materialize(g) });
      });
    }

    // Brücke suchen (Routenplaner): Sitzung starten. Beide Endpunkte werden aufgelöst und
    // ihre direkten Nachbarn geladen; gibt es schon eine Begegnung (A—X—B), kommt das
    // Ergebnis sofort. Sonst antwortet der Server mit einer Sitzungs-Id + Fortschritt und
    // der Client gräbt per /api/bridge/step weiter. Nur Suche — nichts wird gespeichert.
    if (req.method === "POST" && url.pathname === "/api/bridge") {
      const { from, to } = await readBody(req);
      if (!from || !to) return send(res, 400, { error: "from/to fehlt" });
      countUsage("bridge", pack.id);
      try {
        sweepBridges();
        const [ra, rb] = await Promise.all([neighborsFor(pack, from, 60), neighborsFor(pack, to, 60)]);
        const A = ra.canonical, B = rb.canonical;
        const s = {
          id: randomUUID(), packId: pack.id, from: A, to: B,
          A: bridgeSide(A), B: bridgeSide(B),
          skip: new Set([bkey(A), bkey(B), bkey(from), bkey(to)]),
          meets: new Set(), checked: 2, ts: Date.now(),
        };
        bridgeAbsorb(s, s.A, s.A.seen.get(s.A.root), ra.list);
        bridgeAbsorb(s, s.B, s.B.seen.get(s.B.root), rb.list);
        bridgeSessions.set(s.id, s);
        return send(res, 200, await bridgeResult(pack, s));
      } catch (err) {
        return send(res, 502, { error: err.message });
      }
    }

    // Routenplaner-Suche fortsetzen: ein Suchpaket abarbeiten, Fortschritt (und bei Fund
    // die Kandidaten, kürzeste zuerst) zurückgeben.
    if (req.method === "POST" && url.pathname === "/api/bridge/step") {
      const { session } = await readBody(req);
      const s = bridgeSessions.get(String(session || ""));
      if (!s || s.packId !== pack.id) return send(res, 404, { error: "Suche abgelaufen — bitte neu starten." });
      s.ts = Date.now();
      try { await bridgeRunStep(pack, s); } catch (err) { return send(res, 502, { error: err.message }); }
      return send(res, 200, await bridgeResult(pack, s));
    }

    // Routenplaner-Suche abbrechen (Nutzer sagt im „weitersuchen?"-Dialog Nein / schließt die Leiste).
    if (req.method === "POST" && url.pathname === "/api/bridge/stop") {
      const { session } = await readBody(req);
      bridgeSessions.delete(String(session || ""));
      return send(res, 200, { ok: true });
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

    // W14: Karten-Snapshot teilen — unveränderliche Kopie des eigenen Graphen unter
    // zufälliger ID. Private Felder (Notizen, Status, Gagen, Korb) werden entfernt;
    // der Link (/s/<id>) zeigt eine Read-Only-Ansicht.
    if (req.method === "POST" && url.pathname === "/api/share") {
      if (authThrottled(req)) return send(res, 429, { ok: false, error: "Zu viele Versuche — kurz warten." });
      const g = await loadGraph(GRAPH);
      const names = Object.keys(g.artists || {});
      if (!names.length) return send(res, 400, { ok: false, error: "Die Karte ist noch leer." });
      if (names.length > 800) return send(res, 400, { ok: false, error: "Karte zu groß zum Teilen (max. 800 Einträge)." });
      const pub = { meta: { shared: true, pack: pack.id, created: new Date().toISOString() }, artists: {}, edges: g.edges };
      for (const [id, a] of Object.entries(g.artists)) {
        const { note, fee, status, statusChangedAt, basket, known, lists, pending, pendingSource, ...rest } = a; // privates + Listen-Zugehörigkeit + Warteliste bleiben draußen
        pub.artists[id] = rest;
      }
      const sid = randomUUID().replace(/-/g, "").slice(0, 12);
      const dir = join(DATA_DIR, "shares");
      await mkdir(dir, { recursive: true });
      await writeJsonAtomic(join(dir, sid + ".json"), pub);
      countUsage("share", pack.id);
      const base = publicBase(req);
      return send(res, 200, { ok: true, id: sid, url: `${base || ""}/s/${sid}` });
    }

    // E13: Kaltstart-Import — Last.fm-Nutzername -> Top-Künstler als fertige Start-Karte.
    // Bewusst schlank gegen API-Lastspikes: EIN user.getTopArtists-Aufruf + getSimilar nur
    // für die Top-12 (lfetch drosselt ohnehin), Kanten NUR innerhalb der Import-Menge.
    // Ausbauen können die Knoten danach ganz normal per Doppelklick.
    if (req.method === "POST" && url.pathname === "/api/lastfm-import") {
      if (pack.id !== "music") return send(res, 400, { ok: false, error: "Nur im Musik-Pack verfügbar." });
      const { user } = await readBody(req);
      const uname = String(user || "").trim();
      if (!/^[A-Za-z0-9_.-]{2,32}$/.test(uname)) return send(res, 400, { ok: false, error: "Ungültiger Last.fm-Nutzername." });
      countUsage("lastfmImport", pack.id);
      let top;
      try { top = (await getUserTopArtists(uname, { limit: 30 })).filter((a) => a.name); }
      catch (err) { return send(res, 502, { ok: false, error: err.message }); }
      if (!top.length) return send(res, 404, { ok: false, error: "Keine Künstler gefunden — Profil privat oder leer?" });
      const inSet = new Map(top.map((a) => [slug(a.name), a]));
      // Ähnlichkeits-Kanten INNERHALB der Import-Menge einsammeln (Netz statt loser Punkte).
      const pairs = [];
      for (const a of top.slice(0, 12)) {
        try {
          const r = await getSimilar(a.name, { limit: 60 });
          for (const s of r.similar || []) {
            const sid = slug(s.name);
            if (inSet.has(sid) && sid !== slug(a.name)) pairs.push({ from: slug(a.name), to: sid, match: s.match || 0.5 });
          }
        } catch {} // einzelner Ausfall egal — dann fehlt halt eine Kante
      }
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        for (const a of top) upsertArtist(g, { name: a.name, mbid: a.mbid, url: a.url, seed: true });
        for (const p2 of pairs) addEdge(g, p2.from, p2.to, "similar", p2.match, "lastfm");
        await persist(g);
        return send(res, 200, { ok: true, imported: top.length, edges: pairs.length, graph: materialize(g) });
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
          events: incoming.events || [], sources: incoming.sources || [], lists: Array.isArray(incoming.lists) ? incoming.lists : [] };
        await persist(g);
        const loaded = await loadGraph(GRAPH); // durch Migration/Bereinigung schicken
        return send(res, 200, { ok: true, artists: Object.keys(loaded.artists).length, graph: materialize(loaded) });
      });
    }

    // Die alten HTTP-Endpunkte für Wikipedia-Lineups/Auto-Entdeckung sind entfernt: kein
    // UI-Knopf ruft sie je auf (README dokumentiert das Feature nur noch als CLI, siehe
    // scrape.mjs/auto.mjs), und ihr Ergebnis (g.events) wird von migrate() beim nächsten
    // loadGraph() ohnehin verworfen ("alte, deaktivierte Lineup-Ebene") — sie hielten aber
    // den Graph-Lock für die volle, minutenlange Scrape-Dauer und blockierten so /api/explore
    // & Co. für nichts. Die CLI-Skripte funktionieren unverändert (sie laufen außerhalb des
    // Servers direkt gegen graph.json).

    if (req.method === "POST" && url.pathname === "/api/artist") {
      const { id, known, note, status, fee, basket, list, inList } = await readBody(req);
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        const a = g.artists[id];
        if (!a) return send(res, 404, { error: "Eintrag unbekannt" });
        if (typeof known === "boolean") a.known = known;
        if (typeof note === "string") a.note = note;
        if (typeof status === "string") {
          if (a.status !== status) a.statusChangedAt = Date.now(); // E9: wann zuletzt bewegt?
          a.status = status; a.known = status !== ""; // known bleibt abgeleitet
        }
        // E9: Gage (Freitext, Zahlen werden clientseitig summiert) + Lineup-Korb serverseitig —
        // der Korb lebte nur in localStorage und ging bei der Anon-zu-Konto-Migration verloren.
        if (typeof fee === "string") { const f = fee.trim().slice(0, 40); if (f) a.fee = f; else delete a.fee; }
        if (typeof basket === "boolean") { if (basket) a.basket = true; else delete a.basket; }
        // v2.6: Like-Listen — Mitgliedschaft in einer benannten Liste setzen (ersetzt den Einzel-Korb).
        if (typeof list === "string" && typeof inList === "boolean" && g.lists?.some((l) => l.id === list)) {
          a.lists = Array.isArray(a.lists) ? a.lists.filter((x) => g.lists.some((l) => l.id === x)) : [];
          if (inList) { if (!a.lists.includes(list)) a.lists.push(list); }
          else a.lists = a.lists.filter((x) => x !== list);
          if (!a.lists.length) delete a.lists;
        }
        await persist(g);
        return send(res, 200, { ok: true, artist: a });
      });
    }

    // v2.6: Like-Listen verwalten (anlegen / umbenennen / umfärben / löschen). Die Default-Liste
    // ist geschützt (immer Ziel für „like"): sie lässt sich umbenennen/umfärben, aber nicht löschen.
    if (req.method === "POST" && url.pathname === "/api/lists") {
      const body = await readBody(req);
      const action = String(body.action || "");
      return withGraphLock(GRAPH, async () => {
        const g = await loadGraph(GRAPH);
        g.lists ??= [];
        const okColor = (c) => /^#[0-9a-fA-F]{6}$/.test(String(c || ""));
        if (action === "create") {
          const name = String(body.name || "").trim().slice(0, 60) || "Liste";
          const color = okColor(body.color) ? body.color : "#ff6a00";
          const id = "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
          const list = { id, name, color, created: Date.now() };
          g.lists.push(list);
          await persist(g);
          return send(res, 200, { ok: true, list, lists: g.lists });
        }
        const l = g.lists.find((x) => x.id === body.id);
        if (!l) return send(res, 404, { error: "Liste unbekannt" });
        if (action === "rename") { const nm = String(body.name || "").trim().slice(0, 60); if (nm) { l.name = nm; delete l.auto; } }
        else if (action === "recolor") { if (okColor(body.color)) l.color = body.color; }
        else if (action === "delete") {
          if (l.id === "default") return send(res, 400, { error: "Default-Liste ist geschützt" });
          g.lists = g.lists.filter((x) => x.id !== l.id);
          for (const a of Object.values(g.artists)) { // Mitgliedschaften mit aufräumen
            if (Array.isArray(a.lists) && a.lists.includes(l.id)) { a.lists = a.lists.filter((x) => x !== l.id); if (!a.lists.length) delete a.lists; }
          }
        } else return send(res, 400, { error: "unbekannte Aktion" });
        await persist(g);
        return send(res, 200, { ok: true, lists: g.lists });
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
          // stats.json ist über alle Nutzer geteilt -> Lese-Ändern-Schreiben serialisieren,
          // sonst überschreiben sich zwei gleichzeitige Requests gegenseitig (lost update).
          const stats = await withGraphLock(STATS, async () => {
            const st = await loadStats(STATS);
            if (addSnapshot(st, id, patch.popularity)) await saveStats(STATS, st);
            return st;
          });
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
      countUsage("preview", pack.id);
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
      countUsage("radar", pack.id);
      const { limit = 10, extraLikes = [], visible = null, force = false } = await readBody(req);
      // Sprache des Clients (x-like-lang): Begründungen/Fehltexte auf Englisch, wenn gewünscht.
      // Pack-eigene Labels laufen über das en-Overlay der Pack-Config (exakter String -> EN).
      const lang = req.headers["x-like-lang"] === "en" ? "en" : "de";
      const trPack = (s) => (lang === "en" && s && pack.config.en && pack.config.en[s]) ? pack.config.en[s] : s;
      const M = lang === "en"
        ? { empty: "Search or like a few entries first — then the radar has a taste to work from.", near: "close to", month: "/month", together: "directly connected" }
        : { empty: "Erst ein paar Einträge suchen oder liken — dann hat das Radar einen Geschmack, an dem es sich orientieren kann.", near: "nah an", month: "/Monat", together: "direkt verbunden" };
      const g = await loadGraph(GRAPH);
      const extra = new Set(extraLikes);
      // C8 (neu): Der sichtbare Ausschnitt ist der SUCHRAUM — Vorschläge kommen nur aus den
      // gerade sichtbaren Acts. Die Geschmacksbasis bleiben die Likes (gesucht/gemerkt/Status);
      // ohne solche dient der Ausschnitt selbst als Basis (frische Karte).
      const visSet = Array.isArray(visible) ? new Set(visible.filter((id) => g.artists[id])) : null;
      const fromVisible = !!(visSet && visSet.size);
      const realLikes = new Set(Object.values(g.artists)
        .filter((a) => a.seed || a.known || (a.status && a.status !== "declined") || extra.has(a.id))
        .map((a) => a.id));
      const likes = realLikes.size ? realLikes : (fromVisible ? visSet : realLikes);
      if (!likes.size) return send(res, 400, { error: M.empty });

      const cacheKey = [...likes].sort().join(",") + "|" + limit + "|" + lang + (fromVisible ? "|v:" + [...visSet].sort().join(",") : "");
      const cached = radarCache.get(GRAPH);
      if (!force && cached && cached.key === cacheKey && Date.now() - cached.at < RADAR_TTL) {
        return send(res, 200, { ...cached.payload, cached: true, computedAt: cached.at });
      }

      const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const inGraph = new Set(Object.values(g.artists).map((a) => norm(a.name)));
      const likeName = (id) => g.artists[id]?.name || id;
      const popLabel = trPack(pack.config.popularity?.label || "");

      // (a) Graph-Nachbarn: Nähe = Summe der Kantengewichte zu Likes
      const cand = new Map();
      for (const e of g.edges) {
        const [l, o] = likes.has(e.from) && !likes.has(e.to) ? [e.from, e.to]
                     : likes.has(e.to) && !likes.has(e.from) ? [e.to, e.from] : [null, null];
        if (!o || !g.artists[o]) continue;
        if (fromVisible && !visSet.has(o)) continue; // Suchraum: nur Kandidaten im sichtbaren Ausschnitt
        const c = cand.get(o) ?? { id: o, closeness: 0, together: false, vias: new Set() };
        c.closeness += e.type === "similar" ? (e.weight || 0.5) : Math.min(1, 0.4 + 0.1 * (e.weight || 1));
        if (e.type !== "similar") c.together = true;
        c.vias.add(likeName(l));
        cand.set(o, c);
      }
      const graphCands = [...cand.values()].sort((x, y) => y.closeness - x.closeness).slice(0, 30);

      // Parallel statt sequenziell: pack.popularity() läuft für jedes Pack entweder über
      // Last.fms eigene Drossel (lib/lastfm.mjs lfetch) oder über jfetch()s Pro-Host-Drossel
      // (lib/jfetch.mjs) — beide serialisieren die tatsächlichen Netz-Requests bereits intern.
      // Gleichzeitiges Anstoßen lässt nur die Cache-Treffer sofort durch und die echten
      // Netz-Antworten überlappen hinter der Drossel, statt (RTT + Drossel-Pause) × 25 sequenziell
      // aufzusummieren.
      const popById = new Map();
      if (pack.popularity) {
        const results = await Promise.allSettled(graphCands.slice(0, 25).map(async (c) => {
          const a = g.artists[c.id];
          const p = await pack.popularity(a.name, { mbid: a.mbid || undefined });
          return { id: c.id, a, p };
        }));
        for (const r of results) {
          if (r.status !== "fulfilled" || !r.value.p) continue; // ohne Popularität weiter
          const { id, a, p } = r.value;
          if (a.listeners !== p) a.listeners = p; // nur in-memory: fürs Scoring/die Ausgabe unten
          popById.set(id, p);
        }
      }
      // Snapshots erst NACH den Netzaufrufen und unter Lock: stats.json ist über alle Nutzer
      // geteilt — unserialisiert verlöre einer von zwei gleichzeitigen Writes seine Snapshots.
      let stats;
      if (popById.size) {
        stats = await withGraphLock(STATS, async () => {
          const st = await loadStats(STATS);
          let ch = false;
          for (const [id, p] of popById) if (addSnapshot(st, id, p)) ch = true;
          if (ch) await saveStats(STATS, st);
          return st;
        });
      } else {
        stats = await loadStats(STATS);
      }
      // Hörerzahlen NACH id in den AKTUELLEN Graph mergen (unter Lock) — nie die alte Kopie
      // zurückschreiben, sonst überschriebe man parallel dazwischen erkundete Acts (lost update).
      if (popById.size) await withGraphLock(GRAPH, async () => {
        const gCur = await loadGraph(GRAPH);
        let ch = false;
        for (const [id, p] of popById) { const a = gCur.artists[id]; if (a && a.listeners !== p) { a.listeners = p; ch = true; } }
        if (ch) await persist(gCur);
      });

      // (b) Pack-spezifische Zusatzkandidaten (Musik: Deezer-Related + Bandcamp-Releases) —
      // entfallen im Sichtbar-Modus: externe Vorschläge liegen nie im sichtbaren Ausschnitt.
      let extras = [];
      if (pack.radarExtras && !fromVisible) {
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
        const reasons = [`${M.near} ${[...c.vias].slice(0, 2).join(" & ")}`];
        if (a.listeners != null && popLabel) reasons.push(`${fmtNum(a.listeners)} ${popLabel}`);
        if (growth != null && growth >= 10) reasons.push(`▲ +${growth}%${M.month}`);
        if (c.together) reasons.push(trPack(pack.config.radarTogetherReason) || M.together);
        if (a.active && pack.config.activeLabel) reasons.push(trPack(pack.config.activeLabel));
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
      radarCache.set(GRAPH, { at: payload.computedAt, key: cacheKey, payload });
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
        // stats.json ist über alle Nutzer geteilt -> Lese-Ändern-Schreiben serialisieren.
        await withGraphLock(STATS, async () => {
          const stats = await loadStats(STATS);
          let statsChanged = false;
          for (const [id, p] of popById) if (addSnapshot(stats, id, p)) { statsChanged = true; n++; }
          if (statsChanged) await saveStats(STATS, stats);
        });
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
      // N1: optionale Zusatzinfos je Treffer (Hörerzahl + Profil-URL) zum Disambiguieren
      // mehrdeutiger Namen. Nur wenn das Pack sie anbietet; sonst bleibt es bei `names`.
      let meta = null;
      if (pack.suggestMeta) { try { meta = await pack.suggestMeta(q); } catch {} }
      return send(res, 200, meta && meta.length ? { names, meta } : { names });
    }

    // N1: gleichnamige Acts („Namensvetter") zu einem Namen — für den Disambiguierungs-Dialog.
    // Read-only, extern gedrosselt/gecacht; leere Liste, wenn es keine Mehrdeutigkeit gibt oder
    // die Quelle nicht erreichbar ist (Feature degradiert dann still).
    if (req.method === "GET" && url.pathname === "/api/namesakes") {
      const name = (url.searchParams.get("name") || "").trim();
      if (!name || !pack.namesakes) return send(res, 200, { ok: true, namesakes: [] });
      let list = [];
      try { list = await pack.namesakes(name); } catch {}
      return send(res, 200, { ok: true, namesakes: list || [] });
    }

    // „Überrasch mich" (leere Seite): ein zufälliger, eher unbekannter Eintrag zum Reinstolpern.
    if (req.method === "GET" && url.pathname === "/api/surprise") {
      if (!pack.surprise) return send(res, 200, { ok: false });
      countUsage("surprise", pack.id);
      const genre = (url.searchParams.get("genre") || "").trim().slice(0, 40); // FB14: optional Genre-gefiltert
      let name = null;
      try { name = await pack.surprise({ genre }); } catch {}
      return name ? send(res, 200, { ok: true, name }) : send(res, 200, { ok: false });
    }

    // Markierte Einträge als CSV exportieren (Shortlist).
    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const g = await loadGraph(GRAPH);
      // Formel-Injection: Zellen, die mit = + - @ (oder Tab/CR) beginnen, würden Excel/
      // LibreOffice als Formel ausführen — Namen/Notizen/Booking-Texte kommen aus externen
      // Quellen bzw. Nutzereingaben, daher solche Zellen mit ' entschärfen.
      const esc = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
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
