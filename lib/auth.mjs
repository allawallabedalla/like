// auth.mjs — schlanke, zero-dependency Accounts (optional): Login/Passwort + Recovery-Code.
// Passwörter werden mit scrypt (Node-Builtin) gehasht, nie im Klartext gespeichert.
// Session = signiertes Cookie "<user>.<hmac>" (stateless). users.json + Secret liegen
// im DATA_DIR (auf Render: die persistente Platte).
import { scrypt, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

let USERS_FILE = null, users = {}, SECRET = "";

export async function initAuth(dataDir) {
  USERS_FILE = join(dataDir, "users.json");
  try {
    const raw = await readFile(USERS_FILE, "utf8");
    try { users = JSON.parse(raw) || {}; }
    catch {
      // Beschädigte users.json NICHT stillschweigend als {} weiterlaufen lassen (sonst
      // überschreibt die nächste Registrierung sie leer -> alle Konten weg). Stattdessen
      // beiseitelegen, damit sie manuell rettbar bleibt, und mit {} starten.
      const bad = USERS_FILE + ".corrupt." + Date.now();
      try { await rename(USERS_FILE, bad); console.error("users.json beschädigt -> gesichert nach " + bad); } catch {}
      users = {};
    }
  } catch { users = {}; } // ENOENT: noch keine Konten
  SECRET = (process.env.LIKE_SESSION_SECRET || "").trim();
  if (!SECRET) {
    const f = join(dataDir, ".session-secret");
    try { SECRET = (await readFile(f, "utf8")).trim(); } catch {}
    if (!SECRET) { SECRET = randomBytes(32).toString("hex"); try { await mkdir(dirname(f), { recursive: true }); await writeFile(f, SECRET); } catch {} }
  }
}

// Atomar schreiben (tmp + rename) — ein Absturz/voller Datenträger mitten im Schreiben darf
// die Konten-Datei nicht zerhacken (sonst wäre beim nächsten Start alles weg).
async function persist() {
  await mkdir(dirname(USERS_FILE), { recursive: true });
  const tmp = USERS_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(users, null, 2));
  await rename(tmp, USERS_FILE);
}
// Async statt scryptSync: scrypt ist absichtlich langsam (Brute-Force-Bremse) — synchron
// würde das den Single-Process-Server für die gesamte Dauer einfrieren, jeder gleichzeitige
// Request (auch anderer Nutzer) müsste warten. Node führt scrypt im Threadpool aus.
const hashPw = async (pw, salt) => (await scryptAsync(String(pw), salt, 64)).toString("hex");
const eq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && timingSafeEqual(A, B); };
const normU = (u) => String(u || "").trim().toLowerCase();
const newRecovery = () => randomBytes(8).toString("hex").toUpperCase().replace(/(.{4})(?=.)/g, "$1-"); // XXXX-XXXX-XXXX-XXXX
// Kein Punkt erlaubt: der Datenraum-Namensraum (sanitizeId in server.mjs) entfernt Punkte,
// sonst würden „a.b" und „ab" auf DENSELBEN Ordner zeigen (Konten-Datenkollision).
export const validUsername = (u) => /^[a-z0-9_-]{3,32}$/.test(normU(u));
export const userExists = (u) => !!users[normU(u)];
export const userCount = () => Object.keys(users).length;

export async function register(u, pw) {
  const id = normU(u);
  if (!validUsername(id)) return { error: "Ungültiger Name (3–32 Zeichen: a–z, 0–9, _ -)" };
  if (users[id]) return { error: "Name ist bereits vergeben" };
  if (String(pw || "").length < 6) return { error: "Passwort zu kurz (mindestens 6 Zeichen)" };
  const salt = randomBytes(16).toString("hex");
  const recovery = newRecovery(), recSalt = randomBytes(16).toString("hex");
  const [hash, recHash] = await Promise.all([hashPw(pw, salt), hashPw(recovery.replace(/-/g, ""), recSalt)]);
  users[id] = { salt, hash, recSalt, recHash, created: Date.now() };
  await persist();
  return { ok: true, user: id, recovery };
}

export async function verify(u, pw) {
  const rec = users[normU(u)];
  return rec ? eq(rec.hash, await hashPw(pw, rec.salt)) : false;
}

export async function resetPassword(u, recovery, newPw) {
  const id = normU(u), rec = users[id];
  if (!rec) return { error: "Unbekannter Nutzer" };
  if (String(newPw || "").length < 6) return { error: "Neues Passwort zu kurz (mindestens 6 Zeichen)" };
  const norm = String(recovery || "").replace(/[-\s]/g, "").toUpperCase();
  if (!eq(rec.recHash, await hashPw(norm, rec.recSalt))) return { error: "Recovery-Code stimmt nicht" };
  rec.salt = randomBytes(16).toString("hex");
  const recovery2 = newRecovery(); rec.recSalt = randomBytes(16).toString("hex");
  [rec.hash, rec.recHash] = await Promise.all([hashPw(newPw, rec.salt), hashPw(recovery2.replace(/-/g, ""), rec.recSalt)]);
  await persist();
  return { ok: true, user: id, recovery: recovery2 };
}

// Session-Cookie "<user>.<hmac>" erzeugen/prüfen. Die Signatur bindet das Passwort-Salt
// mit ein: ein Passwort-Reset rotiert das Salt, damit verfallen alle alten Sessions —
// sonst bliebe ein gestohlenes Cookie auch nach dem Reset für immer gültig.
const sessionSig = (id) => createHmac("sha256", SECRET).update(id + "\n" + (users[id]?.salt || "")).digest("hex").slice(0, 32);
export function makeSession(u) { const id = normU(u); return id + "." + sessionSig(id); }
export function userFromCookie(cookie) {
  const m = /(?:^|;\s*)like_session=([^;]+)/.exec(cookie || ""); if (!m) return null;
  const val = decodeURIComponent(m[1]); const i = val.lastIndexOf("."); if (i < 0) return null;
  const id = val.slice(0, i), sig = val.slice(i + 1);
  if (!users[id]) return null;
  return eq(sig, sessionSig(id)) ? id : null;
}
