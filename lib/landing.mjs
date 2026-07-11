// landing.mjs — die „Kugeln"-Landing: lebendiges Hintergrund-Netz + eine Karte pro Pack.
// Wird an ZWEI Stellen genutzt, damit App und Web-Preview identisch aussehen:
//   • export-static.mjs  -> docs/index.html (Karten verlinken auf ./<id>/)
//   • server.mjs         -> GET / in der App   (Karten verlinken auf /?pack=<id>)
// Zero-Dep: Canvas fürs Hintergrund-Netz (Sterne + Planeten-Umlauf).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Landing-HTML. cards = [{ id, title, item:{sing,plur}, n, e }].
// opts.hrefFor(id) -> Ziel-Link je Karte; opts.heading/sub/footer optional.
export function landingHtml(cards, opts = {}) {
  const hrefFor = opts.hrefFor || ((id) => `./${id}/`);
  const heading = opts.heading || 'like<b>.</b>';
  const sub = opts.sub || "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.";
  const footer = opts.footer || "";
  const gated = !!opts.gated;                 // gesperrte Karten -> „coming soon" + Passwort-Prompt
  const lockLabel = opts.lockLabel || "Coming soon";
  const infoFor = opts.infoFor || ((c) => `Entdecke ähnliche ${c.item.plur} und wie sie zusammenhängen — ein Klick öffnet das Netz.`);
  const heroId = opts.heroId || null;          // E3: eine Domäne als „Hero" hervorheben (Musik)
  const planets = cards.map((c, i) => {
    const locked = gated && c.locked;
    const hero = !locked && heroId && c.id === heroId;
    const info = locked ? `${lockLabel} — dieses Experiment ist noch nicht öffentlich (Passwort nötig).` : infoFor(c);
    const sub = c.item && c.item.plur ? `${c.n} ${esc(c.item.plur)}` : "";
    // Flaches, schlichtes Schloss (Strich-Icon, currentColor) statt Emoji — passt zur „Flat/plain"-Guideline.
    const lockIcon = '<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
    const inner = `<span class="orb"></span><span class="plabel">${esc(c.title)}${locked ? ' ' + lockIcon : ""}</span>${sub ? `<span class="psub">${sub}</span>` : ""}`;
    // Knotengröße variiert leicht mit der Größe der Domäne (wie im App-Netz die Popularität);
    // die Hero-Domäne ist sichtbar größer, gesperrte Labs sichtbar kleiner.
    let sz = Math.round(40 + Math.min(30, Math.sqrt(Math.max(1, c.n)) * 3.2));
    if (hero) sz += 14; else if (locked) sz = Math.round(sz * 0.75);
    const style = `--i:${i};--h:${(i * 67) % 360};--sz:${sz}px`;
    const data = `data-title="${esc(c.title)}" data-info="${esc(info)}"`;
    if (locked) {
      return `<div class="planet locked" style="${style}" ${data} data-href="${esc(hrefFor(c.id))}" role="button" tabindex="0" aria-label="${esc(c.title)} — ${esc(lockLabel)}">${inner}</div>`;
    }
    return `<a class="planet${hero ? " hero" : ""}" style="${style}" ${data} href="${esc(hrefFor(c.id))}" aria-label="${esc(c.title)}">${inner}</a>`;
  }).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${opts.pageTitle || "like — Übersicht"}</title>
${opts.headExtra || ""}
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
  /* Info-Tooltip: heftet sich an den Mauszeiger (per JS platziert), statt als festes Modal
     unten zu kleben. Liegt bis zum ersten Hover unsichtbar oben links. */
  .hint { position: fixed; left: 0; top: 0; z-index: 6;
    max-width: min(300px, 74vw); padding: 9px 13px; border-radius: 12px;
    background: color-mix(in srgb, var(--card) 92%, transparent); border: 1px solid var(--line);
    box-shadow: 0 8px 26px -10px #000a; backdrop-filter: blur(8px);
    opacity: 0; transition: opacity .14s; pointer-events: none; }
  .hint.show { opacity: 1; }
  .hint b { display: block; font-size: 14px; margin-bottom: 2px; }
  .hint span { font-size: 12.5px; opacity: .82; line-height: 1.38; }
  .sun { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 2; cursor: help;
    width: 118px; height: 118px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 23px; letter-spacing: .3px; color: #3a1a05; user-select: none;
    background: radial-gradient(circle at 38% 34%, #ffffff, #ffd9a8 38%, #ff8a3d 76%, #b5480f 100%);
    box-shadow: 0 0 55px 8px rgba(255,138,61,.35), inset -8px -8px 22px rgba(120,40,0,.35); }
  .sun b { color: #7a2f00; }
  .planet { position: fixed; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 5px;
    text-decoration: none; color: var(--fg); will-change: transform; }
  /* Weicher Übergang beim Umschalten Space<->Flat: Planeten GLEITEN zur neuen Position statt hart
     zu springen. Nur kurz aktiv (Klasse wird nach dem Wechsel wieder entfernt), damit der Dauer-
     Umlauf in Space nicht nachzieht. */
  .solar.switching .planet { transition: transform .5s cubic-bezier(.4,0,.2,1); }
  /* Jeder Planet eine echte Kugel — je Domäne ein eigener Farbton (--h). Flach, mit weichem Hof. */
  .orb { width: 52px; height: 52px; border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, hsl(var(--h,210) 46% 66%), hsl(var(--h,210) 44% 58%) 72%, hsl(var(--h,210) 40% 50%) 100%);
    box-shadow: inset 0 0 0 1px #ffffff1c, 0 6px 22px -8px #000, 0 0 22px -4px hsl(var(--h,210) 65% 55% / .5);
    transition: transform .18s, box-shadow .18s; }
  .plabel { font-size: 12.5px; font-weight: 600; white-space: nowrap; text-align: center; text-shadow: 0 1px 8px #000c; }
  /* Schloss-Icon erbt die Labelfarbe (currentColor) und skaliert mit der Schrift — flach, kein Emoji-Glanz. */
  .lk { width: .92em; height: .92em; vertical-align: -.14em; opacity: .9; filter: none; }
  /* Schmale Screens: lange Labels nicht über den Rand ragen lassen — Breite deckeln und
     umbrechen statt nowrap, damit die Kachel im Viewport bleibt (BUGS.md B2). */
  @media (max-width: 480px) { .plabel { white-space: normal; max-width: 90px; line-height: 1.12; } }
  .planet:focus-visible { outline: none; }
  .planet:hover .orb, .planet:focus-visible .orb { transform: scale(1.14);
    box-shadow: inset 0 0 0 1px #ffffff2e, 0 8px 26px -8px #000, 0 0 34px -2px hsl(var(--h,210) 75% 60% / .75); }
  .planet.locked { opacity: .55; cursor: pointer; }
  .planet.locked .orb { filter: grayscale(.65) brightness(.72); width: 40px; height: 40px; }
  .planet.locked .plabel { color: #ff8a3d; font-size: 11px; }
  /* Hero-Domäne (Musik): sichtbar größer + kräftigerer Hof — der Haupteinstieg. */
  .planet.hero .orb { width: 68px; height: 68px;
    box-shadow: inset 0 0 0 1px #ffffff2e, 0 8px 26px -8px #000, 0 0 34px -2px hsl(var(--h,210) 75% 60% / .7); }
  .planet.hero .plabel { font-size: 14.5px; }
  /* Sichtbare Positionierung (E3): der Pitch stand bisher nur im Hover-Tooltip der Sonne. */
  .tagline { position: fixed; top: 58px; left: 50%; transform: translateX(-50%); z-index: 4;
    width: max-content; max-width: min(560px, 92vw); text-align: center; pointer-events: none; }
  .tagline h1 { margin: 0; font-size: 16.5px; font-weight: 650; letter-spacing: .01em; text-shadow: 0 1px 10px #000b; }
  .tagline p { margin: 3px 0 0; font-size: 12.5px; opacity: .66; text-shadow: 0 1px 8px #000b; }
  @media (max-height: 560px) { .tagline p { display: none; } }
  body.flatmode .tagline h1, body.flatmode .tagline p { color: #000; text-shadow: none; }
  :root[data-theme="light"] .tagline h1, :root[data-theme="light"] .tagline p { text-shadow: 0 1px 6px #ffffffcc; }
  footer { position: fixed; left: 0; right: 0; bottom: 14px; text-align: center; font-size: 12.5px; opacity: .55; z-index: 2; }
  /* Space/Flat-Umschalter — gleiche Optik/Logik wie der Ansicht-Umschalter in der App selbst. */
  .landtoggle { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 5;
    display: inline-flex; border: 1px solid var(--line); border-radius: 11px; overflow: hidden;
    background: color-mix(in srgb, var(--card) 86%, transparent); backdrop-filter: blur(8px); }
  .landtoggle button { border: 0; background: transparent; color: var(--fg); opacity: .58;
    font: 600 13px system-ui, -apple-system, sans-serif; padding: 7px 16px; cursor: pointer; letter-spacing: .01em; }
  .landtoggle button.on { background: var(--fg); color: var(--bg); opacity: 1; }
  .landtoggle button:not(.on):hover { opacity: .9; }
  /* Stöbern/Booking-Umschalter (oben links) — gleiche Optik wie der Space/Flat-Toggle.
     Schreibt nur localStorage („like_mode"); die App liest die Wahl beim Öffnen einer Domäne. */
  .modetgl { position: fixed; top: 14px; left: 14px; z-index: 5;
    display: inline-flex; border: 1px solid var(--line); border-radius: 11px; overflow: hidden;
    background: color-mix(in srgb, var(--card) 86%, transparent); backdrop-filter: blur(8px); }
  .modetgl button { border: 0; background: transparent; color: var(--fg); opacity: .58;
    font: 600 13px system-ui, -apple-system, sans-serif; padding: 7px 16px; cursor: pointer; letter-spacing: .01em; }
  .modetgl button.on { background: var(--fg); color: var(--bg); opacity: 1; }
  .modetgl button:not(.on):hover { opacity: .9; }
  body.flatmode .modetgl { background: #fff; border-color: #e2e2e2; }
  body.flatmode .modetgl button { color: #000; }
  body.flatmode .modetgl button.on { background: #000; color: #fff; }
  /* Schmale Screens: unten mittig (über dem Footer) — oben würde er mit dem zentrierten
     Space/Flat-Toggle kollidieren. */
  @media (max-width: 640px) { .modetgl { top: auto; bottom: 46px; left: 50%; transform: translateX(-50%); } }
  /* Sprach-Umschalter DE|EN — neben dem Theme-Knopf oben rechts */
  .langtgl { position: fixed; top: 14px; right: 62px; z-index: 5;
    display: inline-flex; border: 1px solid var(--line); border-radius: 11px; overflow: hidden;
    background: color-mix(in srgb, var(--card) 86%, transparent); backdrop-filter: blur(8px); }
  .langtgl button { border: 0; background: transparent; color: var(--fg); opacity: .58;
    font: 600 12px system-ui, -apple-system, sans-serif; padding: 8px 10px; cursor: pointer; letter-spacing: .04em; }
  .langtgl button.on { background: var(--fg); color: var(--bg); opacity: 1; }
  .langtgl button:not(.on):hover { opacity: .9; }
  body.flatmode .langtgl { background: #fff; border-color: #e2e2e2; }
  body.flatmode .langtgl button { color: #000; }
  body.flatmode .langtgl button.on { background: #000; color: #fff; }
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
  body.flatmode .landtoggle { background: #fff; border-color: #e2e2e2; color: #000; }
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
  <!-- Erst-Theme aus dem gespeicherten Modus: Space = dunkel (Weltraum), Flat = hell (App-Netz).
       Default = Flat (hell); nur wer explizit Space gewählt hat ("0"), bekommt dunkel. -->
  <script>(function(){try{var f=localStorage.getItem("like_landing_flat")!=="0";document.documentElement.setAttribute("data-theme",f?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();</script>
  <div class="landtoggle" id="landToggle" title="Ansicht umschalten — Space: Domänen kreisen (dunkel) · Flat: klassisches Netz wie in der App (hell)">
    <button type="button" id="landSpace">Space</button>
    <button type="button" id="landFlat">Flat</button>
  </div>
  <div class="modetgl" id="modeToggle">
    <button type="button" id="modeFun" data-title="Stöbern" data-info="Die aufgeräumte Ansicht: suchen, erkunden, anhören, merken — ideal zum Entdecken. Gilt für alle Domänen, umschaltbar jederzeit im ⋯-Menü.">Stöbern</button>
    <button type="button" id="modeWork" data-title="Booking" data-info="Der volle Werkzeugkasten: Status, Notizen, Vergleich, Szenen, Brücken, Export & mehr — für die Arbeit mit deiner Sammlung.">Booking</button>
  </div>
  <div class="langtgl" id="langTgl" title="Sprache / Language">
    <button type="button" id="langDe">DE</button>
    <button type="button" id="langEn">EN</button>
  </div>
  ${opts.tagline ? `<div class="tagline"><h1>${opts.tagline.h}</h1>${opts.tagline.p ? `<p>${opts.tagline.p}</p>` : ""}</div>` : ""}
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
  var sunEl = document.getElementById("sun");
  var net = document.getElementById("netlines"), nctx = net.getContext("2d");
  var DPR = Math.min(devicePixelRatio || 1, 2);
  var N = planets.length, rings = [], W = 0, H = 0, last = null, mx = -1e9, my = -1e9;
  // Default = Flat; nur eine explizit gespeicherte Space-Wahl ("0") schaltet zurück auf Space.
  var flat = true; try { flat = localStorage.getItem("like_landing_flat") !== "0"; } catch (e) {}
  function assign() {
    if (N > 6) { var inner = [], outer = [];
      planets.forEach(function (p, i) { (i % 2 ? outer : inner).push(p); });
      rings = [{ els: inner, f: 0.60, dir: 1 }, { els: outer, f: 1.0, dir: -1 }];
    } else rings = [{ els: planets, f: 1.0, dir: 1 }];
    rings.forEach(function (ring, r) { ring.els.forEach(function (el, i) {
      el._ang = (i / ring.els.length) * 6.2832 + Math.random() * 1.2;
      el._spd = (Math.random() < 0.5 ? 1 : -1) * (0.028 + Math.random() * 0.032); // ~0.028 .. 0.06 rad/s
    }); });
    // Flat: EIN gleichmäßiger Ring (Winkel exakt verteilt) — kein Überlappen der Labels.
    planets.forEach(function (el, i) { el._flatAng = (i / N) * 6.2832 - Math.PI / 2; });
  }
  function size() { W = innerWidth; H = innerHeight; net.width = W * DPR; net.height = H * DPR; nctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  function frame(ts) {
    if (last == null) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    var cx = W / 2, cy = H / 2, base = Math.max(96, Math.min(W, H) * 0.36);
    nctx.clearRect(0, 0, W, H);
    if (flat) {
      // Radius so groß, dass die Labels rundum Platz haben (Bogenlänge ~ 24px pro Knoten),
      // aber im Viewport bleiben. Statische Kanten Sonne -> Domäne, kein Kreisen.
      var fR = Math.min(Math.min(W, H) / 2 - 80, Math.max(base, 24 * N));
      // Pass 1: alle Planeten positionieren (nur Writes).
      for (var i = 0; i < planets.length; i++) {
        var el = planets[i];
        var x = cx + Math.cos(el._flatAng) * fR, y = cy + Math.sin(el._flatAng) * fR;
        el.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
      }
      // Pass 2: Kanten vom SONNENRAND bis KURZ VOR die Kugel — nie überlappen. Wichtig: gesperrte
      // Kacheln sind halbdurchsichtig (opacity .55), also darf die Linie NICHT bis in die Kugel-
      // mitte laufen (schiene sonst durch). Wir richten auf die Orb-Mitte, kürzen die Linie aber
      // beidseitig (Sonnenradius + Luft am Anfang, Orb-Radius + Luft am Ende). Ein Layout-Read
      // nach allen Writes = kein Thrash.
      var sunR = sunEl.getBoundingClientRect().width / 2;
      nctx.lineWidth = 2; nctx.strokeStyle = "rgba(47,109,246,0.8)"; // App-Kantenblau (#2f6df6)
      for (var i2 = 0; i2 < planets.length; i2++) {
        var el2 = planets[i2], orb = el2._orb || (el2._orb = el2.querySelector(".orb"));
        var r = orb.getBoundingClientRect();
        var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
        var dx = ox - cx, dy = oy - cy, dist = Math.hypot(dx, dy) || 1;
        var a = sunR + 4, b = dist - r.width / 2 - 6; // Start: Sonnenrand+4px · Ende: 6px vor der Kugel
        if (b <= a) continue;                          // Kugel zu nah an der Sonne -> keine Linie
        nctx.beginPath();
        nctx.moveTo(cx + dx / dist * a, cy + dy / dist * a);
        nctx.lineTo(cx + dx / dist * b, cy + dy / dist * b);
        nctx.stroke();
      }
    } else {
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r], R = base * ring.f;
        for (var j = 0; j < ring.els.length; j++) {
          var e2 = ring.els[j];
          var ex = cx + Math.cos(e2._ang) * R, ey = cy + Math.sin(e2._ang) * R;
          // Näherung: kommt die Maus nah, stoppt der Planet (0), sonst volle Fahrt (1).
          var f = 1;
          if (mx > -1e8) { var dd = Math.hypot(mx - ex, my - ey); f = dd > 175 ? 1 : dd < 62 ? 0 : (dd - 62) / 113; }
          e2._ang += (reduce ? 0 : e2._spd) * dt * f;
          e2.style.transform = "translate(" + ex + "px," + ey + "px) translate(-50%,-50%)";
        }
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  function setFlat(v, animate) {
    flat = !!v; solar.classList.toggle("flat", flat);
    // Beim Klick kurz weich gleiten lassen (nicht beim ersten Laden -> sonst fliegen alle aus der Ecke).
    if (animate && !reduce) {
      solar.classList.add("switching");
      clearTimeout(setFlat._t); setFlat._t = setTimeout(function () { solar.classList.remove("switching"); }, 560);
    }
    document.body.classList.toggle("flatmode", flat); // Flat = heller App-Netz-Look (Sternenfeld aus)
    // Optik an den Modus koppeln: Space = dunkel (Weltraum), Flat = hell (App-Netz). Der frühere
    // separate Hell/Dunkel-Umschalter ist entfallen; like_theme wird mitgeführt, damit die Domäne
    // beim Öffnen zum gerade gesehenen Look passt.
    document.documentElement.setAttribute("data-theme", flat ? "light" : "dark");
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", flat ? "#ffffff" : "#0f1115");
    document.getElementById("landSpace").classList.toggle("on", !flat);
    document.getElementById("landFlat").classList.toggle("on", flat);
    try { localStorage.setItem("like_landing_flat", flat ? "1" : "0"); localStorage.setItem("like_theme", flat ? "light" : "dark"); } catch (e) {}
    if (reduce) { size(); requestAnimationFrame(frame); } // ohne Dauer-Loop einmal neu zeichnen
  }
  addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; });
  addEventListener("mouseout", function (e) { if (!e.relatedTarget) { mx = my = -1e9; } });
  addEventListener("resize", function () { size(); if (reduce) requestAnimationFrame(frame); });
  document.getElementById("landSpace").onclick = function () { setFlat(false, true); };
  document.getElementById("landFlat").onclick = function () { setFlat(true, true); };
  size(); assign(); setFlat(flat); requestAnimationFrame(frame);
})();
// Hover/Fokus über „like" (Sonne) oder einen Planeten -> Info-Tooltip, der am Mauszeiger klebt.
(function () {
  var hint = document.getElementById("hint");
  // Tooltip nahe (x,y) platzieren, aber im Viewport halten (bei Bedarf auf die andere Seite kippen).
  function place(x, y) {
    var r = hint.getBoundingClientRect(), w = r.width || 220, h = r.height || 56;
    var px = x + 16, py = y + 16;
    if (px + w > innerWidth - 8) px = x - w - 16;
    if (px < 8) px = 8;
    if (py + h > innerHeight - 8) py = y - h - 16;
    if (py < 8) py = 8;
    hint.style.left = px + "px"; hint.style.top = py + "px";
  }
  function show(el) {
    if (!el) return; hint.innerHTML = "";
    var b = document.createElement("b"); b.textContent = el.getAttribute("data-title") || "";
    var s = document.createElement("span"); s.textContent = el.getAttribute("data-info") || "";
    hint.appendChild(b); hint.appendChild(s); hint.classList.add("show");
  }
  function hide() { hint.classList.remove("show"); }
  function onMove(e) { place(e.clientX, e.clientY); }
  [].slice.call(document.querySelectorAll(".planet, #sun, .modetgl button")).forEach(function (el) {
    el.addEventListener("mouseenter", function (e) { show(el); place(e.clientX, e.clientY); });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", hide);
    // Tastatur-Fokus hat keine Mausposition -> Tooltip unter das Element setzen.
    el.addEventListener("focus", function () { show(el); var rc = el.getBoundingClientRect(); place(rc.left + rc.width / 2, rc.bottom); });
    el.addEventListener("blur", hide);
  });
})();
// Stöbern/Booking-Umschalter: schreibt nur die Wahl nach localStorage („like_mode") —
// die App wertet sie beim Öffnen einer Domäne aus. Standard: Stöbern.
(function () {
  var bF = document.getElementById("modeFun"), bW = document.getElementById("modeWork");
  var fun = true;
  try { fun = (localStorage.getItem("like_mode") || "fun") !== "work"; } catch (e) {}
  function render() { bF.classList.toggle("on", fun); bW.classList.toggle("on", !fun); }
  function set(v) { fun = v; try { localStorage.setItem("like_mode", v ? "fun" : "work"); } catch (e) {} render(); }
  bF.onclick = function () { set(true); };
  bW.onclick = function () { set(false); };
  render();
})();
// Sprache: Deutsch ist die Quellsprache; EN wird beim Laden per Wörterbuch ersetzt. Default
// bestimmt der Browser (de -> Deutsch, sonst Englisch), eine gespeicherte Wahl gewinnt —
// gleicher localStorage-Schlüssel („like_lang") wie in der App.
(function () {
  function browserLang() { return ((navigator.language || "en").toLowerCase().indexOf("de") === 0) ? "de" : "en"; }
  var lang = browserLang();
  try { var s = localStorage.getItem("like_lang"); if (s === "de" || s === "en") lang = s; } catch (e) {}
  document.documentElement.lang = lang;
  var bD = document.getElementById("langDe"), bE = document.getElementById("langEn");
  bD.classList.toggle("on", lang === "de"); bE.classList.toggle("on", lang === "en");
  function set(l) { if (l === lang) return; try { localStorage.setItem("like_lang", l); } catch (e) {} location.reload(); }
  bD.onclick = function () { set("de"); }; bE.onclick = function () { set("en"); };
  if (lang !== "en") return;
  var D = {
    "like — Übersicht": "like — Overview",
    "Wähle, wonach du heute stöbern willst. Jede Domäne bringt ihr eigenes Netz mit — ein Klick, und du bist mittendrin.": "Pick what you feel like browsing today. Each domain brings its own network — one click and you're in.",
    "Ansicht umschalten — Space: Domänen kreisen (dunkel) · Flat: klassisches Netz wie in der App (hell)": "Switch view — Space: domains orbit (dark) · Flat: classic network like in the app (light)",
    "Stöbern": "Browse",
    "Die aufgeräumte Ansicht: suchen, erkunden, anhören, merken — ideal zum Entdecken. Gilt für alle Domänen, umschaltbar jederzeit im ⋯-Menü.": "The clean, simple view: search, explore, listen, save — ideal for discovering. Applies to all domains; switch any time in the ⋯ menu.",
    "Der volle Werkzeugkasten: Status, Notizen, Vergleich, Szenen, Brücken, Export & mehr — für die Arbeit mit deiner Sammlung.": "The full toolbox: status, notes, compare, scenes, bridges, export & more — for working with your collection.",
    "alle Domänen in einer App": "all domains in one app",
    "Spotify sagt dir, was du hören sollst.": "Spotify tells you what to listen to.",
    "zeigt dir die Landkarte.": "shows you the map.",
    "Kleine Acts, echte Verbindungen — ähnlicher Sound und „zusammen aufgetreten“ als begehbares Netz. Ohne Feed, ohne Werbung, ohne Tracking.": "Small acts, real connections — similar sound and „played together“ as a walkable network. No feed, no ads, no tracking.",
    "Impressum": "Imprint", "Datenschutz": "Privacy",
    "Diese Domäne ist noch in Arbeit.\\nPasswort eingeben, um sie freizuschalten:": "This domain is still in the works.\\nEnter the password to unlock it:",
    "Falsches Passwort.": "Wrong password.", "Freischalten fehlgeschlagen.": "Unlock failed.",
  };
  var PLUR = { "Themen": "topics", "Reiseziele": "destinations", "Spiele": "games", "Bücher": "books",
    "Podcasts": "podcasts", "Pflanzen": "plants", "Paper": "papers", "Filme": "movies", "Acts": "acts" };
  function tr(s) {
    if (!s) return s;
    var v = s.trim();
    if (D[v]) return s.replace(v, D[v]);
    var m = v.match(/^(\\d+) (.+)$/);
    if (m && PLUR[m[2]]) return m[1] + " " + PLUR[m[2]];
    m = v.match(/^Entdecke ähnliche (.+) und wie sie zusammenhängen — ein Klick öffnet das Netz\\.$/);
    if (m) return "Discover similar " + (PLUR[m[1]] || m[1]).toLowerCase() + " and how they connect — one click opens the network.";
    m = v.match(/^(.+) — dieses Experiment ist noch nicht öffentlich \\(Passwort nötig\\)\\.$/);
    if (m) return m[1] + " — this experiment is not public yet (password required).";
    // Teilsätze in längeren Knoten (z. B. Footer "v1.2 · alle Domänen in einer App · …")
    if (s.indexOf("alle Domänen in einer App") >= 0) return s.replace("alle Domänen in einer App", D["alle Domänen in einer App"]);
    return s;
  }
  // Attribute (Hints/Tooltips) + sichtbare Textknoten übersetzen
  [].slice.call(document.querySelectorAll("[data-title],[data-info],[title]")).forEach(function (el) {
    ["data-title", "data-info", "title"].forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, tr(v)); });
  });
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var tn; var nodesArr = [];
  while ((tn = walker.nextNode())) { var pt = tn.parentNode && tn.parentNode.tagName; if (pt !== "SCRIPT" && pt !== "STYLE") nodesArr.push(tn); }
  nodesArr.forEach(function (n) { var v = n.nodeValue.trim(); if (v) { var e = tr(v); if (e !== v) n.nodeValue = n.nodeValue.replace(v, e); } });
  document.title = tr(document.title);
  window.LIKE_TR = tr; // fürs Passwort-Prompt im Unlock-Script
})();
</script>
${gated ? `<script>
// Gesperrter Planet: Passwort abfragen -> freischalten -> zur Domäne.
(function(){
  var TR = window.LIKE_TR || function(s){ return s; }; // Sprach-Wörterbuch (EN), sonst Durchreiche
  function unlock(href){
    var pw = window.prompt(TR("Diese Domäne ist noch in Arbeit.\\nPasswort eingeben, um sie freizuschalten:"));
    if(pw==null) return;
    fetch("/api/unlock",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:pw})})
      .then(function(r){ if(r.ok){ location.href=href; } else { alert(TR("Falsches Passwort.")); } })
      .catch(function(){ alert(TR("Freischalten fehlgeschlagen.")); });
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
