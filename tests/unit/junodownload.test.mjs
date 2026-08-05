// Unit-Tests für den Juno-RSS-Adapter (lib/junodownload.mjs) — rein, netz-frei.
// Das Fixture ist eine gekürzte, aber ORIGINALGETREUE Kopie des Live-Feeds
// https://www.juno.co.uk/deep-house/feeds/rss/ (abgerufen 2026-08-05): beschriftete
// Felder (Title/Artist/Label) in CDATA, Künstler „NACHNAME, Vorname" bzw. per „/" getrennt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJunoRss, cleanArtists, junoSlugFor } from "../../lib/junodownload.mjs";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Juno Records - Deep House</title>
<item><title>CARIDAD VALDEZ, Mayra/GILLES PETERSON'S HAVANA CULTURA BAND - Brownswood Remix Editions 008 (Brownswood) 12"</title>
<link>https://www.juno.co.uk/products/mayra-caridad-valdez-gilles-brownswood-remix-editions-008-vinyl/1165537-01/</link>
<guid isPermaLink="true">https://www.juno.co.uk/products/mayra-caridad-valdez-gilles-brownswood-remix-editions-008-vinyl/1165537-01/</guid>
<pubDate>Thu, 06 Aug 2026 00:00:00 +0100</pubDate>
<description><![CDATA[Title: Brownswood Remix Editions 008<br/>Artist: CARIDAD VALDEZ, Mayra/GILLES PETERSON'S HAVANA CULTURA BAND<br/>Label: Brownswood<br/>Format: 12"<br/><br/>Track listing:<br/>Roforofo Fight<br />]]></description></item>
<item><title>VARIOUS - Jazz House Vibes (Wagram France) 2xLP</title>
<link>https://www.juno.co.uk/products/jazz-house-vibes-the-finest-selection-of-vinyl/1158018-01/</link>
<pubDate>Thu, 06 Aug 2026 00:00:00 +0100</pubDate>
<description><![CDATA[Title: Jazz House Vibes: The Finest Selection Of Jazz House Music<br/>Artist: VARIOUS<br/>Label: Wagram France<br/>Format: 2xLP<br/>]]></description></item>
<item><title>MOUNT KIMBIE/VARIOUS - Fabric Presents Mount Kimbie (Fabric) 2xLP</title>
<link>https://www.juno.co.uk/products/mount-kimbie-fabric-presents-mount-kimbie-vinyl/1171564-01/</link>
<pubDate>Tue, 04 Aug 2026 00:00:00 +0100</pubDate>
<description><![CDATA[Title: Fabric Presents Mount Kimbie<br/>Artist: MOUNT KIMBIE/VARIOUS<br/>Label: Fabric<br/>Format: 2xLP<br/>]]></description></item>
</channel></rss>`;

test("parseJunoRss(): Artist-Feld, Label, Link — reiner Sampler (VARIOUS) fällt raus", () => {
  const rel = parseJunoRss(FEED);
  assert.equal(rel.length, 2); // der reine VARIOUS-Sampler fehlt
  assert.equal(rel[0].title, "Brownswood Remix Editions 008");
  assert.equal(rel[0].label, "Brownswood");
  assert.ok(rel[0].url.startsWith("https://www.juno.co.uk/products/"));
  // „NACHNAME, Vorname" gedreht + Versalien normalisiert; zweiter Act eigener Eintrag
  assert.deepEqual(rel[0].artists, ["Mayra Caridad Valdez", "Gilles Peterson's Havana Cultura Band"]);
  // VARIOUS als MIT-Autor wird entfernt, der echte Act bleibt
  assert.deepEqual(rel[1].artists, ["Mount Kimbie"]);
});

test("cleanArtists(): Sonderfälle — DJ-Kürzel bleiben, Artikel werden normal gesetzt", () => {
  assert.deepEqual(cleanArtists("DJ SEINFELD"), ["DJ Seinfeld"]);
  assert.deepEqual(cleanArtists("THE ORB"), ["The Orb"]);
  assert.deepEqual(cleanArtists("various artists"), []);
  assert.deepEqual(cleanArtists(""), []);
});

test("junoSlugFor(): nur verifizierte Genres mappen, Unbekanntes -> null", () => {
  assert.equal(junoSlugFor(["Deep House"]), "deep-house");
  assert.equal(junoSlugFor(["trip-hop", "house"]), "downtempo"); // erster Treffer gewinnt
  assert.equal(junoSlugFor(["schlager"]), null);
  assert.equal(junoSlugFor([]), null);
});

test("parseJunoRss(): kaputtes/fremdes XML -> leer statt Müll", () => {
  assert.deepEqual(parseJunoRss("<html>not a feed</html>"), []);
  assert.deepEqual(parseJunoRss(""), []);
  // Item ohne Artist-Feld (Formatänderung) wird übersprungen
  const noArtist = `<rss><channel><item><title>X - Y (Z)</title><link>https://j/p/1</link><description><![CDATA[Title: Y<br/>Label: Z<br/>]]></description></item></channel></rss>`;
  assert.deepEqual(parseJunoRss(noArtist), []);
});
