/**
 * Canvas renderer, camera and particles. Everything is vector shapes drawn
 * each frame — no image assets. The camera keeps a fixed zoom per level/stage
 * size (wide enough to show the whole island when it fits) and pans along x.
 */
import { SLING, MAX_PULL, previewPath, currentBird } from "../engine/game.js";
import { WORLDS } from "../data/worlds.js";

const TAU = Math.PI * 2;
const VIEW_H = 820; // world units visible vertically at base zoom
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ---------------------------------------------------------------- camera */

export function createView() {
  return { w: 1, h: 1, dpr: 1, zoom: 1, camX: 0, camY: 0, minCam: 0, maxCam: 0, viewW: 1, intro: 0, manual: false, shake: 0, t: 0 };
}

/** fits the level to a stage of w×h CSS px */
export function fitView(v, def, w, h, dpr) {
  v.w = w;
  v.h = h;
  v.dpr = dpr;
  const base = Math.min(h / VIEW_H, w / 1000);
  const need = def.width - (SLING.x - 170) + 40;
  const fit = Math.max(0.62, Math.min(1, w / base / need));
  v.zoom = base * fit;
  v.viewW = w / v.zoom;
  v.camY = 70 - h / v.zoom;
  v.minCam = SLING.x - 170;
  v.maxCam = Math.max(v.minCam, def.width + 60 - v.viewW);
  v.camX = Math.max(v.minCam, Math.min(v.maxCam, v.camX));
}

export function startIntro(v) {
  v.intro = v.maxCam > v.minCam + 40 ? 2.4 : 0;
  v.camX = v.intro ? v.maxCam : v.minCam;
  v.manual = false;
}

export const toWorld = (v, sx, sy) => ({ x: v.camX + sx / v.zoom, y: v.camY + sy / v.zoom });
export const toScreen = (v, x, y) => ({ x: (x - v.camX) * v.zoom, y: (y - v.camY) * v.zoom });

export function updateCamera(v, g, dt) {
  v.t += dt;
  let target = v.camX;
  const lead = g.shot?.birds.find((b) => !b.done);
  if (v.intro > 0) {
    v.intro -= dt;
    target = v.intro > 1.4 ? v.maxCam : v.minCam;
  } else if (lead) {
    v.manual = false;
    target = lead.body.position.x - v.viewW * 0.38;
  } else if (v.manual) {
    target = v.camX;
  } else if (g.state === "ready") {
    target = v.minCam;
  }
  target = Math.max(v.minCam, Math.min(v.maxCam, target));
  const k = v.intro > 0 ? 2.2 : lead ? 6 : 3.2;
  v.camX += (target - v.camX) * Math.min(1, dt * k);
  v.shake = Math.max(0, v.shake - dt * 3);
}

/* ---------------------------------------------------------------- particles */

const MAT_COLORS = {
  wood: ["#c98a4b", "#a96b34", "#e2a868"],
  glass: ["#bdf0ff", "#e8fbff", "#8fd8f0"],
  stone: ["#9aa0a8", "#7b818a", "#b9bec4"],
  ice: ["#dff3ff", "#b8e2fb", "#ffffff"],
  tnt: ["#e8463c", "#ffcf33", "#3b3640"],
  enemy: ["#b07cf5", "#8a5ad8", "#ffffff"],
  ground: ["#d9b263", "#b88d45", "#f3d58b"],
};

export function spawnFx(fx, e, v) {
  const add = (p) => fx.length < 600 && fx.push(p);
  const rnd = Math.random;
  switch (e.type) {
    case "break": {
      const cols = MAT_COLORS[e.mat] || MAT_COLORS.wood;
      const n = e.silent ? 0 : e.mat === "glass" || e.mat === "ice" ? 12 : 9;
      for (let i = 0; i < n; i++) {
        add({ k: e.mat === "glass" || e.mat === "ice" ? "shard" : "chip", x: e.x + (rnd() - 0.5) * e.w * 0.8, y: e.y + (rnd() - 0.5) * e.h * 0.8, vx: (rnd() - 0.5) * 7, vy: -rnd() * 7 - 1, g: 0.35, life: 0.9 + rnd() * 0.5, t: 0, s: 5 + rnd() * 8, rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.5, c: cols[i % 3] });
      }
      if (!e.silent) for (let i = 0; i < 4; i++) add({ k: "dust", x: e.x + (rnd() - 0.5) * 30, y: e.y + (rnd() - 0.5) * 30, vx: (rnd() - 0.5) * 1.5, vy: -rnd() * 1.2, g: 0, life: 0.7, t: 0, s: 14 + rnd() * 12, c: "rgba(255,255,255,0.6)" });
      if (!e.silent) add({ k: "text", x: e.x, y: e.y - 10, vx: 0, vy: -1.2, g: 0, life: 0.9, t: 0, txt: String(e.pts), c: "#fff7d6", s: 22 });
      break;
    }
    case "enemy": {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        add({ k: "dust", x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, g: 0, life: 0.6, t: 0, s: 10 + rnd() * 10, c: i % 2 ? "rgba(230,210,255,0.85)" : "rgba(255,255,255,0.9)" });
      }
      for (let i = 0; i < 5; i++) add({ k: "star", x: e.x, y: e.y, vx: (rnd() - 0.5) * 6, vy: -rnd() * 6 - 2, g: 0.25, life: 1, t: 0, s: 7 + rnd() * 5, rot: rnd() * TAU, vr: 0.2, c: "#ffd84a" });
      add({ k: "text", x: e.x, y: e.y - 30, vx: 0, vy: -1.4, g: 0, life: 1.3, t: 0, txt: String(e.pts), c: "#d9a8ff", s: 32 });
      break;
    }
    case "blast": {
      add({ k: "ring", x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 0.45, t: 0, s: e.r, c: e.kind === "tnt" ? "#ffcf33" : "#ffffff" });
      add({ k: "flash", x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 0.3, t: 0, s: e.r * 0.8, c: "#ffb347" });
      for (let i = 0; i < 22; i++) {
        const a = rnd() * TAU, sp = 3 + rnd() * 8;
        add({ k: i % 3 ? "spark" : "smoke", x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: i % 3 ? 0.15 : -0.02, life: 0.5 + rnd() * 0.6, t: 0, s: i % 3 ? 4 + rnd() * 3 : 22 + rnd() * 16, c: i % 3 ? (i % 2 ? "#ffd84a" : "#ff6a2a") : "rgba(70,60,70,0.55)" });
      }
      if (v) v.shake = Math.max(v.shake, e.kind === "tnt" ? 0.8 : 1);
      break;
    }
    case "ability": {
      if (e.bird === "yellow") {
        for (let i = 0; i < 10; i++) add({ k: "spark", x: e.x - e.dx * i * 6, y: e.y - e.dy * i * 6, vx: -e.dx * 2 + (rnd() - 0.5), vy: -e.dy * 2 + (rnd() - 0.5), g: 0, life: 0.4, t: 0, s: 5, c: "#fff3a0" });
      } else if (e.bird === "blue") {
        add({ k: "ring", x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 0.3, t: 0, s: 45, c: "#bfe8ff" });
      }
      for (let i = 0; i < 4; i++) add({ k: "feather", x: e.x, y: e.y, vx: (rnd() - 0.5) * 3, vy: (rnd() - 0.5) * 3, g: 0.04, life: 1.2, t: 0, s: 9, rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.2, c: e.bird === "yellow" ? "#ffcf33" : e.bird === "blue" ? "#4fb8ff" : "#3b3640" });
      break;
    }
    case "poof": {
      if (e.why === "out") break;
      for (let i = 0; i < 6; i++) add({ k: "feather", x: e.x, y: e.y, vx: (rnd() - 0.5) * 3, vy: -rnd() * 3, g: 0.05, life: 1.1, t: 0, s: 9, rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.2, c: birdColor(e.bird) });
      add({ k: "dust", x: e.x, y: e.y, vx: 0, vy: -0.5, g: 0, life: 0.5, t: 0, s: 26, c: "rgba(255,255,255,0.8)" });
      break;
    }
    case "hit": {
      if (e.power < 6) break;
      const cols = MAT_COLORS[e.mat] || MAT_COLORS.ground;
      for (let i = 0; i < Math.min(6, e.power / 5); i++) add({ k: "chip", x: e.x, y: e.y, vx: (rnd() - 0.5) * 5, vy: -rnd() * 4, g: 0.3, life: 0.5, t: 0, s: 3 + rnd() * 4, rot: rnd() * TAU, vr: 0.3, c: cols[i % 3] });
      if (v && e.power > 25) v.shake = Math.max(v.shake, Math.min(0.6, e.power / 120));
      break;
    }
    case "launch":
      for (let i = 0; i < 5; i++) add({ k: "feather", x: SLING.x, y: SLING.y, vx: (rnd() - 0.5) * 2, vy: -rnd() * 2, g: 0.04, life: 0.9, t: 0, s: 8, rot: rnd() * TAU, vr: 0.1, c: birdColor(e.bird) });
      break;
    case "bonus":
      add({ k: "text", x: SLING.x - 50 - e.i * 30, y: -90 - e.i * 30, vx: 0, vy: -1, g: 0, life: 1.6, t: -e.i * 0.25, txt: String(e.pts), c: "#ffe066", s: 34 });
      break;
    default:
  }
}

export function stepFx(fx, dt) {
  const k = dt * 60;
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.t += dt;
    if (p.t < 0) continue;
    p.vy += p.g * k;
    p.x += p.vx * k;
    p.y += p.vy * k;
    if (p.vr) p.rot += p.vr * k;
    if (p.k === "feather") p.vx *= 0.97;
    if (p.t >= p.life) fx.splice(i, 1);
  }
}

/* ---------------------------------------------------------------- birds & enemies */

export function birdColor(type) {
  return type === "yellow" ? "#ffcf33" : type === "black" ? "#3b3640" : type === "blue" || type === "bluelet" ? "#4fb8ff" : "#e8463c";
}

/** draws a bird centred at the origin facing +x, radius r */
export function drawBird(ctx, type, r, opts = {}) {
  const t = opts.t || 0;
  const blue = type === "blue" || type === "bluelet";
  // tail feathers
  ctx.fillStyle = type === "yellow" ? "#e0a400" : type === "black" ? "#25212a" : blue ? "#2f86d0" : "#b52e2a";
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.1);
  ctx.lineTo(-r * 1.45, -r * 0.45);
  ctx.lineTo(-r * 1.3, -r * 0.05);
  ctx.lineTo(-r * 1.5, r * 0.3);
  ctx.lineTo(-r * 0.8, r * 0.25);
  ctx.closePath();
  ctx.fill();
  // crest
  ctx.fillStyle = type === "red" ? "#ff8a3d" : type === "yellow" ? "#ff9d1c" : type === "black" ? "#ff7a2a" : "#bfe8ff";
  ctx.beginPath();
  if (type === "red") {
    // flame-like crest: three licks
    ctx.moveTo(-r * 0.35, -r * 0.8);
    ctx.quadraticCurveTo(-r * 0.6, -r * 1.55, -r * 0.05, -r * 1.35);
    ctx.quadraticCurveTo(r * 0.05, -r * 1.75, r * 0.3, -r * 1.25);
    ctx.quadraticCurveTo(r * 0.6, -r * 1.4, r * 0.45, -r * 0.8);
  } else if (type === "yellow") {
    ctx.moveTo(-r * 0.2, -r * 0.85);
    ctx.lineTo(-r * 1.2, -r * 1.25);
    ctx.lineTo(-r * 0.6, -r * 0.75);
  } else if (type === "black") {
    ctx.arc(0, -r * 1.05, r * 0.2 + Math.sin(t * 20) * r * 0.05, 0, TAU);
  } else {
    ctx.moveTo(-r * 0.1, -r * 0.9);
    ctx.quadraticCurveTo(r * 0.1, -r * 1.6, r * 0.5, -r * 1.3);
    ctx.quadraticCurveTo(r * 0.2, -r * 1.2, r * 0.2, -r * 0.85);
  }
  ctx.closePath();
  ctx.fill();
  // body
  const body = birdColor(type);
  const grd = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r);
  grd.addColorStop(0, lighten(body, 0.25));
  grd.addColorStop(1, body);
  ctx.fillStyle = grd;
  ctx.beginPath();
  if (type === "yellow") ctx.ellipse(0, 0, r * 1.12, r * 0.92, 0, 0, TAU);
  else ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = "rgba(40,20,30,0.55)";
  ctx.stroke();
  // belly
  ctx.fillStyle = type === "black" ? (opts.fuse ? "#ffb347" : "#ff8a3d") : type === "yellow" ? "#fff2b8" : blue ? "#e8f7ff" : "#ffe1c4";
  ctx.beginPath();
  ctx.ellipse(r * 0.15, r * 0.45, r * 0.62, r * 0.42, 0, 0, TAU);
  ctx.fill();
  if (type === "black") {
    // glowing ember speckles
    ctx.fillStyle = "#ffcf5a";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.4 + i * r * 0.3, -r * 0.2 + (i % 2) * r * 0.15, r * 0.06, 0, TAU);
      ctx.fill();
    }
  }
  // wing
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, r * 0.15, r * 0.42, r * 0.26, -0.5 + Math.sin(t * 14) * 0.25, 0, TAU);
  ctx.fill();
  // eyes
  const ex = r * 0.3, ey = -r * 0.25;
  if (type === "yellow") {
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(-r * 0.6, ey - r * 0.08, r * 1.6, r * 0.16);
  }
  for (const dx of [0, r * 0.38]) {
    ctx.fillStyle = type === "yellow" ? "#bfe8ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(ex + dx - r * 0.12, ey, r * 0.24, 0, TAU);
    ctx.fill();
    if (type === "yellow") {
      ctx.strokeStyle = "#6b4a2b";
      ctx.lineWidth = r * 0.08;
      ctx.stroke();
    }
    ctx.fillStyle = "#1d1420";
    ctx.beginPath();
    ctx.arc(ex + dx - r * 0.05, ey + r * 0.02, r * 0.11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex + dx - r * 0.02, ey - r * 0.04, r * 0.04, 0, TAU);
    ctx.fill();
  }
  // determined eyelids (not brows)
  if (type !== "yellow") {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(ex + r * 0.07, ey - r * 0.2, r * 0.48, r * 0.14, 0.12, 0, TAU);
    ctx.fill();
  }
  // beak
  ctx.fillStyle = "#ffa62b";
  ctx.beginPath();
  ctx.moveTo(r * 0.72, -r * 0.05);
  ctx.quadraticCurveTo(r * 1.35, r * 0.05, r * 0.72, r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,60,0,0.6)";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(r * 0.75, r * 0.12);
  ctx.lineTo(r * 1.1, r * 0.1);
  ctx.stroke();
}

/** a Moko — the mischievous purple island imps that stole the Sunfruit */
export function drawEnemy(ctx, kind, r, opts = {}) {
  const hurt = opts.hurt > 0 || opts.dmg > 0.5;
  const base = kind === "big" ? "#e0609c" : kind === "king" ? "#8f5bd6" : kind === "helmet" ? "#7d58c8" : "#a875f0";
  // horns
  ctx.fillStyle = "#ffe0a8";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.35, -r * 0.8);
    ctx.quadraticCurveTo(s * r * 0.75, -r * 1.35, s * r * 0.65, -r * 0.65);
    ctx.closePath();
    ctx.fill();
  }
  const grd = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.05);
  grd.addColorStop(0, lighten(base, 0.3));
  grd.addColorStop(1, base);
  ctx.fillStyle = grd;
  ctx.beginPath();
  // fuzzy outline
  const bumps = 14;
  for (let i = 0; i <= bumps * 2; i++) {
    const a = (i / (bumps * 2)) * TAU;
    const rr = r * (i % 2 ? 1.0 : 0.94);
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40,10,60,0.5)";
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  // belly spot
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r * 0.5, r * 0.32, 0, 0, TAU);
  ctx.fill();
  if (kind === "big") {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (const [x, y] of [[-0.55, -0.1], [0.6, 0.05], [-0.2, -0.6]]) {
      ctx.beginPath();
      ctx.arc(x * r, y * r, r * 0.12, 0, TAU);
      ctx.fill();
    }
  }
  // eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(s * r * 0.32, -r * 0.18, r * 0.26, r * (hurt ? 0.1 : 0.3), 0, 0, TAU);
    ctx.fill();
    if (!hurt) {
      ctx.fillStyle = "#2a1236";
      ctx.beginPath();
      ctx.arc(s * r * 0.32 + r * 0.06, -r * 0.12, r * 0.12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s * r * 0.32 + r * 0.09, -r * 0.17, r * 0.045, 0, TAU);
      ctx.fill();
    }
  }
  // grin (or a wobbly frown when hurt)
  ctx.strokeStyle = "#2a1236";
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (hurt) {
    ctx.moveTo(-r * 0.3, r * 0.35);
    ctx.quadraticCurveTo(0, r * 0.15, r * 0.3, r * 0.35);
  } else {
    ctx.moveTo(-r * 0.32, r * 0.2);
    ctx.quadraticCurveTo(0, r * 0.52, r * 0.32, r * 0.2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(r * 0.08, r * 0.3);
    ctx.lineTo(r * 0.16, r * 0.42);
    ctx.lineTo(r * 0.22, r * 0.27);
    ctx.fill();
    ctx.beginPath();
  }
  ctx.stroke();
  if (hurt) {
    ctx.fillStyle = "rgba(255,120,160,0.6)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 0.55, r * 0.12, r * 0.12, 0, TAU);
      ctx.fill();
    }
  }
  // headgear
  if (kind === "helmet") {
    ctx.fillStyle = "#8a5a2e";
    ctx.beginPath();
    ctx.arc(0, -r * 0.35, r * 0.82, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5e3b1c";
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
    ctx.fillStyle = "#b07a45";
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.85, r * 0.08, 0, TAU);
    ctx.arc(r * 0.2, -r * 0.8, r * 0.07, 0, TAU);
    ctx.fill();
  } else if (kind === "king") {
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.7);
    ctx.lineTo(-r * 0.6, -r * 1.25);
    ctx.lineTo(-r * 0.28, -r * 0.98);
    ctx.lineTo(0, -r * 1.4);
    ctx.lineTo(r * 0.28, -r * 0.98);
    ctx.lineTo(r * 0.6, -r * 1.25);
    ctx.lineTo(r * 0.55, -r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = r * 0.05;
    ctx.stroke();
    ctx.fillStyle = "#ff4d6d";
    ctx.beginPath();
    ctx.arc(0, -r * 0.92, r * 0.09, 0, TAU);
    ctx.fill();
  } else {
    // little leaf tuft
    ctx.fillStyle = "#4cc46a";
    ctx.beginPath();
    ctx.ellipse(r * 0.1, -r * 1.02, r * 0.28, r * 0.11, -0.6, 0, TAU);
    ctx.fill();
  }
}

/* ---------------------------------------------------------------- blocks */

function rectPath(ctx, w, h, rr) {
  const r = Math.min(rr, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  ctx.closePath();
}

function drawCracks(ctx, ent, w, h) {
  const dmg = 1 - ent.hp / ent.maxHp;
  if (dmg < 0.3) return;
  const seed = ent.body.id;
  ctx.strokeStyle = ent.mat === "glass" || ent.mat === "ice" ? "rgba(255,255,255,0.9)" : "rgba(30,15,10,0.6)";
  ctx.lineWidth = 1.5;
  const n = dmg > 0.65 ? 3 : 1;
  for (let k = 0; k < n; k++) {
    let x = (hash(seed + k) - 0.5) * w * 0.6, y = (hash(seed * 3 + k) - 0.5) * h * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 3; i++) {
      x += (hash(seed + i * 7 + k) - 0.5) * w * 0.5;
      y += (hash(seed + i * 11 + k) - 0.5) * h * 0.5;
      ctx.lineTo(Math.max(-w / 2, Math.min(w / 2, x)), Math.max(-h / 2, Math.min(h / 2, y)));
    }
    ctx.stroke();
  }
}

function drawBlock(ctx, ent) {
  const b = ent.body;
  if (ent.shape === "tri") {
    const vs = b.vertices;
    ctx.beginPath();
    ctx.moveTo(vs[0].x, vs[0].y);
    for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
    ctx.closePath();
    fillMat(ctx, ent.mat);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  if (ent.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, ent.r, 0, TAU);
    fillMat(ctx, ent.mat);
    ctx.stroke();
    if (ent.mat === "wood") {
      ctx.strokeStyle = "rgba(110,60,20,0.55)";
      ctx.lineWidth = 1.5;
      for (const k of [0.66, 0.33]) {
        ctx.beginPath();
        ctx.arc(0, 0, ent.r * k, 0, TAU);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(-ent.r * 0.3, -ent.r * 0.3, ent.r * 0.25, 0, TAU);
      ctx.fill();
    }
    drawCracks(ctx, ent, ent.r * 1.4, ent.r * 1.4);
    ctx.restore();
    return;
  }
  const w = ent.w, h = ent.h;
  rectPath(ctx, w, h, ent.mat === "stone" ? 4 : 3);
  fillMat(ctx, ent.mat);
  ctx.stroke();
  switch (ent.mat) {
    case "wood": {
      ctx.strokeStyle = "rgba(110,60,20,0.45)";
      ctx.lineWidth = 1.4;
      const along = w >= h;
      const L = along ? w : h, S = along ? h : w;
      const lines = Math.max(1, Math.floor(S / 14));
      for (let i = 1; i <= lines; i++) {
        const o = -S / 2 + (i * S) / (lines + 1);
        ctx.beginPath();
        if (along) {
          ctx.moveTo(-L / 2 + 6, o);
          ctx.lineTo(L / 2 - 6, o + 1);
        } else {
          ctx.moveTo(o, -L / 2 + 6);
          ctx.lineTo(o + 1, L / 2 - 6);
        }
        ctx.stroke();
      }
      if (w === h) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 5, -h / 2 + 5);
        ctx.lineTo(w / 2 - 5, h / 2 - 5);
        ctx.stroke();
      }
      break;
    }
    case "glass":
    case "ice":
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 5, h / 2 - 6);
      ctx.lineTo(-w / 2 + Math.min(w, h) * 0.6, -h / 2 + 5);
      ctx.stroke();
      if (ent.mat === "ice") {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, Math.min(5, h * 0.2));
      }
      break;
    case "stone":
      ctx.fillStyle = "rgba(60,64,72,0.35)";
      for (let i = 0; i < Math.max(2, (w * h) / 900); i++) {
        ctx.beginPath();
        ctx.arc((hash(b.id + i) - 0.5) * (w - 8), (hash(b.id * 2 + i) - 0.5) * (h - 8), 2 + hash(i) * 2, 0, TAU);
        ctx.fill();
      }
      break;
    case "tnt":
      ctx.fillStyle = "#ffcf33";
      ctx.fillRect(-w / 2 + 3, -4, w - 6, 8);
      ctx.fillStyle = "#3b1d1d";
      ctx.font = `900 ${Math.round(h * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✸", 0, 1);
      break;
    default:
  }
  drawCracks(ctx, ent, w, h);
  ctx.restore();
}

function fillMat(ctx, mat) {
  const fills = { wood: "#cf8f4f", glass: "rgba(170,230,250,0.55)", stone: "#9ba1aa", ice: "rgba(214,240,255,0.92)", tnt: "#d8433a" };
  const strokes = { wood: "#7a4520", glass: "rgba(90,170,210,0.95)", stone: "#5c6169", ice: "#86b8dc", tnt: "#7a1f1a" };
  ctx.fillStyle = fills[mat];
  ctx.fill();
  ctx.strokeStyle = strokes[mat];
  ctx.lineWidth = 2;
}

/* ---------------------------------------------------------------- scenery */

function drawSky(ctx, v, W, wid) {
  const { w, h } = v;
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, W.sky[0]);
  grd.addColorStop(1, W.sky[1]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  // sun / glow
  const sx = w * 0.78 - v.camX * v.zoom * 0.04, sy = h * 0.2;
  const sr = Math.min(w, h) * 0.07;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
  glow.addColorStop(0, W.sun);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  ctx.fillStyle = W.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, TAU);
  ctx.fill();
  // clouds (or ash) drift slowly
  ctx.fillStyle = wid === 4 ? "rgba(60,30,40,0.35)" : "rgba(255,255,255,0.75)";
  const span = w + 400;
  for (let i = 0; i < 6; i++) {
    const cx = ((hash(i) * span - v.camX * v.zoom * 0.1 + v.t * (8 + i * 2)) % span + span) % span - 200;
    const cy = h * (0.08 + hash(i + 9) * 0.3);
    const s = Math.min(w, h) * (0.04 + hash(i + 4) * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, s, 0, TAU);
    ctx.arc(cx + s * 1.1, cy - s * 0.4, s * 1.2, 0, TAU);
    ctx.arc(cx + s * 2.3, cy, s * 0.9, 0, TAU);
    ctx.fill();
  }
}

/** layer of repeating silhouettes; `p` = parallax factor */
function layer(ctx, v, p, spacing, fn) {
  const z = v.zoom;
  const groundY = (0 - v.camY) * z; // screen y of the ground line
  const off = v.camX * p;
  const first = Math.floor(off / spacing) - 1;
  const last = first + Math.ceil(v.viewW / spacing) + 3;
  for (let i = first; i <= last; i++) {
    const x = (i * spacing - off) * z;
    fn(x, groundY, z, i);
  }
}

function drawScenery(ctx, v, W, wid) {
  const z = v.zoom;
  const groundY = (0 - v.camY) * z;
  // far layer
  ctx.fillStyle = W.far;
  if (wid === 4) {
    // the volcano
    const vx = v.w * 0.62 - v.camX * z * 0.12;
    const top = groundY - 520 * z;
    ctx.beginPath();
    ctx.moveTo(vx - 520 * z, groundY);
    ctx.lineTo(vx - 90 * z, top);
    ctx.lineTo(vx + 90 * z, top);
    ctx.lineTo(vx + 560 * z, groundY);
    ctx.fill();
    ctx.fillStyle = "#ff6a2a";
    ctx.beginPath();
    ctx.moveTo(vx - 90 * z, top);
    ctx.lineTo(vx - 60 * z, top + 60 * z);
    ctx.lineTo(vx - 20 * z, top + 30 * z);
    ctx.lineTo(vx + 30 * z, top + 90 * z);
    ctx.lineTo(vx + 90 * z, top);
    ctx.fill();
    const gl = ctx.createRadialGradient(vx, top, 10 * z, vx, top, 220 * z);
    gl.addColorStop(0, "rgba(255,140,60,0.55)");
    gl.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(vx - 220 * z, top - 220 * z, 440 * z, 440 * z);
  } else {
    layer(ctx, v, 0.25, 520, (x, gy, z2, i) => {
      const hgt = (140 + hash(i) * 200) * z2;
      ctx.beginPath();
      if (wid === 2) {
        ctx.moveTo(x, gy);
        ctx.lineTo(x + 60 * z2, gy - hgt);
        ctx.lineTo(x + 330 * z2, gy - hgt);
        ctx.lineTo(x + 400 * z2, gy);
      } else if (wid === 3) {
        ctx.moveTo(x, gy);
        ctx.lineTo(x + 200 * z2, gy - hgt * 1.3);
        ctx.lineTo(x + 420 * z2, gy);
      } else {
        ctx.ellipse(x + 260 * z2, gy, 300 * z2, hgt, 0, Math.PI, TAU);
      }
      ctx.fill();
      if (wid === 3) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x + 200 * z2, gy - hgt * 1.3);
        ctx.lineTo(x + 150 * z2, gy - hgt * 1.0);
        ctx.lineTo(x + 250 * z2, gy - hgt * 1.0);
        ctx.fill();
        ctx.fillStyle = W.far;
      }
    });
  }
  // sea strip
  if (W.sea) {
    ctx.fillStyle = W.sea;
    ctx.fillRect(0, groundY - 40 * z, v.w, 40 * z);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 12; i++) {
      const x = ((hash(i) * v.w + v.t * 12 - v.camX * z * 0.4) % v.w + v.w) % v.w;
      ctx.fillRect(x, groundY - (12 + hash(i + 3) * 22) * z, 26 * z, 2 * z);
    }
  }
  // mid layer
  layer(ctx, v, 0.55, 340, (x, gy, z2, i) => {
    const r = hash(i * 1.7);
    if (r < 0.35) return;
    const hgt = (160 + r * 140) * z2;
    if (wid === 0) palm(ctx, x, gy, hgt, z2, W.mid);
    else if (wid === 1) bamboo(ctx, x, gy, hgt * 1.6, z2, W.mid, i);
    else if (wid === 2) cactus(ctx, x, gy, hgt * 0.5, z2, W.mid);
    else if (wid === 3) pine(ctx, x, gy, hgt, z2, W.mid);
    else spire(ctx, x, gy, hgt, z2, W.mid);
  });
}

function palm(ctx, x, gy, h, z, col) {
  ctx.strokeStyle = "#8a6a45";
  ctx.lineWidth = 12 * z;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, gy);
  ctx.quadraticCurveTo(x + 30 * z, gy - h * 0.5, x + 10 * z, gy - h);
  ctx.stroke();
  ctx.fillStyle = col;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.62;
    ctx.beginPath();
    ctx.ellipse(x + 10 * z + Math.cos(a) * 45 * z, gy - h + Math.sin(a) * 25 * z + 18 * z, 58 * z, 13 * z, a, 0, TAU);
    ctx.fill();
  }
}
function bamboo(ctx, x, gy, h, z, col, i) {
  for (let k = 0; k < 3; k++) {
    const bx = x + k * 26 * z, bh = h * (0.7 + hash(i + k) * 0.4);
    ctx.fillStyle = col;
    ctx.fillRect(bx, gy - bh, 12 * z, bh);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let s = 40; s < bh / z; s += 60) ctx.fillRect(bx - 1 * z, gy - s * z, 14 * z, 4 * z);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(bx + 20 * z, gy - bh + 30 * z, 22 * z, 6 * z, -0.4, 0, TAU);
    ctx.fill();
  }
}
function cactus(ctx, x, gy, h, z, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, gy - h, 20 * z, h);
  ctx.fillRect(x - 22 * z, gy - h * 0.7, 14 * z, h * 0.35);
  ctx.fillRect(x - 22 * z, gy - h * 0.42, 30 * z, 12 * z);
  ctx.fillRect(x + 26 * z, gy - h * 0.85, 14 * z, h * 0.4);
  ctx.fillRect(x + 12 * z, gy - h * 0.5, 28 * z, 12 * z);
}
function pine(ctx, x, gy, h, z, col) {
  ctx.fillStyle = "#6b5040";
  ctx.fillRect(x - 6 * z, gy - 30 * z, 12 * z, 30 * z);
  for (let k = 0; k < 3; k++) {
    const y = gy - 20 * z - k * h * 0.27, wdt = (70 - k * 16) * z;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - wdt, y);
    ctx.lineTo(x, y - h * 0.42);
    ctx.lineTo(x + wdt, y);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x - wdt * 0.35, y - h * 0.28);
    ctx.lineTo(x, y - h * 0.42);
    ctx.lineTo(x + wdt * 0.35, y - h * 0.28);
    ctx.fill();
  }
}
function spire(ctx, x, gy, h, z, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - 40 * z, gy);
  ctx.lineTo(x - 8 * z, gy - h);
  ctx.lineTo(x + 18 * z, gy - h * 0.6);
  ctx.lineTo(x + 50 * z, gy);
  ctx.fill();
  ctx.fillStyle = "rgba(255,90,40,0.5)";
  ctx.fillRect(x - 3 * z, gy - h * 0.7, 3 * z, h * 0.5);
}

function drawGround(ctx, v, g, W) {
  const x0 = v.camX - 50, x1 = v.camX + v.viewW + 50;
  const y1 = v.camY + v.h / v.zoom + 10;
  ctx.fillStyle = W.ground[1];
  ctx.fillRect(x0, 0, x1 - x0, y1);
  ctx.fillStyle = W.ground[0];
  ctx.fillRect(x0, 0, x1 - x0, 14);
  ctx.fillStyle = W.ground[2];
  for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) {
    ctx.beginPath();
    ctx.arc(x + hash(x) * 40, 30 + hash(x + 1) * 30, 4 + hash(x + 2) * 5, 0, TAU);
    ctx.fill();
  }
  if (g.def.icyGround) {
    ctx.fillStyle = "rgba(220,240,255,0.85)";
    ctx.fillRect(x0, -2, x1 - x0, 6);
  }
  for (const t of g.terrain) {
    if (t.style === "ground") continue;
    const b = t.body;
    ctx.beginPath();
    const vs = b.vertices;
    ctx.moveTo(vs[0].x, vs[0].y);
    for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
    ctx.closePath();
    ctx.fillStyle = t.ice ? "#cfe7fb" : W.rock[0];
    ctx.fill();
    ctx.strokeStyle = t.ice ? "#8fb6dc" : W.rock[1];
    ctx.lineWidth = 3;
    ctx.stroke();
    if (t.shape === "rect") {
      const top = b.bounds.min.y;
      ctx.fillStyle = t.ice ? "#ffffff" : W.cap;
      ctx.fillRect(b.bounds.min.x, top, b.bounds.max.x - b.bounds.min.x, 8);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(b.bounds.min.x + hash(b.id + i) * t.w, top + 20 + hash(b.id * 3 + i) * Math.max(0, t.h - 30), 4 + hash(i) * 4, 0, TAU);
        ctx.fill();
      }
    }
  }
}

/* ---------------------------------------------------------------- slingshot */

const FORK_BACK = { x: SLING.x + 14, y: SLING.y - 6 };
const FORK_FRONT = { x: SLING.x - 16, y: SLING.y - 4 };

function slingBack(ctx) {
  ctx.strokeStyle = "#6b4122";
  ctx.lineCap = "round";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(SLING.x, 0);
  ctx.lineTo(SLING.x, SLING.y + 60);
  ctx.quadraticCurveTo(SLING.x + 2, SLING.y + 25, FORK_BACK.x, FORK_BACK.y);
  ctx.stroke();
}
function slingFront(ctx) {
  ctx.strokeStyle = "#8a5530";
  ctx.lineCap = "round";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(SLING.x, SLING.y + 60);
  ctx.quadraticCurveTo(SLING.x - 4, SLING.y + 25, FORK_FRONT.x, FORK_FRONT.y);
  ctx.stroke();
  ctx.strokeStyle = "#5a3418";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(SLING.x - 7, SLING.y + 70);
  ctx.lineTo(SLING.x + 7, SLING.y + 76);
  ctx.moveTo(SLING.x - 7, SLING.y + 82);
  ctx.lineTo(SLING.x + 7, SLING.y + 88);
  ctx.stroke();
}
function band(ctx, from, to, w) {
  ctx.strokeStyle = "#4a2416";
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/* ---------------------------------------------------------------- frame */

/**
 * draws one frame. `ui` = { pull: {x,y}|null, aiming: bool } from the input layer.
 */
export function drawFrame(ctx, g, v, fx, ui) {
  const W = WORLDS[g.def.world];
  const { dpr, zoom } = v;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(ctx, v, W, g.def.world);
  drawScenery(ctx, v, W, g.def.world);

  const shk = v.shake > 0 ? v.shake * 6 : 0;
  const sx = shk ? (Math.random() - 0.5) * shk : 0, sy = shk ? (Math.random() - 0.5) * shk : 0;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, (-v.camX * zoom + sx) * dpr, (-v.camY * zoom + sy) * dpr);

  drawGround(ctx, v, g, W);

  // previous shot's trail
  if (g.lastTrail || g.shot) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const trails = g.shot ? g.shot.birds.map((b) => b.trail) : g.lastTrail;
    for (const tr of trails) {
      for (let i = 0; i < tr.length; i += 2) {
        ctx.beginPath();
        ctx.arc(tr[i].x, tr[i].y, i % 4 ? 2.5 : 4, 0, TAU);
        ctx.fill();
      }
    }
  }

  slingBack(ctx);
  const pouchBird = g.state === "ready" ? currentBird(g) : null;
  const pull = ui.aiming && ui.pull ? ui.pull : { x: 0, y: 0 };
  const pouch = { x: SLING.x + pull.x, y: SLING.y + pull.y };
  if (pouchBird) band(ctx, FORK_BACK, pouch, 7);

  for (const t of g.blocks) drawBlock(ctx, t);
  for (const e of g.enemies) {
    const b = e.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    drawEnemy(ctx, e.type, e.r, { hurt: e.hurtT, dmg: 1 - e.hp / e.maxHp });
    ctx.restore();
  }
  if (g.shot) {
    for (const bd of g.shot.birds) {
      if (bd.done) continue;
      const b = bd.body;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(bd.touched ? b.angle : Math.atan2(b.velocity.y, b.velocity.x) * 0.6);
      drawBird(ctx, bd.type, bd.r, { t: v.t, fuse: g.shot.fuse > 0 });
      ctx.restore();
      if (g.shot.fuse > 0 && Math.floor(v.t * 12) % 2) {
        ctx.fillStyle = "rgba(255,120,40,0.35)";
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, bd.r * 1.6, 0, TAU);
        ctx.fill();
      }
    }
  }

  // bird in the pouch + front band
  if (pouchBird) {
    const r = { red: 21, yellow: 19, black: 24, blue: 15 }[pouchBird];
    ctx.save();
    ctx.translate(pouch.x, pouch.y);
    if (ui.aiming) ctx.rotate(Math.atan2(-pull.y, -pull.x) * 0.5);
    drawBird(ctx, pouchBird, r, { t: 0 });
    ctx.restore();
    ctx.fillStyle = "#4a2416";
    ctx.beginPath();
    ctx.ellipse(pouch.x - 4, pouch.y + 4, 9, r * 0.7, 0.2, 0, TAU);
    ctx.fill();
    band(ctx, FORK_FRONT, pouch, 7);
  }
  slingFront(ctx);

  // birds waiting their turn
  const waiting = g.queue.slice(g.next + (pouchBird ? 1 : 0));
  const gap = Math.min(48, 130 / Math.max(1, waiting.length - 1));
  waiting.forEach((type, i) => {
    const r = { red: 21, yellow: 19, black: 24, blue: 15 }[type];
    const hop = Math.max(0, Math.sin(v.t * 3 + i * 1.3)) * 6;
    ctx.save();
    ctx.translate(SLING.x - 50 - i * gap, -r - hop);
    ctx.scale(0.85, 0.85);
    drawBird(ctx, type, r, { t: 0 });
    ctx.restore();
  });

  // aiming guide: dotted arc for the first part of the flight
  if (ui.aiming && pouchBird && Math.hypot(pull.x, pull.y) > 18) {
    const pts = previewPath(pull, 14, 3);
    const strength = Math.hypot(pull.x, pull.y) / MAX_PULL;
    pts.forEach((p, i) => {
      ctx.fillStyle = `rgba(255,255,255,${0.95 - i * 0.055})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 - i * 0.22, 0, TAU);
      ctx.fill();
    });
    // power ring
    ctx.strokeStyle = `hsla(${120 - strength * 120}, 90%, 55%, 0.7)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(SLING.x, SLING.y, MAX_PULL + 12, -Math.PI / 2, -Math.PI / 2 + strength * TAU);
    ctx.stroke();
  }

  drawParticles(ctx, fx);

  // off-screen marker for a bird flying above the view
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lead = g.shot?.birds.find((b) => !b.done);
  if (lead) {
    const s = toScreen(v, lead.body.position.x, lead.body.position.y);
    if (s.y < 0) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.moveTo(s.x, 6);
      ctx.lineTo(s.x - 9, 22);
      ctx.lineTo(s.x + 9, 22);
      ctx.fill();
      ctx.fillStyle = birdColor(lead.type);
      ctx.beginPath();
      ctx.arc(s.x, 32, 8, 0, TAU);
      ctx.fill();
    }
  }
}

function drawParticles(ctx, fx) {
  for (const p of fx) {
    if (p.t < 0) continue;
    const a = Math.max(0, 1 - p.t / p.life);
    ctx.globalAlpha = a;
    switch (p.k) {
      case "chip":
      case "shard":
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.k === "shard") {
          ctx.beginPath();
          ctx.moveTo(0, -p.s / 2);
          ctx.lineTo(p.s / 2, p.s / 2);
          ctx.lineTo(-p.s / 2, p.s / 3);
          ctx.fill();
        } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
        break;
      case "feather":
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.s, p.s * 0.35, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        break;
      case "dust":
      case "smoke":
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (1 + p.t / p.life), 0, TAU);
        ctx.fill();
        break;
      case "spark":
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, TAU);
        ctx.fill();
        break;
      case "star":
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        starPath(ctx, p.s);
        ctx.fill();
        ctx.restore();
        break;
      case "ring":
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 6 * a + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (0.3 + 0.7 * (p.t / p.life)), 0, TAU);
        ctx.stroke();
        break;
      case "flash": {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
        gr.addColorStop(0, "rgba(255,240,180,0.95)");
        gr.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, TAU);
        ctx.fill();
        break;
      }
      case "text":
        ctx.font = `900 ${p.s}px "Nunito", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(40,20,40,0.8)";
        ctx.strokeText(p.txt, p.x, p.y);
        ctx.fillStyle = p.c;
        ctx.fillText(p.txt, p.x, p.y);
        break;
      default:
    }
  }
  ctx.globalAlpha = 1;
}

export function starPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}
