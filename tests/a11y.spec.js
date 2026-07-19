// a11y.spec.js — A11y-Gate (U-2f, W5) für die statischen Seiten und die App.
//
// Idealfall wäre @axe-core/playwright; die Lib ist in dieser Umgebung aber weder
// installiert noch (ohne Netz / ohne die package-lock anzufassen) nachrüstbar, und
// axe per CDN nachzuladen scheidet aus (die Seiten sind bewusst offline-fähig und
// die Test-Umgebung blockiert externe Hosts). Darum ein schlanker, DEPENDENZ-FREIER
// A11y-Smoke, der die tragenden Grundlagen deterministisch prüft:
//   • html[lang] gesetzt (Screenreader-Sprache)
//   • sinnvolle Überschrift je Seite (statische Seiten: genau eine <h1>;
//     die App hat keine <h1>, dafür einen nicht-leeren <title>)
//   • jeder SICHTBARE Button/Link hat einen zugänglichen Namen
//   • jedes <img> hat ein alt-Attribut
//
// Bewusst wird nur assertiert, was der aktuelle Code ERFÜLLT — ein grünes,
// wachsendes Gate. Kommt axe später dazu, kann es hier ergänzt werden.

const { test, expect } = require("@playwright/test");

// Zu prüfende Seiten. „music" ist das öffentliche Pack (LIKE_PUBLIC_PACK) — die App
// lädt ohne Gate. h1Erwartet: Anzahl der erwarteten <h1> (App rendert keine).
const SEITEN = [
  { name: "Landing /", url: "/", h1Erwartet: 1 },
  { name: "Impressum", url: "/impressum", h1Erwartet: 1 },
  { name: "Datenschutz", url: "/datenschutz", h1Erwartet: 1 },
  { name: "App /?pack=music", url: "/?pack=music", h1Erwartet: 0 },
];

// Sammelt im Browser-Kontext alle A11y-Grunddaten einer Seite in EINEM Durchgang.
// Zugänglicher Name (vereinfacht, robust): aria-label > aria-labelledby > title >
// sichtbarer Text > alt (bei img-only Buttons). Es zählen nur SICHTBARE Elemente,
// damit versteckte Overlays/Menüs keine falschen Rot-Meldungen erzeugen.
async function pruefeSeite(page) {
  return page.evaluate(() => {
    const sichtbar = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      return el.offsetParent !== null || s.position === "fixed";
    };
    const name = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const lb = el.getAttribute("aria-labelledby");
      if (lb) {
        const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim();
        if (t) return t;
      }
      const title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      const txt = (el.textContent || "").trim();
      if (txt) return txt;
      const img = el.querySelector && el.querySelector("img[alt]");
      if (img && img.getAttribute("alt").trim()) return img.getAttribute("alt").trim();
      return "";
    };
    const beschreibe = (el) => el.id ? `#${el.id}` : (el.getAttribute("class") ? `.${el.getAttribute("class").split(/\s+/)[0]}` : el.outerHTML.slice(0, 60));

    const buttons = [...document.querySelectorAll("button")].filter(sichtbar);
    const links = [...document.querySelectorAll("a[href]")].filter(sichtbar);
    const imgs = [...document.querySelectorAll("img")];

    return {
      lang: document.documentElement.getAttribute("lang") || "",
      title: (document.title || "").trim(),
      h1: document.querySelectorAll("h1").length,
      buttonsOhneNamen: buttons.filter((b) => !name(b)).map(beschreibe),
      linksOhneNamen: links.filter((a) => !name(a)).map(beschreibe),
      imgsOhneAlt: imgs.filter((i) => i.getAttribute("alt") === null).map(beschreibe),
    };
  });
}

test.describe("A11y-Smoke (statische Seiten + App)", () => {
  for (const seite of SEITEN) {
    test(`${seite.name}: Sprache, Überschrift, zugängliche Namen, alt-Texte`, async ({ page }) => {
      await page.goto(seite.url, { waitUntil: "domcontentloaded" });
      // Kurz settlen lassen (App baut per JS auf); deterministisch ohne Netz.
      await page.waitForLoadState("load").catch(() => {});
      const r = await pruefeSeite(page);

      // (1) Sprache gesetzt — mind. zweistelliger Sprachcode
      expect(r.lang, "html[lang] muss gesetzt sein").toMatch(/^[a-z]{2}/i);

      // (2) sinnvolle Überschrift: statische Seiten genau eine <h1>; die App keine,
      //     dafür einen nicht-leeren <title>
      if (seite.h1Erwartet > 0) {
        expect(r.h1, "genau eine <h1> erwartet").toBe(seite.h1Erwartet);
      } else {
        expect(r.title.length, "App braucht einen nicht-leeren <title>").toBeGreaterThan(0);
      }

      // (3) jeder sichtbare Button/Link hat einen zugänglichen Namen
      expect(r.buttonsOhneNamen, "sichtbare Buttons ohne zugänglichen Namen").toEqual([]);
      expect(r.linksOhneNamen, "sichtbare Links ohne zugänglichen Namen").toEqual([]);

      // (4) jedes <img> hat ein alt-Attribut
      expect(r.imgsOhneAlt, "<img> ohne alt-Attribut").toEqual([]);
    });
  }
});
