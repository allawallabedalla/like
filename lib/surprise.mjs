// surprise.mjs — „Überrasch mich" für alle Packs (gleiche Mechanik wie im Musik-Pack):
// aus einem kuratierten Seed-Pool ein paar Zufallskandidaten ziehen, ihre Popularität
// prüfen und den KLEINSTEN nehmen -> eher eine echte Entdeckung als der bekannteste
// Treffer. Fällt ohne Netz auf einen einfachen Zufallszug zurück.
export async function surpriseFrom(seeds, popularity, { draws = 4 } = {}) {
  const pick = () => seeds[Math.floor(Math.random() * seeds.length)];
  const cands = new Set();
  while (cands.size < Math.min(draws, seeds.length)) cands.add(pick());
  let best = null, bestP = Infinity;
  for (const name of cands) {
    try {
      const p = await popularity(name);
      if (p != null && p < bestP) { bestP = p; best = name; }
      else if (best == null) best = name;
    } catch { if (best == null) best = name; }
  }
  return best || pick();
}
