// ra.mjs — Resident Advisor (ra.co) GraphQL: vergangene Auftritte eines Acts -> Co-Acts + Genres.
// Hinweis: inoffizielle API, Nutzung auf eigenes Risiko (RA-ToS). Nur lesend, gedrosselt.

const ENDPOINT = "https://ra.co/graphql";
const HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (LikeBookingTool; personal, non-commercial)",
  referer: "https://ra.co/",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Health-Wächter (E6): RA ist eine inoffizielle API und kann still kaputtgehen — dann
// degradieren die „zusammen aufgetreten"-Kanten unbemerkt. Ab 5 Fehlschlägen IN FOLGE
// einen Pushover-Hinweis an den Betreiber (höchstens einmal pro 24 h); jeder Erfolg
// setzt den Zähler zurück. Ohne Pushover-Credentials passiert schlicht nichts.
import { notifyQuiet } from "./pushover.mjs";
let raFailStreak = 0, raLastAlarm = 0;
function raHealth(ok, err) {
  if (ok) { raFailStreak = 0; return; }
  raFailStreak++;
  if (raFailStreak >= 5 && Date.now() - raLastAlarm > 24 * 3600e3) {
    raLastAlarm = Date.now();
    notifyQuiet({
      title: "like — RA-Quelle gestört",
      message: `Resident Advisor schlägt seit ${raFailStreak} Anfragen in Folge fehl (zuletzt: ${String(err?.message || err).slice(0, 120)}). Die „zusammen aufgetreten"-Kanten degradieren still — Quellen-Diagnose prüfen.`,
    });
  }
}

let gate = Promise.resolve(); // serialisiert + drosselt Requests
async function gql(query, variables) {
  const job = gate.then(async () => {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try {
        let res;
        try {
          res = await fetch(ENDPOINT, { method: "POST", headers: HEADERS, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(6000) });
        } catch (netErr) {
          // Netz komplett weg/hängt: Retries bringen nichts, würden Explore nur ~7s blockieren
          netErr.noRetry = true; throw netErr;
        }
        // (Die 300-ms-Höflichkeitspause hängt seit R13 in der Gate-Kette unten — der Aufrufer
        // wartet sie nicht mehr mit ab; der Abstand zwischen zwei RA-Requests bleibt gleich.)
        if (res.status === 429 || res.status >= 500) throw new Error("RA HTTP " + res.status);
        if (!res.ok) { const e = new Error("RA HTTP " + res.status); e.noRetry = true; throw e; } // 4xx: Retry zwecklos
        let j;
        try { j = await res.json(); }
        catch { const e = new Error("RA: keine JSON-Antwort (blockiert?)"); e.noRetry = true; throw e; }
        if (j.errors) {
          // RA-Downstream-Fehler sind oft transient -> retry
          const transient = JSON.stringify(j.errors).match(/DOWNSTREAM|No response|TIMEOUT|503|429/i);
          if (transient && i < 3) throw new Error("RA transient");
          if (j.errors && !j.data) throw new Error("RA: " + JSON.stringify(j.errors).slice(0, 160));
        }
        raHealth(true);
        return j.data;
      } catch (e) {
        lastErr = e;
        if (e.noRetry) break;
        await sleep(600 * (i + 1));
      }
    }
    raHealth(false, lastErr);
    throw lastErr;
  });
  // Pause zweiarmig in der Gate-Kette (gilt auch nach Fehlern): der NÄCHSTE RA-Request
  // wartet den Abstand ab, nicht der aktuelle Aufrufer (Taskforce R13, spart 2×300 ms
  // pro Ausbau). Der Retry-Backoff (600·(i+1) ms) oben bleibt unangetastet.
  gate = job.then(() => sleep(300), () => sleep(300));
  return job;
}

export async function searchArtist(name) {
  const d = await gql(
    "query($t:String!){ search(searchTerm:$t, limit:5, indices:[ARTIST]){ id value searchType } }",
    { t: name }
  );
  const hit = (d.search || []).find((x) => x.searchType === "ARTIST");
  return hit ? { id: hit.id, name: hit.value } : null;
}

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function artistCoappear(id, { limit = 40 } = {}) {
  const d = await gql(
    `query($id:ID!,$l:Int!){ artist(id:$id){
       name contentUrl bookingDetails website soundcloud instagram facebook upcomingEventsCount
       area{ name } country{ name }
       events(limit:$l, type:PREVIOUS){ title date artists{ name } genres{ name } venue{ name } area{ name } }
       upcoming: events(limit:8, type:UPCOMING){ title date venue{ name } area{ name } }
     } }`,
    { id, l: limit }
  );
  const a = d.artist;
  if (!a) return { name: null, coacts: [], genres: [], booking: null };
  const co = new Map(), gen = new Map(); // name -> { weight, shows[] }
  for (const e of a.events || []) {
    const show = { event: e.title || null, date: e.date ? String(e.date).slice(0, 10) : null, venue: e.venue?.name || null, city: e.area?.name || null };
    for (const ar of e.artists || []) {
      if (!ar.name || ar.name === a.name) continue;
      let rec = co.get(ar.name);
      if (!rec) { rec = { weight: 0, shows: [] }; co.set(ar.name, rec); }
      rec.weight++;
      if (rec.shows.length < 12) rec.shows.push(show);
    }
    for (const g of e.genres || []) gen.set(g.name, (gen.get(g.name) || 0) + 1);
  }
  return {
    name: a.name,
    coacts: [...co.entries()].sort((x, y) => y[1].weight - x[1].weight).map(([name, r]) => ({ name, weight: r.weight, shows: r.shows })),
    genres: [...gen.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name),
    booking: {
      ra: a.contentUrl ? "https://ra.co" + a.contentUrl : null,
      details: stripHtml(a.bookingDetails).slice(0, 600) || null,
      website: a.website || null,
      soundcloud: a.soundcloud || null,
      instagram: a.instagram || null,
      facebook: a.facebook || null,
      upcoming: a.upcomingEventsCount || 0,
      // Kommende Auftritte (E6): fürs Booking das Routing-Argument („spielt ohnehin in der Region").
      upcomingShows: (a.upcoming || []).map((e) => ({
        event: e.title || null, date: e.date ? String(e.date).slice(0, 10) : null,
        venue: e.venue?.name || null, city: e.area?.name || null,
      })).filter((s) => s.event || s.venue),
      area: a.area?.name || null,
      country: a.country?.name || null,
    },
  };
}

// Namen normalisieren, um RA-Fehltreffer abzuwehren ("Led Zeppelin" != "Led Er Est").
const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Komfort: Name -> { name, coacts, genres, booking }. matched=false, wenn RA den Act nicht (sicher) kennt.
// Ergebnis wird 3 Tage gecacht (RA-Aussetzer abfedern, Re-Explore sofort).
import { cached } from "./cache.mjs";
export async function coappearByName(name) {
  return cached("ra", name, 3 * 864e5, async () => {
    const hit = await searchArtist(name);
    if (!hit || norm(hit.name) !== norm(name)) return { name: null, matched: false, coacts: [], genres: [], booking: null };
    const r = await artistCoappear(hit.id);
    return { name: r.name || hit.name, matched: true, coacts: r.coacts, genres: r.genres, booking: r.booking };
  });
}
