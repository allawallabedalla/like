// coappear.mjs — vereint die "zusammen aufgetreten"-Quellen.
// RA ist immer aktiv (kein Key nötig). Songkick/Bandsintown nur, wenn Key/app_id hinterlegt.
// Gewichte werden quellenübergreifend addiert; Genres kommen (aktuell) von RA.

import * as ra from "./ra.mjs";
import { bandsintownCoappear } from "./bandsintown.mjs";
import { songkickCoappear } from "./songkick.mjs";

export async function coAppearances(name) {
  const co = new Map();
  const genres = new Map();
  const sources = [];
  let booking = null;

  const merge = (list) => { for (const c of list || []) co.set(c.name, (co.get(c.name) || 0) + c.weight); };

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

  return {
    name,
    sources,
    booking,
    coacts: [...co.entries()].sort((a, b) => b[1] - a[1]).map(([name, weight]) => ({ name, weight })),
    genres: [...genres.keys()],
  };
}
