// packs/music/pack.mjs — das ursprüngliche like: Künstler-Nachbarschaften.
// Bündelt die Musik-Quellen (Last.fm, RA, Deezer, MusicBrainz, Bandcamp, iTunes,
// Setlist.fm) hinter dem generischen Pack-Interface. Die Logik ist 1:1 aus dem
// alten server.mjs übernommen — Verhalten unverändert.

import { getSimilar, getTopTags, getArtistInfo, searchArtists, searchArtistsDetailed, getTagArtists, clearKeyCache } from "../../lib/lastfm.mjs";
import { coAppearances } from "../../lib/coappear.mjs";
import { relatedArtists, topTrackPreview, trackPreviewSearch, artistByName as dzArtist } from "../../lib/deezer.mjs";
import { previewByName } from "../../lib/itunes.mjs";
import { labelmates, artistByName as mbArtist, namesakes as mbNamesakes } from "../../lib/musicbrainz.mjs";
import { searchBand, discoverTag } from "../../lib/bandcamp.mjs";
import { hasKey as hasSetlistKey, sharedBills } from "../../lib/setlistfm.mjs";

// „Überrasch mich" (Kaltstart): kuratierter Pool eher kleiner/nischiger Acts über viele
// Ecken der elektronischen/instrumentalen Musik. surprise() zieht daraus eine Zufalls-
// stichprobe und nimmt den mit den WENIGSTEN Hörern -> echte Entdeckung, nicht der Hit.
const SURPRISE_SEEDS = [
  "Christian Löffler", "Rival Consoles", "Max Cooper", "Lusine", "Marconi Union", "Loscil",
  "Hania Rani", "Peter Broderick", "Poppy Ackroyd", "Rafael Anton Irisarri", "Benoît Pioulard",
  "GoGo Penguin", "Mammal Hands", "Portico Quartet", "Nubya Garcia", "Alfa Mist", "Emma-Jean Thackray",
  "This Is The Kit", "Novo Amor", "Julie Byrne", "Bill Ryder-Jones", "Ryley Walker", "Aldous Harding",
  "Clark", "Lanark Artefax", "Konx-om-Pax", "Loraine James", "Skee Mask", "upsammy", "Yves De Mey",
  "Vril", "Rrose", "Zenker Brothers", "Refracted", "Sedef Adasi", "Perila", "Purelink",
  "Rodriguez Jr.", "Nicolas Bougaïeff", "Innellea", "Fejká", "Marsh", "Tinlicker", "Yotto",
  "Hammock", "A Winged Victory for the Sullen", "Sophie Hutchings", "Bruno Sanfilippo", "offthesky",
  "Kiasmos", "Fort Romeau", "Roman Flügel", "Hodge", "Batu", "Peverelist", "Facta",
  "Anz", "India Jordan", "Nabihah Iqbal", "Space Afrika", "Actress", "Beatrice Dillon", "Pariah",
  "Shackleton", "Andy Stott", "Demdike Stare", "Karen Gwyer", "Aleksi Perälä", "Bibio", "Gold Panda",
];

export default {
  id: "music",

  key: {
    name: "Last.fm",
    envVar: "LASTFM_API_KEY",
    file: ".lastfm-key",
    pattern: "^[a-f0-9]{32}$",
    createUrl: "https://www.last.fm/api/account/create",
    hint: "Für die Live-Suche braucht like einen kostenlosen Last.fm-API-Key.",
  },
  clearKeyCache,

  config: {
    id: "music",
    title: "Like Music",
    brand: "like",
    item: { sing: "Act", plur: "Acts" },
    searchPlaceholder: "Act suchen…   ( / )",
    searchTitle: "Act bei Last.fm suchen — lädt ähnliche Acts + gemeinsame Auftritte (Taste /)",
    goTitle: "Act laden: ähnlicher Stil + zusammen aufgetreten + Genres",
    exampleSeed: "Bonobo",
    // E8: klickbare Startpunkte im leeren Zustand — bewusst verschiedene Ecken der Karte
    // (Downtempo-Hub, Neoclassical, Bassmusik), damit der erste Klick garantiert trägt.
    seedChips: ["Bonobo", "Hania Rani", "Skee Mask"],
    emptyTitle: "Noch keine Acts auf der Karte",
    emptyHint: "bringt gleich sein Umfeld mit: ähnlicher Stil + zusammen aufgetreten.",
    edges: {
      similar: { label: "ähnlicher Stil (Last.fm)" },
      together: { label: "zusammen aufgetreten (RA)" },
    },
    popularity: { label: "Hörer", big: 20000, dimLabel: "Große dämpfen", dimTitle: "Acts mit ≥20k Last.fm-Hörern abdunkeln (sobald die Hörerzahl geladen ist) — nur die Kleinen leuchten" },
    genreLabel: "Genres",
    genreFilterPlaceholder: "Genre filtern…",
    statuses: [
      { value: "shortlist", label: "Shortlist", color: "#000000" },
      { value: "contacted", label: "angefragt", color: "#ff6a00" },
      { value: "confirmed", label: "bestätigt", color: "#1a9e54" },
      { value: "declined", label: "abgesagt", color: "#9a9a9a" },
    ],
    noteLabel: "Booking-Notiz",
    notePlaceholder: "Kontakt, Agentur, letzte Show, Idee…",
    similarLabel: "Ähnlicher Stil",
    togetherLabel: "Zusammen aufgetreten",
    contextLabel: "Label-Umfeld",
    contextHint: "(MusicBrainz)",
    contextButton: "Label-Kolleg:innen laden",
    contextWait: "Lade Label-Umfeld … (MusicBrainz drosselt auf 1 Anfrage/Sekunde)",
    basketLabel: "Lineup",
    likeLabel: "like!",
    activeLabel: "tritt auf",
    profileLabel: "Last.fm",
    searchLinks: [
      { cls: "yt", label: "YouTube", url: "https://www.youtube.com/results?search_query={Q}+music" },
      { cls: "sp", label: "Spotify", url: "https://open.spotify.com/search/{Q}" },
      { cls: "td", label: "Tidal", url: "https://listen.tidal.com/search?q={Q}" },
    ],
    radarTitle: "Radar — Geheimtipps",
    radarTogetherReason: "hat mit deinem Like gespielt",
    features: { preview: true, radar: true, context: true, active: true, booking: true, tour: true, venues: true, surprise: true, bandcamp: true },
    key: { name: "Last.fm-Key", createUrl: "https://www.last.fm/api/account/create", hint: "Für die Live-Suche braucht like einen kostenlosen Last.fm-API-Key." },
    // EN-Overlay: exakte deutsche Config-Strings -> Englisch (für den Sprach-Umschalter)
    en: {
      "Act suchen…   ( / )": "Search act…   ( / )",
      "Act bei Last.fm suchen — lädt ähnliche Acts + gemeinsame Auftritte (Taste /)": "Search act on Last.fm - loads similar acts + shared gigs (key /)",
      "Act laden: ähnlicher Stil + zusammen aufgetreten + Genres": "Load act: similar style + performed together + genres",
      "Noch keine Acts auf der Karte": "No acts on the map yet",
      "bringt gleich sein Umfeld mit: ähnlicher Stil + zusammen aufgetreten.": "brings its surroundings along: similar style + performed together.",
      "ähnlicher Stil (Last.fm)": "similar style (Last.fm)",
      "zusammen aufgetreten (RA)": "performed together (RA)",
      "Hörer": "Listeners",
      "Große dämpfen": "Dim the big ones",
      "Acts mit ≥20k Last.fm-Hörern abdunkeln (sobald die Hörerzahl geladen ist) — nur die Kleinen leuchten": "Dim acts with ≥20k Last.fm listeners (once the listener count is loaded) - only the small ones glow",
      "Genre filtern…": "Filter genres…",
      "angefragt": "contacted",
      "bestätigt": "confirmed",
      "abgesagt": "declined",
      "Booking-Notiz": "Booking note",
      "Kontakt, Agentur, letzte Show, Idee…": "Contact, agency, last show, idea…",
      "Ähnlicher Stil": "Similar style",
      "Zusammen aufgetreten": "Performed together",
      "Label-Umfeld": "Label context",
      "Label-Kolleg:innen laden": "Load labelmates",
      "Lade Label-Umfeld … (MusicBrainz drosselt auf 1 Anfrage/Sekunde)": "Loading label context … (MusicBrainz throttles to 1 request/second)",
      "tritt auf": "performing",
      "Radar — Geheimtipps": "Radar - hidden gems",
      "hat mit deinem Like gespielt": "played with your like",
      "Last.fm-Key": "Last.fm key",
      "Für die Live-Suche braucht like einen kostenlosen Last.fm-API-Key.": "For live search, like needs a free Last.fm API key.",
    },
  },

  // N1: aus der detaillierten Suche ableiten (gleicher Cache wie suggestMeta -> nur EIN
  // Last.fm-Aufruf je Query). Fällt bei Fehler auf die schlanke Namenssuche zurück.
  async suggest(q) {
    try { const d = await searchArtistsDetailed(q); if (d && d.length) return d.map((x) => x.name); } catch {}
    return searchArtists(q);
  },

  // N1: Zusatzinfos je Vorschlag (Hörerzahl + Last.fm-URL) — die Autocomplete kann so bei
  // mehrdeutigen Namen zeigen, welcher Act gemeint ist. Fällt still auf [] zurück.
  async suggestMeta(q) { try { return await searchArtistsDetailed(q); } catch { return []; } },

  // N1 (Namensvetter-Dialog): alle gleichnamigen Acts mit Unterscheidungs-Info. Genre/Herkunft/
  // Jahre kommen aus MusicBrainz, die Hörerzahl je Identität best-effort aus Last.fm (per MBID,
  // damit die richtige Identität gezählt wird). Nur zurückgeben, wenn es WIRKLICH mehrere sind.
  async namesakes(name) {
    let list = [];
    try { list = await mbNamesakes(name); } catch { return []; }
    if (!list || list.length < 2) return [];
    const out = [];
    for (const c of list) {
      let listeners = null;
      try { const info = await getArtistInfo(c.name, { mbid: c.mbid }); listeners = info?.listeners ?? null; } catch {}
      out.push({ ...c, listeners });
    }
    // stärkste zuerst: bekannte (viele Hörer) oben, Unbekannte darunter
    out.sort((a, b) => (b.listeners || 0) - (a.listeners || 0));
    return out;
  },

  // Leichter „ähnlich"-Zugriff für die Brücke (nur getSimilar, ohne RA/Genres).
  async similar(name, { limit = 60 } = {}) {
    const r = await getSimilar(name, { limit });
    return { canonical: r.sourceName, similar: r.similar.map((s) => ({ name: s.name, url: s.url, mbid: s.mbid || null, match: s.match || 0.5 })) };
  },

  // BREITE Nachbarschaft NUR für die Brücke (Routenplaner): ähnlicher Stil (Last.fm)
  // PLUS „zusammen aufgetreten" (RA/Songkick/Setlist.fm). Erst dadurch findet die Brücke
  // Verbindungen über GETEILTE BÜHNEN statt nur über Klang — das Booking-Signal von Like
  // Music: Ketten wie „A —spielte mit— X —ähnlich— B" werden möglich, die reine Stil-
  // Ähnlichkeit nie zusammenbringt. Die Auftritts-Quelle ist langsamer/wackliger als
  // Last.fm, kommt darum „best effort" dazu und fällt bei Störung sauber auf reine
  // Stil-Nachbarn zurück (kein Ausbremsen der Suche). Naben (Mega-Acts/Festivals, mit
  // denen fast jeder gespielt hat) werden NICHT hier, sondern beim RANKING gedämpft:
  // bridgeResult reichert die Kandidaten mit `listeners` an, und der „klein/spannend"-
  // Regler (bridgeRanked) wertet Große ab — so bleibt die Suche billig (keine Extra-
  // Hörer-Abfrage pro expandiertem Knoten).
  async bridgeNeighbors(name, { limit = 40 } = {}) {
    const [simR, coR] = await Promise.all([
      getSimilar(name, { limit: Math.min(limit, 50) }).catch(() => null),
      coAppearances(name).catch(() => null),
    ]);
    const out = [], seen = new Set([name.toLowerCase()]);
    const add = (nm, url, match) => { const k = String(nm || "").toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ name: nm, url: url || null, match }); };
    let canonical = name;
    if (simR) {
      canonical = simR.sourceName || name; seen.add(canonical.toLowerCase());
      for (const s of simR.similar) add(s.name, s.url, s.match || 0.5); // Last.fm-Match 0..1
    }
    // Auftritts-Nachbarn: mehr geteilte Shows = stärkere Verbindung. Solide gewichtet,
    // knapp unter perfekter Stil-Ähnlichkeit, damit beide Straßen fair zusammenspielen.
    for (const c of (coR?.coacts || []).slice(0, 25)) {
      const shows = Array.isArray(c.shows) ? c.shows.length : (c.weight || 1);
      add(c.name, null, Math.min(0.85, 0.5 + 0.1 * shows));
    }
    return { canonical, list: out };
  },

  // FB15/#72: Bandcamp-„Geheimtipps" — kleine Acts, die oft NUR auf Bandcamp existieren, als
  // Eckverbinder an einen vorhandenen Act hängen (über dessen Genres via Bandcamp-Genre-Discovery).
  // Bewusst NUR auf Anfrage aufgerufen (lazy, opt-in) — nie im normalen explore()-/radar-Pfad, damit
  // Default-Nutzung keinerlei Bandcamp-Kosten trägt. Liefert View-only-Blätter (kein Last.fm → nicht
  // weiter erkundbar; im Panel „auf Bandcamp öffnen"). Defensiv: Bandcamp aus/Genre leer -> [].
  async bandcampNeighbors(name, { genres = [], limit = 8 } = {}) {
    const tags = (genres || []).map((g) => String(g || "").toLowerCase().trim()).filter(Boolean).slice(0, 2);
    if (!tags.length) return [];
    const seen = new Set([String(name || "").toLowerCase()]);
    const out = [];
    for (const tag of tags) {
      let items = [];
      try { items = await discoverTag(tag, { limit: Math.ceil(limit / tags.length) + 2 }); } catch { items = []; }
      for (const it of items) {
        const k = String(it.artist || "").toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push({ name: it.artist, url: it.url || null, genre: it.genre });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    return out;
  },

  // R14 — zweiphasiger Ausbau: Phase 1 (schnell, ~0,7-1 s) liefert Last.fm-Identität +
  // ähnlichen Stil + Tags; Phase 2 (langsam, RA-Kette) reicht "zusammen aufgetreten" +
  // kuratierte Genres + Booking nach. pack.explore() bleibt unverändert für Prefetch/
  // Brücke/Cross-Pack — und wärmt über cached() BEIDE Phasen vor.
  async exploreFast(name, { mbid } = {}) {
    let canonical = name, similar = [], tags = [];
    try { const r = await getSimilar(name, { limit: 30, mbid }); canonical = r.sourceName; similar = r.similar; }
    catch (e) { if (/API-Key/i.test(e.message)) throw e; /* sonst: nicht bei Last.fm */ }
    try { tags = await getTopTags(canonical, { mbid }); } catch {}
    return {
      canonical,
      genres: tags.slice(0, 6), // vorläufig nur Tags — Phase 2 mischt RA-Genres davor
      similarSource: "lastfm",
      similar: similar.slice(0, 25).map((s) => ({ name: s.name, url: s.url, mbid: s.mbid || null, match: s.match || 0.5 })),
      together: [],
    };
  },
  async exploreTogether(canonical) {
    const ca = await coAppearances(canonical); // degradiert bei Quellen-Fehlern selbst (sources leer)
    return {
      together: ca.coacts.slice(0, 25).map((c) => ({ name: c.name, weight: c.weight, shows: c.shows })),
      togetherSource: ca.sources.join("+") || "ra",
      genres: ca.genres.slice(0, 6), // kuratierte RA-Genres — der Server mischt sie VOR die Tags
      meta: ca.booking || null,
      active: ca.booking ? ca.booking.upcoming > 0 : undefined,
      sources: ca.sources,
    };
  },

  // Haupt-Flow: Last.fm bestimmt Identität + ähnlichen Stil, RA (+ optionale Quellen)
  // liefert "zusammen aufgetreten" + kuratierte Genres + Booking-Steckbrief.
  async explore(name, { mbid } = {}) {
    let canonical = name, similar = [], coacts = [], raGenres = [], tags = [], sources = [];
    try { const r = await getSimilar(name, { limit: 30, mbid }); canonical = r.sourceName; similar = r.similar; }
    catch (e) { if (/API-Key/i.test(e.message)) throw e; /* sonst: nicht bei Last.fm */ }
    // Tags (Last.fm) und Co-Auftritte (RA) brauchen beide nur `canonical` und treffen
    // GETRENNTE Hosts/Gates — parallel statt seriell spart ~370-500 ms pro kaltem Ausbau
    // (Taskforce R13). Schluck-Semantik wie vorher: jeder Zweig scheitert für sich still;
    // die Genre-Mischreihenfolge (RA vor Tags, unten) bleibt unverändert.
    let booking = null;
    const [tagsR, caR] = await Promise.allSettled([getTopTags(canonical, { mbid }), coAppearances(canonical)]);
    if (tagsR.status === "fulfilled") tags = tagsR.value;
    if (caR.status === "fulfilled") { const ca = caR.value; coacts = ca.coacts; raGenres = ca.genres; sources = ca.sources; booking = ca.booking; }

    const genres = [], seenG = new Set();
    for (const x of [...raGenres, ...tags]) { const k = x.toLowerCase(); if (!seenG.has(k)) { seenG.add(k); genres.push(x); } }

    return {
      canonical,
      genres: genres.slice(0, 6),
      similarSource: "lastfm",
      similar: similar.slice(0, 25).map((s) => ({ name: s.name, url: s.url, mbid: s.mbid || null, match: s.match || 0.5 })),
      together: coacts.slice(0, 25).map((c) => ({ name: c.name, weight: c.weight, shows: c.shows })),
      togetherSource: sources.join("+") || "ra",
      meta: booking || null,
      active: booking ? booking.upcoming > 0 : undefined,
      sources,
    };
  },

  async enrich(a) {
    const out = {};
    // mbid (aus getSimilar mitgeführt) löst Namensvetter auf: ein als „ähnlich zu David Guetta"
    // entdecktes „Majestic" (House) bekommt so seine House-Genres/Hörer statt die der
    // gleichnamigen Metal-Band, die eine reine Namenssuche liefern würde.
    const mbid = a.mbid || undefined;
    if (!a.genres || !a.genres.length) {
      try { const t = await getTopTags(a.name, { mbid }); if (t.length) out.genres = t; } catch {}
    }
    try { const info = await getArtistInfo(a.name, { mbid }); if (info?.listeners) out.popularity = info.listeners; } catch {}
    if (!a.booking?.area && !a.bcLocation) {
      try { const b = await searchBand(a.name); if (b?.location) { out.location = b.location; out.locationUrl = b.url; } } catch {}
    }
    return out;
  },

  async popularity(name, { mbid } = {}) {
    const info = await getArtistInfo(name, { mbid });
    return info?.listeners || null;
  },

  // Klangprobe über mehrere Quellen, in Reihenfolge steigender „Breite", jede streng am
  // Künstlernamen verankert (nie ein fremder Act): Deezer-Top-Track → Deezer-Track-Suche
  // (falls /top leer) → iTunes (zwei Anläufe). So gibt es deutlich seltener „keine Vorschau".
  async preview(name, opts = {}) {
    const listeners = opts.listeners ?? null;
    // Plausi (C6): ist der Act auf Last.fm klein, der gefundene Deezer-Treffer aber ein Mega-Act,
    // handelt es sich fast sicher um einen berühmten NAMENSVETTER (anderes Genre). Dann lieber KEINE
    // Klangprobe als die eines fremden Acts — und auch nicht auf einen namensgleichen Fallback ausweichen.
    const plausibleFans = (fans) => fans == null || listeners == null || !(listeners < 20000 && fans > 300000);
    try {
      const p = await topTrackPreview(name);
      if (p?.url) return plausibleFans(p.fans) ? p : null; // unplausibel -> gar keine (kein fremder Fallback)
    } catch {}
    for (const fn of [trackPreviewSearch, previewByName]) {
      try { const p = await fn(name); if (p?.url) return p; } catch {}
    }
    return null;
  },

  // „Überrasch mich" (Kaltstart, leere Seite): 4 Zufallskandidaten aus dem Pool ziehen,
  // ihre Hörerzahl prüfen und den mit den WENIGSTEN nehmen -> eher ein Geheimtipp.
  // Fällt ohne Netz/Key auf einen einfachen Zufallszug zurück.
  async surprise({ genre } = {}) {
    // FB14/#74: Mit Genre -> ein eher unbekannter Act AUS diesem Genre (Last.fm tag.gettopartists,
    // nach Popularität sortiert). Aus der hinteren Hälfte der Liste ziehen = Geheimtipp statt Chart-
    // Hit, aber garantiert über Last.fm ladbar. Ohne Genre bzw. bei leerem Ergebnis: Seed-Pool wie bisher.
    const g = String(genre || "").trim();
    if (g) {
      try {
        const arr = await getTagArtists(g, { limit: 60 });
        if (arr.length) {
          const tail = arr.slice(Math.floor(arr.length / 2)); // populärste Hälfte weglassen
          const pool = tail.length ? tail : arr;
          return pool[Math.floor(Math.random() * pool.length)].name;
        }
      } catch {}
      // kein Treffer fürs Genre -> auf den normalen Zufallszug zurückfallen
    }
    const pick = () => SURPRISE_SEEDS[Math.floor(Math.random() * SURPRISE_SEEDS.length)];
    const cands = new Set(); while (cands.size < 4) cands.add(pick());
    let best = null, bestL = Infinity;
    for (const name of cands) {
      try {
        const info = await getArtistInfo(name);
        const l = info?.listeners;
        if (l != null && l < bestL) { bestL = l; best = name; }
        else if (best == null) best = name;
      } catch { if (best == null) best = name; }
    }
    return best || pick();
  },

  // Label-Umfeld (MusicBrainz): Labels + wer dort noch veröffentlicht.
  async context(name) {
    const r = await labelmates(name);
    if (!r.mates?.length) return { groups: [] };
    return {
      note: r.labels?.length ? "Labels: " + r.labels.map((l) => l.name).join(", ") : null,
      groups: [{
        label: "Label-Kolleg:innen",
        items: r.mates.map((m) => ({ name: m.name, sub: m.label + (m.releases > 1 ? ` · ${m.releases} Releases` : "") })),
      }],
    };
  },

  // Radar-Zusatzkandidaten: Deezer-Related der Top-Likes + frische Bandcamp-Releases
  // in den dominanten Genres — bringt Namen, die noch gar nicht auf der Karte sind.
  async radarExtras({ topLikeNames, topGenres, isKnown }) {
    const out = [], seenNew = new Set();
    for (const likeName of topLikeNames) {
      try {
        for (const r of await relatedArtists(likeName, { limit: 20 })) {
          const k = r.name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (isKnown(k) || seenNew.has(k)) continue;
          seenNew.add(k);
          const reasons = [`Deezer-Nachbar von ${likeName}`];
          if (r.fans != null) reasons.push(`${r.fans >= 1000 ? Math.round(r.fans / 1000) + "k" : r.fans} Fans`);
          reasons.push("noch nicht auf deiner Karte");
          const small = r.fans == null ? 0.5 : r.fans < 3000 ? 1 : r.fans < 10000 ? 0.85 : r.fans < 30000 ? 0.65 : r.fans < 100000 ? 0.4 : r.fans < 300000 ? 0.2 : 0.08;
          out.push({ name: r.name, score: 0.55 * small, reasons, url: r.link });
        }
      } catch { /* Deezer down -> weiter */ }
    }
    for (const tag of topGenres) {
      try {
        for (const it of await discoverTag(tag, { limit: 8 })) {
          const k = it.artist.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (isKnown(k) || seenNew.has(k)) continue;
          seenNew.add(k);
          out.push({
            name: it.artist, score: 0.45, url: it.url,
            reasons: [`frisch auf Bandcamp (${it.genre})`, it.title ? `Release: „${it.title}"` : null, "noch nicht auf deiner Karte"].filter(Boolean),
          });
        }
      } catch { /* Bandcamp aus -> weiter */ }
    }
    return out;
  },

  async diag() {
    const T = "Radiohead";
    const setlistNote = (await hasSetlistKey()) ? "" : "kein Key (optional)";
    return [
      { name: "Last.fm", probe: async () => (await getArtistInfo(T))?.listeners > 0 },
      { name: "Deezer", probe: async () => !!(await dzArtist(T)) },
      { name: "MusicBrainz", probe: async () => !!(await mbArtist(T)) },
      { name: "Bandcamp", probe: async () => { await discoverTag("ambient", { limit: 1 }); return true; } },
      { name: "iTunes", probe: async () => !!(await previewByName(T)) },
      { name: "Setlist.fm", probe: async () => (await hasSetlistKey()) ? !!(await sharedBills(T)) : true, note: setlistNote },
    ];
  },
};
