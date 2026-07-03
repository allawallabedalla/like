# Demo-Graph-Format (packs/<id>/demo.json)

Kuratierter Mini-Graph für die statische Preview (GitHub Pages). Read-only —
nur zum Anschauen/Klicken/Filtern, keine Live-Suche.

Struktur = derselbe Graph wie `graph.json`:

```json
{
  "meta": { "version": 1, "demo": true },
  "artists": {
    "<id>": { "id": "<id>", "name": "…", "seed": true, "genres": ["…"], "listeners": 1234, "url": "https://…" }
  },
  "edges": [
    { "from": "<id>", "to": "<id>", "type": "similar", "weight": 0.7, "source": "demo" },
    { "from": "<id>", "to": "<id>", "type": "together", "weight": 2, "source": "demo" }
  ]
}
```

IDs sind Slugs (kleingeschrieben). `type` ist `similar` (blau) oder `together` (orange).
`seed: true` färbt den Knoten als „gesucht". `listeners` = Popularitätszahl des Packs.
Wird von `export-static.mjs --pack=<id>` in die Preview injiziert.
