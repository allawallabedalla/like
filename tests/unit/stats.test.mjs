// Unit-Tests für die reinen Momentum-Funktionen (lib/stats.mjs).
// addSnapshot / growthPerMonth bekommen `now` injiziert -> deterministisch, netz- & datei-frei.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addSnapshot, growthPerMonth } from "../../lib/stats.mjs";

const DAY = 864e5;

test("addSnapshot() hängt ersten Snapshot an und meldet Änderung", () => {
  const stats = {};
  const changed = addSnapshot(stats, "act", 100, 0);
  assert.equal(changed, true);
  assert.deepEqual(stats.act, [{ t: 0, l: 100 }]);
});

test("addSnapshot() ignoriert nicht-positive Hörerzahlen", () => {
  const stats = {};
  assert.equal(addSnapshot(stats, "act", 0, 0), false);
  assert.equal(addSnapshot(stats, "act", -5, 0), false);
  assert.equal(stats.act, undefined);
});

test("addSnapshot() dedupliziert innerhalb des Mindestabstands (5 Tage)", () => {
  const stats = {};
  addSnapshot(stats, "act", 100, 0);
  // 4 Tage später -> zu früh, kein neuer Punkt.
  assert.equal(addSnapshot(stats, "act", 120, 4 * DAY), false);
  assert.equal(stats.act.length, 1);
  // 6 Tage später -> jenseits des Mindestabstands, neuer Punkt.
  assert.equal(addSnapshot(stats, "act", 120, 6 * DAY), true);
  assert.equal(stats.act.length, 2);
});

test("growthPerMonth() ist null bei zu kurzer Historie", () => {
  assert.equal(growthPerMonth({}, "act", 0), null);
  assert.equal(growthPerMonth({ act: [{ t: 0, l: 100 }] }, "act", 0), null);
});

test("growthPerMonth() ist null wenn Spannweite unter 12 Tagen liegt", () => {
  const now = 100 * DAY;
  const stats = { act: [{ t: now - 5 * DAY, l: 100 }, { t: now, l: 150 }] };
  assert.equal(growthPerMonth(stats, "act", now), null);
});

test("growthPerMonth() normiert Wachstum auf %/30 Tage", () => {
  const now = 100 * DAY;
  // +50% über exakt 30 Tage -> 50 %/Monat.
  const stats = { act: [{ t: now - 30 * DAY, l: 100 }, { t: now, l: 150 }] };
  assert.equal(growthPerMonth(stats, "act", now), 50);
});

test("growthPerMonth() erkennt auch Rückgang (negatives Wachstum)", () => {
  const now = 100 * DAY;
  // -20% über 30 Tage -> -20 %/Monat.
  const stats = { act: [{ t: now - 30 * DAY, l: 100 }, { t: now, l: 80 }] };
  assert.equal(growthPerMonth(stats, "act", now), -20);
});
