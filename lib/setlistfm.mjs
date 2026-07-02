// setlistfm.mjs — Setlist.fm (offizielle API, GRATIS-Key nötig): geteilte Bills.
// Der klassische Talentsucher-Move: "Wer hat für X geöffnet?" — und genau die
// Opener sind die Kleinen. Key aus ENV SETLISTFM_KEY oder Datei .setlistfm-key.
// Ohne Key liefert der Adapter still null (Feature einfach aus).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cached } from "./cache.mjs";

const ROOT = process.env.LIKE_DATA_DIR || dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = "https://api.setlist.fm/rest/1.0";

let cachedKey = null, keyTried = false;
export function clearSetlistKeyCache() { cachedKey = null; keyTried = false; }
async function getKey() {
  if (cachedKey) return cachedKey;
  if (process.env.SETLISTFM_KEY) return (cachedKey = process.env.SETLISTFM_KEY.trim());
  if (keyTried) return null;
  keyTried = true;
  try { const k = (await readFile(join(ROOT, ".setlistfm-key"), "utf8")).trim(); if (k) return (cachedKey = k); } catch {}
  return null;
}
export async function hasKey() { return !!(await getKey()); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve(); // Setlist.fm drosselt hart -> serialisieren + Pause
async function api(path) {
  const key = await getKey();
  if (!key) return null;
  const job = gate.then(async () => {
    const res = await fetch(BASE + path, {
      headers: { "x-api-key": key, accept: "application/json", "user-agent": "like-booking-tool/1.4 (personal)" },
      signal: AbortSignal.timeout(9000),
    });
    await sleep(600);
    if (res.status === 404) return null; // nichts gefunden ist kein Fehler
    if (!res.ok) throw new Error("Setlist.fm HTTP " + res.status);
    return res.json();
  });
  gate = job.then(() => {}, () => {});
  return job;
}

const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Geteilte Bühnen eines Acts: aus seinen letzten Shows die Venue+Datum ziehen und
// dort nach anderen Setlists desselben Abends suchen -> Co-Performer (inkl. Opener).
// Gewicht = Anzahl geteilter Abende. 3 Tage gecacht.
export async function sharedBills(name, { maxEvents = 6 } = {}) {
  if (!(await getKey())) return null;
  return cached("setlist", name, 3 * 864e5, async () => {
    const self = norm(name);
    const d = await api(`/search/setlists?artistName=${encodeURIComponent(name)}&p=1`);
    const sets = d?.setlist || [];
    // Act nur akzeptieren, wenn Setlist.fm denselben Namen meint
    const own = sets.filter((s) => norm(s.artist?.name) === self);
    if (!own.length) return { name: null, matched: false, coacts: [] };

    const co = new Map();
    const events = own.slice(0, maxEvents);
    for (const s of events) {
      const venueId = s.venue?.id, date = s.eventDate;
      if (!venueId || !date) continue;
      let bill;
      try { bill = await api(`/search/setlists?venueId=${venueId}&date=${date}`); } catch { continue; }
      const others = (bill?.setlist || []).filter((x) => norm(x.artist?.name) !== self && x.artist?.name);
      const show = { event: s.tour?.name || "Show", date: date.split("-").reverse().join("-"), venue: s.venue?.name || null, city: s.venue?.city?.name || null };
      for (const o of others) {
        const n = o.artist.name, k = norm(n);
        let rec = co.get(k);
        if (!rec) { rec = { name: n, weight: 0, shows: [] }; co.set(k, rec); }
        rec.weight++;
        if (rec.shows.length < 12) rec.shows.push(show);
      }
    }
    return {
      name,
      matched: true,
      coacts: [...co.values()].sort((a, b) => b.weight - a.weight).map((r) => ({ name: r.name, weight: r.weight, shows: r.shows })),
    };
  });
}
