// xml.mjs — winziger, toleranter XML-Helfer (zero-dep) für die BoardGameGeek-XMLAPI2.
// Kein voller Parser: nur die Extraktion, die die BGG-Endpunkte brauchen
// (Attribute lesen, wiederholte Tags einsammeln). Reicht für read-only, robust genug.

// alle <tag ...>-Vorkommen als Attribut-Objekte (self-closing oder öffnend).
export function tags(xml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*?)\\/?>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(attrs(m[1]));
  return out;
}

// erstes <tag>…</tag> inkl. Inhalt; gibt { ...attrs, _inner } zurück.
export function firstBlock(xml, tag) {
  const m = new RegExp(`<${tag}\\b([^>]*?)>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  if (!m) return null;
  return { ...attrs(m[1]), _inner: m[2] };
}

// alle <tag>…</tag>-Blöcke.
export function blocks(xml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*?)>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push({ ...attrs(m[1]), _inner: m[2] });
  return out;
}

function attrs(s) {
  const o = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) o[m[1]] = decode(m[2]);
  return o;
}

export function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
