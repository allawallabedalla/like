// musicbrainz.mjs — MusicBrainz (offene Daten, kein Key): Label-Umfeld eines Acts.
// Kleine Labels signen kleine Acts — wer neben deinem Like auf demselben Label
// sitzt, ist oft genau der Geheimtipp. Regeln: max 1 Request/Sekunde, User-Agent.

import { cached } from "./cache.mjs";

const UA = "like-booking-tool/1.3 (persoenlich, nicht-kommerziell)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve(); // MusicBrainz verlangt <= 1 req/s
async function get(url) {
  const job = gate.then(async () => {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    await sleep(1100);
    if (!res.ok) throw new Error("MusicBrainz HTTP " + res.status);
    return res.json();
  });
  gate = job.then(() => {}, () => {});
  return job;
}

const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Escapt einen Wert für eine Lucene-PHRASE (in Anführungszeichen): darin sind nur \ und "
// bedeutsam. Ersetzt das frühere reine Quote-Strippen — das verlor Zeichen und konnte bei einem
// End-Backslash die Query zerbrechen. \ zuerst, dann ", je über die Ersetzungsgruppe.
const lucenePhrase = (s) => String(s).replace(/[\\"]/g, "\\$&");

// Act -> MBID (nur bei sicherem Namens-Treffer). 30 Tage gecacht.
export async function artistByName(name) {
  return cached("mb-artist", name, 30 * 864e5, async () => {
    const q = encodeURIComponent(`artist:"${lucenePhrase(name)}"`);
    const d = await get(`https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=5`);
    const hit = (d.artists || []).find((a) => norm(a.name) === norm(name) && (a.score ?? 0) >= 90);
    return hit ? { mbid: hit.id, name: hit.name } : null;
  });
}

// Gleichnamige Acts („Namensvetter") — alle MusicBrainz-Entitäten mit exakt diesem Namen,
// je mit Unterscheidungs-Notiz (disambiguation), Genre (Top-Tag), Herkunft und Jahren. Damit
// lässt sich vor der Auswahl zeigen, WELCHER „Nirvana"/„Boris" gemeint ist. 30 Tage gecacht.
export async function namesakes(name) {
  return cached("mb-namesakes", name, 30 * 864e5, async () => {
    const q = encodeURIComponent(`artist:"${lucenePhrase(name)}"`);
    const d = await get(`https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=25`);
    const target = norm(name);
    const seen = new Set(), out = [];
    for (const a of d.artists || []) {
      if (norm(a.name) !== target) continue;      // nur exakte Namensgleichheit = Namensvetter
      if (!a.id || seen.has(a.id)) continue; seen.add(a.id);
      const tag = (a.tags || []).slice().sort((x, y) => (y.count || 0) - (x.count || 0))[0];
      out.push({
        mbid: a.id,
        name: a.name,
        disambiguation: a.disambiguation || "",
        genre: tag ? tag.name : "",
        area: a.area?.name || a.country || a["begin-area"]?.name || "",
        type: a.type || "",
        begin: a["life-span"]?.begin ? String(a["life-span"].begin).slice(0, 4) : "",
        score: a.score ?? 0,
      });
      if (out.length >= 8) break;
    }
    return out;
  });
}

// Labels eines Acts (aus den Artist-Label-Beziehungen). 14 Tage gecacht.
export async function labelsOf(name) {
  return cached("mb-labels", name, 14 * 864e5, async () => {
    const a = await artistByName(name);
    if (!a) return [];
    const d = await get(`https://musicbrainz.org/ws/2/artist/${a.mbid}?inc=label-rels&fmt=json`);
    const seen = new Set(), out = [];
    for (const r of d.relations || []) {
      const l = r.label;
      if (!l?.id || seen.has(l.id)) continue;
      seen.add(l.id);
      out.push({ mbid: l.id, name: l.name });
      if (out.length >= 5) break;
    }
    return out;
  });
}

// Roster eines Labels: Acts nach Anzahl Releases dort. 14 Tage gecacht.
export async function labelRoster(labelMbid) {
  return cached("mb-roster", labelMbid, 14 * 864e5, async () => {
    const d = await get(`https://musicbrainz.org/ws/2/release?label=${labelMbid}&inc=artist-credits&fmt=json&limit=100`);
    const count = new Map();
    for (const rel of d.releases || []) {
      for (const c of rel["artist-credit"] || []) {
        const n = c.artist?.name || c.name;
        if (n) count.set(n, (count.get(n) || 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, releases]) => ({ name, releases }));
  });
}

// Komfort: alle Label-Kolleg:innen eines Acts (über dessen erste 2 Labels).
export async function labelmates(name, { limit = 20 } = {}) {
  const labels = await labelsOf(name);
  const self = norm(name);
  const seen = new Set(), mates = [];
  for (const l of labels.slice(0, 2)) {
    try {
      const roster = await labelRoster(l.mbid);
      for (const r of roster) {
        const k = norm(r.name);
        if (k === self || seen.has(k) || /^various/i.test(r.name)) continue;
        seen.add(k);
        mates.push({ name: r.name, label: l.name, releases: r.releases });
        if (mates.length >= limit) return { labels, mates };
      }
    } catch { /* einzelnes Label kaputt -> weiter */ }
  }
  return { labels, mates };
}
