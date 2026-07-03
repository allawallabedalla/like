#!/usr/bin/env node
// serve-docs.mjs — den statischen Export (docs/) lokal ansehen, ohne Backend.
// Serviert auch die Pack-Unterordner (docs/books/, docs/plants/ …).
//   node serve-docs.mjs   -> http://localhost:5174
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, sep } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DOCS = join(ROOT, "docs");
const PORT = process.env.PORT || 5174;

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    // Pfad einsperren: alles außerhalb von docs/ ist tabu (../-Tricks abwehren)
    const file = normalize(join(DOCS, p));
    if (!file.startsWith(DOCS + sep) && file !== join(DOCS, "index.html")) {
      res.writeHead(403); return res.end("verboten");
    }
    const body = await readFile(file);
    const type = file.endsWith(".html") ? "text/html; charset=utf-8"
      : file.endsWith(".json") ? "application/json"
      : file.endsWith(".png") ? "image/png" : "text/plain; charset=utf-8";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("Nicht gefunden – erst: node export-static.mjs --all");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Statische Vorschau auf http://localhost:${PORT}`));
