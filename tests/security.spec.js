// Sicherheits-Regressionstests (U-2c.8) — sichern die Härtung aus Phase 2c ab:
// Security-Header + CSP (nur auf HTML), Pro-IP-Rate-Limit (429) und saubere Eingabe-Validierung.
// Alles über die API-Ebene (request-Fixture), deterministisch ohne Live-Daten.
const { test, expect } = require("@playwright/test");

test.describe("Security-Header", () => {
  test("HTML-Seiten tragen Schutz-Header + sichere Basis-CSP", async ({ request }) => {
    const r = await request.get("/");
    expect(r.ok()).toBeTruthy();
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["permissions-policy"]).toBeTruthy();
    const csp = h["content-security-policy"] || "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("JSON-API trägt KEINE HTML-CSP, aber weiter nosniff", async ({ request }) => {
    const r = await request.get("/api/packs");
    expect(r.ok()).toBeTruthy();
    const h = r.headers();
    expect(h["content-security-policy"]).toBeFalsy();
    expect(h["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("Rate-Limit (U-2c.3)", () => {
  // Eigene synthetische IP via X-Forwarded-For, damit dieser Flood die Bucket der echten
  // Test-Requests (127.0.0.1) NICHT berührt und keine anderen Specs beeinflusst.
  test("Flut auf /api/clienterror liefert 429", async ({ request }) => {
    const headers = { "x-forwarded-for": "203.0.113.250" };
    let got429 = false;
    for (let i = 0; i < 40; i++) {
      const r = await request.post("/api/clienterror", { data: { msg: "x" }, headers });
      if (r.status() === 429) { got429 = true; break; }
    }
    expect(got429, "nach genug Anfragen muss der Limiter 429 liefern").toBe(true);
  });
});

test.describe("Eingabe-Validierung", () => {
  test("explore ohne name -> 400 (kein 500)", async ({ request }) => {
    const r = await request.post("/api/explore", { data: {} });
    expect(r.status()).toBe(400);
  });

  test("unbekannte API-Route -> 404 (kein 500)", async ({ request }) => {
    const r = await request.get("/api/does-not-exist");
    expect(r.status()).toBe(404);
  });
});
