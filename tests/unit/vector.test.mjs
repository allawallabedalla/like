// Unit-Tests für den Merkmalsvektor-Index (lib/vector.mjs) — rein, ohne ML/Netz.
// tokenize / featureVec / cosine / featureSim gegen kleine, deterministische Eingaben.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, featureVec, cosine, featureSim } from "../../lib/vector.mjs";

test("tokenize() normalisiert: klein, akzentfrei, ohne kurze Tokens & Stoppwörter", () => {
  // "The" ist Stoppwort, "of" hat <3 Zeichen -> beide raus. Akzente werden entfernt (Café->cafe).
  const toks = tokenize("The Café of Deep House");
  assert.deepEqual(toks, ["cafe", "deep", "house"]);
});

test("tokenize() entfernt Akzente VOR dem Stoppwort-Check (Umlaut-Stoppwörter greifen nicht)", () => {
  // Bewusst dokumentiert: "für" steht in der Stoppwort-Liste, wird aber zu "fur" normalisiert
  // und passt daher NICHT mehr — es überlebt. (Tatsächliches Verhalten, kein Wunschdenken.)
  assert.deepEqual(tokenize("für"), ["fur"]);
});

test("tokenize() zerlegt Mehrwort-Merkmale an Nicht-Alphanumerik", () => {
  assert.deepEqual(tokenize("Deep House"), ["deep", "house"]);
  assert.deepEqual(tokenize("hip-hop/rap"), ["hip", "hop", "rap"]);
});

test("tokenize() für leere/nullige Eingabe liefert leeres Array", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test("featureVec() zählt Token-Häufigkeiten über die Merkmalsliste", () => {
  const v = featureVec(["Deep House", "House", "Techno"]);
  assert.equal(v.get("house"), 2);
  assert.equal(v.get("deep"), 1);
  assert.equal(v.get("techno"), 1);
  assert.equal(v.get("gibtsnicht"), undefined);
});

test("cosine() ist 1 für identische Vektoren (bis auf Gleitkomma-Rauschen)", () => {
  const a = featureVec(["techno", "house"]);
  const b = featureVec(["house", "techno"]);
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
});

test("cosine() ist 0 bei komplett disjunkten oder leeren Vektoren", () => {
  const a = featureVec(["techno"]);
  const b = featureVec(["jazz"]);
  assert.equal(cosine(a, b), 0);
  assert.equal(cosine(featureVec([]), a), 0); // leerer Vektor
});

test("cosine() liegt für teilweise Überlappung echt zwischen 0 und 1", () => {
  const a = featureVec(["deep", "house"]);
  const b = featureVec(["deep", "techno"]);
  const s = cosine(a, b);
  assert.ok(s > 0 && s < 1, `erwartet 0<s<1, war ${s}`);
  // Ein gemeinsames von je zwei Tokens gleicher Gewichtung -> exakt 0.5.
  assert.ok(Math.abs(s - 0.5) < 1e-9, `erwartet ~0.5, war ${s}`);
});

test("cosine() ist symmetrisch", () => {
  const a = featureVec(["deep", "house", "minimal"]);
  const b = featureVec(["deep", "techno"]);
  assert.equal(cosine(a, b), cosine(b, a));
});

test("featureSim() ist die Kurzform cosine(featureVec, featureVec)", () => {
  const fa = ["Deep House", "Minimal"];
  const fb = ["Deep Techno"];
  assert.equal(featureSim(fa, fb), cosine(featureVec(fa), featureVec(fb)));
});
