// check-packs.mjs — Config-/i18n-Wächter (U-2f) für alle Domänen-Packs.
//
// Zweck: BEVOR gebaut/veröffentlicht wird, statisch sicherstellen, dass jede
// packs/<id>/pack.mjs eine vollständige `config` mitbringt UND ihr EN-Overlay
// (config.en, DE→EN für den Sprach-Umschalter) keine nutzersichtbaren deutschen
// Strings vergisst. Ergänzt check-config.mjs (electron-builder) und smoke.mjs
// (Laufzeit) um die Inhalts-/Übersetzungs-Ebene — zero-dep, in Sekunden.
//
// Grün-Regel: Das Skript läuft auf dem AKTUELLEN Code mit Exit 0 durch. Es meldet
// nur ECHTE Lücken (fehlende Pflichtfelder, unübersetzte deutsche Labels). Bewusst
// nicht gemappte Strings (Eigennamen wie „TMDB", Marken-Titel „Like Music",
// Quellen-Hinweise „(Wikipedia)", englische Lehnwörter wie „Act") werden über eine
// konservative Heuristik als „EN-identisch" akzeptiert und zählen NICHT als Fehler.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKS = readdirSync(join(ROOT, "packs"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// ---- Pflichtfelder ---------------------------------------------------------
// Konservativ abgeleitet aus dem, was ALLE Packs gemeinsam tragen (Schnittmenge
// der config-Keys). Jeder Eintrag: Pfad + erwarteter Typ. „str" = nicht-leerer
// String, „arr1" = nicht-leeres Array, „obj" = Objekt.
const REQUIRED = [
  ["id", "str"],
  ["title", "str"],
  ["item.sing", "str"],
  ["item.plur", "str"],
  ["searchPlaceholder", "str"],
  ["searchTitle", "str"],
  ["goTitle", "str"],
  ["exampleSeed", "str"],
  ["seedChips", "arr1"],
  ["emptyTitle", "str"],
  ["emptyHint", "str"],
  ["edges.similar.label", "str"],
  ["edges.together.label", "str"],
  ["popularity.label", "str"],
  ["genreLabel", "str"],
  ["statuses", "arr1"],
  ["en", "obj"],
];

// ---- Nutzersichtbare, übersetzbare Config-Strings --------------------------
// Die üblichen Label-/Hint-/Titel-/Placeholder-Felder. Für jeden hier gelisteten
// Pfad muss der (falls vorhandene) deutsche String im EN-Overlay stehen ODER
// EN-identisch sein (siehe istEnIdentisch). statuses[].label wird separat geprüft.
const I18N_PATHS = [
  "title", "item.sing", "item.plur",
  "searchPlaceholder", "searchTitle", "goTitle",
  "emptyTitle", "emptyHint",
  "edges.similar.label", "edges.together.label",
  "popularity.label", "popularity.dimLabel", "popularity.dimTitle",
  "genreLabel", "genreFilterPlaceholder",
  "noteLabel", "notePlaceholder", "similarLabel", "togetherLabel",
  "contextLabel", "contextHint", "contextButton", "contextWait",
  "basketLabel", "likeLabel", "activeLabel", "profileLabel",
  "radarTitle", "radarTogetherReason", "previewLabel",
  "key.name", "key.hint",
];

// Kleine Allowlist englischer Klein-Wörter, die als „schon englisch" gelten, auch
// ohne Großbuchstaben (z. B. „like!"). Bewusst knapp gehalten.
const EN_LOWER_OK = new Set(["like", "a", "an", "the", "of", "and", "or", "to", "on", "for", "with", "in", "at", "by", "my", "your"]);

function get(obj, path) {
  return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
}

// Heuristik: Ist der (nicht gemappte) String faktisch schon englisch / ein
// Eigenname / eine Marke, sodass ein DE→EN-Mapping überflüssig ist?
function istEnIdentisch(s) {
  const t = String(s).trim();
  // 1) enthält gar keine Buchstaben (Zahlen, Symbole) → identisch
  if (!/\p{L}/u.test(t)) return true;
  // 2) enthält deutsche Sonderzeichen → braucht garantiert eine Übersetzung
  if (/[äöüßÄÖÜ]/.test(t)) return false;
  // 3) Marken-Titel „Like …" (Like Music, Like Anything, …)
  if (t.startsWith("Like ")) return true;
  // 4) Quellen-Hinweis in Klammern „(Wikipedia)", „(MusicBrainz)" …
  if (/^\(.*\)$/.test(t)) return true;
  // 5) jedes Wort ist ein Eigenname/Marke (irgendein Großbuchstabe: TMDB,
  //    iNaturalist, Last.fm) ODER ein erlaubtes englisches Klein-Wort
  const words = t.split(/\s+/);
  for (const w of words) {
    const letters = w.replace(/[^A-Za-z]/g, "");
    if (letters === "") continue;            // reine Interpunktion
    if (/[A-Z]/.test(w)) continue;           // Groß-/CamelCase → Eigenname/Marke
    if (EN_LOWER_OK.has(letters.toLowerCase())) continue; // erlaubtes EN-Wort
    return false;                            // deutsches Klein-Wort → Übersetzung fehlt
  }
  return true;
}

function typeOk(val, kind) {
  if (kind === "str") return typeof val === "string" && val.trim() !== "";
  if (kind === "arr1") return Array.isArray(val) && val.length > 0;
  if (kind === "obj") return val && typeof val === "object" && !Array.isArray(val);
  return false;
}

async function main() {
  const errors = [];

  for (const id of PACKS) {
    let mod;
    try {
      mod = await import(new URL(`../packs/${id}/pack.mjs`, import.meta.url));
    } catch (e) {
      errors.push(`[${id}] pack.mjs nicht importierbar: ${e.message}`);
      continue;
    }
    const cfg = mod?.default?.config;
    if (!cfg || typeof cfg !== "object") {
      errors.push(`[${id}] kein config-Objekt exportiert`);
      continue;
    }

    // (a) Pflichtfelder
    for (const [path, kind] of REQUIRED) {
      if (!typeOk(get(cfg, path), kind)) {
        errors.push(`[${id}] Pflichtfeld fehlt/ungültig: config.${path} (erwartet ${kind})`);
      }
    }
    // config.id muss zum Ordner passen
    if (typeof cfg.id === "string" && cfg.id !== id) {
      errors.push(`[${id}] config.id="${cfg.id}" passt nicht zum Ordner „${id}"`);
    }
    // statuses: jeder Eintrag braucht value + label
    if (Array.isArray(cfg.statuses)) {
      cfg.statuses.forEach((s, i) => {
        if (!s || typeof s.value !== "string" || typeof s.label !== "string") {
          errors.push(`[${id}] statuses[${i}] braucht {value, label}`);
        }
      });
    }

    // (b) EN-Overlay-Vollständigkeit
    const en = cfg.en && typeof cfg.en === "object" ? cfg.en : {};
    // EN-Werte müssen Strings sein
    for (const [k, v] of Object.entries(en)) {
      if (typeof v !== "string") errors.push(`[${id}] config.en["${k}"] ist kein String`);
    }
    // nutzersichtbare Felder …
    const checkString = (label, s) => {
      if (typeof s !== "string" || s.trim() === "") return;
      if (s in en) return;                 // explizit gemappt
      if (istEnIdentisch(s)) return;       // Eigenname/Marke/schon englisch
      errors.push(`[${id}] EN-Overlay fehlt für ${label}: ${JSON.stringify(s)}`);
    };
    for (const path of I18N_PATHS) checkString(`config.${path}`, get(cfg, path));
    // … plus statuses-Labels
    (cfg.statuses || []).forEach((s, i) => checkString(`config.statuses[${i}].label`, s?.label));
    // Hinweis: config.en darf bewusst MEHR Keys tragen als in der statischen Config
    // vorkommen (Übersetzungen dynamisch gerenderter Strings: Genre-/Vibe-Namen,
    // Abschnitts-Überschriften, Fehlermeldungen). Solche „Extra"-Keys sind KEIN
    // Fehler und werden darum nicht bemängelt.
  }

  if (errors.length) {
    console.error(`✗ Pack-Config-Wächter: ${errors.length} Problem(e)`);
    for (const e of errors) console.error("   " + e);
    process.exit(1);
  }
  console.log(`✓ Pack-Config-Wächter: ${PACKS.length} Packs OK (Pflichtfelder + EN-Overlay vollständig)`);
}

main().catch((e) => { console.error("✗ check-packs:", e.stack || e.message); process.exit(1); });
