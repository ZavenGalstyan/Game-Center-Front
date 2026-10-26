/**
 * Shadow Runner — Canvas 2D renderer. Draws one frame of a sim in world
 * units (the caller sets the base transform so 1 unit = VIEW_H-relative px).
 * Owns presentation-only state: camera, particles, weather, flashes; it reads
 * the sim but never writes to it.
 */
import { THEMES, TILE, buildLayer, rng } from "./theme.js";
import { drawFigure, poseFor } from "./runner.js";
import { laserOn, laserRect, laserPhase, hunterPose } from "../engine/sim.js";
import { PHYS } from "../engine/constants.js";

const TAU = Math.PI * 2;

export function createView(L, settings = {}) {
  const theme = THEMES[L.district] || THEMES[0];
  const view = {
    L,
    theme,
    weather: L.weather || "dusk",
    layers: theme.layers.map((ly, i) => ({ ...ly, items: buildLayer(ly, L.district * 97 + i * 13 + 5) })),
    cam: { x: 0, y: 0, init: false },
    shake: 0,
    flash: 0,
    flashColor: "255,255,255",
    lightning: { t: 3 + Math.random() * 4, bolt: null, life: 0 },
    parts: [],
    rain: [],
    embers: [],
    fallen: new Map(), // crumble index → render time it fell
    springT: new Map(),
    time: 0,
    patterns: null,
    props: buildProps(L),
    settings,
  };
  return view;
}

function buildProps(L) {
  const props = [];
  const r = rng(L.id * 7919 + 3);
  for (const roof of L.roofs) {
    let x = roof.x + 30 + r() * 80;
    while (x < roof.x + roof.w - 60) {
      const w = 26 + r() * 50;
      // keep props clear of anything you can collide with on this roof
      const busy = L.solids.some((c) => c !== roof && c.x < x + w + 30 && c.x + c.w > x - 30 && c.y < roof.y + 2 && c.y + c.h > roof.y - 300);
      const nearEdge = x + w > roof.x + roof.w - 20;
      if (!busy && !nearEdge) {
        const k = r();
        const type = k < 0.35 ? "ac" : k < 0.55 ? "vent" : k < 0.72 ? "antenna" : k < 0.86 ? "tank" : "pipe";
        props.push({ type, x, y: roof.y, w, h: 14 + r() * 26, seed: r() });
      }
      x += w + 90 + r() * 260;
    }
  }
  return props;
}

function makePatterns(ctx, theme) {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(240, 200) : Object.assign(document.createElement("canvas"), { width: 240, height: 200 });
    const g = c.getContext("2d");
    const r = rng(1234 + v * 77);
    const cols = 4 + v;
    const cw = 240 / cols;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < cols; col++) {
        const lit = r() < 0.2;
        g.fillStyle = lit ? theme.window : "rgba(255,255,255,0.025)";
        if (lit) g.globalAlpha = 0.18 + r() * 0.4;
        g.fillRect(col * cw + cw * 0.3, row * 50 + 16, cw * 0.4, 20);
        g.globalAlpha = 1;
      }
    }
    out.push(ctx.createPattern(c, "repeat"));
  }
  return out;
}

// ---------------------------------------------------------------- update

export function updateView(v, s, dt, events, W, H) {
  v.time += dt;
  const p = s.p;
  const cam = v.cam;
  const tx = p.x - W * 0.3;
  const ty = Math.min(p.y + p.h - H * 0.64, s.L.deathY + 40 - H);
  if (!cam.init) {
    cam.x = tx;
    cam.y = ty;
    cam.init = true;
  } else if (s.phase !== "dead" || s.deathCause !== "fall") {
    const kx = 1 - Math.exp(-dt * 7);
    const ky = 1 - Math.exp(-dt * (p.mode === "air" && p.vy > 500 ? 7 : 3.6));
    cam.x += (tx - cam.x) * kx;
    cam.y += (ty - cam.y) * ky;
  }
  if (s.phase === "dead" && s.deathCause === "fall") cam.y += (Math.min(ty, s.L.deathY - H * 0.5) - cam.y) * 0.02;

  const fxOn = v.settings.effects !== false;
  const feet = p.y + p.h;
  const cx = p.x + p.w / 2;
  for (const e of events) {
    if (e === "land" || e === "landHard") dust(v, cx, feet, e === "landHard" ? 10 : 5);
    else if (e === "jump" || e === "walljump") dust(v, cx, feet, 4);
    else if (e === "airjump") ring(v, cx, feet - 4);
    else if (e === "coin") sparkle(v, cx, p.y + 20);
    else if (e === "bonk") {
      v.shake = Math.max(v.shake, 6);
      dust(v, cx + 10, p.y + 20, 6);
    } else if (e === "spring") v.springT.set(Math.round(cx / 50), v.time);
    else if (e === "die:laser") {
      burst(v, cx, p.y + p.h / 2, "#ff3a4a", 28);
      v.shake = 9;
      flash(v, "255,60,70", 0.35);
    } else if (e === "die:caught") {
      burst(v, cx, p.y + p.h / 2, "#ff3a4a", 14);
      v.shake = 10;
      flash(v, "255,30,40", 0.45);
    } else if (e === "die:fall") v.shake = 4;
    else if (e === "checkpoint") ring(v, cx, p.y + 10, "#4dff9a");
    else if (e === "respawn") {
      v.cam.x = tx;
      v.cam.y = ty;
      ring(v, cx, p.y + 28, v.theme.accent);
    } else if (e === "finish") ring(v, cx, p.y + 20, "#ffffff");
    else if (e === "landHard") v.shake = Math.max(v.shake, 3);
  }
  for (let i = 0; i < s.crumble.length; i++) if (s.crumble[i] === Infinity && !v.fallen.has(i)) v.fallen.set(i, v.time);
  for (const i of v.fallen.keys()) if (s.crumble[i] !== Infinity) v.fallen.delete(i);

  if (v.settings.shake === false) v.shake = 0;
  v.shake = Math.max(0, v.shake - dt * 30);
  v.flash = Math.max(0, v.flash - dt * 1.6);

  // particles
  const parts = v.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) {
      parts[i] = parts[parts.length - 1];
      parts.pop();
      continue;
    }
    q.vy += (q.g ?? 600) * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }

  // weather
  const wx = v.weather;
  const rainy = wx === "rain" || wx === "storm";
  const wantRain = fxOn && rainy ? (wx === "storm" ? 170 : 110) : 0;
  while (v.rain.length < wantRain) v.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.6 });
  if (v.rain.length > wantRain) v.rain.length = wantRain;
  for (const d of v.rain) {
    d.y += 900 * d.s * dt;
    d.x -= 160 * d.s * dt;
    if (d.y > H) {
      d.y -= H + 20;
      d.x = Math.random() * (W + 200);
    }
    if (d.x < -20) d.x += W + 40;
  }
  const wantEmbers = fxOn && (wx === "embers" || wx === "haze") ? 50 : 0;
  while (v.embers.length < wantEmbers) v.embers.push({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random(), ph: Math.random() * TAU });
  if (v.embers.length > wantEmbers) v.embers.length = wantEmbers;
  for (const e of v.embers) {
    e.y -= 30 * e.s * dt;
    e.x += Math.sin(v.time * 1.3 + e.ph) * 14 * dt - 20 * dt;
    if (e.y < -10) {
      e.y = H + 10;
      e.x = Math.random() * W;
    }
    if (e.x < -10) e.x += W + 20;
  }
  if (wx === "storm" && fxOn) {
    const lg = v.lightning;
    lg.t -= dt;
    lg.life = Math.max(0, lg.life - dt);
    if (lg.t <= 0) {
      lg.t = 4 + Math.random() * 6;
      lg.life = 0.35;
      lg.bolt = bolt(W * (0.15 + Math.random() * 0.7), H * 0.55);
      flash(v, "200,225,255", 0.28);
    }
  }
}

function flash(v, color, a) {
  if (v.settings.effects === false) a *= 0.4;
  v.flashColor = color;
  v.flash = Math.max(v.flash, a);
}
function dust(v, x, y, n) {
  for (let i = 0; i < n; i++)
    v.parts.push({ x: x + (Math.random() - 0.5) * 16, y: y - 2, vx: (Math.random() - 0.5) * 140, vy: -40 - Math.random() * 80, g: 200, life: 0.35 + Math.random() * 0.25, max: 0.6, size: 3 + Math.random() * 3, color: "rgba(200,200,210,0.35)", kind: "dust" });
}
function sparkle(v, x, y) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    v.parts.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, g: 300, life: 0.4, max: 0.4, size: 2.4, color: "#ffe27a", kind: "spark" });
  }
}
function burst(v, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = 80 + Math.random() * 280;
    v.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 700, life: 0.5 + Math.random() * 0.5, max: 1, size: 2 + Math.random() * 3.5, color, kind: "spark" });
  }
}
function ring(v, x, y, color = "#ffffff") {
  v.parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0.4, max: 0.4, size: 30, color, kind: "ring" });
}
function bolt(x, yEnd) {
  const pts = [[x, 0]];
  let cx = x;
  for (let y = 0; y < yEnd; y += 24 + Math.random() * 30) {
    cx += (Math.random() - 0.5) * 50;
    pts.push([cx, y]);
  }
  return pts;
}

// ---------------------------------------------------------------- draw

export function drawWorld(ctx, v, s, alpha, W, H) {
  const th = v.theme;
  const L = s.L;
  if (!v.patterns) v.patterns = makePatterns(ctx, th);
  const cam = v.cam;
  const shx = v.shake ? (Math.random() - 0.5) * v.shake : 0;
  const shy = v.shake ? (Math.random() - 0.5) * v.shake : 0;

  // ---- sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  th.sky.forEach((c, i) => sky.addColorStop(i / (th.sky.length - 1), c));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (th.sun) {
    const sx = W * th.sun.x - cam.x * 0.01;
    const sy = H * th.sun.y - cam.y * 0.02;
    const g = ctx.createRadialGradient(sx, sy, th.sun.r * 0.4, sx, sy, th.sun.r * 3.2);
    g.addColorStop(0, th.sun.glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = th.sun.color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(sx, sy, th.sun.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const lg = v.lightning;
  if (lg.life > 0 && lg.bolt) {
    ctx.strokeStyle = `rgba(220,235,255,${(lg.life / 0.35) * 0.9})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    lg.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }

  // ---- parallax skyline
  const horizon = H * 0.86 - (cam.y - (L.start.y - H * 0.64)) * 0.06;
  for (const ly of v.layers) {
    const base = horizon + ly.f * 140 - (cam.y - (L.start.y - H * 0.64)) * ly.f * 0.35;
    const off = -(((cam.x * ly.f) % TILE) + TILE) % TILE;
    for (let rep = off; rep < W; rep += TILE) drawLayer(ctx, ly, rep, base, H, th, v.time);
    ctx.fillStyle = th.fog;
    ctx.fillRect(0, base - 60, W, H - base + 60);
  }

  // ---- world
  ctx.save();
  ctx.translate(-cam.x + shx, -cam.y + shy);
  const x0 = cam.x - 80;
  const x1 = cam.x + W + 80;
  const yBot = cam.y + H + 20;

  for (const pr of v.props) if (pr.x + pr.w > x0 && pr.x < x1) drawProp(ctx, pr, th, v.time);

  for (const c of L.solids) {
    if (c.x + c.w < x0 || c.x > x1) continue;
    drawSolid(ctx, c, th, v, yBot, s);
  }
  for (const c of L.crumbles) {
    if (c.x + c.w < x0 || c.x > x1) continue;
    drawCrumble(ctx, c, s.crumble[c.ci], v);
  }
  for (const m of L.movers) {
    if (m.x + m.w < x0 - 200 || m.x > x1 + 200) continue;
    drawMover(ctx, m, th, cam.y);
  }
  for (const sp of L.springs) if (sp.x + sp.w > x0 && sp.x < x1) drawSpring(ctx, sp, th, v);
  L.checkpoints.forEach((c, i) => c.x > x0 && c.x < x1 && drawCheckpoint(ctx, c, i <= s.cp.i, v.time));
  if (L.finish.x > x0 - 200 && L.finish.x < x1 + 200) drawFinish(ctx, L.finish, th, v.time);

  // coins
  for (let i = 0; i < L.coins.length; i++) {
    if (s.coins[i]) continue;
    const c = L.coins[i];
    if (c.x < x0 || c.x > x1) continue;
    drawCoin(ctx, c.x, c.y, v.time);
  }

  // hunter
  if (s.chase) {
    const hp = hunterPose(s);
    if (hp && hp.x > x0 - 60) {
      const feet = hp.y + (hp.h || PHYS.H);
      const pose = poseFor({ m: hp.m === "dead" ? "run" : hp.m, vx: hp.vx, vy: hp.vy, st: hp.st, jk: hp.jk, at: hp.at, k: 0.5 }, v.time);
      ctx.save();
      const g = ctx.createRadialGradient(hp.x + 11, feet - 30, 4, hp.x + 11, feet - 30, 60);
      g.addColorStop(0, "rgba(255,40,50,0.28)");
      g.addColorStop(1, "rgba(255,40,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(hp.x - 50, feet - 90, 122, 120);
      ctx.restore();
      drawFigure(ctx, hp.x + 11, feet, (hp.vx ?? 1) < 0 ? -1 : 1, pose, { body: "#000000", far: "#1a0709", rim: "#ff2a3a", bulk: 1.16, visor: "#ff4747", coat: true });
    }
  }

  // player
  const p = s.p;
  if (!(s.phase === "dead" && s.deathCause === "laser")) {
    const ix = p.px + (p.x - p.px) * alpha;
    const iy = p.py + (p.y - p.py) * alpha;
    const feet = iy + p.h;
    const q = { m: p.mode === "dead" ? "air" : p.mode, vx: p.vx, vy: p.vy, st: p.stride, jk: p.jumpKind, at: p.airT, landT: p.landT, k: p.sc ? p.sc.t / p.sc.dur : 0.5 };
    if (s.phase === "done") q.m = "run";
    const pose = poseFor(q, v.time);
    const dir = p.mode === "wall" ? p.wallDir : p.dir < 0 ? -1 : 1;
    // speed afterimages
    if (v.settings.effects !== false && s.trail.length > 12 && (Math.abs(p.vx) > L.run * 0.9 || p.jumpKind === 2)) {
      for (const back of [10, 5]) {
        const tq = s.trail[s.trail.length - back];
        if (!tq) continue;
        drawFigure(ctx, tq.x + 11, tq.y + tq.h, dir, poseFor({ m: tq.m, vx: tq.vx, vy: tq.vy, st: tq.st, jk: tq.jk, at: tq.at, k: 0.5 }, v.time), { body: th.accent, far: th.accent, alpha: back === 10 ? 0.07 : 0.13 });
      }
    }
    drawFigure(ctx, ix + p.w / 2, feet, dir, pose, { body: "#030305", far: "#17171f", rim: th.rim, scarf: th.accent, alpha: s.phase === "dead" ? Math.max(0, s.deadT / 0.75) : 1 });
  }

  // lasers on top
  for (const z of L.lasers) {
    const r = laserRect(z, s.t);
    if (r.x + r.w < x0 || r.x > x1) continue;
    drawLaser(ctx, z, r, s.t);
  }

  // particles
  for (const q of v.parts) {
    const k = q.life / q.max;
    if (q.kind === "ring") {
      ctx.strokeStyle = q.color;
      ctx.globalAlpha = k * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (1.4 - k), 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = q.color;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- screen-space weather + overlays
  if (v.rain.length) {
    ctx.strokeStyle = "rgba(190,215,255,0.32)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const d of v.rain) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + 6 * d.s, d.y - 26 * d.s);
    }
    ctx.stroke();
  }
  if (v.embers.length) {
    ctx.fillStyle = v.weather === "haze" ? "rgba(255,120,220,0.55)" : "rgba(255,170,80,0.8)";
    for (const e of v.embers) {
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(v.time * 2 + e.ph));
      ctx.fillRect(e.x, e.y, 2.2 * e.s, 2.2 * e.s);
    }
    ctx.globalAlpha = 1;
  }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // hunter danger edge
  if (s.chase && s.phase === "play") {
    const gap = s.p.dist - s.chase.h;
    const d = Math.max(0, Math.min(1, 1 - (gap - 60) / 160));
    if (d > 0) {
      const eg = ctx.createLinearGradient(0, 0, W * 0.28, 0);
      eg.addColorStop(0, `rgba(255,20,40,${0.45 * d})`);
      eg.addColorStop(1, "rgba(255,20,40,0)");
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, W * 0.28, H);
    }
  }
  if (v.flash > 0) {
    ctx.fillStyle = `rgba(${v.flashColor},${v.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------- pieces

function drawLayer(ctx, ly, ox, base, H, th, t) {
  ctx.fillStyle = ly.color;
  for (const it of ly.items) {
    const x = ox + it.x;
    const top = base - it.h;
    ctx.fillRect(x, top, it.w, H - top + 400);
    const e = it.extra;
    if (e) {
      if (e.type === "crane") {
        ctx.fillRect(x + it.w / 2 - 3, base - e.h, 6, e.h - it.h);
        ctx.fillRect(x + it.w / 2 - e.arm * 0.3, base - e.h, e.arm, 5);
        ctx.fillRect(x + it.w / 2 + e.arm * 0.6, base - e.h, 2, 60);
      } else if (e.type === "stack") {
        ctx.fillRect(x + it.w * 0.3, base - e.h, e.w, e.h - it.h);
      } else if (e.type === "spire") {
        ctx.beginPath();
        ctx.moveTo(x + it.w * 0.2, top);
        ctx.lineTo(x + it.w / 2, top - e.h);
        ctx.lineTo(x + it.w * 0.8, top);
        ctx.fill();
        if (Math.sin(t * 2 + it.x) > 0.6) {
          ctx.fillStyle = "rgba(255,70,70,0.9)";
          ctx.fillRect(x + it.w / 2 - 1.5, top - e.h - 3, 3, 3);
          ctx.fillStyle = ly.color;
        }
      } else if (e.type === "antenna") {
        ctx.fillRect(x + it.w * 0.6, top - e.h, 2, e.h);
      } else if (e.type === "sign") {
        ctx.fillStyle = e.hue ? "rgba(57,230,255,0.55)" : "rgba(255,62,165,0.55)";
        const flick = Math.sin(t * 7 + it.x) > -0.95 ? 1 : 0.3;
        ctx.globalAlpha = flick;
        ctx.fillRect(x + 5, top + e.y, e.w, e.h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ly.color;
      }
    }
    if (it.windows.length) {
      ctx.fillStyle = th.window;
      ctx.globalAlpha = ly.f < 0.3 ? 0.35 : 0.55;
      for (const w of it.windows) ctx.fillRect(x + w.x, top + w.y, w.w, w.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ly.color;
    }
  }
}

function drawProp(ctx, pr, th, t) {
  ctx.fillStyle = th.facade2;
  const { x, y, w, h } = pr;
  switch (pr.type) {
    case "ac":
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 4, y - h + 4, w - 8, 3);
      break;
    case "vent":
      ctx.fillRect(x + w / 2 - 5, y - h - 10, 10, h + 10);
      ctx.fillRect(x + w / 2 - 9, y - h - 14, 18, 5);
      break;
    case "antenna":
      ctx.fillRect(x + w / 2 - 1, y - h * 3, 2, h * 3);
      ctx.fillRect(x + w / 2 - 8, y - h * 2.4, 16, 2);
      if (Math.sin(t * 3 + x) > 0.3) {
        ctx.fillStyle = "rgba(255,60,60,0.85)";
        ctx.fillRect(x + w / 2 - 1.5, y - h * 3 - 3, 3, 3);
      }
      break;
    case "tank":
      ctx.fillRect(x + 4, y - h - 8, 3, h + 8);
      ctx.fillRect(x + w - 7, y - h - 8, 3, h + 8);
      ctx.fillRect(x, y - h * 2 - 8, w, h);
      ctx.beginPath();
      ctx.moveTo(x - 2, y - h * 2 - 8);
      ctx.lineTo(x + w / 2, y - h * 2 - 22);
      ctx.lineTo(x + w + 2, y - h * 2 - 8);
      ctx.fill();
      break;
    default:
      ctx.fillRect(x, y - 14, w, 6);
      ctx.fillRect(x, y - 14, 5, 14);
      ctx.fillRect(x + w - 5, y - 14, 5, 14);
  }
}

function drawSolid(ctx, c, th, v, yBot, s) {
  const bottom = Math.min(c.y + c.h, yBot);
  if (c.kind === "roof" || c.kind === "block") {
    ctx.fillStyle = th.facade;
    ctx.fillRect(c.x, c.y, c.w, bottom - c.y);
    const pat = v.patterns[(Math.abs(Math.round(c.x / 97)) + (c.kind === "block" ? 1 : 0)) % 3];
    if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") {
      pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, c.x + 10, c.y + 26]));
      ctx.fillStyle = pat;
      ctx.fillRect(c.x + 8, c.y + 24, c.w - 16, bottom - c.y - 24);
    }
    // depth fade
    const g = ctx.createLinearGradient(0, c.y + 20, 0, c.y + 280);
    g.addColorStop(0, "rgba(0,0,0,0.1)");
    g.addColorStop(1, "rgba(0,0,0,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(c.x, c.y, c.w, bottom - c.y);
    // parapet + rim light
    ctx.fillStyle = th.solid;
    ctx.fillRect(c.x - 3, c.y, c.w + 6, 10);
    ctx.fillStyle = th.rim;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(c.x - 3, c.y, c.w + 6, 2);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(c.x - 3, c.y, 2, Math.min(80, bottom - c.y));
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = th.solid;
  if (c.kind === "vault") {
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = th.rim;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
    ctx.beginPath();
    ctx.moveTo(c.x + 4, c.y + 4);
    ctx.lineTo(c.x + c.w - 4, c.y + c.h - 4);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = th.rim;
    ctx.fillRect(c.x, c.y, c.w, 2);
    ctx.globalAlpha = 1;
  } else if (c.kind === "bar") {
    ctx.fillRect(c.x, c.y, c.w, c.h);
    // billboard face at the bottom edge — this is what you slide under
    ctx.fillStyle = th.accent2;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(c.x, c.y + c.h - 3, c.w, 3);
    ctx.globalAlpha = 0.18;
    ctx.fillRect(c.x + 6, c.y + c.h - 40, c.w - 12, 30);
    ctx.globalAlpha = 1;
    for (let i = 0; i < c.w; i += 14) {
      ctx.fillStyle = (i / 14) % 2 ? "#111" : th.accent2;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(c.x + i, c.y + c.h - 9, 7, 5);
    }
    ctx.globalAlpha = 1;
  } else if (c.kind === "plat") {
    ctx.fillStyle = th.plank;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = th.solid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = c.x; x < c.x + c.w - 10; x += 20) {
      ctx.moveTo(x, c.y + c.h);
      ctx.lineTo(x + 10, c.y + c.h + 14);
      ctx.lineTo(x + 20, c.y + c.h);
    }
    ctx.moveTo(c.x, c.y + c.h + 14);
    ctx.lineTo(c.x + c.w, c.y + c.h + 14);
    ctx.stroke();
    ctx.fillStyle = th.rim;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(c.x, c.y, c.w, 2);
    ctx.globalAlpha = 1;
  } else {
    // wall / generic block on a roof
    ctx.fillRect(c.x, c.y, c.w, Math.min(c.h, bottom - c.y));
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = c.y + 12; y < Math.min(c.y + c.h, bottom) - 6; y += 18) ctx.fillRect(c.x + 3, y, c.w - 6, 2);
    ctx.fillStyle = th.rim;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(c.x, c.y, c.w, 2);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(c.x, c.y, 2, Math.min(c.h, bottom - c.y));
    ctx.globalAlpha = 1;
  }
}

function drawCrumble(ctx, c, state, v) {
  let dy = 0;
  let dx = 0;
  let rot = 0;
  let a = 1;
  if (state === Infinity) {
    const t0 = v.fallen.get(c.ci) ?? v.time;
    const t = v.time - t0;
    if (t > 1.2) return;
    dy = 0.5 * 1800 * t * t;
    rot = t * 0.4;
    a = Math.max(0, 1 - t / 1.2);
  } else if (state >= 0) {
    const k = state / c.delay;
    dx = Math.sin(v.time * 70) * 1.8 * k;
    dy = k * 2;
  }
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(c.x + c.w / 2 + dx, c.y + dy);
  ctx.rotate(rot);
  ctx.fillStyle = "#1d1714";
  ctx.fillRect(-c.w / 2, 0, c.w, c.h);
  ctx.strokeStyle = "rgba(255,190,120,0.35)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const r = rng(c.ci * 31 + 7);
  for (let i = 0; i < 4; i++) {
    let x = -c.w / 2 + r() * c.w;
    ctx.moveTo(x, 0);
    for (let y = 4; y < c.h; y += 5) {
      x += (r() - 0.5) * 10;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.fillStyle = state >= 0 && state !== Infinity ? "#ff7a3a" : "#c98a52";
  ctx.fillRect(-c.w / 2, 0, c.w, 2);
  ctx.restore();
}

function drawMover(ctx, m, th, camY) {
  ctx.strokeStyle = "rgba(170,170,190,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(m.x + 14, m.y);
  ctx.lineTo(m.x + 14, camY - 20);
  ctx.moveTo(m.x + m.w - 14, m.y);
  ctx.lineTo(m.x + m.w - 14, camY - 20);
  ctx.stroke();
  ctx.fillStyle = "#23262e";
  ctx.fillRect(m.x, m.y, m.w, m.h);
  for (let x = 0; x < m.w; x += 16) {
    ctx.fillStyle = (x / 16) % 2 ? "#111" : th.accent2;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(m.x + x, m.y + m.h - 6, 8, 6);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = th.rim;
  ctx.fillRect(m.x, m.y, m.w, 2);
}

function drawSpring(ctx, sp, th, v) {
  let squash = 0;
  for (const [k, t] of v.springT) if (Math.abs(k * 50 - (sp.x + sp.w / 2)) < 60) squash = Math.max(squash, Math.max(0, 1 - (v.time - t) / 0.25));
  const h = 10 - squash * 6;
  ctx.fillStyle = th.solid;
  ctx.fillRect(sp.x - 4, sp.y - 4, sp.w + 8, 4);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(sp.x, sp.y - 4 - h, sp.w, 5);
  ctx.strokeStyle = "#ffd23f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = sp.x + 6 + i * ((sp.w - 12) / 3);
    ctx.moveTo(x - 3, sp.y - 4);
    ctx.lineTo(x + 3, sp.y - 4 - h / 2);
    ctx.lineTo(x - 3, sp.y - 4 - h);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(255,210,63,0.18)";
  ctx.fillRect(sp.x - 2, sp.y - 30, sp.w + 4, 26);
}

function drawCheckpoint(ctx, c, reached, t) {
  const x = c.x;
  const y = c.y;
  ctx.fillStyle = "#15151c";
  ctx.fillRect(x - 2, y - 70, 4, 70);
  const col = reached ? "#4dff9a" : "#ff5a5a";
  ctx.fillStyle = col;
  const wave = Math.sin(t * 5) * 3;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 70);
  ctx.quadraticCurveTo(x + 14, y - 66 + wave, x + 26, y - 62);
  ctx.lineTo(x + 2, y - 52);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y - 70, 1, x, y - 70, 26);
  g.addColorStop(0, reached ? "rgba(77,255,154,0.6)" : "rgba(255,90,90,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 26, y - 96, 52, 52);
}

function drawFinish(ctx, f, th, t) {
  const x = f.x;
  const y = f.y;
  const beam = ctx.createLinearGradient(0, y - 600, 0, y);
  beam.addColorStop(0, "rgba(255,255,255,0)");
  beam.addColorStop(1, `rgba(140,255,200,${0.18 + Math.sin(t * 3) * 0.05})`);
  ctx.fillStyle = beam;
  ctx.fillRect(x - 10, y - 600, 90, 600);
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(x - 10, y - 130, 8, 130);
  ctx.fillRect(x + 72, y - 130, 8, 130);
  ctx.fillRect(x - 14, y - 138, 98, 16);
  ctx.fillStyle = "#4dff9a";
  ctx.fillRect(x - 14, y - 124, 98, 2);
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ESCAPE", x + 35, y - 126);
  for (let i = 0; i < 5; i++) {
    const on = Math.floor(t * 6) % 5 === i;
    ctx.fillStyle = on ? "#c8ffe0" : "#2c6b4a";
    ctx.fillRect(x - 8, y - 112 + i * 20, 4, 10);
    ctx.fillRect(x + 74, y - 112 + i * 20, 4, 10);
  }
}

function drawCoin(ctx, x, y, t) {
  const k = Math.cos(t * 4 + x * 0.05);
  const w = 8 * Math.max(0.18, Math.abs(k));
  const g = ctx.createRadialGradient(x, y, 1, x, y, 18);
  g.addColorStop(0, "rgba(255,220,90,0.45)");
  g.addColorStop(1, "rgba(255,220,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 18, y - 18, 36, 36);
  ctx.fillStyle = k > 0 ? "#ffd84a" : "#e0a92a";
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(x - w * 0.3, y - 5, Math.max(1, w * 0.3), 4);
}

function drawLaser(ctx, z, r, t) {
  const on = laserOn(z, t);
  const vertical = r.h >= r.w;
  // emitters
  ctx.fillStyle = "#1b1b22";
  if (vertical) {
    ctx.fillRect(r.x - 5, r.y - 8, r.w + 10, 8);
    if (r.h < 200) ctx.fillRect(r.x - 5, r.y + r.h, r.w + 10, 6);
  } else {
    ctx.fillRect(r.x - 8, r.y - 4, 8, r.h + 8);
    ctx.fillRect(r.x + r.w, r.y - 4, 8, r.h + 8);
  }
  if (!on) {
    const ph = laserPhase(z, t);
    const toOn = z.on + z.off - ph;
    const warn = toOn < 0.3 && Math.floor(t * 20) % 2 === 0;
    ctx.fillStyle = warn ? "rgba(255,60,70,0.55)" : "rgba(255,60,70,0.12)";
    if (vertical) ctx.fillRect(r.x + r.w / 2 - 1, r.y, 2, r.h);
    else ctx.fillRect(r.x, r.y + r.h / 2 - 1, r.w, 2);
    return;
  }
  const flick = 0.85 + Math.sin(t * 40 + r.x) * 0.15;
  ctx.fillStyle = `rgba(255,40,60,${0.1 * flick})`;
  ctx.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
  ctx.fillStyle = `rgba(255,40,60,${0.28 * flick})`;
  ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.fillStyle = "#ff2a3c";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#ffd0d4";
  if (vertical) ctx.fillRect(r.x + r.w / 2 - 1, r.y, 2, r.h);
  else ctx.fillRect(r.x, r.y + r.h / 2 - 1, r.w, 2);
}
