// jfetch.mjs — kleiner JSON/Text-Fetch mit Timeout, User-Agent und per-Host-Drossel.
// Alle Pack-Adapter gehen hierüber: serialisiert Anfragen je Host (schont Rate-Limits)
// und wirft bei HTTP-Fehlern eine sprechende Exception.

const gates = new Map(); // host -> Promise-Kette

export async function jfetch(url, { headers = {}, timeout = 8000, gapMs = 250, method = "GET", body } = {}) {
  const host = new URL(url).host;
  const prev = gates.get(host) || Promise.resolve();
  const job = prev.then(async () => {
    const res = await fetch(url, {
      method, body,
      headers: { "user-agent": "like-tool/1.0 (personal, non-commercial)", accept: "application/json, text/xml, */*", ...headers },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${host})`);
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? res.json() : res.text();
  });
  // Host-Abstand zweiarmig in der Gate-Kette (gilt auch nach Fehlern): der NÄCHSTE Request
  // an denselben Host wartet gapMs ab, nicht der aktuelle Aufrufer (Taskforce R13).
  const gap = () => new Promise((r) => setTimeout(r, gapMs));
  gates.set(host, job.then(gap, gap));
  return job;
}
