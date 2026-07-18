#!/usr/bin/env node
// audit-personas.mjs — „Alternativer Agent-Audit": Alters­gruppen-Simulation.
//
// ZWECK
// Ein reproduzierbarer, agentenbasierter UX-Audit, der die App NICHT (nur) technisch prüft,
// sondern aus der Sicht je einer NUTZER-ALTERSGRUPPE simuliert. Jede Gruppe hat andere
// Erwartungen, Vorwissen und Einschränkungen — was für 20-Jährige selbsterklärend ist, ist
// für 70-Jährige eine versteckte Geste. Der Audit deckt so Verbesserungspotenzial auf in:
//   • Eindeutigkeit der Bedienung   • Darstellung   • Funktionalität
//   • gebotene Features             • Verständlichkeit der Erklärungen (Intro/Hilfe)
//
// Er ergänzt (ersetzt nicht) den Code-Audit und die Feedback-Runden: Code-Audit findet Bugs,
// Feedback bringt echte Nutzerstimmen, dieser Audit findet die BLINDEN FLECKEN pro Zielgruppe,
// bevor sie als Feedback zurückkommen.
//
// SO LÄUFT DER PROZESS (einmal pro Release/vor größeren UI-Änderungen):
//   1) `node scripts/audit-personas.mjs`  → druckt für jede Persona einen fertigen Audit-Brief.
//   2) Jeden Brief an einen eigenen Agenten geben (parallel), der die App aus dieser Alters-
//      sicht „durchspielt". Quelle der Wahrheit für „was sitzt wo" ist USABILITY.md; der Agent
//      darf gezielt in public/index.html nachschlagen. (In Agent-Umgebungen ohne Live-Netz wird
//      aus USABILITY.md + Code auditiert — die externen Such-APIs sind dort ohnehin blockiert,
//      siehe NOTES.md.)
//   3) Die Roh-Erkenntnisse aller Personas einsammeln, deduplizieren (viele Punkte treffen mehr
//      als eine Gruppe → das erhöht die Priorität) und als FBn-Punkte in BACKLOG.md übernehmen.
//
// Der Prozess ist bewusst als Skript festgehalten (nicht als Einmal-Prompt), damit jede Runde
// dieselben Personas/Dimensionen verwendet und die Ergebnisse über Releases vergleichbar sind.
//
// AUFRUF
//   node scripts/audit-personas.mjs            # menschenlesbare Briefs (Default)
//   node scripts/audit-personas.mjs --json     # maschinenlesbar (Personas + Dimensionen)
//   node scripts/audit-personas.mjs --list     # nur die Persona-Namen

// --- Die Audit-Dimensionen (für alle Personas gleich) ---------------------------------------
export const DIMENSIONS = [
  { key: "bedienung",   title: "Eindeutigkeit der Bedienung",
    frage: "Versteht die Gruppe sofort, was zu tun ist? Versteckte Gesten, Icon-only-Knöpfe, Auffindbarkeit, Metaphern (Karte/Space/Flat/Monde)." },
  { key: "darstellung", title: "Darstellung",
    frage: "Lesbarkeit, Schriftgröße, Kontrast, Zielgrößen, Icons, Optik — auch bei Zoom/kleinen Screens." },
  { key: "funktion",    title: "Funktionalität",
    frage: "Funktioniert der erwartete Flow? Reibungspunkte, Verlässlichkeit, verzeihende Bedienung (Undo, Fehlermeldungen). Auch Handy." },
  { key: "features",    title: "Gebotene Features",
    frage: "Fehlt etwas, das diese Gruppe erwartet? Ist etwas überflüssig/überfordernd für sie?" },
  { key: "erklaerung",  title: "Verständlichkeit der Erklärungen",
    frage: "Erklären Intro-Tour und Hilfe die KERNfunktionen (suchen → antippen → hören → merken) — oder verlieren sie sich in Details?" },
];

// --- Die Alters-Personas --------------------------------------------------------------------
export const PERSONAS = [
  { id: "teens", spanne: "13–17",
    titel: "Jugendliche",
    profil: `Digital-native, TikTok/Spotify-sozialisiert, ungeduldig, wenig Lesebereitschaft, erwartet sofortiges „Spielen", Dark Mode, Sharing. Kein Bezug zu „Booking".`,
    fokus: "Erster Eindruck, sofortiges Anhören/Teilen, Handy, Sprache/Jargon." },
  { id: "young", spanne: "18–29",
    titel: "Junge Erwachsene",
    profil: "Konzert-/Festivalgänger, Playlist-Kuratoren, teils selbst in der Szene (kleine Veranstalter/DJs). Technisch fit, neugierig auf Entdeckung, oft am Handy.",
    fokus: "Entdecken/Radar/Streifzug, Teilen, mobile Nutzung, Merken/Lineup." },
  { id: "pro", spanne: "30–49",
    titel: "Erwachsene (Profi-Nutzung)",
    profil: "Booker, Veranstalter, Kuratoren, Journalist:innen. Zielorientiert, wollen exportieren (CSV/Lineup), Notizen/Status pflegen, Szenen/Brücken verstehen. Wenig Geduld für Spielerei.",
    fokus: "Booking-Modus, Effizienz, Export, Vergleich, Verlässlichkeit." },
  { id: "older", spanne: "50–64",
    titel: "Ältere Erwachsene",
    profil: "Weniger technikaffin, funktionale Nutzung, lesen sorgfältiger, verunsichert durch ungewohnte Metaphern. Erwarten klare Beschriftungen, gut sichtbare Knöpfe, verzeihende Bedienung.",
    fokus: "Metaphern, Icon-only-Knöpfe, Auffindbarkeit, Fehlertoleranz." },
  { id: "seniors", spanne: "65+",
    titel: "Senior:innen",
    profil: "Geringe Technik-Erfahrung, mögliche Einschränkungen (Sehkraft, Feinmotorik). Oft Tablet/Handy mit großer Schrift/Zoom, evtl. Screenreader. Brauchen große Zielflächen, hohen Kontrast, einfache lineare Abläufe, keine versteckten Gesten.",
    fokus: "Barrierefreiheit (Tastatur/Screenreader/Listenansicht), Kontrast, Zielgrößen, einfache Sprache." },
];

// --- Brief-Generator ------------------------------------------------------------------------
export function briefFor(p) {
  const dims = DIMENSIONS.map((d, i) => `  ${i + 1}. ${d.title} — ${d.frage}`).join("\n");
  return `Du bist ein UX-Auditor, der die Web-App „like" (Entdeckungs-/Booking-Tool; Einträge als
klickbare Knoten auf einer Zoom-Karte) aus Sicht EINER Altersgruppe simuliert und bewertet.

DEINE PERSONA: ${p.titel} (${p.spanne}).
${p.profil}
Besonderer Fokus: ${p.fokus}

Lies zum Verständnis der App:
  • USABILITY.md            (Funktions-/UI-Referenz — die maßgebliche Quelle, WAS wo sitzt)
  • public/index.html       (Intro-Tour-Slides + Tour-Texte; gezielt weitere Stellen per Grep)

Simuliere den ersten Besuch und die für DEINE Gruppe typischen Aufgaben. Bewerte entlang:
${dims}

Ausgabe: 4–7 priorisierte Erkenntnisse. Je Erkenntnis:
  • kurzer Titel
  • warum es für DIESE Altersgruppe zählt
  • konkreter, umsetzbarer Verbesserungsvorschlag (mit Bezug auf konkrete UI-Elemente/IDs)
  • Schwere (hoch/mittel/niedrig)
Keine Allgemeinplätze. Antworte auf Deutsch. Die finale Antwort IST das Ergebnis (Backlog-Rohdaten).`;
}

// --- CLI ------------------------------------------------------------------------------------
function main() {
  const arg = process.argv[2] || "";
  if (arg === "--json") {
    process.stdout.write(JSON.stringify({ dimensions: DIMENSIONS, personas: PERSONAS }, null, 2) + "\n");
    return;
  }
  if (arg === "--list") {
    for (const p of PERSONAS) process.stdout.write(`${p.id}\t${p.titel} (${p.spanne})\n`);
    return;
  }
  const bar = "=".repeat(90);
  process.stdout.write(`${bar}\nALTERSGRUPPEN-AUDIT „like" — ${PERSONAS.length} Personas × ${DIMENSIONS.length} Dimensionen\n`);
  process.stdout.write(`Jeden Brief an einen eigenen Agenten geben; Erkenntnisse dedupliziert nach BACKLOG.md.\n${bar}\n`);
  for (const p of PERSONAS) {
    process.stdout.write(`\n\n### Persona: ${p.titel} (${p.spanne})  [id=${p.id}]\n${"-".repeat(90)}\n`);
    process.stdout.write(briefFor(p) + "\n");
  }
}

// Nur ausführen, wenn direkt gestartet (nicht bei Import).
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
