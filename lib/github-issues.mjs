// github-issues.mjs — anonymes Testuser-Feedback als GitHub-Issue sammeln. Zero-Dep.
// Ergänzt die Pushover-Sofortmeldung um eine dauerhafte, im Repo auffindbare Sammelstelle:
// die offenen Issues mit dem Label "feedback" sind die Backlog-Rohliste (daraus werden
// BACKLOG.md-Einträge gemacht und die Issues dann geschlossen).
//
// ANONYM: es wird bewusst NUR der Nachrichtentext + Pack + Version gespeichert — keine IP,
// kein Konto, keine Session. Nichts landet in der Git-History (Issues, nicht Dateien),
// Redigieren/Löschen bleibt trivial.
//
// Credentials (nie im Repo): ENV GITHUB_FEEDBACK_TOKEN mit "issues: write" aufs Ziel-Repo.
// BEWUSST kein Fallback auf ein generisches GITHUB_TOKEN — sonst würde ein zufällig im
// Environment vorhandener Token (CI/Render/Shell) die Sammlung still einschalten und Issues
// ins Default-Repo pushen. Aktivierung ist also immer explizit. Ziel: GITHUB_FEEDBACK_REPO
// als "owner/repo" (Default: allawallabedalla/like). Optionales Label: GITHUB_FEEDBACK_LABEL
// (Default "feedback"). Fehlt der Token, ist die Sammlung einfach aus — wie beim Pushover-Muster.

const REPO = (process.env.GITHUB_FEEDBACK_REPO || "allawallabedalla/like").trim();
const TOKEN = (process.env.GITHUB_FEEDBACK_TOKEN || "").trim();
const LABEL = (process.env.GITHUB_FEEDBACK_LABEL || "feedback").trim();

export function hasIssueSink() { return !!(TOKEN && /^[^/\s]+\/[^/\s]+$/.test(REPO)); }

// Ziel-Repo + Label (für Anzeige/Links im Betreiber-Log).
export function feedbackTarget() { return { repo: REPO, label: LABEL }; }

const GH_HEADERS = () => ({
  authorization: `Bearer ${TOKEN}`,
  accept: "application/vnd.github+json",
  "user-agent": "like-feedback",
  "x-github-api-version": "2022-11-28",
});

// Gesammelte Feedback-Issues live von GitHub lesen (Betreiber-Ansicht). Ein Read-Through auf
// dieselben Issues, die auch auf GitHub stehen — EINE Quelle der Wahrheit. Wirft bei Fehler.
export async function listFeedbackIssues({ state = "open", limit = 50 } = {}) {
  if (!hasIssueSink()) throw new Error("Kein GitHub-Sink eingerichtet (GITHUB_FEEDBACK_TOKEN + GITHUB_FEEDBACK_REPO).");
  const st = ["open", "closed", "all"].includes(state) ? state : "open";
  const per = Math.min(Math.max(1, limit | 0), 100);
  const u = `https://api.github.com/repos/${REPO}/issues?labels=${encodeURIComponent(LABEL)}&state=${st}&per_page=${per}`;
  const res = await fetch(u, { headers: GH_HEADERS(), signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GitHub HTTP ${res.status}${t ? ": " + t.slice(0, 160) : ""}`);
  }
  const arr = await res.json().catch(() => []);
  // Die Issues-API liefert auch Pull Requests -> die mit pull_request rauswerfen.
  return (Array.isArray(arr) ? arr : []).filter((i) => !i.pull_request).map((i) => ({
    number: i.number, title: i.title, body: i.body || "", url: i.html_url,
    state: i.state, createdAt: i.created_at,
  }));
}

// Fire-and-forget-Variante: eine kaputte GitHub-Anbindung darf den Feedback-Request nie
// verzögern oder scheitern lassen. Fehler werden nur geloggt (und nur, wenn ein Token
// überhaupt hinterlegt ist).
export function collectFeedbackQuiet({ message, pack, version }) {
  createFeedbackIssue({ message, pack, version }).catch((e) => {
    if (TOKEN) console.error("Feedback-Issue fehlgeschlagen:", e.message);
  });
}

// Anonymes Feedback als GitHub-Issue anlegen. Wirft bei fehlendem Sink oder API-Fehler.
// Gibt die Issue-Nummer zurück. Das Label wird von GitHub bei Bedarf automatisch angelegt.
export async function createFeedbackIssue({ message, pack, version }) {
  if (!hasIssueSink()) throw new Error("Kein GitHub-Sink eingerichtet (GITHUB_FEEDBACK_TOKEN + GITHUB_FEEDBACK_REPO).");
  const msg = String(message || "").trim().slice(0, 4000);
  const p = String(pack || "?").slice(0, 40);
  const v = String(version || "?").slice(0, 20);
  const firstLine = msg.split(/\r?\n/)[0].slice(0, 80) || "Feedback";
  const title = `[feedback] ${firstLine}`;
  const body = [
    msg,
    "",
    "---",
    `Pack: \`${p}\` · Version: \`${v}\``,
    "_Anonym über den Feedback-Knopf gesammelt — keine IP, kein Konto, keine Session._",
  ].join("\n");
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "like-feedback",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels: [LABEL] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GitHub HTTP ${res.status}${t ? ": " + t.slice(0, 160) : ""}`);
  }
  const j = await res.json().catch(() => ({}));
  return j.number || true;
}
