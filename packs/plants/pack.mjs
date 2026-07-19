// packs/plants/pack.mjs — Pflanzen-Nachbarschaften über iNaturalist (offen, kein Key; GBIF
// nur als externer Profil-Link, keine eigene API-Anbindung).
//   blau   = botanisch verwandt (gleiche Gattung/Familie, via iNat-Taxonomie)
//   orange = gedeiht am selben Standort (Ko-Okkurrenz: Pflanzen, die iNaturalist-Beobachter
//            an mehreren, geografisch verteilten Fundorten dieser Art oft mit-beobachten —
//            teilen faktisch Klima/Boden, also ähnliche Standortansprüche). Echte
//            strukturierte Wunsch-Bedingungen (Sonne/Boden/pH) gibt es frei nicht sauber;
//            Ko-Okkurrenz ist der beste freie Proxy dafür.
// Popularität = observations_count (wie oft beobachtet/fotografiert).

import { cached } from "../../lib/cache.mjs";
import { jfetch } from "../../lib/jfetch.mjs";

import { surpriseFrom } from "../../lib/surprise.mjs";

const INAT = "https://api.inaturalist.org/v1";
// (U-2d) iNaturalist drosselt geteilte, key-lose Nutzung — der jfetch-Default (250 ms) taktet
// zu dicht und provoziert 429er. Größerer Pro-Host-Abstand für alle iNat-Requests.
const INAT_GAP = 800;

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
// (U-2d) iNat liefert den Rang roh englisch ("species"/"genus"/…). Für den Systematik-Chip
// auf Deutsch mappen; unbekannte Ränge fallen später über filter(Boolean) einfach weg,
// statt roh englisch zu erscheinen.
const RANK_DE = {
  kingdom: "Reich", phylum: "Abteilung", subphylum: "Unterabteilung", class: "Klasse",
  subclass: "Unterklasse", order: "Ordnung", suborder: "Unterordnung", family: "Familie",
  subfamily: "Unterfamilie", tribe: "Tribus", genus: "Gattung", subgenus: "Untergattung",
  section: "Sektion", species: "Art", subspecies: "Unterart", variety: "Varietät",
  form: "Form", hybrid: "Hybride",
};
const rankDe = (r) => RANK_DE[String(r || "").toLowerCase()] || null;
// Anzeigename: bevorzugt der deutsche Trivialname, sonst der wissenschaftliche.
const display = (t) => t.preferred_common_name ? cap(t.preferred_common_name) : t.name;

// Namens-Normalisierung für den Treffervergleich: Akzente/Diakritika weg, Kleinschreibung,
// Whitespace zusammenfassen — damit „Ophrys Apifera" == „ophrys  apifera" und „Café" == „cafe"
// matchen, der Vergleich also robust gegen Groß-/Kleinschreibung und Zierzeichen ist.
const normName = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "") // Diakritika (kombinierende Zeichen) entfernen
  .toLowerCase().replace(/\s+/g, " ").trim();

// Namensvetter-Disambiguierung: unter mehreren gleichnamigen Taxa bewusst wählen, statt blind
// den erstbesten Treffer zu nehmen. Zuerst ein exakter (normalisierter) Namens-Treffer —
// wissenschaftlicher Name ODER gebräuchlicher (deutscher/englischer) Trivialname; sonst das
// Taxon mit den meisten Beobachtungen. Verhindert, dass ein obskures gleichnamiges Taxon
// (z.B. eine kaum beobachtete Art) statt der gemeinten, weit verbreiteten Pflanze landet.
function pickTaxon(results, name) {
  const list = (results || []).filter(Boolean);
  if (!list.length) return null;
  const q = normName(name);
  // (U-2d) exakter Namens-Treffer gewinnt — wissenschaftlich oder Trivialname (bevorzugt/englisch).
  const exact = list.find((t) => q && [t.name, t.preferred_common_name, t.english_common_name]
    .some((n) => normName(n) === q));
  if (exact) return exact;
  // sonst der mit den meisten Beobachtungen (obskures gleichnamiges Taxon fällt so hinten runter)
  return list.reduce((best, t) => ((t.observations_count || 0) > (best.observations_count || 0) ? t : best), list[0]);
}

// locale=de: iNaturalist liefert dann deutsche Trivialnamen ("Echter Lavendel"
// statt "true lavender"), wo vorhanden — sonst fällt es auf Englisch/Latein zurück.
async function searchTaxon(name) {
  return cached("inat-taxon", name, 14 * 864e5, async () => {
    const u = new URL(INAT + "/taxa");
    u.searchParams.set("q", name);
    u.searchParams.set("taxon_id", String(PLANTAE));
    // (U-2d) mehrere Treffer holen und bewusst wählen (pickTaxon) — nicht blind den ersten.
    u.searchParams.set("per_page", "10");
    u.searchParams.set("locale", "de");
    const j = await jfetch(u.href, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
    return pickTaxon(j.results, name);
  });
}

async function taxonById(id) {
  return cached("inat-byid", id, 30 * 864e5, async () => {
    const j = await jfetch(`${INAT}/taxa/${id}?locale=de`, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
    return j.results?.[0] || null;
  });
}

// FB27/#95: Bild fürs Info-Panel aus dem iNaturalist-Standardfoto — mit Attribution/Lizenz
// (CC-Fotos brauchen einen Credit). Mittlere Auflösung reicht fürs kleine Panel.
function photoOf(taxon) {
  const p = taxon && taxon.default_photo;
  if (!p || !(p.medium_url || p.url)) return null;
  const lic = p.license_code ? ` (${String(p.license_code).toUpperCase()})` : "";
  return {
    src: p.medium_url || p.url,
    credit: (p.attribution || "iNaturalist") + lic,
    href: `https://www.inaturalist.org/taxa/${taxon.id}`,
  };
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
    const j = await jfetch(u.href, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
    return (j.results || []).filter((t) => t.id !== taxon.id && t.rank === "species");
  });
}

// Kilometer zwischen zwei Koordinaten (Haversine) — hier nur für einen Mindestabstand
// zwischen Fundorten gebraucht, keine Präzisionsanforderung.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bis zu `n` geografisch verteilte, gut belegte Fundorte der Art (Research-Grade, mit
// Koordinaten) — statt nur des EINEN "besten" Funds. Ein einzelner Fundort ist bei
// Kosmopoliten (z.B. Löwenzahn) willkürlich: die Flora um zufällig genau diesen einen Park
// sagt wenig über die Art allgemein. Kandidaten mit Mindestabstand zueinander auswählen,
// damit die Fundorte tatsächlich unterschiedliche Regionen/Klimazonen abdecken.
async function representativeLocations(taxonId, { n = 3, minSepKm = 80 } = {}) {
  const u = new URL(INAT + "/observations");
  u.searchParams.set("taxon_id", String(taxonId));
  u.searchParams.set("quality_grade", "research");
  u.searchParams.set("geo", "true");
  u.searchParams.set("order_by", "votes");
  u.searchParams.set("per_page", "20"); // Kandidatenpool, daraus verteilte auswählen
  const results = (await jfetch(u.href, { gapMs: INAT_GAP })).results || []; // (U-2d) iNat-Drossel
  const locs = [];
  for (const obs of results) {
    const loc = obs?.location; if (!loc) continue;
    const [lat, lng] = loc.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (locs.every((p) => haversineKm(p.lat, p.lng, lat, lng) >= minSepKm)) locs.push({ lat, lng });
    if (locs.length >= n) break;
  }
  return locs;
}

// Standort-Nachbarn (Ko-Okkurrenz): Pflanzen, die an MEHREREN, weit auseinanderliegenden
// Fundorten dieser Art mit-beobachtet werden — also wirklich die Standortansprüche teilen,
// nicht nur zufällig am selben einzelnen Ort wachsen. Rang: an mehreren Fundorten gesehen
// ("hits") schlägt einen einzelnen Treffer; bei Gleichstand mehr Beobachtungen zuerst.
// count = aufsummierte Beobachtungen der Nachbar-Art -> Kantengewicht (häufiger = dicker).
async function sameHabitat(taxon, { limit = 12 } = {}) {
  const genus = (taxon.ancestors || []).find((a) => a.rank === "genus");
  return cached("inat-habitat", taxon.id + "|" + limit, 14 * 864e5, async () => {
    try {
      const locs = await representativeLocations(taxon.id, { n: 3, minSepKm: 80 });
      if (!locs.length) return [];
      const cand = new Map(); // taxonId -> { taxon, count, hits }
      for (const { lat, lng } of locs) {
        try {
          const su = new URL(INAT + "/observations/species_counts");
          su.searchParams.set("lat", lat);
          su.searchParams.set("lng", lng);
          su.searchParams.set("radius", "60");
          su.searchParams.set("iconic_taxa", "Plantae");
          su.searchParams.set("quality_grade", "research");
          su.searchParams.set("per_page", "40"); // größerer Pool je Standort, nach Filtern bleibt genug übrig
          su.searchParams.set("locale", "de");
          const j = await jfetch(su.href, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
          for (const r of j.results || []) {
            const t = r.taxon;
            if (!t || t.id === taxon.id) continue;
            if (genus && (t.ancestor_ids || []).includes(genus.id)) continue; // eigene Gattung ist schon "verwandt" (blau)
            if (t.rank !== "species") continue;
            const rec = cand.get(t.id) || { taxon: t, count: 0, hits: 0 };
            rec.count += r.count || 1; rec.hits++;
            cand.set(t.id, rec);
          }
        } catch { /* ein Fundort ohne Antwort -> mit den übrigen weiter */ }
      }
      return [...cand.values()]
        .sort((a, b) => b.hits - a.hits || b.count - a.count)
        .slice(0, limit)
        .map((r) => ({ taxon: r.taxon, count: r.count }));
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
    goTitle: "Pflanze laden: botanisch verwandt + gedeiht am selben Standort + Systematik", // (U-2d)
    exampleSeed: "Lavendel",
    // (U-2d) kontrastierende Startpunkte (Eigennamen -> als Suchbegriff genutzt, nicht übersetzt):
    // Zimmerpflanze / Baum / Wildblume.
    seedChips: ["Monstera", "Ginkgo", "Klatschmohn"],
    emptyTitle: "Noch keine Pflanzen auf der Karte",
    emptyHint: "bringt gleich ihr Umfeld mit: verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen.",
    edges: {
      similar: { label: "botanisch verwandt (Gattung)", count: "verwandte" },
      together: { label: "gedeiht am selben Standort (iNat)", count: "mit ähnlichen Ansprüchen" },
    },
    popularity: { label: "Beobachtungen", big: 50000, dimLabel: "Allerweltsarten dämpfen", dimTitle: "Sehr häufig beobachtete Arten abdunkeln — nur die Seltenen leuchten" },
    genreLabel: "Systematik", // (U-2d) ehem. „Merkmale" — es ist reine Taxonomie, kein Merkmalsprofil
    genreFilterPlaceholder: "Systematik filtern…",
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
    basketLabel: "Pflanzenliste", // (U-2d) Tippfehler „Pflanzliste" korrigiert
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
      "Pflanze laden: botanisch verwandt + gedeiht am selben Standort + Systematik": "Load plant: botanically related + thrives in the same habitat + systematics", // (U-2d)
      "Noch keine Pflanzen auf der Karte": "No plants on the map yet",
      "bringt gleich ihr Umfeld mit: verwandte Arten + Pflanzen mit ähnlichen Standortansprüchen.": "brings its surroundings along: related species + plants with similar site requirements.",
      "botanisch verwandt (Gattung)": "botanically related (genus)",
      "verwandte": "related",
      "gedeiht am selben Standort (iNat)": "thrives in the same habitat (iNat)",
      "mit ähnlichen Ansprüchen": "with similar requirements",
      "Beobachtungen": "Observations",
      "Allerweltsarten dämpfen": "Dim common species",
      "Sehr häufig beobachtete Arten abdunkeln — nur die Seltenen leuchten": "Dim very frequently observed species - only the rare ones glow",
      "Systematik": "Systematics", // (U-2d) ehem. „Merkmale"/„Traits"
      "Systematik filtern…": "Filter systematics…",
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
      "Pflanzenliste": "Plant list", // (U-2d)
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
      const j = await jfetch(u.href, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
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

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): Gattungs-Geschwister
  // (Taxonomie) PLUS Ko-Okkurrenz am selben Standort (Ökologie). Die Taxonomie bleibt in
  // der Verwandtschaft; Ko-Okkurrenz verbindet botanisch Unverwandtes, das zusammen wächst
  // — eine ganz andere Achse. Beide Straßen best effort. Naben (Kosmopoliten wie Löwenzahn,
  // die überall mitwachsen) werden beim Ranking über die Beobachtungszahl gedämpft.
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    let hit; try { hit = await searchTaxon(name); } catch { return { canonical: name, list: [] }; }
    if (!hit) return { canonical: name, list: [] };
    const taxon = (await taxonById(hit.id).catch(() => null)) || hit;
    const [sibs, co] = await Promise.all([
      genusSiblings(taxon, { limit: 15 }).catch(() => []),
      sameHabitat(taxon).catch(() => []),
    ]);
    const canonical = display(taxon);
    const seen = new Set([canonical.toLowerCase()]), out = [];
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    sibs.forEach((t) => add(display(t), `https://www.inaturalist.org/taxa/${t.id}`, 0.6));                              // Taxonomie
    co.forEach(({ taxon: t, count }) => add(display(t), `https://www.inaturalist.org/taxa/${t.id}`, Math.min(0.7, 0.4 + 0.03 * (count || 1)))); // Ko-Okkurrenz
    return { canonical, list: out };
  },

  async explore(name) {
    const hit = await searchTaxon(name);
    if (!hit) throw new Error(`„${name}" nicht bei iNaturalist gefunden (Pflanzen)`);
    const taxon = await taxonById(hit.id) || hit;
    const family = (taxon.ancestors || []).find((a) => a.rank === "family");
    const genus = (taxon.ancestors || []).find((a) => a.rank === "genus");

    const [sibs, co] = await Promise.all([genusSiblings(taxon), sameHabitat(taxon)]);
    // (U-2d) Rang deutsch mappen statt roh englisch; unbekannter Rang fällt via filter(Boolean) weg.
    const genres = [family?.preferred_common_name || family?.name, genus?.name, rankDe(taxon.rank)].filter(Boolean).map(cap);

    return {
      canonical: display(taxon),
      url: `https://www.inaturalist.org/taxa/${taxon.id}`,
      genres: genres.slice(0, 6),
      image: photoOf(taxon), // FB27/#95
      similarSource: "inaturalist",
      togetherSource: "inaturalist",
      similar: sibs.slice(0, 15).map((t) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, match: 0.6 })),
      together: co.slice(0, 12).map(({ taxon: t, count }) => ({ name: display(t), url: `https://www.inaturalist.org/taxa/${t.id}`, weight: count })),
      sources: ["inaturalist"],
    };
  },

  async enrich(a) {
    const out = {};
    if (!a || !a.name) return out; // (U-2d) Null-Guard: ohne Knoten/Name nichts nachzuladen
    try {
      const hit = await searchTaxon(a.name);
      if (hit) {
        if (hit.observations_count) out.popularity = hit.observations_count;
        if (!a.url) out.url = `https://www.inaturalist.org/taxa/${hit.id}`;
        // FB27/#95: Bild (+ ggf. Familie) für Nachbarknoten nachladen. Das Standardfoto steckt im
        // Voll-Taxon; einmal holen und für Bild und Familie nutzen.
        if (!a.image || !a.genres?.length) {
          const t = await taxonById(hit.id);
          if (!a.image) { const img = photoOf(t || hit); if (img) out.image = img; }
          if (!a.genres?.length) {
            const fam = (t?.ancestors || []).find((x) => x.rank === "family");
            if (fam) out.genres = [cap(fam.preferred_common_name || fam.name)];
          }
        }
      }
    } catch {}
    return out;
  },

  async popularity(name) {
    if (!name) return null; // (U-2d) Null-Guard: ohne Namen keine Suche
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
    const j = await jfetch(u.href, { gapMs: INAT_GAP }); // (U-2d) iNat-Drossel
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
      { name: "iNaturalist Standort-Gemeinschaft", probe: async () => { const h = await searchTaxon("Lavandula"); if (!h) return false; /* (U-2d) Null-Guard: ohne Treffer kein h.id */ const t = await taxonById(h.id) || h; return (await sameHabitat(t)).length >= 0; } },
    ];
  },
};
