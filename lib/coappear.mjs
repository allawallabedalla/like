// coappear.mjs — vereint die "zusammen aufgetreten"-Quellen.
// RA ist immer aktiv (kein Key nötig). Songkick/Bandsintown nur, wenn Key/app_id hinterlegt.
// Gewichte werden quellenübergreifend addiert; Genres kommen (aktuell) von RA.

import * as ra from "./ra.mjs";
import { bandsintownCoappear } from "./bandsintown.mjs";
import { songkickCoappear } from "./songkick.mjs";
import { sharedBills } from "./setlistfm.mjs";

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

  try {
    const r = await ra.coappearByName(name);
    if (r.matched) {
      sources.push("ra");
      booking = r.booking || null;
      merge(r.coacts);
      for (const g of r.genres) genres.set(g, (genres.get(g) || 0) + 1);
    }
  } catch { /* RA flaky/blockiert -> still weiter */ }

  try { const r = await bandsintownCoappear(name); if (r) { sources.push("bandsintown"); merge(r.coacts); } } catch {}
  try { const r = await songkickCoappear(name); if (r) { sources.push("songkick"); merge(r.coacts); } } catch {}
  try { const r = await sharedBills(name); if (r?.matched) { sources.push("setlist.fm"); merge(r.coacts); } } catch {}

  return {
    name,
    sources,
    booking,
    coacts: [...co.entries()].sort((a, b) => b[1].weight - a[1].weight).map(([name, r]) => ({ name, weight: r.weight, shows: r.shows })),
    genres: [...genres.keys()],
  };
}
