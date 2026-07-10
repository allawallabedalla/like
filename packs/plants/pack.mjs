// packs/plants/pack.mjs — Pflanzen-Nachbarschaften über iNaturalist + GBIF (beide offen, kein Key).
//   blau   = botanisch verwandt (gleiche Gattung/Familie, via iNat-Taxonomie)
//   orange = gedeiht am selben Standort (Ko-Okkurrenz: Pflanzen, die iNaturalist-Beobachter
//            oft im selben Umkreis finden — teilen faktisch Klima/Boden, also ähnliche
//            Standortansprüche). Echte strukturierte Wunsch-Bedingungen (Sonne/Boden/pH)
//            gibt es frei nicht sauber; Ko-Okkurrenz ist der beste freie Proxy dafür.
// Popularität = observations_count (wie oft beobachtet/fotografiert).

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";

import { surpriseFrom } from "../../lib/surprise.mjs";

const INAT = "https://api.inaturalist.org/v1";

// „Überrasch mich" (Kaltstart): kuratierter Pool bemerkenswerter Pflanzen (Urzeit-Relikte,
// Fleischfresser, Rekordhalter). surprise() nimmt die mit den WENIGSTEN Beobachtungen.
const SURPRISE_SEEDS = [
  "Welwitschia mirabilis", "Drosera rotundifolia", "Dionaea muscipula", "Ginkgo biloba",
  "Wollemia nobilis", "Amorphophallus titanum", "Mimosa pudica", "Selaginella lepidophylla",
  "Victoria amazonica", "Nepenthes rajah", "Passiflora caerulea", "Aloe polyphylla",
  "Eucalyptus deglupta", "Strongylodon macrobotrys", "Puya raimondii", "Dracaena cinnabari",
  "Adansonia grandidieri", "Ophrys apifera", "Sequoiadendron giganteum", "Utricularia vulgaris",
  "Lithops lesliei", "Rafflesia arnoldii", "Equisetum arvense", "Monotropa uniflora",
];
const PLANTAE = 47126; // iNat-Taxon-ID des Pflanzenreichs — hält Tiere/Pilze draußen

const cap = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
// Anzeigename: bevorzugt der deutsche Trivialname, sonst der wissenschaftliche.
const display = (t) => t.preferred_common_name ? cap(t.preferred_common_name) : t.name;

// locale=de: iNaturalist liefert dann deutsche Trivialnamen ("Echter Lavendel"
// statt "true lavender"), wo vorhanden — sonst fällt es auf Englisch/Latein zurück.
async function searchTaxon(name) {
  return cached("inat-taxon", name, 14 * 864e5, async () => {
    const u = new URL(INAT + "/taxa");
    u.searchParams.set("q", name);
    u.searchParams.set("taxon_id", String(PLANTAE));
    u.searchParams.set("per_page", "1");
    u.searchParams.set("locale", "de");
    const j = await jfetch(u.href);
    return j.results?.[0] || null;
  });
}

async function taxonById(id) {
  return cached("inat-byid", id, 30 * 864e5, async () => {
    const j = await jfetch(`${INAT}/taxa/${id}?locale=de`);
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
    u.searchParams.set("locale", "de");
    const j = await jfetch(u.href);
    return (j.results || []).filter((t) => t.id !== taxon.id && t.rank === "species");
  });
}

// Standort-Nachbarn (Ko-Okkurrenz): Pflanzen, die im selben Umkreis wachsen wie diese —
// also ähnliche Klima-/Bodenbedingungen mögen. Zwei Schritte, beide gecacht:
//   1) einen repräsentativen Fundort der Art holen (gut belegte Beobachtung mit Koordinaten)
//   2) im Umkreis die häufigsten ANDEREN Pflanzenarten zählen (species_counts) = Standortgemeinschaft
// count = Beobachtungen der Nachbar-Art in der Region -> Kantengewicht (häufiger = dicker).
async function sameHabitat(taxon, { limit = 12 } = {}) {
  const genus = (taxon.ancestors || []).find((a) => a.rank === "genus");
  return cached("inat-habitat", taxon.id + "|" + limit, 14 * 864e5, async () => {
    try {
      // repräsentativen Fundort suchen (Research-Grade, mit Geokoordinaten)
      const ou = new URL(INAT + "/observations");
      ou.searchParams.set("taxon_id", String(taxon.id));
      ou.searchParams.set("quality_grade", "research");
      ou.searchParams.set("geo", "true");
      ou.searchParams.set("order_by", "votes");
      ou.searchParams.set("per_page", "1");
      const obs = (await jfetch(ou.href)).results?.[0];
      const loc = obs?.location; // "lat,lng"
      if (!loc) return [];
      const [lat, lng] = loc.split(",");
      // häufigste Pflanzen im Umkreis (~60 km) — die Standortgemeinschaft
      const su = new URL(INAT + "/observations/species_counts");
      su.searchParams.set("lat", lat);
      su.searchParams.set("lng", lng);
      su.searchParams.set("radius", "60");
      su.searchParams.set("iconic_taxa", "Plantae");
      su.searchParams.set("quality_grade", "research");
      su.searchParams.set("per_page", String(limit + 6));
      su.searchParams.set("locale", "de");
      const j = await jfetch(su.href);
      const out = [];
      for (const r of j.results || []) {
        const t = r.taxon;
        if (!t || t.id === taxon.id) continue;
        if (genus && (t.ancestor_ids || []).includes(genus.id)) continue; // eigene Gattung ist schon "verwandt" (blau)
        if (t.rank !== "species") continue;
        out.push({ taxon: t, count: r.count || 1 });
        if (out.length >= limit) break;
      }
      return out;
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
    searchTitle: "Pflanze bei iNaturalist suchen — lädt verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen (Taste /)",
    goTitle: "Pflanze laden: botanisch verwandt + gedeiht am selben Standort + Merkmale",
    exampleSeed: "Lavendel",
    emptyTitle: "Noch keine Pflanzen auf der Karte",
    emptyHint: "bringt gleich ihr Umfeld mit: verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen.",
    edges: {
      similar: { label: "botanisch verwandt (Gattung)", count: "verwandte" },
      together: { label: "gedeiht am selben Standort (iNat)", count: "mit ähnlichen Ansprüchen" },
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
    togetherLabel: "Gedeiht am selben Standort",
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
    radarTogetherReason: "gedeiht am selben Standort wie dein Like",
    features: { preview: false, radar: true, context: true, active: false, booking: false, tour: true, venues: false, surprise: true },
    key: null,
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Pflanze": "Plant",
      "Pflanzen": "Plants",
      "Pflanze suchen…   ( / )": "Search plant…   ( / )",
      "Pflanze bei iNaturalist suchen — lädt verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen (Taste /)": "Search plant on iNaturalist - loads related species + plants with similar site requirements (key /)",
      "Pflanze laden: botanisch verwandt + gedeiht am selben Standort + Merkmale": "Load plant: botanically related + thrives in the same habitat + traits",
      "Noch keine Pflanzen auf der Karte": "No plants on the map yet",
      "bringt gleich ihr Umfeld mit: verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen.": "brings its surroundings along: related species + plants with similar site requirements.",
      "botanisch verwandt (Gattung)": "botanically related (genus)",
      "verwandte": "related",
      "gedeiht am selben Standort (iNat)": "thrives in the same habitat (iNat)",
      "mit ähnlichen Ansprüchen": "with similar requirements",
      "Beobachtungen": "Observations",
      "Allerweltsarten dämpfen": "Dim common species",
      "Sehr häufig beobachtete Arten abdunkeln — nur die Seltenen leuchten": "Dim very frequently observed species - only the rare ones glow",
      "Merkmale": "Traits",
      "Merkmal filtern…": "Filter traits…",
      "will ich pflanzen": "want to plant",
      "gesät": "sown",
      "im Garten": "in the garden",
      "nichts für mich": "not for me",
      "Notiz": "Note",
      "Standort, Boden, Bezugsquelle, Beobachtung…": "Site, soil, source, observation…",
      "Botanisch verwandt": "Botanically related",
      "Gedeiht am selben Standort": "Thrives in the same habitat",
      "Familien-Umfeld": "Family context",
      "Familie laden": "Load family",
      "Lade Familien-Umfeld …": "Loading family context …",
      "Pflanzliste": "Plant list",
      "merken!": "save!",
      "Radar — seltene Arten": "Radar - rare species",
      "gedeiht am selben Standort wie dein Like": "thrives in the same habitat as your like",
    },
  },

  async suggest(q) {
    return cached("inat-suggest", q, 864e5, async () => {
      const u = new URL(INAT + "/taxa/autocomplete");
      u.searchParams.set("q", q);
      u.searchParams.set("taxon_id", String(PLANTAE));
      u.searchParams.set("per_page", "6");
      u.searchParams.set("locale", "de");
      const j = await jfetch(u.href);
      const seen = new Set();
      return (j.results || []).map(display).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    });
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (Routenplaner): nur Gattungs-Geschwister,
  // ohne Standort-Gemeinschaft — schneller als explore().
  async similar(name, { limit = 15 } = {}) {
    const hit = await searchTaxon(name);
    if (!hit) return { canonical: name, similar: [] };
    const taxon = await taxonById(hit.id) || hit;
    const sibs = await genusSiblings(taxon, { limit: Math.min(limit, 15) });
    return { canonical: display(taxon), similar: sibs.map((t) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, match: 0.6 })) };
  },

  // „Überrasch mich" (Kaltstart): Zufallszug aus dem Pool, das UNBEKANNTESTE gewinnt.
  async surprise() { return surpriseFrom(SURPRISE_SEEDS, (n) => this.popularity(n)); },

  async explore(name) {
    const hit = await searchTaxon(name);
    if (!hit) throw new Error(`„${name}" nicht bei iNaturalist gefunden (Pflanzen)`);
    const taxon = await taxonById(hit.id) || hit;
    const family = (taxon.ancestors || []).find((a) => a.rank === "family");
    const genus = (taxon.ancestors || []).find((a) => a.rank === "genus");

    const [sibs, co] = await Promise.all([genusSiblings(taxon), sameHabitat(taxon)]);
    const genres = [family?.preferred_common_name || family?.name, genus?.name, taxon.rank].filter(Boolean).map(cap);

    return {
      canonical: display(taxon),
      url: `https://www.inaturalist.org/taxa/${taxon.id}`,
      genres: genres.slice(0, 6),
      similarSource: "inaturalist",
      togetherSource: "inaturalist",
      similar: sibs.slice(0, 15).map((t) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, match: 0.6 })),
      together: co.slice(0, 12).map(({ taxon: t, count }) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, weight: count })),
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
    u.searchParams.set("locale", "de");
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
      { name: "iNaturalist Standort-Gemeinschaft", probe: async () => { const h = await searchTaxon("Lavandula"); const t = await taxonById(h.id) || h; return (await sameHabitat(t)).length >= 0; } },
    ];
  },
};
