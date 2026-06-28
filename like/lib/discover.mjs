// discover.mjs — automatische Festival-Entdeckung aus den Acts im Graph.
//
// Ablauf:
//  1. Für noch nicht geprüfte Acts die Wikipedia-Seite auflösen + Backlinks holen
//     (welche Seiten verlinken den Act) -> als a.bl auf dem Knoten cachen.
//  2. Über ALLE Acts auszählen, welche Seiten von >= minArtists Acts verlinkt werden.
//  3. Diese Kandidaten per Kategorie auf Festivals filtern.
//  4. Deren Lineups scrapen -> events -> daraus werden co_lineup-Kanten abgeleitet.
//
// Inkrementell: pro Lauf nur maxArtists neue Acts; erneut aufrufen verarbeitet die nächsten.

import { resolveArtistTitle, getBacklinks, filterFestivals, fetchLineup } from "./wikipedia.mjs";
import { addEvent, slug, buildLineupLayer } from "./store.mjs";

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

export async function discoverAndScrape(graph, {
  lang = "en", maxArtists = 60, minArtists = 2, maxFestivals = 30, log = () => {},
} = {}) {
  const arts = Object.values(graph.artists);

  // 1) noch nicht geprüfte Acts, Seeds/bekannte zuerst
  const pending = arts
    .filter((a) => !a.wikiChecked)
    .sort((a, b) => ((b.seed ? 2 : b.known ? 1 : 0) - (a.seed ? 2 : a.known ? 1 : 0)))
    .slice(0, maxArtists);

  let resolved = 0;
  log(`Prüfe ${pending.length} Acts (von ${arts.length})…`);
  await mapLimit(pending, 4, async (a) => {
    try {
      const title = await resolveArtistTitle(a.name, { lang });
      a.wiki = title || null;
      a.wikiChecked = true;
      if (title) {
        a.bl = (await getBacklinks(title, { lang, limit: 200 })).slice(0, 150);
        resolved++;
        log(`✓ ${a.name} → ${title} (${a.bl.length} Backlinks)`);
      } else {
        a.bl = [];
        log(`· ${a.name}: keine Musik-Seite`);
      }
    } catch (err) {
      a.wikiChecked = true; a.bl = a.bl || [];
      log(`✗ ${a.name}: ${err.message}`);
    }
  });

  // 2) Kandidaten: Seiten, die >= minArtists Acts verlinken (über ALLE gecachten Backlinks)
  const count = new Map();
  for (const a of arts) for (const t of (a.bl || [])) count.set(t, (count.get(t) || 0) + 1);
  const haveEvent = new Set((graph.events || []).map((e) => slug(e.name)));
  let candidates = [...count.entries()]
    .filter(([t, c]) => c >= minArtists && !haveEvent.has(slug(t)))
    .sort((x, y) => y[1] - x[1])
    .map(([t]) => t);

  // 3) auf Festivals filtern (begrenzt, um API-Aufrufe zu deckeln)
  const fests = await filterFestivals(candidates.slice(0, 400), { lang });
  const festList = candidates.filter((t) => fests.has(t)).slice(0, maxFestivals);
  log(`Kandidaten ≥${minArtists} Acts: ${candidates.length} · davon Festivals: ${fests.size} · scrape: ${festList.length}`);

  // 4) Lineups scrapen (Aggregat-Listen "…line-ups" über Jahrzehnte überspringen)
  const MAX_LINEUP = 1200; // darüber ist es fast sicher eine Mehrjahres-Sammelseite
  let scraped = 0, added = 0;
  for (const title of festList) {
    if (/line[\s-]?ups?$/i.test(title)) { log(`· ${title}: übersprungen (Sammelseite)`); continue; }
    try {
      const r = await fetchLineup(title, { lang });
      if (!r.lineup.length) { log(`· ${title}: kein Lineup`); continue; }
      if (r.lineup.length > MAX_LINEUP) { log(`· ${r.eventName}: übersprungen (${r.lineup.length} Acts, Sammelseite)`); continue; }
      const { artistCount } = addEvent(graph, { name: r.eventName, lineup: r.lineup, sourceUrl: r.sourceUrl });
      scraped++; added += artistCount;
      log(`⤓ ${r.eventName}: ${artistCount} Acts`);
    } catch (err) {
      log(`✗ ${title}: ${err.message}`);
    }
  }

  const layer = buildLineupLayer(graph, { minShared: minArtists });
  return {
    processedArtists: pending.length,
    resolved,
    candidates: candidates.length,
    scraped,
    discovered: Object.keys(layer.discovered).length,
    connections: layer.edges.length,
    remaining: arts.filter((a) => !a.wikiChecked).length,
  };
}
