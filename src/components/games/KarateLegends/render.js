/**
 * Karate Legends drawing: arenas (static layers cached per arena on an
 * offscreen canvas), procedural cartoon fighters, hit FX and the canvas HUD.
 * Reads engine state only — never mutates it. Per-fighter animation state
 * (smoothed pose, delayed health bar) lives in a WeakMap keyed by fighter.
 */
import { W, H, FLOOR, ENERGY_MAX, hitbox, hurtbox } from "./engine.js";
import { ARENAS, PLAYER_LOOK } from "./data.js";

const D2R = Math.PI / 180;
const INK = "#1d1626";
const THIGH = 40;
const SHIN = 38;
const TORSO = 52;
const UPPER = 27;
const FORE = 26;

// angles in degrees: lean 0 = upright (+ forward); limbs 0 = straight down, 90 = forward, 180 = up
const POSES = {
  idle: { lean: 8, fu: 42, ff: 150, bu: 26, bf: 140, ft: 26, fs: 4, bt: -24, bs: -8 },
  jump: { lean: 4, fu: 60, ff: 160, bu: 40, bf: 150, ft: 72, fs: -6, bt: 12, bs: -78 },
  block: { lean: -5, fu: 72, ff: 172, bu: 60, bf: 166, ft: 28, fs: 6, bt: -28, bs: -10 },
  hit: { lean: -22, fu: -12, ff: 30, bu: -28, bf: 8, ft: 16, fs: 6, bt: -24, bs: -14 },
  win: { lean: 0, fu: 168, ff: 176, bu: 28, bf: 122, ft: 10, fs: 0, bt: -10, bs: 0 },
  jab: { lean: 14, fu: 88, ff: 90, bu: 30, bf: 140, ft: 30, fs: 6, bt: -28, bs: -8 },
  cross: { lean: 20, fu: 44, ff: 155, bu: 88, bf: 90, ft: 30, fs: 6, bt: -30, bs: -6 },
  roundhouse: { lean: -20, fu: 50, ff: 150, bu: -20, bf: 40, ft: 112, fs: 104, bt: -8, bs: -4 },
  kick: { lean: -12, fu: 46, ff: 150, bu: 10, bf: 100, ft: 90, fs: 90, bt: -12, bs: -6 },
  airPunch: { lean: 14, fu: 76, ff: 66, bu: 30, bf: 140, ft: 66, fs: -8, bt: 10, bs: -80 },
  airKick: { lean: -6, fu: 60, ff: 150, bu: 20, bf: 120, ft: 74, fs: 62, bt: -22, bs: -92 },
  special: { lean: -10, fu: -40, ff: -20, bu: -52, bf: -30, ft: 90, fs: 90, bt: -40, bs: -100 },
};
const KEYS = Object.keys(POSES.idle);

const anim = new WeakMap();
const animOf = (f) => {
  let a = anim.get(f);
  if (!a) {
    a = { pose: { ...POSES.idle }, hpShown: f.hp, hpTrail: f.hp, energyFlash: 0 };
    anim.set(f, a);
  }
  return a;
};

function lerpPose(p, q, w) {
  const o = {};
  for (const k of KEYS) o[k] = p[k] + (q[k] - p[k]) * w;
  return o;
}

function targetPose(f, s) {
  const at = f.attack;
  if (at) {
    const m = at.m;
    const base = m.air ? POSES.jump : POSES.idle;
    let w;
    if (at.t < m.startup) w = at.t / m.startup;
    else if (at.t < m.startup + m.active) w = 1;
    else w = Math.max(0, 1 - (at.t - m.startup - m.active) / m.recovery);
    return { pose: lerpPose(base, POSES[at.name], easeOut(w)), snap: true };
  }
  switch (f.state) {
    case "walk": {
      const ph = Math.sin(f.walkT * 9);
      const p = { ...POSES.idle };
      p.ft += ph * 16;
      p.bt -= ph * 16;
      p.fs += Math.max(0, -ph) * 18;
      p.bs -= Math.max(0, ph) * 18;
      return { pose: p };
    }
    case "jump":
      return { pose: POSES.jump };
    case "block":
      return { pose: POSES.block };
    case "hit":
    case "ko":
      return { pose: POSES.hit, snap: f.stateT < 0.02 };
    case "win":
      return { pose: { ...POSES.win, fu: 168 + Math.sin(s.time * 8) * 6 } };
    default: {
      const p = { ...POSES.idle };
      const br = Math.sin(s.time * 3.2 + f.idx) * 2;
      p.fu += br;
      p.bu += br;
      return { pose: p };
    }
  }
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

/* ---------- fighter ---------- */

function limbEnd(x, y, len, deg) {
  return [x + Math.sin(deg * D2R) * len, y + Math.cos(deg * D2R) * len];
}

function seg(ctx, x0, y0, x1, y1, w, col) {
  ctx.lineWidth = w + 5;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.stroke();
}

function dot(ctx, x, y, r, col) {
  ctx.beginPath();
  ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
}

/** Draw a fighter at the origin (feet), facing +x. */
export function drawFigure(ctx, look, pose, opts = {}) {
  const P = pose;
  // legs from a hip at (0,0); then lift so the lower foot rests on y=0
  const legs = [
    [P.bt, P.bs],
    [P.ft, P.fs],
  ].map(([t, sh]) => {
    const k = limbEnd(0, 0, THIGH, t);
    const ft = limbEnd(k[0], k[1], SHIN, sh);
    return { k, ft };
  });
  const hipY = opts.air ? -(THIGH + SHIN) + 4 : -Math.max(legs[0].ft[1], legs[1].ft[1]);
  ctx.save();
  ctx.translate(0, hipY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const sh = [Math.sin(P.lean * D2R) * TORSO, -Math.cos(P.lean * D2R) * TORSO];
  const arm = (u, f) => {
    const e = limbEnd(sh[0], sh[1], UPPER, u);
    const h = limbEnd(e[0], e[1], FORE, f);
    return { e, h };
  };
  const back = arm(P.bu, P.bf);
  const front = arm(P.fu, P.ff);

  // far side first
  const bl = legs[0];
  seg(ctx, 0, 0, bl.k[0], bl.k[1], 16, look.trim);
  seg(ctx, bl.k[0], bl.k[1], bl.ft[0], bl.ft[1], 14, look.trim);
  dot(ctx, bl.ft[0] + 3, bl.ft[1], 5.5, shade(look.skin, -18));
  seg(ctx, sh[0], sh[1], back.e[0], back.e[1], 13, look.trim);
  seg(ctx, back.e[0], back.e[1], back.h[0], back.h[1], 11, shade(look.skin, -18));
  dot(ctx, back.h[0], back.h[1], 7, shade(look.skin, -18));

  // torso
  seg(ctx, 0, -2, sh[0] * 0.92, sh[1] * 0.92, 30, look.gi);
  ctx.lineWidth = 3;
  ctx.strokeStyle = look.trim;
  ctx.beginPath();
  ctx.moveTo(sh[0] * 0.9 - 6, sh[1] * 0.9);
  ctx.lineTo(sh[0] * 0.45 + 3, sh[1] * 0.45);
  ctx.lineTo(sh[0] * 0.9 + 8, sh[1] * 0.9);
  ctx.stroke();
  // belt
  ctx.save();
  ctx.rotate(P.lean * D2R);
  ctx.fillStyle = INK;
  ctx.fillRect(-17, -12, 34, 11);
  ctx.fillStyle = look.belt;
  ctx.fillRect(-15, -10.5, 30, 8);
  ctx.fillRect(-12, -4, 5, 12);
  ctx.restore();

  // head
  const hd = [sh[0] + Math.sin(P.lean * D2R) * 17, sh[1] - Math.cos(P.lean * D2R) * 17];
  drawHead(ctx, look, hd[0], hd[1], opts);

  // near side
  const fl = legs[1];
  seg(ctx, 0, 0, fl.k[0], fl.k[1], 17, look.gi);
  seg(ctx, fl.k[0], fl.k[1], fl.ft[0], fl.ft[1], 15, look.gi);
  dot(ctx, fl.ft[0] + 3, fl.ft[1], 6, look.skin);
  seg(ctx, sh[0], sh[1], front.e[0], front.e[1], 14, look.gi);
  seg(ctx, front.e[0], front.e[1], front.h[0], front.h[1], 12, look.skin);
  dot(ctx, front.h[0], front.h[1], 7.5, look.skin);
  ctx.restore();
}

function drawHead(ctx, look, x, y, opts) {
  const r = 15;
  // hair behind
  if (look.hairStyle === "pony") {
    seg(ctx, x - 10, y - 6, x - 24, y + 8 + Math.sin(opts.t * 6 || 0) * 2, 8, look.hair);
  } else if (look.hairStyle === "topknot") {
    dot(ctx, x - 2, y - r - 5, 6, look.hair);
  }
  dot(ctx, x, y, r, look.skin);
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  switch (look.hairStyle) {
    case "bald":
      break;
    case "spiky":
      ctx.moveTo(x - r, y - 2);
      for (let k = 0; k <= 5; k++) {
        const a = Math.PI + (k / 5) * Math.PI * 0.9;
        ctx.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
        ctx.lineTo(x + Math.cos(a + 0.3) * r * 0.9, y + Math.sin(a + 0.3) * r * 0.9);
      }
      ctx.lineTo(x + r * 0.6, y - 6);
      break;
    case "mohawk":
      ctx.ellipse(x - 2, y - r + 1, 5, 10, -0.2, 0, Math.PI * 2);
      break;
    default:
      ctx.arc(x - 1, y - 2, r + 1, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(x - r, y - 1);
  }
  ctx.fill();
  if (look.hairStyle === "bun") dot(ctx, x - r + 1, y - 9, 6, look.hair);
  if (look.band) {
    ctx.fillStyle = look.band;
    ctx.fillRect(x - r, y - 8, r * 2, 5);
    const wv = Math.sin((opts.t || 0) * 9) * 3;
    seg(ctx, x - r, y - 6, x - r - 14, y - 2 + wv, 3, look.band);
    seg(ctx, x - r, y - 6, x - r - 11, y + 5 - wv, 3, look.band);
  }
  // face (looking forward)
  ctx.fillStyle = INK;
  if (opts.ko) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x + 10, y + 2);
    ctx.moveTo(x + 10, y - 4);
    ctx.lineTo(x + 4, y + 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x + 8, y - 1, 2.3, opts.hurt ? 1 : 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 7);
    ctx.lineTo(x + 12, y - 5);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 7);
    ctx.lineTo(x + 12, y + (opts.happy ? 5 : 7));
    ctx.stroke();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function drawFighter(ctx, s, f, dt) {
  const a = animOf(f);
  const { pose, snap } = targetPose(f, s);
  if (snap) a.pose = pose;
  else {
    const w = 1 - Math.exp(-dt * 20);
    a.pose = lerpPose(a.pose, pose, w);
  }
  const look = f.look || PLAYER_LOOK;
  // floor shadow
  const lift = Math.max(0, FLOOR - f.y);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 3, Math.max(14, 40 - lift * 0.1), 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  let drawX = f.x;
  if (f.state === "ko") {
    // the lying body extends ~175px behind the feet; keep it on screen at a wall
    const tail = -f.facing * 175;
    drawX = Math.min(W - 12 - Math.max(0, tail), Math.max(12 - Math.min(0, tail), f.x));
  }
  ctx.translate(drawX, f.y);
  if (f.attack?.name === "special") {
    const at = f.attack;
    const glow = at.t < at.m.startup ? at.t / at.m.startup : 1;
    ctx.save();
    ctx.globalAlpha = 0.5 * glow;
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.ellipse(0, -90, 60, 95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (look.boss && f.state !== "ko") {
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(s.time * 4) * 0.06;
    ctx.fillStyle = look.belt;
    ctx.beginPath();
    ctx.ellipse(0, -88, 48, 100, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.scale(f.facing, 1);
  if (f.state === "ko") {
    const k = f.grounded ? Math.min(1, f.stateT / 0.25 + 0.6) : Math.min(0.8, f.stateT * 2.5);
    ctx.translate(0, -10 * k);
    ctx.rotate(-Math.PI / 2 * k);
  }
  if (f.state === "hit" && f.stateT < 0.08) ctx.translate(-4, 0);
  drawFigure(ctx, look, a.pose, { air: !f.grounded || f.attack?.name === "special", t: s.time, ko: f.state === "ko", hurt: f.state === "hit", happy: f.state === "win" });
  ctx.restore();
}

/* ---------- arenas ---------- */

const bgCache = new Map();

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

function paintArena(ctx, id) {
  const r = seeded(id.length * 977 + 3);
  if (id === "dojo") {
    let g = ctx.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, "#7a4a2a");
    g.addColorStop(1, "#b97a45");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FLOOR);
    // shoji panels
    for (let k = 0; k < 6; k++) {
      const x = 30 + k * 155;
      ctx.fillStyle = "#f6ead2";
      ctx.fillRect(x, 70, 130, 300);
      ctx.strokeStyle = "#5a341c";
      ctx.lineWidth = 6;
      ctx.strokeRect(x, 70, 130, 300);
      ctx.lineWidth = 3;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + (130 * i) / 3, 70);
        ctx.lineTo(x + (130 * i) / 3, 370);
        ctx.stroke();
      }
      for (let j = 1; j < 5; j++) {
        ctx.beginPath();
        ctx.moveTo(x, 70 + j * 60);
        ctx.lineTo(x + 130, 70 + j * 60);
        ctx.stroke();
      }
    }
    // beam + scroll
    ctx.fillStyle = "#4a2a14";
    ctx.fillRect(0, 40, W, 34);
    ctx.fillRect(0, 370, W, 22);
    ctx.fillStyle = "#efe2c4";
    ctx.fillRect(W / 2 - 50, 95, 100, 200);
    ctx.strokeStyle = "#3a2210";
    ctx.lineWidth = 4;
    ctx.strokeRect(W / 2 - 50, 95, 100, 200);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(W / 2, 180, 32, 0.3, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(W / 2 - 8, 240, 16, 16);
    // floor planks
    g = ctx.createLinearGradient(0, FLOOR - 60, 0, H);
    g.addColorStop(0, "#d9a066");
    g.addColorStop(1, "#a86a36");
    ctx.fillStyle = g;
    ctx.fillRect(0, 392, W, H - 392);
    ctx.strokeStyle = "rgba(90,50,20,0.35)";
    ctx.lineWidth = 2;
    for (let y = 405; y < H; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // tatami mat
    ctx.fillStyle = "rgba(140,170,90,0.55)";
    ctx.fillRect(120, FLOOR - 18, W - 240, 52);
    ctx.strokeStyle = "rgba(60,80,30,0.6)";
    ctx.strokeRect(120, FLOOR - 18, W - 240, 52);
  } else if (id === "rooftop") {
    let g = ctx.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, "#1b1f4b");
    g.addColorStop(0.6, "#7b3f8c");
    g.addColorStop(1, "#f28c6a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = "#fff6d5";
    ctx.beginPath();
    ctx.arc(760, 110, 38, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 0; layer < 2; layer++) {
      let x = -20;
      while (x < W) {
        const w = 50 + r() * 70;
        const h = (layer ? 120 : 190) + r() * (layer ? 110 : 140);
        ctx.fillStyle = layer ? "#20193a" : "#3a2d5c";
        ctx.fillRect(x, 400 - h, w, h);
        ctx.fillStyle = layer ? "#ffd56b" : "rgba(255,213,107,0.5)";
        for (let wy = 400 - h + 12; wy < 390; wy += 18)
          for (let wx = x + 8; wx < x + w - 10; wx += 14) if (r() < 0.35) ctx.fillRect(wx, wy, 6, 8);
        x += w + 6;
      }
    }
    // water tower
    ctx.fillStyle = "#4b3a2a";
    ctx.fillRect(110, 250, 70, 70);
    ctx.fillRect(118, 320, 6, 70);
    ctx.fillRect(166, 320, 6, 70);
    ctx.beginPath();
    ctx.moveTo(100, 252);
    ctx.lineTo(145, 222);
    ctx.lineTo(190, 252);
    ctx.fill();
    // rooftop
    ctx.fillStyle = "#5c5f6e";
    ctx.fillRect(0, 380, W, 22);
    g = ctx.createLinearGradient(0, 400, 0, H);
    g.addColorStop(0, "#7d808f");
    g.addColorStop(1, "#4e505c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 400, W, H - 400);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    for (let x = 0; x < W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 400);
      ctx.lineTo(x - 40, H);
      ctx.stroke();
    }
    ctx.fillStyle = "#3a3c48";
    ctx.fillRect(760, 340, 90, 60);
    ctx.fillStyle = "#2a2c36";
    for (let k = 0; k < 4; k++) ctx.fillRect(768 + k * 21, 350, 14, 40);
  } else if (id === "temple") {
    let g = ctx.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, "#8ec5ff");
    g.addColorStop(1, "#fde2c8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FLOOR);
    const mountain = (pts, col, snow) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, 420);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(W, 420);
      ctx.fill();
      if (snow) {
        ctx.fillStyle = "#ffffff";
        for (const [x, y] of pts) if (y < 200) {
          ctx.beginPath();
          ctx.moveTo(x - 28, y + 40);
          ctx.lineTo(x, y);
          ctx.lineTo(x + 28, y + 40);
          ctx.fill();
        }
      }
    };
    mountain([[0, 260], [140, 150], [260, 250], [420, 110], [560, 240], [700, 140], [860, 230], [960, 180]], "#8a9bc4", true);
    mountain([[0, 330], [180, 260], [330, 320], [520, 250], [700, 320], [860, 270], [960, 300]], "#5f7a63", false);
    // temple
    const tx = W / 2;
    ctx.fillStyle = "#8b1e1e";
    ctx.fillRect(tx - 120, 250, 14, 150);
    ctx.fillRect(tx + 106, 250, 14, 150);
    ctx.fillStyle = "#2a1a1a";
    ctx.beginPath();
    ctx.moveTo(tx - 180, 255);
    ctx.quadraticCurveTo(tx, 215, tx + 180, 255);
    ctx.lineTo(tx + 150, 232);
    ctx.quadraticCurveTo(tx, 195, tx - 150, 232);
    ctx.fill();
    ctx.fillRect(tx - 100, 180, 200, 30);
    ctx.beginPath();
    ctx.moveTo(tx - 140, 190);
    ctx.quadraticCurveTo(tx, 140, tx + 140, 190);
    ctx.lineTo(tx + 110, 172);
    ctx.quadraticCurveTo(tx, 130, tx - 110, 172);
    ctx.fill();
    ctx.fillStyle = "#e9c46a";
    ctx.fillRect(tx - 40, 300, 80, 100);
    // stone floor
    g = ctx.createLinearGradient(0, 400, 0, H);
    g.addColorStop(0, "#c9bba6");
    g.addColorStop(1, "#8f8070");
    ctx.fillStyle = g;
    ctx.fillRect(0, 398, W, H - 398);
    ctx.strokeStyle = "rgba(60,50,40,0.3)";
    ctx.lineWidth = 2;
    for (let y = 410; y < H; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      for (let x = ((y / 26) % 2) * 45; x < W; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 26);
        ctx.stroke();
      }
    }
    // cherry tree
    ctx.strokeStyle = "#4a2c20";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(60, 400);
    ctx.quadraticCurveTo(80, 300, 40, 220);
    ctx.stroke();
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = k % 2 ? "#f7a8c4" : "#fbc8da";
      ctx.beginPath();
      ctx.arc(20 + r() * 120, 170 + r() * 90, 16 + r() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // grand arena
    let g = ctx.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, "#0d0b1e");
    g.addColorStop(1, "#2d1b4e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FLOOR);
    // crowd tiers
    for (let row = 0; row < 7; row++) {
      const y = 170 + row * 30;
      ctx.fillStyle = `rgba(255,255,255,${0.03 + row * 0.01})`;
      ctx.fillRect(0, y + 14, W, 6);
      for (let x = (row % 2) * 9; x < W; x += 18) {
        const hue = Math.floor(r() * 360);
        ctx.fillStyle = `hsl(${hue},45%,${28 + row * 4}%)`;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 8, y + 4, 16, 12);
      }
    }
    // banners
    const cols = ["#d63a3a", "#3d8bfd", "#3fa34d", "#e9a23b"];
    for (let k = 0; k < 4; k++) {
      const x = 90 + k * 250;
      ctx.fillStyle = cols[k];
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 60, 40);
      ctx.lineTo(x + 60, 140);
      ctx.lineTo(x + 30, 122);
      ctx.lineTo(x, 140);
      ctx.fill();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + 30, 80, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    // ring mat
    g = ctx.createLinearGradient(0, 395, 0, H);
    g.addColorStop(0, "#1f4fa3");
    g.addColorStop(1, "#122c66");
    ctx.fillStyle = g;
    ctx.fillRect(0, 395, W, H - 395);
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(0, 395, W, 10);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(W / 2, FLOOR + 30, 150, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function arenaLayer(idx) {
  const id = ARENAS[idx]?.id || "dojo";
  let c = bgCache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paintArena(c.getContext("2d"), id);
    bgCache.set(id, c);
  }
  return c;
}

function drawArena(ctx, idx, t) {
  ctx.drawImage(arenaLayer(idx), 0, 0);
  const id = ARENAS[idx]?.id;
  if (id === "temple") {
    // drifting petals
    ctx.fillStyle = "#f7a8c4";
    for (let k = 0; k < 18; k++) {
      const x = (k * 157 + t * (30 + (k % 5) * 8)) % (W + 40) - 20;
      const y = (k * 89 + t * (40 + (k % 3) * 12)) % (FLOOR - 40);
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 2.4, t * 2 + k, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "grand") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 2; k++) {
      const sx = k ? W - 120 : 120;
      const sw = Math.sin(t * 0.7 + k * 2) * 160;
      const g = ctx.createLinearGradient(sx, 0, W / 2 + sw, FLOOR);
      g.addColorStop(0, "rgba(255,240,200,0.22)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 10, 0);
      ctx.lineTo(sx + 10, 0);
      ctx.lineTo(W / 2 + sw + 90, FLOOR + 30);
      ctx.lineTo(W / 2 + sw - 90, FLOOR + 30);
      ctx.fill();
    }
    ctx.restore();
  } else if (id === "rooftop") {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let k = 0; k < 3; k++) {
      const x = ((t * 18 + k * 340) % (W + 200)) - 100;
      ctx.beginPath();
      ctx.ellipse(x, 60 + k * 28, 70, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ---------- FX + HUD ---------- */

function drawFx(ctx, s) {
  for (const p of s.fx) {
    const k = p.t / p.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (p.kind === "spark" || p.kind === "burst") {
      const big = p.kind === "burst";
      const R = (big ? 30 : 16) + k * (big ? 70 : 30);
      ctx.strokeStyle = big ? "#ff8a1f" : "#fff3a0";
      ctx.lineWidth = big ? 6 : 4;
      for (let i = 0; i < (big ? 12 : 8); i++) {
        const a = (i / (big ? 12 : 8)) * Math.PI * 2 + (big ? 0 : 0.3);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * R * 0.45, p.y + Math.sin(a) * R * 0.45);
        ctx.lineTo(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, (big ? 18 : 9) * (1 - k), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "block") {
      ctx.strokeStyle = "#7fd3ff";
      ctx.lineWidth = 6;
      ctx.beginPath();
      const cx = p.x - p.dir * 4;
      ctx.arc(cx, p.y, 22 + k * 14, p.dir > 0 ? -1.1 : Math.PI - 1.1, p.dir > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
    } else if (p.kind === "ring") {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 + k * 90, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "dust") {
      ctx.fillStyle = "rgba(220,210,190,0.8)";
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(p.x + sx * (12 + k * 30), p.y - 4 - k * 6, 8 * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function text(ctx, str, x, y, size, fill, align = "center", stroke = 5) {
  ctx.font = `900 ${size}px "Nunito", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke;
  ctx.strokeStyle = INK;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

function bar(ctx, x, y, w, h, frac, trail, flip, col) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 8);
  ctx.fill();
  ctx.fillStyle = "#3b2f4a";
  ctx.fillRect(x, y, w, h);
  const fx = (f) => (flip ? x + w - w * f : x);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(fx(trail), y, w * trail, h);
  ctx.fillStyle = col;
  ctx.fillRect(fx(frac), y, w * frac, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(fx(frac), y, w * frac, h * 0.35);
}

function drawHud(ctx, s, names, dt) {
  const bw = 360;
  s.fighters.forEach((f, i) => {
    const a = animOf(f);
    a.hpShown = f.hp;
    a.hpTrail = a.hpTrail > f.hp ? Math.max(f.hp, a.hpTrail - dt * f.maxHp * 0.45) : f.hp;
    const x = i ? W - 30 - bw : 30;
    const frac = f.hp / f.maxHp;
    const col = frac > 0.5 ? "#52d273" : frac > 0.25 ? "#ffcf3f" : "#ff4f4f";
    bar(ctx, x, 26, bw, 24, frac, a.hpTrail / f.maxHp, i === 1, col);
    text(ctx, names[i], i ? W - 34 : 34, 68, 18, "#ffffff", i ? "right" : "left", 4);
    // round pips
    for (let k = 0; k < s.roundsToWin; k++) {
      const px = i ? W - 40 - bw + 8 + k * 22 : 30 + bw - 8 - k * 22;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, 68, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = k < f.wins ? "#ffd23f" : "#4a3d5c";
      ctx.beginPath();
      ctx.arc(px, 68, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // energy
    const ex = i ? W - 30 - 220 : 30;
    const ef = f.energy / ENERGY_MAX;
    const full = f.energy >= ENERGY_MAX;
    bar(ctx, ex, H - 34, 220, 14, ef, ef, i === 1, full ? (Math.sin(s.time * 12) > 0 ? "#ffd23f" : "#ff8a1f") : "#3db7ff");
    text(ctx, full ? (i ? "SPECIAL!" : "SPECIAL READY · SPACE") : "ENERGY", i ? W - 30 : 30, H - 48, 13, full ? "#ffd23f" : "#cfe9ff", i ? "right" : "left", 3);
    if (f.chain >= 2 && f.chainT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.chainT * 2);
      text(ctx, `${f.chain} HIT COMBO!`, i ? W - 140 : 140, 118, 26, "#ffd23f");
      ctx.restore();
    }
  });
  // timer
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, 40, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6ea";
  ctx.beginPath();
  ctx.arc(W / 2, 40, 26, 0, Math.PI * 2);
  ctx.fill();
  const tl = Math.ceil(s.roundTime);
  text(ctx, String(tl), W / 2, 42, 26, tl <= 10 ? "#ff4f4f" : INK, "center", 0);
  text(ctx, `ROUND ${s.round}`, W / 2, 86, 13, "#ffffff", "center", 3);

  // banners
  let banner = null;
  let col = "#ffd23f";
  if (s.phase === "intro") {
    const last = s.fighters[0].wins === s.roundsToWin - 1 && s.fighters[1].wins === s.roundsToWin - 1 && s.roundsToWin > 1;
    banner = s.phaseT < 0.95 ? (last ? "FINAL ROUND" : `ROUND ${s.round}`) : "FIGHT!";
    if (banner === "FIGHT!") col = "#ff6b3d";
  } else if (s.phase === "fight" && s.phaseT < 0.5) {
    banner = "FIGHT!";
    col = "#ff6b3d";
  } else if (s.phase === "roundEnd" || (s.phase === "matchOver" && s.phaseT < 0.6)) {
    const t = s.phase === "roundEnd" ? s.phaseT : 9;
    if (s.roundWinner === -1) banner = "DRAW";
    else if (t < 1.1) banner = s.roundEndReason === "ko" ? "K.O.!" : "TIME!";
    else banner = s.roundWinner === 0 ? "YOU WIN THE ROUND" : `${names[1]} WINS THE ROUND`;
    col = s.roundEndReason === "ko" && t < 1.1 ? "#ff4f4f" : "#ffd23f";
  }
  if (banner) {
    const t = s.phase === "intro" ? (s.phaseT < 0.95 ? s.phaseT : s.phaseT - 0.95) : s.phaseT;
    const pop = Math.min(1, t * 6);
    ctx.save();
    ctx.translate(W / 2, H / 2 - 40);
    ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
    text(ctx, banner, 0, 0, banner.length > 10 ? 46 : 78, col, "center", 10);
    ctx.restore();
  }
}

/** Optional debug overlay (?kldtest=1&boxes=1). */
function drawBoxes(ctx, s) {
  ctx.lineWidth = 2;
  for (const f of s.fighters) {
    const hb = hurtbox(f);
    if (hb) {
      ctx.strokeStyle = "#3dff7a";
      ctx.strokeRect(hb.l, hb.t, hb.r - hb.l, hb.b - hb.t);
    }
    const ab = hitbox(f);
    if (ab) {
      ctx.strokeStyle = "#ff3d3d";
      ctx.strokeRect(ab.l, ab.t, ab.r - ab.l, ab.b - ab.t);
    }
  }
}

/** Full battle frame in world units (960x540). */
export function draw(ctx, s, names, dt, opts = {}) {
  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
  drawArena(ctx, s.battle.arena, s.time);
  // the attacker draws on top so its strike reads clearly
  const order = [...s.fighters].sort((a, b) => (a.attack ? 1 : 0) - (b.attack ? 1 : 0));
  for (const f of order) drawFighter(ctx, s, f, dt);
  drawFx(ctx, s);
  if (opts.boxes) drawBoxes(ctx, s);
  ctx.restore();
  drawHud(ctx, s, names, dt);
}

/** Menu backdrop: an arena with the hero idling. */
export function drawPreview(ctx, arenaIdx, t, look = PLAYER_LOOK) {
  drawArena(ctx, arenaIdx, t);
  ctx.fillStyle = "rgba(20,12,36,0.35)";
  ctx.fillRect(0, 0, W, H);
  const pose = { ...POSES.idle };
  pose.fu += Math.sin(t * 3.2) * 3;
  ctx.save();
  ctx.translate(W * 0.2, FLOOR);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 3, 40, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(1.15, 1.15);
  drawFigure(ctx, look, pose, { t });
  ctx.restore();
}

/** Small portrait (head + torso) for battle cards, drawn into its own canvas. */
export function drawPortrait(ctx, look, size) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  // head + chest framing: head top (~170 up) lands just inside the top edge
  const k = size / 80;
  ctx.translate(size / 2 - 4, 4 + 172 * k);
  ctx.scale(k, k);
  drawFigure(ctx, look, POSES.idle, { t: 0 });
  ctx.restore();
}

