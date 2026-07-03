// packs/plants/pack.mjs — Pflanzen-Nachbarschaften über iNaturalist + GBIF (beide offen, kein Key).
//   blau   = botanisch verwandt (gleiche Gattung/Familie, via iNat-Taxonomie)
//   orange = wird oft verwechselt mit (iNat similar_species: Arten, die Beobachter
//            in der Praxis miteinander verwechseln — d.h. sie SEHEN sich ähnlich)
// Popularität = observations_count (wie oft beobachtet/fotografiert).

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";

const INAT = "https://api.inaturalist.org/v1";
const PLANTAE = 47126; // iNat-Taxon-ID des Pflanzenreichs — hält Tiere/Pilze draußen

const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
// Anzeigename: bevorzugt der deutsche Trivialname, sonst der wissenschaftliche.
const display = (t) => t.preferred_common_name ? cap(t.preferred_common_name) : t.name;

async function searchTaxon(name) {
  return cached("inat-taxon", name, 14 * 864e5, async () => {
    const u = new URL(INAT + "/taxa");
    u.searchParams.set("q", name);
    u.searchParams.set("taxon_id", String(PLANTAE));
    u.searchParams.set("per_page", "1");
    const j = await jfetch(u.href);
    return j.results?.[0] || null;
  });
}

async function taxonById(id) {
  return cached("inat-byid", id, 30 * 864e5, async () => {
    const j = await jfetch(`${INAT}/taxa/${id}`);
    return j.results?.[0] || null;
  });
}

// Geschwister-Arten: andere Arten derselben Gattung (GBIF-frei via iNat-Children des Elterntaxons).
async function genusSiblings(taxon, { limit = 12 } = {}) {
  const genus = (taxon.ancestors || []).find((a) => a.rank === "genus") || (taxon.rank === "genus" ? taxon : null);
  if (!genus) return [];
  return cached("inat-sib", genus.id + "|" + limit, 14 * 864e5, async () => {
    const u = new URL(INAT + "/taxa");
    u.searchParams.set("parent_id", String(genus.id));
    u.searchParams.set("per_page", String(limit));
    u.searchParams.set("order_by", "observations_count");
    const j = await jfetch(u.href);
    return (j.results || []).filter((t) => t.id !== taxon.id && t.rank === "species");
  });
}

// Verwechslungs-Arten: welche Arten Beobachter mit dieser verwechseln (iNat
// similar_species, aus echten Fehlbestimmungen abgeleitet = optische Ähnlichkeit).
async function lookAlikes(taxonId, { limit = 12 } = {}) {
  return cached("inat-co", taxonId + "|" + limit, 14 * 864e5, async () => {
    try {
      const j = await jfetch(`${INAT}/identifications/similar_species?taxon_id=${taxonId}&per_page=${limit}`);
      return (j.results || []).map((r) => r.taxon).filter((t) => t && t.iconic_taxon_name === "Plantae");
    } catch { return []; }
  });
}

export default {
  id: "plants",
  key: null,

  config: {
    id: "plants",
    title: "Like Plants",
    brand: "like",
    item: { sing: "Pflanze", plur: "Pflanzen" },
    searchPlaceholder: "Pflanze suchen…   ( / )",
    searchTitle: "Pflanze bei iNaturalist suchen — lädt verwandte + zum Verwechseln ähnliche Arten (Taste /)",
    goTitle: "Pflanze laden: botanisch verwandt + wird oft verwechselt mit + Merkmale",
    exampleSeed: "Lavendel",
    emptyTitle: "Noch keine Pflanzen auf der Karte",
    emptyHint: "bringt gleich ihr Umfeld mit: verwandte + zum Verwechseln ähnliche Arten.",
    edges: {
      similar: { label: "botanisch verwandt (Gattung)", count: "verwandte" },
      together: { label: "wird oft verwechselt mit (iNat)", count: "zum Verwechseln ähnlich" },
    },
    popularity: { label: "Beobachtungen", big: 50000, dimLabel: "Allerweltsarten dämpfen", dimTitle: "Sehr häufig beobachtete Arten abdunkeln — nur die Seltenen leuchten" },
    genreLabel: "Merkmale",
    genreFilterPlaceholder: "Merkmal filtern…",
    statuses: [
      { value: "shortlist", label: "will ich pflanzen", color: "#000000" },
      { value: "contacted", label: "gesät", color: "#ff6a00" },
      { value: "confirmed", label: "im Garten", color: "#1a9e54" },
      { value: "declined", label: "nichts für mich", color: "#9a9a9a" },
    ],
    noteLabel: "Notiz",
    notePlaceholder: "Standort, Boden, Bezugsquelle, Beobachtung…",
    similarLabel: "Botanisch verwandt",
    togetherLabel: "Wird oft verwechselt mit",
    contextLabel: "Familien-Umfeld",
    contextHint: "(iNaturalist)",
    contextButton: "Familie laden",
    contextWait: "Lade Familien-Umfeld …",
    basketLabel: "Pflanzliste",
    likeLabel: "merken!",
    profileLabel: "iNaturalist",
    searchLinks: [
      { cls: "", label: "Wikipedia", url: "https://de.wikipedia.org/w/index.php?search={Q}" },
      { cls: "", label: "GBIF", url: "https://www.gbif.org/species/search?q={Q}" },
    ],
    radarTitle: "Radar — seltene Arten",
    radarTogetherReason: "sieht deinem Like zum Verwechseln ähnlich",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: false, venues: false },
    key: null,
  },

  async suggest(q) {
    return cached("inat-suggest", q, 864e5, async () => {
      const u = new URL(INAT + "/taxa/autocomplete");
      u.searchParams.set("q", q);
      u.searchParams.set("taxon_id", String(PLANTAE));
      u.searchParams.set("per_page", "6");
      const j = await jfetch(u.href);
      const seen = new Set();
      return (j.results || []).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  async explore(name) {
    const hit = await searchTaxon(name);
    if (!hit) throw new Error(`„${name}" nicht bei iNaturalist gefunden (Pflanzen)`);
    const taxon = await taxonById(hit.id) || hit;
    const family = (taxon.ancestors || []).find((a) => a.rank === "family");
    const genus = (taxon.ancestors || []).find((a) => a.rank === "genus");

    const [sibs, co] = await Promise.all([genusSiblings(taxon), lookAlikes(taxon.id)]);
    const genres = [family?.preferred_common_name || family?.name, genus?.name, taxon.rank].filter(Boolean).map(cap);

    return {
      canonical: display(taxon),
      url: `https://www.inaturalist.org/taxa/${taxon.id}`,
      genres: genres.slice(0, 6),
      similarSource: "inaturalist",
      togetherSource: "inaturalist",
      similar: sibs.slice(0, 15).map((t) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, match: 0.6 })),
      together: co.slice(0, 12).map((t) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, weight: 1 })),
      sources: ["inaturalist"],
    };
  },

  async enrich(a) {
    const out = {};
    try {
      const hit = await searchTaxon(a.name);
      if (hit) {
        if (hit.observations_count) out.popularity = hit.observations_count;
        if (!a.url) out.url = `https://www.inaturalist.org/taxa/${hit.id}`;
        if (!a.genres?.length) {
          const t = await taxonById(hit.id);
          const fam = (t?.ancestors || []).find((x) => x.rank === "family");
          if (fam) out.genres = [cap(fam.preferred_common_name || fam.name)];
        }
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    const hit = await searchTaxon(name);
    return hit?.observations_count || null;
  },

  // Familien-Umfeld: die meistbeobachteten Gattungen/Arten derselben Familie.
  async context(name) {
    const hit = await searchTaxon(name);
    const taxon = hit && (await taxonById(hit.id));
    const family = (taxon?.ancestors || []).find((a) => a.rank === "family");
    if (!family) return { groups: [] };
    const u = new URL(INAT + "/taxa");
    u.searchParams.set("parent_id", String(family.id));
    u.searchParams.set("per_page", "12");
    u.searchParams.set("order_by", "observations_count");
    const j = await jfetch(u.href);
    return {
      note: `Familie: ${cap(family.preferred_common_name || family.name)}`,
      groups: [{
        label: "Gattungen der Familie",
        items: (j.results || []).filter((t) => t.id !== taxon.id).map((t) => ({ name: display(t), sub: t.observations_count ? `${t.observations_count} Beobachtungen` : "" })),
      }],
    };
  },

  async diag() {
    return [
      { name: "iNaturalist Suche", probe: async () => !!(await searchTaxon("Lavandula")) },
      { name: "iNaturalist Verwechslungs-Arten", probe: async () => { const h = await searchTaxon("Lavandula"); return (await lookAlikes(h.id)).length >= 0; } },
    ];
  },
};
