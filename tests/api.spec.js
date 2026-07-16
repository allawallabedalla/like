// API-Ebene: (1) alle Netzwerk-Requests mitloggen und same-origin 4xx/5xx melden,
// (2) kritische Endpoints read-only auf Status + Response-Schema prüfen.
const { test, expect } = require("@playwright/test");
const { isSameOrigin, PUBLIC_PACK, LOCKED_PACKS } = require("./helpers");

test.describe("Netzwerk-Requests", () => {
  test("alle Requests werden geloggt; keine unerwarteten same-origin 4xx/5xx", async ({ page, baseURL }, testInfo) => {
    const log = [];
    const bad = [];
    page.on("response", (r) => {
      const url = r.url(), status = r.status(), method = r.request().method();
      log.push(`${status} ${method} ${url}`);
      if (status < 400) return;
      if (!isSameOrigin(url, baseURL)) return;
      if (/\/favicon\.ico$/.test(new URL(url).pathname)) return; // bekannt (BUGS.md B1)
      bad.push(`${status} ${method} ${url}`);
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.goto(`/?pack=${PUBLIC_PACK}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    // vollständiges Request-Log als Test-Artefakt sichern
    await testInfo.attach("network-log.txt", { body: log.join("\n"), contentType: "text/plain" });
    // 4xx/5xx (same-origin) müssen in BUGS.md stehen; hier darf keiner NEU auftauchen
    expect(bad, "unerwartete same-origin 4xx/5xx (siehe BUGS.md)").toEqual([]);
  });
});

test.describe("Kritische Endpoints (read-only): Status + Schema", () => {
  test("GET /api/packs — Liste aller Packs mit Lock-Flags", async ({ request }) => {
    const res = await request.get("/api/packs");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.packs)).toBe(true);
    expect(body.packs.length).toBe(1 + LOCKED_PACKS.length); // 10
    for (const p of body.packs) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.title).toBe("string");
      expect(p.item && typeof p.item.sing).toBe("string");
      expect(p.item && typeof p.item.plur).toBe("string");
      expect(typeof p.locked).toBe("boolean");
    }
    const byId = Object.fromEntries(body.packs.map((p) => [p.id, p]));
    expect(byId[PUBLIC_PACK].locked, "music ist frei").toBe(false);
    for (const id of LOCKED_PACKS) expect(byId[id].locked, `${id} gesperrt`).toBe(true);
  });

  test("GET /api/health — Selbstauskunft des Packs", async ({ request }) => {
    const res = await request.get(`/api/health?pack=${PUBLIC_PACK}`);
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.ok).toBe(true);
    expect(typeof b.key).toBe("boolean");
    expect(typeof b.version).toBe("string");
    expect(b.pack).toBe(PUBLIC_PACK);
    expect(typeof b.feedback).toBe("boolean");
  });

  test("GET /api/graph — leerer Startgraph mit korrektem Schema", async ({ request }) => {
    const res = await request.get(`/api/graph?pack=${PUBLIC_PACK}`);
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.artists && typeof b.artists).toBe("object");
    expect(Array.isArray(b.edges)).toBe(true);
  });

  test("GET /api/auth/me — anonym (kein Nutzer)", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.ok).toBe(true);
    expect(b.user ?? null).toBeNull();
  });

  test("GET /api/taste — Geschmacks-Fingerabdruck-Schema", async ({ request }) => {
    const res = await request.get("/api/taste");
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.packs)).toBe(true);
    expect(Array.isArray(b.overlaps)).toBe(true);
  });

  test("GET /api/suggest — liefert immer ein names-Array (auch ohne Netz)", async ({ request }) => {
    const res = await request.get(`/api/suggest?q=bo&pack=${PUBLIC_PACK}`);
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(Array.isArray(b.names)).toBe(true);
  });

  test("GET /api/namesakes — liefert immer ein namesakes-Array (degradiert ohne Netz)", async ({ request }) => {
    const res = await request.get(`/api/namesakes?name=Nirvana&pack=${PUBLIC_PACK}`);
    expect(res.status()).toBe(200);
    const b = await res.json();
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.namesakes)).toBe(true);
  });
});
