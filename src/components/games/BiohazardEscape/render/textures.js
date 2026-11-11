/**
 * Procedural canvas textures (no image files, no text): laboratory wall
 * panels with a sector-coloured trim band, rubber floor tiles, ceiling panels,
 * hazard stripes, door leaves, screens that show graphs and waveforms,
 * paper notes with scribbled lines, panel faces (colours / symbols) and soft
 * sprites for glows, smoke, sparks and goo.
 */
import * as THREE from "three";
import { SYMBOLS, COLORS } from "../engine/symbols.js";

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const canvas = (w, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const rgb = ([r, g, b], k = 1) => `rgb(${Math.max(0, Math.min(255, r * k)) | 0},${Math.max(0, Math.min(255, g * k)) | 0},${Math.max(0, Math.min(255, b * k)) | 0})`;
const paths = {};
const symPath = (id) => (paths[id] ??= new Path2D(SYMBOLS[id].d));

function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, rand, n, alpha, dark = true) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha * rand()})` : `rgba(255,255,255,${alpha * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}
function grime(ctx, w, h, rand, n, color = "40,30,20") {
  for (let i = 0; i < n; i++) {
    const x = rand() * w,
      y = rand() * h,
      r = 10 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${0.12 + rand() * 0.18})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Wall: two stacked metal/composite panels per 2 m with a coloured trim band. */
export function wallTexture(zone, seed = 1) {
  const W = 256,
    H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 31 + zone.id);
  ctx.fillStyle = rgb(zone.wall, 0.66);
  ctx.fillRect(0, 0, W, H);
  // lower kick plate
  ctx.fillStyle = rgb(zone.wall, 0.5);
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
  // panels
  const seams = [0, H * 0.42, H * 0.82];
  for (let i = 0; i < 2; i++) {
    const y0 = seams[i] + 4,
      y1 = seams[i + 1] - 4;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgb(zone.wall, 0.78));
    g.addColorStop(1, rgb(zone.wall, 0.6));
    ctx.fillStyle = g;
    ctx.fillRect(6, y0, W - 12, y1 - y0);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(6, y0, W - 12, y1 - y0);
    // rivets
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (const [x, y] of [
      [14, y0 + 8],
      [W - 14, y0 + 8],
      [14, y1 - 8],
      [W - 14, y1 - 8],
    ])
      ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  // vent grille on some panels
  if (rand() < 0.5) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.3, H * 0.55 + i * 9, W * 0.4, 4);
  }
  // trim band
  ctx.fillStyle = rgb(zone.trim, 0.95);
  ctx.fillRect(0, H * 0.72, W, 14);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, H * 0.72, W, 3);
  grime(ctx, W, H, rand, 18);
  // drips from the top
  for (let i = 0; i < 5; i++) {
    const x = rand() * W;
    const len = 30 + rand() * 120;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, "rgba(30,25,20,0.35)");
    g.addColorStop(1, "rgba(30,25,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rand() * 4, len);
  }
  speckle(ctx, W, H, rand, 1800, 0.25);
  return tex(c, { repeat: true });
}

/** Floor: rubberised tiles with seams and dirt. */
export function floorTexture(zone, seed = 2) {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 17 + zone.id * 3);
  ctx.fillStyle = rgb(zone.floor);
  ctx.fillRect(0, 0, S, S);
  const n = 4,
    s = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = 0.88 + rand() * 0.16;
      ctx.fillStyle = rgb(zone.floor, k);
      ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      // tread dots
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) ctx.fillRect(i * s + 10 + a * 20, j * s + 10 + b * 20, 4, 4);
    }
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, S);
    ctx.moveTo(0, i * s);
    ctx.lineTo(S, i * s);
    ctx.stroke();
  }
  grime(ctx, S, S, rand, 16);
  speckle(ctx, S, S, rand, 2500, 0.3);
  return tex(c, { repeat: true });
}

/** Ceiling: square acoustic panels with metal frame. */
export function ceilingTexture(zone) {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(91 + zone.id);
  ctx.fillStyle = rgb(zone.wall, 0.45);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = rgb(zone.wall, 0.55 + rand() * 0.1);
      ctx.fillRect(i * 128 + 5, j * 128 + 5, 118, 118);
    }
  speckle(ctx, S, S, rand, 1600, 0.35);
  grime(ctx, S, S, rand, 6);
  return tex(c, { repeat: true });
}

/** Yellow/black hazard stripes. */
export function stripeTexture(a = "#f2c230", b = "#1a1a1a") {
  const c = canvas(128, 32);
  const ctx = c.getContext("2d");
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = a;
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 16, 0);
    ctx.fill();
  }
  return tex(c, { repeat: true });
}

/** Heavy sliding door leaf with a coloured security band. */
export function doorTexture(color = "#e0e4ea", band = "#f2c230") {
  const W = 256,
    H = 384;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(color.length * 7 + band.length);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#5b6068");
  g.addColorStop(0.5, "#8a9099");
  g.addColorStop(1, "#5b6068");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.beginPath();
  ctx.moveTo(W / 2, 12);
  ctx.lineTo(W / 2, H - 12);
  ctx.stroke();
  // hazard band
  for (let x = -40; x < W + 40; x += 36) {
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.58);
    ctx.lineTo(x + 18, H * 0.58);
    ctx.lineTo(x + 36, H * 0.5);
    ctx.lineTo(x + 18, H * 0.5);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, H * 0.5 - 3, W, 3);
  ctx.fillRect(0, H * 0.58, W, 3);
  // window slits
  ctx.fillStyle = "#1a2a30";
  ctx.fillRect(W * 0.22, H * 0.16, W * 0.18, H * 0.18);
  ctx.fillRect(W * 0.6, H * 0.16, W * 0.18, H * 0.18);
  ctx.fillStyle = "rgba(140,220,255,0.25)";
  ctx.fillRect(W * 0.22, H * 0.16, W * 0.18, H * 0.05);
  ctx.fillRect(W * 0.6, H * 0.16, W * 0.18, H * 0.05);
  // colour tab
  ctx.fillStyle = color;
  ctx.fillRect(W * 0.42, H * 0.36, W * 0.16, H * 0.08);
  grime(ctx, W, H, rand, 8);
  speckle(ctx, W, H, rand, 1500, 0.25);
  return tex(c);
}

/** Screen content: graph lines, bars and a blinking cursor — emissive. */
export function screenTexture(kind = "graph", tint = "#3aff9a", seed = 1) {
  const W = 256,
    H = 192;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 13 + kind.length);
  ctx.fillStyle = "#04100c";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = tint;
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.25;
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  if (kind === "graph") {
    ctx.lineWidth = 2;
    ctx.beginPath();
    let y = H * 0.5;
    for (let x = 10; x < W - 10; x += 6) {
      y = Math.max(30, Math.min(H - 20, y + (rand() - 0.5) * 30));
      x === 10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 8; i++) ctx.fillRect(14 + i * 28, H - 14 - rand() * 40, 16, 6);
  } else if (kind === "lines") {
    for (let i = 0; i < 9; i++) ctx.fillRect(14, 20 + i * 18, 40 + rand() * 170, 6);
  } else if (kind === "alarm") {
    ctx.fillStyle = "#3a0606";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ff3020";
    ctx.beginPath();
    ctx.moveTo(W / 2, 30);
    ctx.lineTo(W / 2 + 60, 150);
    ctx.lineTo(W / 2 - 60, 150);
    ctx.fill();
    ctx.fillStyle = "#3a0606";
    ctx.fillRect(W / 2 - 6, 70, 12, 46);
    ctx.fillRect(W / 2 - 6, 124, 12, 12);
  } else if (kind === "gauge") {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.62, 64, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    const a = Math.PI + rand() * Math.PI;
    ctx.moveTo(W / 2, H * 0.62);
    ctx.lineTo(W / 2 + Math.cos(a) * 58, H * 0.62 + Math.sin(a) * 58);
    ctx.stroke();
  }
  return tex(c);
}

/** Paper note / whiteboard / poster faces with scribbled lines (no letters). */
export function paperTexture(kind = "note", seed = 1) {
  const W = 192,
    H = 160;
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 7 + kind.length);
  ctx.fillStyle = kind === "board" ? "#e8eef0" : kind === "poster" ? "#f2e6b8" : "#efe8d2";
  ctx.fillRect(0, 0, W, H);
  if (kind === "board") {
    ctx.strokeStyle = "#7a8288";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }
  if (kind === "poster") {
    ctx.fillStyle = "#e02a20";
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#1a1a1a";
    ctx.save();
    ctx.translate(W / 2 - 34, 44);
    ctx.scale(0.68, 0.68);
    ctx.fill(symPath("biohazard"), "evenodd");
    ctx.restore();
  }
  const ink = kind === "board" ? ["#2a4aa8", "#c02a2a", "#2a2a2a"] : ["#2a2a40"];
  const y0 = kind === "poster" ? 120 : 18;
  for (let y = y0; y < H - 10; y += 14) {
    ctx.strokeStyle = ink[Math.floor(rand() * ink.length)];
    ctx.lineWidth = 2;
    ctx.beginPath();
    let x = 12 + rand() * 8;
    ctx.moveTo(x, y);
    const end = 40 + rand() * (W - 60);
    while (x < end) {
      x += 3 + rand() * 4;
      ctx.lineTo(x, y + (rand() - 0.5) * 4);
    }
    ctx.stroke();
  }
  return tex(c);
}

/** Face for a colour / symbol panel (also used for item tags). */
export function faceTexture(sym, colorKey) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a0e12";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "#5a6470";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, S - 6, S - 6);
  if (SYMBOLS[sym]) {
    ctx.fillStyle = "#e8f6ff";
    ctx.save();
    ctx.translate(14, 14);
    ctx.scale(1, 1);
    ctx.fill(symPath(sym), "evenodd");
    ctx.restore();
  } else {
    ctx.fillStyle = COLORS[colorKey || sym] || "#ffffff";
    ctx.fillRect(20, 20, S - 40, S - 40);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(20, 20, S - 40, 12);
  }
  return tex(c);
}

/** Soft additive sprites. */
export function spriteTexture(kind) {
  const S = 64;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === "glow") {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else if (kind === "smoke") {
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else if (kind === "spark") {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.15, "rgba(255,240,200,0.9)");
    g.addColorStop(0.4, "rgba(255,160,60,0.25)");
    g.addColorStop(1, "rgba(255,120,0,0)");
  } else if (kind === "flash") {
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.3, "rgba(255,220,140,0.85)");
    g.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,230,160,0.8)";
    ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      ctx.lineTo(S / 2 + Math.cos(a) * 30, S / 2 + Math.sin(a) * 30);
      ctx.stroke();
    }
    return tex(c);
  } else {
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c);
}

/** Splat decal (blood / goo / papers). */
export function splatTexture(kind, seed = 3) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(seed * 11 + kind.length);
  if (kind === "papers") {
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(20 + rand() * 88, 20 + rand() * 88);
      ctx.rotate(rand() * 6.28);
      ctx.fillStyle = `rgba(${230 - rand() * 30},${225 - rand() * 30},${210 - rand() * 30},0.95)`;
      ctx.fillRect(-14, -18, 28, 36);
      ctx.fillStyle = "rgba(40,40,60,0.5)";
      for (let l = 0; l < 5; l++) ctx.fillRect(-10, -12 + l * 6, 12 + rand() * 8, 1.5);
      ctx.restore();
    }
    return tex(c);
  }
  const col = kind === "goo" ? [90, 220, 60] : [110, 8, 8];
  for (let i = 0; i < 26; i++) {
    const r = i === 0 ? 34 : 4 + rand() * 14;
    const a = rand() * 6.28,
      d = i === 0 ? 0 : 20 + rand() * 36;
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.65 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, 6.28);
    ctx.fill();
  }
  return tex(c);
}

/** Acid surface (tiles, scrolled in the shader via offset). */
export function acidTexture() {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const rand = rng(77);
  ctx.fillStyle = "#2a8a10";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = rand() * S,
      y = rand() * S,
      r = 3 + rand() * 12;
    ctx.fillStyle = `rgba(${150 + rand() * 80},255,${40 + rand() * 60},${0.2 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.28);
    ctx.fill();
  }
  return tex(c, { repeat: true });
}
