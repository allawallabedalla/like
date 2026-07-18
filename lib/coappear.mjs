// coappear.mjs — vereint die "zusammen aufgetreten"-Quellen.
// RA ist immer aktiv (kein Key nötig). Bandsintown/Setlist.fm nur, wenn app_id/Key hinterlegt.
// Gewichte werden quellenübergreifend addiert; Genres kommen (aktuell) von RA.
//
// Songkick ist bewusst NICHT mehr in der Kette: die öffentliche Songkick-API ist stillgelegt,
// der Adapter (lib/songkick.mjs) lieferte real nichts mehr und täuschte eine Absicherung vor,
// die es nicht gibt (Ehrlichkeit, Runde 24 / U-2a.3). Die Datei bleibt als deprecated erhalten.

import * as ra from "./ra.mjs";
import { bandsintownCoappear } from "./bandsintown.mjs";
import { sharedBills } from "./setlistfm.mjs";

// Kill-Switch (U-2a.7): RA ist die einzige keyfreie together-Quelle und eine inoffizielle API.
// Über LIKE_DISABLE_RA=1 lässt sich RA sofort und reversibel abschalten (ToS-Absicherung); die
// together-Relation degradiert dann bewusst SICHTBAR (siehe `degraded` unten), statt still auf
// reine Klangähnlichkeit zurückzufallen.
const RA_DISABLED = /^(1|true|yes|on)$/i.test(process.env.LIKE_DISABLE_RA || "");

export async function coAppearances(name) {
  const co = new Map();
  const genres = new Map();
  const sources = [];
  let booking = null;

  // co: name -> { weight, shows[] } (shows = wo/wann sie zusammen auftraten)
  const merge = (list) => {
    for (const c of list || []) {
      let rec = co.get(c.name);
      if (!rec) { rec = { weight: 0, shows: [] }; co.set(c.name, rec); }
      rec.weight += c.weight;
      for (const s of c.shows || []) if (rec.shows.length < 12) rec.shows.push(s);
    }
  };

  let raFailed = false;
  if (!RA_DISABLED) {
    try {
      const r = await ra.coappearByName(name);
      if (r.matched) {
        sources.push("ra");
        booking = r.booking || null;
        merge(r.coacts);
        for (const g of r.genres) genres.set(g, (genres.get(g) || 0) + 1);
      }
    } catch { raFailed = true; /* RA flaky/blockiert/Abkühlphase -> still weiter, aber als degradiert vermerkt */ }
  }

  try { const r = await bandsintownCoappear(name); if (r) { sources.push("bandsintown"); merge(r.coacts); } } catch {}
  try { const r = await sharedBills(name); if (r?.matched) { sources.push("setlist.fm"); merge(r.coacts); } } catch {}

  // degraded = die together-Relation konnte GAR NICHT konsultiert werden (RA aus/gestört und keine
  // andere Quelle lieferte). Ehrlich unterscheidbar vom Fall „konsultiert, aber real keine
  // Co-Auftritte" (dann ist eine Quelle in `sources`), damit der Client nicht fälschlich
  // „keine gemeinsamen Auftritte" behauptet, obwohl nur die Quelle fehlte.
  const degraded = sources.length === 0 && (RA_DISABLED || raFailed);

  return {
    name,
    sources,
    booking,
    degraded,
    coacts: [...co.entries()].sort((a, b) => b[1].weight - a[1].weight).map(([name, r]) => ({ name, weight: r.weight, shows: r.shows })),
    genres: [...genres.keys()],
  };
}
