/**
 * Night Corridor — procedural textures, painted once on canvases and cached.
 *
 * No image files: every surface (two-tone institutional paint with grime,
 * drips, water stains and peeling patches; lino / carpet / concrete / grate
 * floors; stained ceiling tiles; doors; signs; decals) is drawn here with a
 * seeded RNG so it's identical on every load. Each colour map has a
 * matching bump map so the flashlight picks out relief.
 */
import * as THREE from "three";
import { mulberry32, hashStr } from "../engine/rng.js";

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function mottle(g, rand, x, y, w, h, base, count, spread = 0.05, size = 60) {
  for (let i = 0; i < count; i++) {
    const cx = x + rand() * w;
    const cy = y + rand() * h;
    const r = 6 + rand() * size;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = shade(base, (rand() - 0.5) * spread * 2);
    grad.addColorStop(0, col);
    grad.addColorStop(1, `${col}00`);
    g.globalAlpha = 0.25 + rand() * 0.35;
    g.fillStyle = grad;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

function speckle(g, rand, w, h, count, dark = "#000", light = "#fff", alpha = 0.08) {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = alpha * rand();
    g.fillStyle = rand() < 0.6 ? dark : light;
    const s = 1 + rand() * 2.5;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
  g.globalAlpha = 1;
}

function crack(g, rand, x, y, len, width = 1.2, color = "rgba(15,12,10,0.55)") {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rand() - 0.5) * 0.9;
    x += Math.cos(a) * 5;
    y += Math.sin(a) * 5;
    g.lineTo(x, y);
    if (rand() < 0.08) crack(g, rand, x, y, Math.floor(len / 3), width * 0.6, color);
  }
  g.stroke();
}

function blobPath(g, rand, cx, cy, r, n = 14) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.65 + rand() * 0.55);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr * 0.8;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function grime(g, rand, w, h, opts = {}) {
  // Darker towards the floor and the ceiling.
  let grad = g.createLinearGradient(0, h, 0, h * 0.55);
  grad.addColorStop(0, `rgba(20,16,10,${opts.floor ?? 0.55})`);
  grad.addColorStop(1, "rgba(20,16,10,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  grad = g.createLinearGradient(0, 0, 0, h * 0.3);
  grad.addColorStop(0, `rgba(18,15,12,${opts.top ?? 0.45})`);
  grad.addColorStop(1, "rgba(18,15,12,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Drips from the ceiling.
  const drips = opts.drips ?? 16;
  for (let i = 0; i < drips; i++) {
    const x = rand() * w;
    const len = h * (0.1 + rand() * 0.55);
    const wd = 2 + rand() * 9;
    const dg = g.createLinearGradient(0, 0, 0, len);
    const col = opts.rust && rand() < 0.5 ? "90,48,20" : "45,35,22";
    dg.addColorStop(0, `rgba(${col},${0.25 + rand() * 0.3})`);
    dg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = dg;
    g.fillRect(x, 0, wd, len);
  }
  // Water stains with a brown tide-line.
  const stains = opts.stains ?? 2;
  for (let i = 0; i < stains; i++) {
    const cx = rand() * w;
    const cy = rand() * h * 0.6;
    const r = 30 + rand() * 90;
    g.save();
    blobPath(g, rand, cx, cy, r);
    g.fillStyle = "rgba(70,52,28,0.16)";
    g.fill();
    g.strokeStyle = "rgba(80,55,25,0.32)";
    g.lineWidth = 2 + rand() * 3;
    g.stroke();
    g.restore();
  }
}

function peel(g, rand, w, y0, y1, plaster, count) {
  for (let i = 0; i < count; i++) {
    const cx = rand() * w;
    const cy = y0 + rand() * (y1 - y0);
    const r = 5 + rand() * 16;
    blobPath(g, rand, cx, cy, r, 10);
    g.fillStyle = plaster;
    g.fill();
    g.strokeStyle = "rgba(25,20,15,0.45)";
    g.lineWidth = 1.5;
    g.stroke();
  }
}

function makeTex(c, { repeat = [1, 1], color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function toBump(src) {
  const c = canvas(src.width, src.height);
  const g = c.getContext("2d");
  g.filter = "grayscale(1) contrast(1.6)";
  g.drawImage(src, 0, 0);
  return c;
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

// ------------------------------------------------------------------ walls
/** 2 m × 3 m wall face. */
export function wallTextures(theme, variant = 0) {
  return cached(`wall:${theme.wallTex}:${theme.wallUpper}:${theme.wallLower}:${variant}`, () => {
    const W = 512;
    const H = 768;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(hashStr(`wall${variant}${theme.wallTex}${theme.wallUpper}`));
    const pxm = H / 3;
    const plaster = "#8f8778";

    if (theme.wallTex === "block") {
      g.fillStyle = theme.wallUpper;
      g.fillRect(0, 0, W, H);
      const bw = 0.4 * pxm;
      const bh = 0.2 * pxm;
      for (let row = 0; row * bh < H; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -off; x < W; x += bw) {
          g.fillStyle = shade(theme.wallUpper, (rand() - 0.5) * 0.06);
          g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
        }
      }
      g.fillStyle = "rgba(25,22,18,0.55)";
      for (let row = 0; row * bh < H; row++) g.fillRect(0, row * bh, W, 2.5);
      mottle(g, rand, 0, 0, W, H, theme.wallUpper, 140, 0.05, 50);
      // painted lower band
      g.globalAlpha = 0.92;
      g.fillStyle = theme.wallLower;
      g.fillRect(0, H - 1.1 * pxm, W, 1.1 * pxm);
      g.globalAlpha = 1;
      g.fillStyle = theme.stripe;
      g.fillRect(0, H - 1.1 * pxm - 14, W, 14);
      speckle(g, rand, W, H, 2500);
      grime(g, rand, W, H, { drips: 10, stains: 1 });
    } else if (theme.wallTex === "concrete") {
      g.fillStyle = theme.wallUpper;
      g.fillRect(0, 0, W, H);
      mottle(g, rand, 0, 0, W, H, theme.wallUpper, 260, 0.07, 70);
      speckle(g, rand, W, H, 5000, "#000", "#fff", 0.12);
      // formwork seams + tie holes
      g.fillStyle = "rgba(20,18,15,0.35)";
      for (let y = pxm * 0.9; y < H; y += pxm * 0.9) g.fillRect(0, y, W, 2);
      for (let y = pxm * 0.45; y < H; y += pxm * 0.9) {
        for (let x = W * 0.25; x < W; x += W * 0.5) {
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fillStyle = "rgba(10,10,8,0.7)";
          g.fill();
        }
      }
      g.fillStyle = theme.stripe;
      g.globalAlpha = 0.85;
      g.fillRect(0, H - 0.45 * pxm, W, 0.08 * pxm);
      g.globalAlpha = 1;
      grime(g, rand, W, H, { drips: 22, stains: 2, rust: true, floor: 0.6 });
      for (let i = 0; i < 4; i++) crack(g, rand, rand() * W, rand() * H, 14 + Math.floor(rand() * 20));
    } else {
      // Institutional two-tone paint.
      const split = H - 1.05 * pxm;
      g.fillStyle = theme.wallUpper;
      g.fillRect(0, 0, W, split);
      mottle(g, rand, 0, 0, W, split, theme.wallUpper, 220, 0.06, 70);
      g.fillStyle = theme.wallLower;
      g.fillRect(0, split, W, H - split);
      mottle(g, rand, 0, split, W, H - split, theme.wallLower, 120, 0.05, 50);
      // chair-rail stripe
      g.fillStyle = theme.stripe;
      g.fillRect(0, split - 16, W, 16);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, split - 16, W, 3);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, split, W, 3);
      // panel seam
      g.fillStyle = "rgba(20,18,15,0.18)";
      g.fillRect(W - 3, 0, 3, H);
      peel(g, rand, W, 40, split - 30, plaster, variant === 2 ? 6 : 2 + variant);
      peel(g, rand, W, split + 20, H - 60, shade(plaster, -0.1), variant === 2 ? 5 : 1);
      speckle(g, rand, W, H, 3000);
      grime(g, rand, W, H, { drips: 10 + variant * 6, stains: 1 + variant });
      // cart scuffs on the lower paint
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(15,12,10,${0.08 + rand() * 0.14})`;
        g.fillRect(rand() * W, H - pxm * (0.2 + rand() * 0.6), 40 + rand() * 160, 2 + rand() * 4);
      }
      for (let i = 0; i < 2 + variant; i++) crack(g, rand, rand() * W, rand() * split, 12 + Math.floor(rand() * 26));
    }
    // baseboard
    const bb = 0.12 * pxm;
    g.fillStyle = "#1c1a17";
    g.fillRect(0, H - bb, W, bb);
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, H - bb, W, 2);
    const map = makeTex(c);
    const bump = makeTex(toBump(c), { color: false });
    return { map, bump };
  });
}

// ----------------------------------------------------------------- floors
/** 2 m × 2 m floor cell. */
export function floorTextures(theme, variant = 0) {
  return cached(`floor:${theme.floorTex}:${theme.floorA}:${variant}`, () => {
    const S = 512;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(hashStr(`floor${variant}${theme.floorTex}${theme.floorA}`));
    if (theme.floorTex === "carpet") {
      g.fillStyle = theme.floorA;
      g.fillRect(0, 0, S, S);
      speckle(g, rand, S, S, 22000, "#000", "#8a8577", 0.22);
      g.strokeStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < S; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, S);
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        blobPath(g, rand, rand() * S, rand() * S, 20 + rand() * 60);
        g.fillStyle = "rgba(20,14,8,0.25)";
        g.fill();
      }
    } else if (theme.floorTex === "concrete") {
      g.fillStyle = theme.floorA;
      g.fillRect(0, 0, S, S);
      mottle(g, rand, 0, 0, S, S, theme.floorA, 200, 0.07, 80);
      speckle(g, rand, S, S, 6000, "#000", "#fff", 0.1);
      for (let i = 0; i < 3; i++) crack(g, rand, rand() * S, rand() * S, 20 + Math.floor(rand() * 30), 1.5);
      for (let i = 0; i < 2; i++) {
        blobPath(g, rand, rand() * S, rand() * S, 25 + rand() * 50);
        g.fillStyle = "rgba(10,10,8,0.3)";
        g.fill();
      }
      g.fillStyle = "rgba(25,22,18,0.45)";
      g.fillRect(0, 0, S, 3);
      g.fillRect(0, 0, 3, S);
    } else if (theme.floorTex === "grate") {
      g.fillStyle = theme.floorA;
      g.fillRect(0, 0, S, S);
      mottle(g, rand, 0, 0, S, S, theme.floorA, 150, 0.06, 60);
      for (let y = 0; y < S; y += 24) {
        for (let x = (y / 24) % 2 ? 12 : 0; x < S; x += 24) {
          g.save();
          g.translate(x, y);
          g.rotate(Math.PI / 4 * ((x + y) % 48 ? 1 : -1));
          g.fillStyle = "rgba(200,200,190,0.10)";
          g.fillRect(-7, -2, 14, 4);
          g.fillStyle = "rgba(0,0,0,0.3)";
          g.fillRect(-7, 2, 14, 1.5);
          g.restore();
        }
      }
      g.fillStyle = "rgba(15,12,8,0.6)";
      g.fillRect(0, 0, S, 4);
      g.fillRect(0, 0, 4, S);
      for (let i = 0; i < 5; i++) {
        blobPath(g, rand, rand() * S, rand() * S, 15 + rand() * 45);
        g.fillStyle = `rgba(${90 + rand() * 30},${45 + rand() * 15},18,0.22)`;
        g.fill();
      }
      speckle(g, rand, S, S, 4000, "#000", "#c8b8a0", 0.12);
    } else {
      // 4 × 4 lino tiles in a two-tone pattern.
      const t = S / 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const base = (x + y) % 2 ? theme.floorA : theme.floorB;
          g.fillStyle = shade(base, (rand() - 0.5) * 0.05);
          g.fillRect(x * t, y * t, t, t);
          mottle(g, rand, x * t, y * t, t, t, base, 10, 0.04, 30);
          if (rand() < 0.12) crack(g, rand, x * t + rand() * t, y * t + rand() * t, 8, 1);
          if (rand() < 0.05) {
            g.fillStyle = "#3a3832";
            g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
            speckle(g, rand, S, S, 200);
          }
        }
      }
      g.fillStyle = "rgba(15,13,10,0.55)";
      for (let i = 0; i <= 4; i++) {
        g.fillRect(i * t - 1.5, 0, 3, S);
        g.fillRect(0, i * t - 1.5, S, 3);
      }
      speckle(g, rand, S, S, 6000, "#000", "#fff", 0.12);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(10,8,6,${0.06 + rand() * 0.12})`;
        g.save();
        g.translate(rand() * S, rand() * S);
        g.rotate(rand() * Math.PI);
        g.fillRect(0, 0, 30 + rand() * 120, 2 + rand() * 6);
        g.restore();
      }
      const vg = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(18,14,10,0.35)");
      g.fillStyle = vg;
      g.fillRect(0, 0, S, S);
    }
    return { map: makeTex(c), bump: makeTex(toBump(c), { color: false }) };
  });
}

// ---------------------------------------------------------------- ceiling
export function ceilingTextures(theme, variant = 0) {
  return cached(`ceil:${theme.ceiling}:${theme.wallTex}:${variant}`, () => {
    const S = 512;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(hashStr(`ceil${variant}${theme.ceiling}`));
    if (theme.wallTex === "concrete") {
      g.fillStyle = theme.ceiling;
      g.fillRect(0, 0, S, S);
      mottle(g, rand, 0, 0, S, S, theme.ceiling, 160, 0.07, 80);
      speckle(g, rand, S, S, 4000, "#000", "#fff", 0.12);
      for (let i = 0; i < 3; i++) {
        blobPath(g, rand, rand() * S, rand() * S, 40 + rand() * 70);
        g.fillStyle = "rgba(30,24,15,0.25)";
        g.fill();
      }
    } else {
      const t = S / 2;
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          g.fillStyle = shade(theme.ceiling, (rand() - 0.5) * 0.06);
          g.fillRect(x * t, y * t, t, t);
          speckle(g, rand, S, S, 900, "#000", "#fff", 0.14);
          if (rand() < 0.45) {
            const cx = x * t + rand() * t;
            const cy = y * t + rand() * t;
            const r = 20 + rand() * 60;
            blobPath(g, rand, cx, cy, r);
            g.fillStyle = "rgba(95,70,35,0.25)";
            g.fill();
            g.strokeStyle = "rgba(90,62,28,0.45)";
            g.lineWidth = 3;
            g.stroke();
          }
        }
      }
      g.fillStyle = "#57554e";
      for (let i = 0; i <= 2; i++) {
        g.fillRect(i * t - 4, 0, 8, S);
        g.fillRect(0, i * t - 4, S, 8);
      }
    }
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(15,12,8,0.4)");
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    return { map: makeTex(c), bump: makeTex(toBump(c), { color: false }) };
  });
}

// ------------------------------------------------------------------ doors
export function doorTexture(style) {
  return cached(`door:${style}`, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(hashStr(`door${style}`));
    if (style === "wood") {
      g.fillStyle = "#5b4330";
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(${30 + rand() * 30},${20 + rand() * 15},10,${0.15 + rand() * 0.25})`;
        g.lineWidth = 1 + rand() * 2;
        g.beginPath();
        const x = rand() * W;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (rand() - 0.5) * 20, H * 0.3, x + (rand() - 0.5) * 20, H * 0.7, x + (rand() - 0.5) * 10, H);
        g.stroke();
      }
      // kick plate + window
      g.fillStyle = "#6d6a63";
      g.fillRect(10, H - 70, W - 20, 60);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(10, H - 70, W - 20, 3);
      g.fillStyle = "#14191b";
      g.fillRect(W * 0.3, H * 0.12, W * 0.4, H * 0.22);
      g.strokeStyle = "#2a2622";
      g.lineWidth = 6;
      g.strokeRect(W * 0.3, H * 0.12, W * 0.4, H * 0.22);
      g.strokeStyle = "rgba(200,210,215,0.12)";
      g.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(W * 0.3, H * 0.12 + i * 12);
        g.lineTo(W * 0.3 + i * 12, H * 0.12);
        g.stroke();
      }
    } else {
      const base = style === "exit" ? "#3a4a44" : style === "security" ? "#4c5257" : "#5d5f5c";
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      mottle(g, rand, 0, 0, W, H, base, 120, 0.06, 40);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(200,200,190,${0.05 + rand() * 0.1})`;
        g.lineWidth = 1;
        g.beginPath();
        const x = rand() * W;
        const y = rand() * H;
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 12);
        g.stroke();
      }
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 4;
      g.strokeRect(16, 16, W - 32, H * 0.45);
      g.strokeRect(16, H * 0.52, W - 32, H * 0.43);
      if (style === "security") {
        g.fillStyle = "#c9a227";
        for (let i = 0; i < 6; i++) {
          g.save();
          g.translate(0, H - 60);
          g.fillStyle = i % 2 ? "#c9a227" : "#1b1b19";
          g.fillRect(i * (W / 6), 0, W / 6, 40);
          g.restore();
        }
      }
      grime(g, rand, W, H, { drips: 6, stains: 1, rust: true, floor: 0.4, top: 0.2 });
    }
    speckle(g, rand, W, H, 1500);
    return { map: makeTex(c), bump: makeTex(toBump(c), { color: false }) };
  });
}

// ------------------------------------------------------------------ signs
export function signTexture(text, kind = "plate") {
  return cached(`sign:${kind}:${text}`, () => {
    const W = 512;
    const H = 128;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(hashStr(text));
    const exit = kind === "exit";
    g.fillStyle = exit ? "#0d3b1f" : kind === "danger" ? "#c9a227" : "#d8d2c2";
    g.fillRect(0, 0, W, H);
    g.fillStyle = exit ? "#3dff7a" : kind === "danger" ? "#111" : "#1d2a2a";
    g.font = `bold ${text.length > 14 ? 44 : 60}px Arial, Helvetica, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, W / 2, H / 2 + 3);
    g.strokeStyle = exit ? "#1a7a3c" : "#2d2b26";
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    if (!exit) {
      grime(g, rand, W, H, { drips: 3, stains: 1, floor: 0.2, top: 0.2 });
      speckle(g, rand, W, H, 900, "#000", "#fff", 0.2);
    }
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ----------------------------------------------------------------- decals
/** Soft dirty stain (alpha). */
export function stainTexture(v = 0) {
  return cached(`stain:${v}`, () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(900 + v);
    for (let i = 0; i < 26; i++) {
      const cx = S / 2 + (rand() - 0.5) * S * 0.5;
      const cy = S / 2 + (rand() - 0.5) * S * 0.5;
      const r = 10 + rand() * 60;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const tone = v === 3 ? "60,20,15" : "38,28,16";
      grad.addColorStop(0, `rgba(${tone},${0.15 + rand() * 0.25})`);
      grad.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    }
    if (v % 2 === 0) {
      for (let i = 0; i < 6; i++) {
        const x = S * 0.3 + rand() * S * 0.4;
        const dg = g.createLinearGradient(0, S / 2, 0, S);
        dg.addColorStop(0, "rgba(35,25,15,0.35)");
        dg.addColorStop(1, "rgba(35,25,15,0)");
        g.fillStyle = dg;
        g.fillRect(x, S / 2, 2 + rand() * 4, S / 2);
      }
    }
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function papersTexture() {
  return cached("papers", () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(77);
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(S / 2 + (rand() - 0.5) * 120, S / 2 + (rand() - 0.5) * 120);
      g.rotate(rand() * Math.PI);
      g.fillStyle = `rgba(${200 + rand() * 30},${195 + rand() * 25},${175 + rand() * 20},0.9)`;
      g.fillRect(-35, -45, 70, 90);
      g.fillStyle = "rgba(40,40,45,0.35)";
      for (let l = 0; l < 9; l++) g.fillRect(-28, -36 + l * 9, 30 + rand() * 25, 2);
      g.fillStyle = "rgba(60,45,25,0.25)";
      g.fillRect(-35, 20, 70, 25);
      g.restore();
    }
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function puddleTexture() {
  return cached("puddle", () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(31);
    blobPath(g, rand, S / 2, S / 2, S * 0.38, 18);
    const grad = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.45);
    grad.addColorStop(0, "rgba(8,9,10,0.85)");
    grad.addColorStop(0.8, "rgba(10,10,10,0.6)");
    grad.addColorStop(1, "rgba(10,10,10,0)");
    g.fillStyle = grad;
    g.fill();
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function debrisTexture() {
  return cached("debris", () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(55);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(${90 + rand() * 80},${85 + rand() * 70},${70 + rand() * 60},${0.4 + rand() * 0.5})`;
      const x = S / 2 + (rand() - 0.5) * S * 0.8 * rand();
      const y = S / 2 + (rand() - 0.5) * S * 0.8 * rand();
      g.save();
      g.translate(x, y);
      g.rotate(rand() * 3);
      g.fillRect(0, 0, 2 + rand() * 9, 2 + rand() * 6);
      g.restore();
    }
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(20,16,12,0.45)");
    grad.addColorStop(1, "rgba(20,16,12,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Radial glow for floor light pools and lamp halos. */
export function glowTexture() {
  return cached("glow", () => {
    const S = 128;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Vertical light shaft fade (top bright → bottom transparent). */
export function shaftTexture() {
  return cached("shaft", () => {
    const c = canvas(64, 256);
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const hg = g.createLinearGradient(0, 0, 64, 0);
    hg.addColorStop(0, "rgba(0,0,0,1)");
    hg.addColorStop(0.5, "rgba(0,0,0,0)");
    hg.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = hg;
    g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Flashlight cookie — a hot centre ring with uneven falloff like a cheap reflector. */
export function flashlightCookie() {
  return cached("cookie", () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, S, S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.18, "#f4f1ea");
    grad.addColorStop(0.24, "#b9b6ad");
    grad.addColorStop(0.3, "#d8d4ca");
    grad.addColorStop(0.55, "#6d6a63");
    grad.addColorStop(0.8, "#262522");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const rand = mulberry32(5);
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = 0.05;
      g.fillStyle = "#000";
      g.beginPath();
      g.arc(S / 2 + (rand() - 0.5) * S * 0.6, S / 2 + (rand() - 0.5) * S * 0.6, 10 + rand() * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Locker front with vent slats. */
export function lockerTexture() {
  return cached("locker", () => {
    const W = 128;
    const H = 288;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(42);
    g.fillStyle = "#4a5652";
    g.fillRect(0, 0, W, H);
    mottle(g, rand, 0, 0, W, H, "#4a5652", 60, 0.07, 30);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "#0b0d0c";
      g.fillRect(W * 0.22, 26 + i * 9, W * 0.56, 4);
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = "#0b0d0c";
      g.fillRect(W * 0.22, H - 50 + i * 9, W * 0.56, 4);
    }
    g.fillStyle = "#9a9c96";
    g.fillRect(W * 0.78, H * 0.45, 8, 26);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 3;
    g.strokeRect(4, 4, W - 8, H - 8);
    grime(g, rand, W, H, { drips: 4, stains: 1, rust: true, floor: 0.5, top: 0.2 });
    speckle(g, rand, W, H, 800);
    return { map: makeTex(c), bump: makeTex(toBump(c), { color: false }) };
  });
}

/** The creature's face — pale, stretched, eyes deep and dark. Not gore. */
/** The creature's face — pale, stretched, waxy, with hollow sockets. Edges fade into the dark skin. Not gore. */
export function faceTexture() {
  return cached("face", () => {
    const S = 256;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const rand = mulberry32(666);
    const grad = g.createRadialGradient(S / 2, S * 0.42, 6, S / 2, S * 0.5, S * 0.55);
    grad.addColorStop(0, "#d3cbbc");
    grad.addColorStop(0.55, "#9b9385");
    grad.addColorStop(1, "#3a3530");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    speckle(g, rand, S, S, 3500, "#2b2520", "#efe6d6", 0.16);
    for (let i = 0; i < 14; i++) crack(g, rand, S * (0.15 + rand() * 0.7), S * (0.1 + rand() * 0.8), 6, 1, "rgba(50,30,25,0.35)");
    // Sockets: large, uneven, sunk deep — one sits lower than the other.
    for (const [ex, ey, rx, ry, rot] of [[S * 0.35, S * 0.37, 34, 30, 0.4], [S * 0.66, S * 0.41, 30, 34, -0.2]]) {
      const eg = g.createRadialGradient(ex, ey, 2, ex, ey, Math.max(rx, ry) * 1.25);
      eg.addColorStop(0, "#000");
      eg.addColorStop(0.55, "#050403");
      eg.addColorStop(0.8, "rgba(30,24,20,0.6)");
      eg.addColorStop(1, "rgba(40,32,26,0)");
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(ex, ey, rx * 1.25, ry * 1.25, rot, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(10,8,7,0.75)";
    g.beginPath();
    g.ellipse(S * 0.5, S * 0.56, 7, 11, 0, 0, Math.PI * 2);
    g.fill();
    // Slack jaw: a long, crooked, vertical opening — never a smile.
    const mg = g.createRadialGradient(S * 0.52, S * 0.8, 4, S * 0.52, S * 0.8, 44);
    mg.addColorStop(0, "#000");
    mg.addColorStop(0.7, "#030202");
    mg.addColorStop(1, "rgba(20,15,12,0)");
    g.fillStyle = mg;
    g.beginPath();
    g.moveTo(S * 0.45, S * 0.66);
    g.bezierCurveTo(S * 0.4, S * 0.74, S * 0.42, S * 0.9, S * 0.5, S * 0.97);
    g.bezierCurveTo(S * 0.6, S * 0.92, S * 0.63, S * 0.75, S * 0.57, S * 0.65);
    g.bezierCurveTo(S * 0.53, S * 0.63, S * 0.48, S * 0.63, S * 0.45, S * 0.66);
    g.fill();
    g.strokeStyle = "rgba(60,40,32,0.5)";
    g.lineWidth = 2;
    g.stroke();
    g.globalCompositeOperation = "destination-in";
    const fade = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "source-over";
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Ragged cloth strip with alpha holes. */
export function clothTexture() {
  return cached("cloth", () => {
    const W = 128;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(13);
    g.fillStyle = "#17130f";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    let y = H;
    for (let x = W; x >= 0; x -= 8) {
      y = H * (0.55 + rand() * 0.45);
      g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    speckle(g, rand, W, H, 1600, "#000", "#3a3028", 0.4);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 14; i++) {
      blobPath(g, rand, rand() * W, H * 0.3 + rand() * H * 0.6, 4 + rand() * 10, 8);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    const t = makeTex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Window to the night: rain-streaked dark glass with a faint cold glow. */
export function windowTexture() {
  return cached("window", () => {
    const W = 256;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(8);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#101a24");
    grad.addColorStop(1, "#05080b");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // distant lights
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(${150 + rand() * 80},${150 + rand() * 60},${120 + rand() * 60},${0.2 + rand() * 0.4})`;
      g.fillRect(rand() * W, H * (0.55 + rand() * 0.3), 2, 2);
    }
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(160,180,200,${0.04 + rand() * 0.1})`;
      g.lineWidth = 1;
      g.beginPath();
      const x = rand() * W;
      const y = rand() * H;
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 4, y + 10 + rand() * 40);
      g.stroke();
    }
    g.fillStyle = "#1a1c1c";
    g.fillRect(W / 2 - 4, 0, 8, H);
    g.fillRect(0, H / 2 - 4, W, 8);
    return makeTex(c);
  });
}

export function disposeTextureCache() {
  for (const v of cache.values()) {
    if (v && v.isTexture) v.dispose();
    else if (v && typeof v === "object") for (const t of Object.values(v)) t?.dispose?.();
  }
  cache.clear();
}
