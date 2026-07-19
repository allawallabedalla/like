// Unit-Tests für den toleranten XML-Helfer (lib/xml.mjs) — rein, netz-frei.
// Gegen einen kleinen, festen XML-String: Attribut-Extraktion, Block-Sammlung, Entity-Decode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tags, blocks, firstBlock, decode } from "../../lib/xml.mjs";

// Kleines, BGG-artiges Beispiel-Dokument.
const XML = `<items>
  <item id="1" type="boardgame">
    <name value="Catan &amp; Co" />
    <name value="Die Siedler" />
  </item>
  <item id="2" type="boardgame">
    <name value="Carcassonne" />
  </item>
</items>`;

test("tags() sammelt alle self-closing Tags mit dekodierten Attributen", () => {
  const names = tags(XML, "name");
  assert.equal(names.length, 3);
  // & wurde aus &amp; dekodiert.
  assert.deepEqual(names.map((n) => n.value), ["Catan & Co", "Die Siedler", "Carcassonne"]);
});

test("tags() liest Attribute öffnender (nicht self-closing) Tags", () => {
  const items = tags(XML, "item");
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.id), ["1", "2"]);
  assert.equal(items[0].type, "boardgame");
});

test("tags() für unbekanntes Tag liefert leeres Array", () => {
  assert.deepEqual(tags(XML, "publisher"), []);
});

test("blocks() liefert Attribute plus _inner-Inhalt je Block", () => {
  const items = blocks(XML, "item");
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "1");
  // Der innere Bereich enthält die beiden <name>-Tags des ersten Items.
  assert.match(items[0]._inner, /Catan/);
  assert.match(items[0]._inner, /Die Siedler/);
  // aber NICHT den Inhalt des zweiten Items.
  assert.doesNotMatch(items[0]._inner, /Carcassonne/);
});

test("firstBlock() liefert nur den ersten Treffer, null wenn keiner", () => {
  const first = firstBlock(XML, "item");
  assert.equal(first.id, "1");
  assert.equal(firstBlock(XML, "publisher"), null);
});

test("decode() ersetzt benannte und numerische Entities", () => {
  assert.equal(decode("a &amp; b"), "a & b");
  assert.equal(decode("&lt;tag&gt;"), "<tag>");
  assert.equal(decode("&quot;x&quot; &apos;y&apos;"), '"x" \'y\'');
  assert.equal(decode("&#65;&#66;"), "AB");        // dezimal
  assert.equal(decode("&#x41;&#x42;"), "AB");       // hexadezimal
});

test("decode() ist idempotent für Text ohne Entities", () => {
  assert.equal(decode("plain text 123"), "plain text 123");
});
