// landing.mjs — die „Kugeln"-Landing: lebendiges Hintergrund-Netz + eine Karte pro Pack.
// Wird an ZWEI Stellen genutzt, damit App und Web-Preview identisch aussehen:
//   • export-static.mjs  -> docs/index.html (Karten verlinken auf ./<id>/)
//   • server.mjs         -> GET / in der App   (Karten verlinken auf /?pack=<id>)
// Zero-Dep: Canvas fürs Hintergrund-Netz, Inline-SVG fürs Mini-Cluster jeder Karte.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Mini-Netz einer Karte als Inline-SVG: Seed mittig, Nachbarn im Ring, Kanten in den
// App-Farben (blau = ähnlich, orange = zusammen). Positionen deterministisch (Index-Winkel).
export function miniCluster(graph) {
  const arts = Object.values(graph.artists || {});
  const seed = arts.find((a) => a.seed) || arts[0];
  if (!seed) return "";
  const others = arts.filter((a) => a.id !== seed.id).slice(0, 5);
  const picked = [seed, ...others];
  const pos = new Map();
  pos.set(seed.id, { x: 60, y: 45 });
  others.forEach((a, i) => {
    const ang = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(a.id, { x: 60 + Math.cos(ang) * 34, y: 45 + Math.sin(ang) * 30 });
  });
  const inSet = new Set(picked.map((a) => a.id));
  const lines = (graph.edges || []).filter((ed) => inSet.has(ed.from) && inSet.has(ed.to)).map((ed) => {
    const p = pos.get(ed.from), q = pos.get(ed.to);
    const col = ed.type === "similar" ? "#5b8cff" : ed.type === "together" ? "#ff8a3d" : "#a586ff";
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${col}" stroke-width="1.4" opacity=".7"/>`;
  }).join("");
  const dots = picked.map((a, i) => {
    const p = pos.get(a.id), r = a.id === seed.id ? 5 : 3.4;
    const op = a.id === seed.id ? 1 : 0.72;
    return `<circle class="mn" style="--i:${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="currentColor" opacity="${op}"/>`;
  }).join("");
  return `<svg class="mini" viewBox="0 0 120 90" aria-hidden="true">${lines}${dots}</svg>`;
}

// Landing-HTML. cards = [{ id, title, item:{sing,plur}, n, e, mini }].
// opts.hrefFor(id) -> Ziel-Link je Karte; opts.heading/sub/footer optional; opts.cardSub(card).
export function landingHtml(cards, opts = {}) {
  const hrefFor = opts.hrefFor || ((id) => `./${id}/`);
  const heading = opts.heading || 'like<b>.</b>';
  const sub = opts.sub || "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.";
  const footer = opts.footer || "";
  const cardSub = opts.cardSub || ((c) => `${c.item.plur} · ${c.n} Knoten · ${c.e} Kanten`);
  const gated = !!opts.gated;                 // gesperrte Karten -> „coming soon" + Passwort-Prompt
  const lockLabel = opts.lockLabel || "Coming soon";
  const infoFor = opts.infoFor || ((c) => `Entdecke ähnliche ${c.item.plur} und wie sie zusammenhängen — ein Klick öffnet das Netz.`);
  const planets = cards.map((c, i) => {
    const locked = gated && c.locked;
    const info = locked ? `${lockLabel} — diese Domäne ist noch in Arbeit (Passwort nötig).` : infoFor(c);
    const sub = c.item && c.item.plur ? `${c.n} ${esc(c.item.plur)}` : "";
    const inner = `<span class="orb"></span><span class="plabel">${esc(c.title)}${locked ? ' <span class="lk" aria-hidden="true">🔒</span>' : ""}</span>${sub ? `<span class="psub">${sub}</span>` : ""}`;
    // Knotengröße variiert leicht mit der Größe der Domäne (wie im App-Netz die Popularität).
    const sz = Math.round(40 + Math.min(30, Math.sqrt(Math.max(1, c.n)) * 3.2));
    const style = `--i:${i};--h:${(i * 67) % 360};--sz:${sz}px`;
    const data = `data-title="${esc(c.title)}" data-info="${esc(info)}"`;
    if (locked) {
      return `<div class="planet locked" style="${style}" ${data} data-href="${esc(hrefFor(c.id))}" role="button" tabindex="0" aria-label="${esc(c.title)} — ${esc(lockLabel)}">${inner}</div>`;
    }
    return `<a class="planet" style="${style}" ${data} href="${esc(hrefFor(c.id))}" aria-label="${esc(c.title)}">${inner}</a>`;
  }).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${opts.pageTitle || "like — Übersicht"}</title>
${opts.pwa === false ? "" : `<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0f1115">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="like">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<script>if("serviceWorker" in navigator && location.protocol==="https:")addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})});</script>`}
<style>
  /* Bewusst ein dunkler Sternenhimmel — die Übersicht ist der „Weltraum", aus dem die Domänen aufgehen. */
  :root { color-scheme: dark; --bg: #05070d; --fg: #e7e9ee; --line: #222a3d; --card: #10141f; --muted: .62; }
  * { box-sizing: border-box; }
  body { font: 16px/1.5 system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; color: var(--fg); overflow-x: hidden;
    background: radial-gradient(130% 90% at 72% -12%, #101c33 0%, #0a0f1c 42%, #05070d 100%); }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; }
  /* Sonnensystem: „like" als Sonne in der Mitte, Domänen kreisen als Planeten drumherum. */
  .solar { position: fixed; inset: 0; z-index: 1; }
  .hint { position: fixed; left: 50%; bottom: 78px; transform: translateX(-50%); z-index: 3;
    max-width: min(440px, 90vw); text-align: center; padding: 11px 18px; border-radius: 14px;
    background: color-mix(in srgb, var(--card) 90%, transparent); border: 1px solid var(--line);
    backdrop-filter: blur(8px); opacity: 0; transition: opacity .16s; pointer-events: none; }
  .hint.show { opacity: 1; }
  .hint b { display: block; font-size: 15px; margin-bottom: 3px; }
  .hint span { font-size: 13px; opacity: .82; line-height: 1.4; }
  .sun { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 2; cursor: help;
    width: 118px; height: 118px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 23px; letter-spacing: .3px; color: #3a1a05; user-select: none;
    background: radial-gradient(circle at 38% 34%, #ffffff, #ffd9a8 38%, #ff8a3d 76%, #b5480f 100%);
    box-shadow: 0 0 55px 8px rgba(255,138,61,.35), inset -8px -8px 22px rgba(120,40,0,.35); }
  .sun b { color: #7a2f00; }
  .planet { position: fixed; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 5px;
    text-decoration: none; color: var(--fg); will-change: transform; }
  /* Jeder Planet eine echte Kugel — je Domäne ein eigener Farbton (--h). Flach, mit weichem Hof. */
  .orb { width: 52px; height: 52px; border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, hsl(var(--h,210) 46% 66%), hsl(var(--h,210) 44% 58%) 72%, hsl(var(--h,210) 40% 50%) 100%);
    box-shadow: inset 0 0 0 1px #ffffff1c, 0 6px 22px -8px #000, 0 0 22px -4px hsl(var(--h,210) 65% 55% / .5);
    transition: transform .18s, box-shadow .18s; }
  .plabel { font-size: 12.5px; font-weight: 600; white-space: nowrap; text-align: center; text-shadow: 0 1px 8px #000c; }
  /* Schmale Screens: lange Labels nicht über den Rand ragen lassen — Breite deckeln und
     umbrechen statt nowrap, damit die Kachel im Viewport bleibt (BUGS.md B2). */
  @media (max-width: 480px) { .plabel { white-space: normal; max-width: 90px; line-height: 1.12; } }
  .planet:focus-visible { outline: none; }
  .planet:hover .orb, .planet:focus-visible .orb { transform: scale(1.14);
    box-shadow: inset 0 0 0 1px #ffffff2e, 0 8px 26px -8px #000, 0 0 34px -2px hsl(var(--h,210) 75% 60% / .75); }
  .planet.locked { opacity: .55; cursor: pointer; }
  .planet.locked .orb { filter: grayscale(.65) brightness(.72); }
  .planet.locked .plabel { color: #ff8a3d; }
  footer { position: fixed; left: 0; right: 0; bottom: 14px; text-align: center; font-size: 12.5px; opacity: .55; z-index: 2; }
  @media (prefers-reduced-motion: reduce) { .planet:hover .mini .mn { animation: none; } }
  /* Hell/Dunkel-Umschalter (oben rechts) — gleiche localStorage-Taste „like_theme" wie die App,
     damit die Wahl in die Domänen mitgenommen wird. */
  .themetgl { position: fixed; top: 14px; right: 14px; z-index: 5; width: 38px; height: 38px; border-radius: 50%;
    border: 1px solid var(--line); background: color-mix(in srgb, var(--card) 86%, transparent); color: var(--fg);
    cursor: pointer; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(8px); transition: transform .15s, border-color .15s; }
  .themetgl:hover { transform: scale(1.09); border-color: color-mix(in srgb, var(--fg) 34%, var(--line)); }
  /* Space/Flat-Umschalter — gleiche Optik/Logik wie der Ansicht-Umschalter in der App selbst. */
  .landtoggle { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 5;
    display: inline-flex; border: 1px solid var(--line); border-radius: 11px; overflow: hidden;
    background: color-mix(in srgb, var(--card) 86%, transparent); backdrop-filter: blur(8px); }
  .landtoggle button { border: 0; background: transparent; color: var(--fg); opacity: .58;
    font: 600 13px system-ui, -apple-system, sans-serif; padding: 7px 16px; cursor: pointer; letter-spacing: .01em; }
  .landtoggle button.on { background: var(--fg); color: var(--bg); opacity: 1; }
  .landtoggle button:not(.on):hover { opacity: .9; }
  /* Netz-Linien (nur im Flat-Modus): „like" in der Mitte, Kanten zu jeder Domäne — wie im App-Netz. */
  #netlines { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
  .psub { display: none; }  /* Genre-artige Unterzeile — nur im Flat-Modus sichtbar */
  /* FLAT = 1:1 der Look des App-Netzes (Light): reinweißer Hintergrund, „like" ein SCHWARZER
     Hub-Knoten, Domänen GRAUE Knoten (#b3b3b3), fette schwarze Namen + graue Unterzeile (#666),
     blaue Kanten (#2f6df6). Kein Verlauf, kein Glow, kein Sternenfeld. */
  body.flatmode { background: #ffffff !important; }
  body.flatmode #bg { display: none !important; }
  body.flatmode .plabel { color: #000; font-weight: 700; text-shadow: none; }
  body.flatmode .psub { display: block; color: #666; font-size: 11px; font-weight: 500; margin-top: 0; text-align: center; }
  body.flatmode .landtoggle, body.flatmode .themetgl { background: #fff; border-color: #e2e2e2; color: #000; }
  body.flatmode .landtoggle button { color: #000; }
  body.flatmode .landtoggle button.on { background: #000; color: #fff; }
  body.flatmode .hint { background: #fff; border-color: #e2e2e2; color: #000; }
  body.flatmode .sun { background: #000; color: #fff; box-shadow: 0 3px 18px -6px rgba(0,0,0,.45); }
  body.flatmode .sun b { color: #ff6a00; }
  body.flatmode .solar.flat .orb { width: var(--sz, 52px); height: var(--sz, 52px);
    background: #b3b3b3; box-shadow: none; }
  body.flatmode .solar.flat .planet:hover .orb, body.flatmode .solar.flat .planet:focus-visible .orb {
    transform: scale(1.08); background: #a3a3a3; box-shadow: 0 0 0 3px rgba(47,109,246,.22); }
  body.flatmode footer { opacity: .5; color: #000; }
  /* Heller „Tag"-Modus: warmer, freundlicher Himmel statt Sternennacht (Sternenfeld aus). */
  :root[data-theme="light"] { color-scheme: light; --bg: #f4f6fb; --fg: #1b2233; --line: #d4dbe9; --card: #ffffff; --muted: .58; }
  :root[data-theme="light"] body { background: radial-gradient(130% 90% at 72% -12%, #dce7ff 0%, #eef2fb 46%, #f4f6fb 100%); }
  :root[data-theme="light"] #bg { display: none; }
  :root[data-theme="light"] .plabel { text-shadow: 0 1px 6px #ffffffcc; }
  :root[data-theme="light"] .sun { box-shadow: 0 0 46px 6px rgba(255,138,61,.28), inset -8px -8px 22px rgba(120,40,0,.25); }
</style></head><body>
  <script>(function(){try{var t=localStorage.getItem("like_theme");document.documentElement.setAttribute("data-theme",(t==="light"||t==="dark")?t:"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();</script>
  <button class="themetgl" id="themeTgl" type="button" aria-label="Hell-/Dunkelmodus umschalten" title="Hell / Dunkel">☾</button>
  <div class="landtoggle" id="landToggle" title="Ansicht umschalten — Space: Domänen kreisen · Flat: klassisches Netz (wie in der App)">
    <button type="button" id="landSpace">Space</button>
    <button type="button" id="landFlat">Flat</button>
  </div>
  <canvas id="bg"></canvas>
  <canvas id="netlines"></canvas>
  <div class="solar" id="solar">
    ${planets}
  </div>
  <div class="sun" id="sun" tabindex="0" data-title="like" data-info="${esc(sub)}">${heading}</div>
  <div class="hint" id="hint" aria-live="polite"></div>
  ${footer ? `<footer>${footer}</footer>` : ""}
<script>
// Sternenhimmel: viele funkelnde Sterne + gelegentlich eine Sternschnuppe. Sehr dezent.
(function () {
  var cv = document.getElementById("bg"), ctx = cv.getContext("2d");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W, H, DPR = Math.min(devicePixelRatio || 1, 2), stars = [], shoot = null, t = 0, nextShoot = 3;
  function resize(){ W = innerWidth; H = innerHeight; cv.width = W*DPR; cv.height = H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); seed(); }
  function seed(){
    var N = Math.max(40, Math.min(260, Math.round(W*H/6500)));
    stars = [];
    for (var i=0;i<N;i++) stars.push({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*Math.random()*1.6 + 0.25,           // viele kleine, wenige größere
      b: 0.25 + Math.random()*0.6,                          // Grundhelligkeit
      tw: Math.random()*6.283, sp: 0.5 + Math.random()*1.6, // Funkeln
      hue: Math.random()<0.15 ? "#bcd0ff" : (Math.random()<0.12 ? "#ffe6c4" : "#eef3ff")
    });
  }
  function frame(){
    t += 0.016;
    ctx.clearRect(0,0,W,H);
    for (var i=0;i<stars.length;i++){ var s=stars[i];
      var a = reduce ? s.b : s.b * (0.55 + 0.45*Math.sin(t*s.sp + s.tw));
      ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = s.hue;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      if (s.r > 1.1) { ctx.globalAlpha = a*0.5; ctx.beginPath(); ctx.arc(s.x, s.y, s.r*2.4, 0, 7); ctx.fill(); } // sanfter Schein
    }
    // Sternschnuppe
    if (!reduce) {
      if (!shoot) { nextShoot -= 0.016; if (nextShoot <= 0) { var edge = Math.random()*W; shoot = { x: edge, y: -20, vx: (Math.random()*1.5+1.2)*(Math.random()<.5?-1:1), vy: Math.random()*2+2.4, life: 1 }; nextShoot = 5 + Math.random()*9; } }
      if (shoot) {
        shoot.x += shoot.vx*6; shoot.y += shoot.vy*6; shoot.life -= 0.02;
        var lx = shoot.x - shoot.vx*22, ly = shoot.y - shoot.vy*22;
        var grd = ctx.createLinearGradient(shoot.x, shoot.y, lx, ly);
        grd.addColorStop(0, "rgba(255,255,255,"+Math.max(0,shoot.life)*0.9+")"); grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1; ctx.strokeStyle = grd; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(lx, ly); ctx.stroke();
        if (shoot.life <= 0 || shoot.y > H+30) shoot = null;
      }
    }
    ctx.globalAlpha = 1;
    if(!reduce) requestAnimationFrame(frame);
  }
  addEventListener("resize", resize);
  resize(); frame();
})();
// Planeten-Umlauf + Flat-Netz. Space: „like" ist die Sonne, die Domänen kreisen langsam drumherum.
// Flat: exakt dieselben Knoten stehen still und sind mit Kanten zur Mitte verbunden — wie das
// klassische Netz in der App. Umschalter oben (gespeichert in like_landing_flat).
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var planets = [].slice.call(document.querySelectorAll(".planet"));
  var solar = document.getElementById("solar");
  var net = document.getElementById("netlines"), nctx = net.getContext("2d");
  var DPR = Math.min(devicePixelRatio || 1, 2);
  var N = planets.length, rings = [], W = 0, H = 0, last = null, mx = -1e9, my = -1e9;
  var flat = false; try { flat = localStorage.getItem("like_landing_flat") === "1"; } catch (e) {}
  function assign() {
    if (N > 6) { var inner = [], outer = [];
      planets.forEach(function (p, i) { (i % 2 ? outer : inner).push(p); });
      rings = [{ els: inner, f: 0.60, dir: 1 }, { els: outer, f: 1.0, dir: -1 }];
    } else rings = [{ els: planets, f: 1.0, dir: 1 }];
    rings.forEach(function (ring, r) { ring.els.forEach(function (el, i) {
      el._ang = (i / ring.els.length) * 6.2832 + Math.random() * 1.2;
      el._spd = (Math.random() < 0.5 ? 1 : -1) * (0.028 + Math.random() * 0.032); // ~0.028 .. 0.06 rad/s
    }); });
  }
  function size() { W = innerWidth; H = innerHeight; net.width = W * DPR; net.height = H * DPR; nctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  function frame(ts) {
    if (last == null) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    var cx = W / 2, cy = H / 2, base = Math.max(96, Math.min(W, H) * 0.36);
    nctx.clearRect(0, 0, W, H);
    if (flat) { nctx.lineWidth = 2; nctx.strokeStyle = "rgba(47,109,246,0.8)"; } // exakt App-Kantenblau (--edge-similar #2f6df6)
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r], R = base * ring.f;
      for (var i = 0; i < ring.els.length; i++) {
        var el = ring.els[i];
        var x = cx + Math.cos(el._ang) * R, y = cy + Math.sin(el._ang) * R;
        if (flat) {
          nctx.beginPath(); nctx.moveTo(cx, cy); nctx.lineTo(x, y); nctx.stroke(); // statische Kante Sonne -> Domäne
        } else {
          // Näherung: kommt die Maus nah, stoppt der Planet (0), sonst volle Fahrt (1).
          var f = 1;
          if (mx > -1e8) { var dd = Math.hypot(mx - x, my - y); f = dd > 175 ? 1 : dd < 62 ? 0 : (dd - 62) / 113; }
          el._ang += (reduce ? 0 : el._spd) * dt * f;
        }
        el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  function setFlat(v) {
    flat = !!v; solar.classList.toggle("flat", flat);
    document.body.classList.toggle("flatmode", flat); // Flat = heller App-Netz-Look (Sternenfeld aus)
    document.getElementById("landSpace").classList.toggle("on", !flat);
    document.getElementById("landFlat").classList.toggle("on", flat);
    try { localStorage.setItem("like_landing_flat", flat ? "1" : "0"); } catch (e) {}
    if (reduce) { size(); requestAnimationFrame(frame); } // ohne Dauer-Loop einmal neu zeichnen
  }
  addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; });
  addEventListener("mouseout", function (e) { if (!e.relatedTarget) { mx = my = -1e9; } });
  addEventListener("resize", function () { size(); if (reduce) requestAnimationFrame(frame); });
  document.getElementById("landSpace").onclick = function () { setFlat(false); };
  document.getElementById("landFlat").onclick = function () { setFlat(true); };
  size(); assign(); setFlat(flat); requestAnimationFrame(frame);
})();
// Hover/Fokus über „like" (Sonne) oder einen Planeten -> kurze Info-Fläche unten.
(function () {
  var hint = document.getElementById("hint");
  function show(el) {
    if (!el) return; hint.innerHTML = "";
    var b = document.createElement("b"); b.textContent = el.getAttribute("data-title") || "";
    var s = document.createElement("span"); s.textContent = el.getAttribute("data-info") || "";
    hint.appendChild(b); hint.appendChild(s); hint.classList.add("show");
  }
  function hide() { hint.classList.remove("show"); }
  [].slice.call(document.querySelectorAll(".planet, #sun")).forEach(function (el) {
    el.addEventListener("mouseenter", function () { show(el); });
    el.addEventListener("mouseleave", hide);
    el.addEventListener("focus", function () { show(el); });
    el.addEventListener("blur", hide);
  });
})();
// Hell/Dunkel-Umschalter: Symbol zeigt den aktuellen Modus (☾ = dunkel, ☀ = hell).
// Speichert in „like_theme" — dieselbe Taste, die die App liest.
(function () {
  var btn = document.getElementById("themeTgl");
  function cur() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function apply(t) {
    document.documentElement.setAttribute("data-theme", t);
    btn.textContent = t === "light" ? "☀" : "☾";
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#eef2fb" : "#0f1115");
    try { localStorage.setItem("like_theme", t); } catch (e) {}
  }
  apply(cur());
  btn.addEventListener("click", function () { apply(cur() === "light" ? "dark" : "light"); });
})();
</script>
${gated ? `<script>
// Gesperrter Planet: Passwort abfragen -> freischalten -> zur Domäne.
(function(){
  function unlock(href){
    var pw = window.prompt("Diese Domäne ist noch in Arbeit.\\nPasswort eingeben, um sie freizuschalten:");
    if(pw==null) return;
    fetch("/api/unlock",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:pw})})
      .then(function(r){ if(r.ok){ location.href=href; } else { alert("Falsches Passwort."); } })
      .catch(function(){ alert("Freischalten fehlgeschlagen."); });
  }
  document.querySelectorAll(".planet.locked").forEach(function(el){
    var href = el.getAttribute("data-href");
    el.addEventListener("click", function(){ unlock(href); });
    el.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); unlock(href); } });
  });
})();
</script>` : ""}
</body></html>`;
}
