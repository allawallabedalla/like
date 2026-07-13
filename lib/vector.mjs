// vector.mjs — winziger „Merkmalsvektor"-Index ohne ML (B4). Aus einer Merkmalsliste
// (Genres, Tags, Kategorien, Titel-Tokens …) einen dünnen Häufigkeitsvektor bilden und per
// Cosinus-Ähnlichkeit eine semantische Nähe messen — key- und dependency-frei, rein Zählen.
// Grundlage, um zu bewerten, ob ein Zwischen-Eintrag thematisch zu beiden Brücken-Enden passt
// (Kohärenz), und später für einen wachsenden Index der erkundeten Nachbarschaft.

// Kleine Stoppwort-Liste (DE/EN) — generische Füllwörter tragen kein Thema.
const STOP = new Set(["the", "and", "for", "der", "die", "das", "und", "für", "von", "mit", "des", "los", "las"]);

// Merkmals-String -> Tokens (kleingeschrieben, akzentfrei, ≥3 Zeichen, ohne Stoppwörter).
// Mehrwort-Merkmale werden zerlegt, sodass „Deep House" und „House" überlappen.
export function tokenize(str) {
  return String(str || "")
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// Merkmalsliste (Strings) -> Map token->Gewicht (Häufigkeit).
export function featureVec(features = []) {
  const v = new Map();
  for (const f of features) for (const t of tokenize(f)) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

// Cosinus-Ähnlichkeit zweier Häufigkeitsvektoren (0..1). Leer -> 0.
export function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) { const w2 = big.get(t); if (w2) dot += w * w2; }
  let na = 0, nb = 0;
  for (const w of a.values()) na += w * w;
  for (const w of b.values()) nb += w * w;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

// Bequemlichkeit: Cosinus direkt aus zwei Merkmalslisten.
export function featureSim(fa, fb) { return cosine(featureVec(fa), featureVec(fb)); }
