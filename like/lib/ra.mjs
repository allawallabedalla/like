// ra.mjs — Resident Advisor (ra.co) GraphQL: vergangene Auftritte eines Acts -> Co-Acts + Genres.
// Hinweis: inoffizielle API, Nutzung auf eigenes Risiko (RA-ToS). Nur lesend, gedrosselt.

const ENDPOINT = "https://ra.co/graphql";
const HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (LikeBookingTool; personal, non-commercial)",
  referer: "https://ra.co/",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = Promise.resolve(); // serialisiert + drosselt Requests
async function gql(query, variables) {
  const job = gate.then(async () => {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch(ENDPOINT, { method: "POST", headers: HEADERS, body: JSON.stringify({ query, variables }) });
        await sleep(300);
        if (res.status === 429 || res.status >= 500) throw new Error("RA HTTP " + res.status);
        const j = await res.json();
        if (j.errors) {
          // RA-Downstream-Fehler sind oft transient -> retry
          const transient = JSON.stringify(j.errors).match(/DOWNSTREAM|No response|TIMEOUT|503|429/i);
          if (transient && i < 3) throw new Error("RA transient");
          if (j.errors && !j.data) throw new Error("RA: " + JSON.stringify(j.errors).slice(0, 160));
        }
        return j.data;
      } catch (e) {
        lastErr = e;
        await sleep(600 * (i + 1));
      }
    }
    throw lastErr;
  });
  gate = job.then(() => {}, () => {});
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
       events(limit:$l, type:PREVIOUS){ artists{ name } genres{ name } }
     } }`,
    { id, l: limit }
  );
  const a = d.artist;
  if (!a) return { name: null, coacts: [], genres: [], booking: null };
  const co = new Map(), gen = new Map();
  for (const e of a.events || []) {
    for (const ar of e.artists || []) if (ar.name && ar.name !== a.name) co.set(ar.name, (co.get(ar.name) || 0) + 1);
    for (const g of e.genres || []) gen.set(g.name, (gen.get(g.name) || 0) + 1);
  }
  return {
    name: a.name,
    coacts: [...co.entries()].sort((x, y) => y[1] - x[1]).map(([name, weight]) => ({ name, weight })),
    genres: [...gen.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name),
    booking: {
      ra: a.contentUrl ? "https://ra.co" + a.contentUrl : null,
      details: stripHtml(a.bookingDetails).slice(0, 600) || null,
      website: a.website || null,
      soundcloud: a.soundcloud || null,
      instagram: a.instagram || null,
      facebook: a.facebook || null,
      upcoming: a.upcomingEventsCount || 0,
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
