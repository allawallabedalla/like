#!/usr/bin/env node
// serve-docs.mjs — den statischen Export (docs/) lokal ansehen, ohne Backend.
//   node serve-docs.mjs   -> http://localhost:5174
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5174;
createServer(async (req, res) => {
  try {
    const html = await readFile(join(ROOT, "docs", "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    res.writeHead(404); res.end("docs/ fehlt – erst: node export-static.mjs");
  }
}).listen(PORT, () => console.log(`Statische Vorschau auf http://localhost:${PORT}`));
