#!/usr/bin/env node
// gen-icon.mjs — erzeugt das App-Icon (build/icon.png, 1024×1024) ohne Abhängigkeiten:
// Pixel werden per Distanzfunktionen (Kreis/Segment/abgerundetes Quadrat) mit weichem
// Rand gerechnet und als PNG (zlib aus Node) geschrieben. Motiv = Mini-Graph im
// App-Design: schwarzer Haupt-Knoten, graue Nachbarn, blaue + orange Kante.
// Danach: scripts/make-icns.sh baut daraus build/icon.icns (sips + iconutil, macOS).
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const S = 1024;
const px = new Uint8Array(S * S * 4);

// ---- Distanzfunktionen (negativ = innen) ----
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function sdRoundRect(x, y, cx, cy, hw, hh, rad) {
  const qx = Math.abs(x - cx) - (hw - rad), qy = Math.abs(y - cy) - (hh - rad);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}
function sdCircle(x, y, cx, cy, r) { return Math.hypot(x - cx, y - cy) - r; }
function sdSegment(x, y, ax, ay, bx, by, halfw) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - halfw;
}
const cov = (d) => clamp(0.5 - d / 1.5, 0, 1); // ~1.5px weicher Rand

// ---- Ebenen (werden der Reihe nach übergemalt) ----
const layers = [
  { d: (x, y) => sdRoundRect(x, y, 512, 512, 448, 448, 200), c: [226, 226, 226, 255] }, // Rand
  { d: (x, y) => sdRoundRect(x, y, 512, 512, 442, 442, 195), c: [255, 255, 255, 255] }, // Fläche
  { d: (x, y) => sdSegment(x, y, 400, 600, 712, 352, 16), c: [47, 109, 246, 255] },     // Kante: ähnlich
  { d: (x, y) => sdSegment(x, y, 400, 600, 688, 748, 16), c: [255, 106, 0, 255] },      // Kante: zusammen
  { d: (x, y) => sdCircle(x, y, 712, 352, 104), c: [179, 179, 179, 255] },              // Nachbar
  { d: (x, y) => sdCircle(x, y, 688, 748, 76), c: [179, 179, 179, 255] },               // Nachbar
  { d: (x, y) => sdCircle(x, y, 400, 600, 170), c: [0, 0, 0, 255] },                    // Haupt-Act
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const L of layers) {
      const c = cov(L.d(x + 0.5, y + 0.5));
      if (c <= 0) continue;
      const la = (L.c[3] / 255) * c;
      r = L.c[0] * la + r * (1 - la);
      g = L.c[1] * la + g * (1 - la);
      b = L.c[2] * la + b * (1 - la);
      a = la * 255 + a * (1 - la);
    }
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
}

// ---- PNG schreiben ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // Filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", png);
console.log("✓ build/icon.png geschrieben (1024×1024)");
