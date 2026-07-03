// pushover.mjs — Testuser-Feedback per Pushover an dich. Zero-Dep.
// Credentials (nie im Repo): ENV PUSHOVER_TOKEN + PUSHOVER_USER, oder Datei .pushover
// (JSON { "token": "...", "user": "..." } ODER zwei Zeilen: token, dann user).
// Läuft server-seitig — die Keys landen NICHT im Browser.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

let memo = undefined; // { token, user } | null
async function creds() {
  if (memo !== undefined) return memo;
  if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER) {
    return (memo = { token: process.env.PUSHOVER_TOKEN.trim(), user: process.env.PUSHOVER_USER.trim() });
  }
  for (const base of [ROOT, REPO]) {
    try {
      const raw = (await readFile(join(base, ".pushover"), "utf8")).trim();
      if (raw.startsWith("{")) {
        const j = JSON.parse(raw);
        if (j.token && j.user) return (memo = { token: String(j.token).trim(), user: String(j.user).trim() });
      } else {
        const [token, user] = raw.split(/\r?\n/).map((s) => s.trim());
        if (token && user) return (memo = { token, user });
      }
    } catch {}
  }
  return (memo = null);
}

export async function hasPushover() { return !!(await creds()); }
export function clearPushoverCache() { memo = undefined; }

// Nachricht senden. Wirft bei fehlenden Credentials oder API-Fehler.
export async function sendFeedback({ message, title = "like — Feedback" }) {
  const c = await creds();
  if (!c) throw new Error("Kein Pushover eingerichtet (PUSHOVER_TOKEN/PUSHOVER_USER oder .pushover).");
  const body = new URLSearchParams({ token: c.token, user: c.user, title, message: String(message).slice(0, 1024) });
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status !== 1) {
    throw new Error(j.errors?.join(", ") || `Pushover HTTP ${res.status}`);
  }
  return true;
}
