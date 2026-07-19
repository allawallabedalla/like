// Unit-Tests für den Datei-Cache (lib/cache.mjs) gegen ein TEMPORÄRES Verzeichnis.
// Wichtig: cache.mjs berechnet sein Verzeichnis EINMAL beim Import aus LIKE_DATA_DIR — deshalb
// setzen wir die ENV VOR dem dynamischen Import und laden das Modul danach.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "like-cache-"));
process.env.LIKE_DATA_DIR = TMP;              // MUSS vor dem Import gesetzt sein
const { cached, pruneCache } = await import("../../lib/cache.mjs");
const CACHE_DIR = join(TMP, "cache");

after(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

test("cached() ruft fn genau einmal und liefert danach den Cache-Wert", async () => {
  let calls = 0;
  const fn = async () => { calls++; return { v: 42 }; };
  const a = await cached("ns", "schlüssel-1", 60_000, fn);
  const b = await cached("ns", "schlüssel-1", 60_000, fn);
  assert.deepEqual(a, { v: 42 });
  assert.deepEqual(b, { v: 42 });
  assert.equal(calls, 1, "zweiter Aufruf muss aus dem Cache kommen");
});

test("cached() memoiert Rejections NICHT — nächster Aufruf versucht es erneut", async () => {
  let calls = 0;
  const fn = async () => { calls++; throw new Error("boom"); };
  await assert.rejects(() => cached("ns", "flaky", 60_000, fn));
  await assert.rejects(() => cached("ns", "flaky", 60_000, fn));
  assert.equal(calls, 2, "eine geworfene fn darf nicht gecached werden");
});

test("cached() ruft fn neu, sobald der TTL abgelaufen ist", async () => {
  let calls = 0;
  const fn = async () => { calls++; return calls; };
  const first = await cached("ns", "ttl", 1, fn); // 1 ms TTL
  await new Promise((r) => setTimeout(r, 5));      // TTL sicher überschreiten
  const second = await cached("ns", "ttl", 1, fn);
  assert.equal(first, 1);
  assert.equal(second, 2, "abgelaufener Cache muss fn erneut aufrufen");
});

test("pruneCache() löscht nur Dateien jenseits des Maximalalters", async () => {
  mkdirSync(CACHE_DIR, { recursive: true });
  const oldFile = join(CACHE_DIR, "alt.json");
  const freshFile = join(CACHE_DIR, "frisch.json");
  writeFileSync(oldFile, "{}");
  writeFileSync(freshFile, "{}");
  // Alte Datei künstlich 10 Tage zurückdatieren.
  const old = Date.now() / 1000 - 10 * 86400;
  utimesSync(oldFile, old, old);

  const removed = await pruneCache(7 * 864e5); // maxAge 7 Tage
  assert.ok(removed >= 1, "mindestens die alte Datei muss entfernt werden");
  const rest = readdirSync(CACHE_DIR);
  assert.ok(rest.includes("frisch.json"), "frische Datei bleibt erhalten");
  assert.ok(!rest.includes("alt.json"), "alte Datei ist gelöscht");
});
