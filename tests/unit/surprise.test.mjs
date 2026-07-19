// Unit-Tests für surpriseFrom (lib/surprise.mjs) — rein, ohne Netz.
// Die injizierte popularity()-Funktion ersetzt jede API; mit draws >= Seed-Anzahl werden ALLE
// Seeds zu Kandidaten -> die Zufallsauswahl fällt weg und das Ergebnis wird deterministisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { surpriseFrom } from "../../lib/surprise.mjs";

test("wählt bei vollständiger Kandidatenmenge den Act mit kleinster Popularität", async () => {
  const seeds = ["a", "b", "c"];
  const pop = { a: 30, b: 10, c: 20 };
  const best = await surpriseFrom(seeds, (n) => pop[n], { draws: 5 });
  assert.equal(best, "b"); // kleinste Popularität -> eher echte Entdeckung
});

test("liefert trotzdem einen Seed, wenn popularity durchgehend wirft", async () => {
  const best = await surpriseFrom(["only"], () => { throw new Error("kein Netz"); }, { draws: 3 });
  assert.equal(best, "only");
});

test("liefert einen Seed, wenn popularity durchgehend null zurückgibt", async () => {
  const seeds = ["x", "y"];
  const best = await surpriseFrom(seeds, () => null, { draws: 5 });
  assert.ok(seeds.includes(best));
});

test("Ergebnis ist immer einer der Seeds (Fuzz über viele Läufe)", async () => {
  const seeds = ["a", "b", "c", "d"];
  const pop = { a: 4, b: 3, c: 2, d: 1 };
  for (let i = 0; i < 50; i++) {
    const best = await surpriseFrom(seeds, (n) => pop[n], { draws: 2 });
    assert.ok(seeds.includes(best), `unerwartetes Ergebnis: ${best}`);
  }
});
