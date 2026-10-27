/**
 * Shadow Warriors — the five arenas (temple, forest, rooftops, desert,
 * snow), each with four lighting variants (0 day, 1 dusk, 2 night, 3 boss).
 *
 * Distant layers are painted once into offscreen canvases (per stage size)
 * and panned with parallax; the floor, edge props and ambient particles are
 * drawn live in world space so they zoom with the fight.
 */
import { makeRng } from "../engine/rng.js";
import { ARENA_W } from "../engine/constants.js";
import { CAM_MIN, CAM_MAX, sx, sy } from "./view.js";

// ------------------------------------------------------------------ palettes
const PAL = {
  temple: [
    { sky: ["#ffe2b3", "#ffb98a", "#f2907a"], orb: "#fff4d6", orbR: 0.09, orbY: 0.3, far: "#d9a08e", mid: "#8a5560", near: "#3a2028", fog: "rgba(255,226,196,0.35)", ground: ["#4a2e2e", "#1d1014"], rim: "#ffd7a6", glow: "#ffb070", particle: "petal", pc: "#ffc0cf" },
    { sky: ["#ffb07a", "#d85a6e", "#55285e"], orb: "#ffd98a", orbR: 0.11, orbY: 0.52, far: "#b0606e", mid: "#6a3550", near: "#2a1424", fog: "rgba(255,170,150,0.3)", ground: ["#3c2030", "#160a12"], rim: "#ffb08a", glow: "#ff8a5a", particle: "petal", pc: "#ffb0c8" },
    { sky: ["#1b2554", "#2c2c62", "#4c3468"], orb: "#f6f2ff", orbR: 0.06, orbY: 0.22, far: "#3e3f78", mid: "#2a2652", near: "#120f26", fog: "rgba(140,150,230,0.22)", ground: ["#221d3c", "#0b0916"], rim: "#b7c4ff", glow: "#ffcf7a", particle: "firefly", pc: "#ffe08a", stars: true, lanterns: true },
    { sky: ["#2a060e", "#7a1818", "#e2602e"], orb: "#ffc070", orbR: 0.16, orbY: 0.56, far: "#7a2a2a", mid: "#4a1418", near: "#1a0608", fog: "rgba(255,120,80,0.28)", ground: ["#2e1012", "#100406"], rim: "#ffa060", glow: "#ff6a3a", particle: "ember", pc: "#ffb060", lanterns: true },
  ],
  forest: [
    { sky: ["#e8f6c8", "#b7e0a0", "#7ab88a"], orb: "#fffbe0", orbR: 0.08, orbY: 0.2, far: "#8fbf8a", mid: "#4f7d58", near: "#1e3424", fog: "rgba(230,255,220,0.35)", ground: ["#2e3a22", "#10180e"], rim: "#e8ffc0", glow: "#d0ff9a", particle: "leaf", pc: "#c8e07a", rays: true },
    { sky: ["#ffd48a", "#e0905a", "#6a4a48"], orb: "#ffe8a0", orbR: 0.1, orbY: 0.5, far: "#a07a5a", mid: "#5a4a38", near: "#22201a", fog: "rgba(255,200,140,0.3)", ground: ["#3a2e1e", "#14100a"], rim: "#ffd090", glow: "#ffb060", particle: "leaf", pc: "#e0a050", rays: true },
    { sky: ["#0e2230", "#163a3e", "#1e4a40"], orb: "#e6fff4", orbR: 0.05, orbY: 0.18, far: "#1f4a48", mid: "#14302e", near: "#081614", fog: "rgba(120,220,180,0.18)", ground: ["#132420", "#060c0a"], rim: "#a0ffd8", glow: "#9affc0", particle: "firefly", pc: "#c8ff7a", stars: true },
    { sky: ["#0c1a10", "#1e3a1a", "#5a7a2a"], orb: "#d8ff9a", orbR: 0.12, orbY: 0.45, far: "#2e4a22", mid: "#1a2e16", near: "#08120a", fog: "rgba(160,255,120,0.22)", ground: ["#162412", "#060a04"], rim: "#b8ff8a", glow: "#7aff6a", particle: "spore", pc: "#9aff7a" },
  ],
  rooftops: [
    { sky: ["#bfe0ff", "#9ac0f0", "#e8b8d8"], orb: "#ffffff", orbR: 0.07, orbY: 0.22, far: "#9aa8d0", mid: "#5a5f8a", near: "#22223a", fog: "rgba(220,230,255,0.3)", ground: ["#2a2638", "#100e18"], rim: "#e0e8ff", glow: "#ffd0f0", particle: "dust", pc: "#ffffff", windows: "#fff3c0" },
    { sky: ["#ffb0a0", "#c0608a", "#3a2a60"], orb: "#ffe0b0", orbR: 0.1, orbY: 0.55, far: "#8a5a8a", mid: "#4a3060", near: "#1c1430", fog: "rgba(255,160,200,0.25)", ground: ["#2a1c34", "#100a16"], rim: "#ffc0d8", glow: "#ff7ab0", particle: "spark", pc: "#ffd27a", windows: "#ffd27a", neon: true },
    { sky: ["#0a0820", "#1c1040", "#3a1450"], orb: "#ffe8f8", orbR: 0.05, orbY: 0.2, far: "#2a1e58", mid: "#1a1238", near: "#0a0618", fog: "rgba(255,90,180,0.18)", ground: ["#18102a", "#07040e"], rim: "#ff8ad8", glow: "#ff5ab0", particle: "rain", pc: "#a0b8ff", windows: "#ff9ad0", neon: true, stars: true },
    { sky: ["#14020e", "#3a0a2a", "#8a1a4a"], orb: "#ff6ab0", orbR: 0.14, orbY: 0.48, far: "#4a1440", mid: "#2a0a24", near: "#10040e", fog: "rgba(255,60,160,0.24)", ground: ["#1e0818", "#0a0208"], rim: "#ff6ac8", glow: "#c46aff", particle: "spark", pc: "#ff7ad8", windows: "#ff5ab0", neon: true },
  ],
  desert: [
    { sky: ["#fff0c0", "#ffd080", "#f0a050"], orb: "#fffbe8", orbR: 0.1, orbY: 0.24, far: "#e8b070", mid: "#b07040", near: "#4a2a18", fog: "rgba(255,230,180,0.35)", ground: ["#c08a4a", "#5a3a1e"], rim: "#fff0c0", glow: "#ffd080", particle: "sand", pc: "#ffe0a0", heat: true },
    { sky: ["#ffb060", "#e06030", "#6a2a3a"], orb: "#ffe090", orbR: 0.13, orbY: 0.55, far: "#c0603a", mid: "#80382a", near: "#301414", fog: "rgba(255,160,90,0.3)", ground: ["#8a4a28", "#3a1a10"], rim: "#ffc080", glow: "#ff8a3a", particle: "sand", pc: "#ffc080" },
    { sky: ["#141a3a", "#2a2a5a", "#5a3a5a"], orb: "#fff8e0", orbR: 0.07, orbY: 0.2, far: "#3a3260", mid: "#28224a", near: "#100c20", fog: "rgba(180,170,255,0.18)", ground: ["#3a3048", "#141020"], rim: "#c8c0ff", glow: "#ffd080", particle: "sand", pc: "#c8b8e0", stars: true },
    { sky: ["#3a1004", "#a03a0a", "#ffb030"], orb: "#ffe070", orbR: 0.18, orbY: 0.5, far: "#a0501a", mid: "#602a0e", near: "#240c04", fog: "rgba(255,170,60,0.32)", ground: ["#7a3a14", "#2a1006"], rim: "#ffc860", glow: "#ffb020", particle: "sand", pc: "#ffc060", heat: true },
  ],
  snow: [
    { sky: ["#f0f8ff", "#c8e4f8", "#a0c8e8"], orb: "#ffffff", orbR: 0.08, orbY: 0.22, far: "#c0d8ec", mid: "#7a9ab8", near: "#2a3a4c", fog: "rgba(240,250,255,0.4)", ground: ["#e8f2fa", "#a8c0d4"], rim: "#ffffff", glow: "#c8f0ff", particle: "snow", pc: "#ffffff", snowGround: true },
    { sky: ["#ffd0c0", "#c0a0d0", "#6a6aa0"], orb: "#fff0d8", orbR: 0.1, orbY: 0.55, far: "#b0a0c8", mid: "#6a6a98", near: "#262a44", fog: "rgba(255,220,230,0.3)", ground: ["#d8d4ec", "#8a88b0"], rim: "#ffe0e8", glow: "#ffc0d8", particle: "snow", pc: "#ffffff", snowGround: true },
    { sky: ["#06101e", "#0e2440", "#1e4a6a"], orb: "#e8f8ff", orbR: 0.06, orbY: 0.2, far: "#1e3a5a", mid: "#122640", near: "#060e1a", fog: "rgba(140,220,255,0.18)", ground: ["#5a7a98", "#1a2a3c"], rim: "#a8e8ff", glow: "#7ad8ff", particle: "snow", pc: "#e8f8ff", stars: true, aurora: true, snowGround: true },
    { sky: ["#05040e", "#1a0a24", "#4a0a24"], orb: "#ff2a4a", orbR: 0.15, orbY: 0.42, far: "#2a1430", mid: "#180a1e", near: "#08040c", fog: "rgba(255,40,80,0.18)", ground: ["#3a3048", "#120c18"], rim: "#ff6a8a", glow: "#ff2a4a", particle: "ash", pc: "#c8c0d0", snowGround: true, eclipse: true },
  ],
};

export function arenaPalette(arena, variant) {
  return PAL[arena][variant] || PAL[arena][0];
}

// ------------------------------------------------------------------ helpers
function ridge(g, w, base, amp, color, rng, { jag = 0.5, step = 40, peaks = false } = {}) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, g.canvas.height);
  let y = base - rng() * amp;
  for (let x = 0; x <= w + step; x += step) {
    const target = base - (peaks ? Math.abs(Math.sin(x * 0.004 + rng() * 0.6)) * amp : rng() * amp);
    y += (target - y) * jag;
    g.lineTo(x, y);
  }
  g.lineTo(w, g.canvas.height);
  g.closePath();
  g.fill();
}

function smoothHills(g, w, base, amp, color, rng, freq = 0.004) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, g.canvas.height);
  const ph = rng() * 10;
  const ph2 = rng() * 10;
  for (let x = 0; x <= w; x += 8) g.lineTo(x, base - (Math.sin(x * freq + ph) * 0.6 + Math.sin(x * freq * 2.3 + ph2) * 0.4 + 1) * amp * 0.5);
  g.lineTo(w, g.canvas.height);
  g.closePath();
  g.fill();
}

function pagoda(g, x, base, s, color, glow) {
  g.fillStyle = color;
  const tiers = 4;
  let y = base;
  let wd = 70 * s;
  for (let i = 0; i < tiers; i++) {
    const hh = 26 * s * (1 - i * 0.08);
    g.fillRect(x - wd * 0.32, y - hh, wd * 0.64, hh);
    // eaves
    g.beginPath();
    g.moveTo(x - wd * 0.62, y - hh + 2 * s);
    g.quadraticCurveTo(x - wd * 0.4, y - hh - 4 * s, x, y - hh - 12 * s);
    g.quadraticCurveTo(x + wd * 0.4, y - hh - 4 * s, x + wd * 0.62, y - hh + 2 * s);
    g.lineTo(x + wd * 0.5, y - hh + 6 * s);
    g.lineTo(x - wd * 0.5, y - hh + 6 * s);
    g.closePath();
    g.fill();
    if (glow) {
      g.fillStyle = glow;
      g.fillRect(x - wd * 0.2, y - hh * 0.7, wd * 0.08, hh * 0.4);
      g.fillRect(x + wd * 0.12, y - hh * 0.7, wd * 0.08, hh * 0.4);
      g.fillStyle = color;
    }
    y -= hh + 8 * s;
    wd *= 0.82;
  }
  g.fillRect(x - 1.5 * s, y - 30 * s, 3 * s, 34 * s);
}

function torii(g, x, base, s, color) {
  g.fillStyle = color;
  g.fillRect(x - 40 * s, base - 110 * s, 8 * s, 110 * s);
  g.fillRect(x + 32 * s, base - 110 * s, 8 * s, 110 * s);
  g.fillRect(x - 50 * s, base - 92 * s, 100 * s, 7 * s);
  g.beginPath();
  g.moveTo(x - 62 * s, base - 108 * s);
  g.quadraticCurveTo(x, base - 118 * s, x + 62 * s, base - 108 * s);
  g.lineTo(x + 58 * s, base - 120 * s);
  g.quadraticCurveTo(x, base - 132 * s, x - 58 * s, base - 120 * s);
  g.closePath();
  g.fill();
}

function cedar(g, x, base, s, color, top) {
  g.fillStyle = color;
  const wd = (16 + top * 10) * s;
  g.beginPath();
  g.moveTo(x - wd, base);
  g.lineTo(x - wd * 0.55, -10);
  g.lineTo(x + wd * 0.55, -10);
  g.lineTo(x + wd, base);
  g.closePath();
  g.fill();
}

function pine(g, x, base, s, color, snow) {
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const wd = (36 - i * 7) * s;
    const y0 = base - i * 26 * s;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x - wd, y0);
    g.lineTo(x, y0 - 44 * s);
    g.lineTo(x + wd, y0);
    g.closePath();
    g.fill();
    if (snow) {
      g.fillStyle = snow;
      g.beginPath();
      g.moveTo(x - wd * 0.4, y0 - 26 * s);
      g.lineTo(x, y0 - 44 * s);
      g.lineTo(x + wd * 0.4, y0 - 26 * s);
      g.quadraticCurveTo(x, y0 - 30 * s, x - wd * 0.4, y0 - 26 * s);
      g.fill();
    }
  }
  g.fillStyle = color;
  g.fillRect(x - 3 * s, base - 4 * s, 6 * s, 14 * s);
}

function palm(g, x, base, s, color, rng) {
  g.strokeStyle = color;
  g.lineWidth = 6 * s;
  g.lineCap = "round";
  const lean = (rng() - 0.5) * 40 * s;
  const topX = x + lean;
  const topY = base - 150 * s;
  g.beginPath();
  g.moveTo(x, base);
  g.quadraticCurveTo(x + lean * 0.2, base - 80 * s, topX, topY);
  g.stroke();
  g.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI + (rng() - 0.5) * 0.3;
    const len = (60 + rng() * 30) * s;
    g.beginPath();
    g.moveTo(topX, topY);
    g.quadraticCurveTo(topX + Math.cos(a) * len * 0.6, topY + Math.sin(a) * len * 0.6 - 18 * s, topX + Math.cos(a) * len, topY + Math.sin(a) * len * 0.5 + 20 * s);
    g.quadraticCurveTo(topX + Math.cos(a) * len * 0.5, topY + Math.sin(a) * len * 0.3, topX, topY + 4 * s);
    g.fill();
  }
}

function skyline(g, w, base, s, color, win, rng, tall = 1) {
  let x = -20;
  while (x < w + 40) {
    const bw = (40 + rng() * 70) * s;
    const bh = (80 + rng() * 200 * tall) * s;
    g.fillStyle = color;
    g.fillRect(x, base - bh, bw, bh + 4);
    if (rng() < 0.35) {
      // pagoda-style roof cap
      g.beginPath();
      g.moveTo(x - 8 * s, base - bh);
      g.quadraticCurveTo(x + bw / 2, base - bh - 26 * s, x + bw + 8 * s, base - bh);
      g.fill();
    }
    if (rng() < 0.2) g.fillRect(x + bw * 0.45, base - bh - 40 * s, 2 * s, 40 * s);
    if (win) {
      g.fillStyle = win;
      for (let yy = base - bh + 10 * s; yy < base - 8 * s; yy += 14 * s) {
        for (let xx = x + 6 * s; xx < x + bw - 6 * s; xx += 11 * s) {
          if (rng() < 0.32) g.fillRect(xx, yy, 4 * s, 6 * s);
        }
      }
    }
    x += bw + rng() * 18 * s;
  }
}

function ruins(g, w, base, s, color, rng) {
  let x = 40 * s;
  while (x < w) {
    const kind = rng();
    g.fillStyle = color;
    if (kind < 0.4) {
      // arch
      const aw = 90 * s;
      const ah = 140 * s;
      g.fillRect(x, base - ah, 18 * s, ah);
      g.fillRect(x + aw - 18 * s, base - ah, 18 * s, ah);
      g.beginPath();
      g.moveTo(x, base - ah);
      g.arc(x + aw / 2, base - ah, aw / 2, Math.PI, 0);
      g.lineTo(x + aw - 18 * s, base - ah);
      g.arc(x + aw / 2, base - ah, aw / 2 - 18 * s, 0, Math.PI, true);
      g.closePath();
      g.fill();
      x += aw + 50 * s;
    } else if (kind < 0.7) {
      // broken columns
      for (let i = 0; i < 3; i++) {
        const ch = (60 + rng() * 110) * s;
        g.fillRect(x + i * 34 * s, base - ch, 16 * s, ch);
        g.fillRect(x + i * 34 * s - 4 * s, base - ch, 24 * s, 6 * s);
      }
      x += 130 * s;
    } else {
      // dome palace
      const dw = 120 * s;
      g.fillRect(x, base - 90 * s, dw, 90 * s);
      g.beginPath();
      g.ellipse(x + dw / 2, base - 90 * s, dw * 0.38, 60 * s, 0, Math.PI, 0);
      g.fill();
      g.fillRect(x + dw / 2 - 2 * s, base - 170 * s, 4 * s, 24 * s);
      g.fillRect(x - 16 * s, base - 150 * s, 14 * s, 150 * s);
      g.fillRect(x + dw + 2 * s, base - 150 * s, 14 * s, 150 * s);
      x += dw + 70 * s;
    }
  }
}

function fortress(g, w, base, s, color, glow, rng) {
  g.fillStyle = color;
  let x = 0;
  while (x < w) {
    const tw = 50 * s;
    const th = (150 + rng() * 80) * s;
    g.fillRect(x, base - th, tw, th);
    // crenellations
    for (let i = 0; i < 4; i++) g.fillRect(x + i * 14 * s, base - th - 10 * s, 8 * s, 10 * s);
    // spire roof
    g.beginPath();
    g.moveTo(x - 6 * s, base - th - 10 * s);
    g.lineTo(x + tw / 2, base - th - 60 * s);
    g.lineTo(x + tw + 6 * s, base - th - 10 * s);
    g.fill();
    if (glow) {
      g.fillStyle = glow;
      g.fillRect(x + tw / 2 - 3 * s, base - th + 30 * s, 6 * s, 12 * s);
      g.fillStyle = color;
    }
    const ww = (120 + rng() * 80) * s;
    g.fillRect(x + tw, base - 100 * s, ww, 100 * s);
    for (let i = 0; i < ww / (16 * s); i++) g.fillRect(x + tw + i * 16 * s, base - 110 * s, 9 * s, 10 * s);
    x += tw + ww;
  }
}

// ------------------------------------------------------------------ layer painters
// each returns a list of { p (parallax), paint(g, w, h, s, base, P, rng) }
const LAYERS = {
  temple: [
    { p: 0.08, paint: (g, w, h, s, base, P, rng) => ridge(g, w, base - 150 * s, 120 * s, P.far, rng, { jag: 0.35, step: 30 * s, peaks: true }) },
    { p: 0.2, paint: (g, w, h, s, base, P, rng) => {
      ridge(g, w, base - 60 * s, 70 * s, mix(P.far, P.mid, 0.5), rng, { jag: 0.4, step: 24 * s });
      for (let x = 200 * s; x < w; x += (380 + rng() * 260) * s) pagoda(g, x, base - 40 * s, 0.9 * s, mix(P.far, P.mid, 0.55), P.lanterns ? P.glow : null);
    } },
    { p: 0.45, paint: (g, w, h, s, base, P, rng) => {
      g.fillStyle = P.mid;
      g.fillRect(0, base - 26 * s, w, h);
      for (let x = 120 * s; x < w; x += (520 + rng() * 300) * s) {
        if (rng() < 0.5) torii(g, x, base - 20 * s, 1.1 * s, P.mid);
        else pagoda(g, x, base - 20 * s, 1.3 * s, P.mid, P.lanterns ? P.glow : null);
      }
      // stone wall with lanterns
      for (let x = 0; x < w; x += 46 * s) g.fillRect(x, base - 46 * s, 30 * s, 26 * s);
    } },
  ],
  forest: [
    { p: 0.08, paint: (g, w, h, s, base, P, rng) => smoothHills(g, w, base - 120 * s, 130 * s, P.far, rng, 0.003 / s) },
    { p: 0.22, paint: (g, w, h, s, base, P, rng) => {
      const c = mix(P.far, P.mid, 0.5);
      for (let x = 0; x < w; x += (30 + rng() * 40) * s) cedar(g, x, base, 0.6 * s, c, rng());
      g.fillStyle = c;
      g.fillRect(0, base - 30 * s, w, h);
    } },
    { p: 0.48, paint: (g, w, h, s, base, P, rng) => {
      for (let x = 0; x < w; x += (90 + rng() * 120) * s) cedar(g, x, base, 1.2 * s, P.mid, rng());
      g.fillStyle = P.mid;
      g.fillRect(0, base - 14 * s, w, h);
      // hanging moss
      g.strokeStyle = P.mid;
      g.lineWidth = 2 * s;
      for (let x = 0; x < w; x += (40 + rng() * 60) * s) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (rng() - 0.5) * 10 * s, (40 + rng() * 120) * s);
        g.stroke();
      }
    } },
  ],
  rooftops: [
    { p: 0.06, paint: (g, w, h, s, base, P, rng) => skyline(g, w, base - 40 * s, 0.7 * s, P.far, P.windows ? fade(P.windows, 0.4) : null, rng, 1.3) },
    { p: 0.2, paint: (g, w, h, s, base, P, rng) => {
      skyline(g, w, base + 10 * s, 1 * s, mix(P.far, P.mid, 0.6), P.windows ? fade(P.windows, 0.75) : null, rng, 1);
      if (P.neon) {
        for (let x = 100 * s; x < w; x += (260 + rng() * 300) * s) {
          g.fillStyle = rng() < 0.5 ? P.glow : P.rim;
          g.globalAlpha = 0.85;
          g.fillRect(x, base - (120 + rng() * 80) * s, 10 * s, (40 + rng() * 40) * s);
          g.globalAlpha = 1;
        }
      }
    } },
    { p: 0.5, paint: (g, w, h, s, base, P, rng) => {
      // nearby roofs + lantern strings
      for (let x = -40 * s; x < w; x += (300 + rng() * 200) * s) {
        const rw = (220 + rng() * 120) * s;
        const top = base - (40 + rng() * 60) * s;
        g.fillStyle = P.mid;
        g.fillRect(x + 20 * s, top, rw - 40 * s, base - top + 40 * s);
        g.beginPath();
        g.moveTo(x - 10 * s, top + 8 * s);
        g.quadraticCurveTo(x + rw / 2, top - 46 * s, x + rw + 10 * s, top + 8 * s);
        g.lineTo(x + rw - 10 * s, top + 16 * s);
        g.lineTo(x + 10 * s, top + 16 * s);
        g.fill();
      }
      g.strokeStyle = P.mid;
      g.lineWidth = 1.5 * s;
      for (let x = 0; x < w; x += 420 * s) {
        g.beginPath();
        g.moveTo(x, base - 190 * s);
        g.quadraticCurveTo(x + 210 * s, base - 120 * s, x + 420 * s, base - 190 * s);
        g.stroke();
        for (let i = 1; i < 7; i++) {
          const t = i / 7;
          const lx = x + 420 * s * t;
          const ly = base - 190 * s + 4 * t * (1 - t) * 70 * s;
          g.fillStyle = P.glow;
          g.beginPath();
          g.ellipse(lx, ly + 8 * s, 5 * s, 7 * s, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    } },
  ],
  desert: [
    { p: 0.06, paint: (g, w, h, s, base, P, rng) => smoothHills(g, w, base - 90 * s, 110 * s, P.far, rng, 0.002 / s) },
    { p: 0.2, paint: (g, w, h, s, base, P, rng) => {
      ruins(g, w, base - 10 * s, 0.9 * s, mix(P.far, P.mid, 0.5), rng);
      smoothHills(g, w, base + 20 * s, 50 * s, mix(P.far, P.mid, 0.4), rng, 0.004 / s);
    } },
    { p: 0.45, paint: (g, w, h, s, base, P, rng) => {
      for (let x = 60 * s; x < w; x += (340 + rng() * 260) * s) palm(g, x, base - 6 * s, 1.1 * s, P.mid, rng);
      smoothHills(g, w, base + 30 * s, 50 * s, P.mid, rng, 0.006 / s);
    } },
  ],
  snow: [
    { p: 0.05, paint: (g, w, h, s, base, P, rng) => {
      ridge(g, w, base - 140 * s, 200 * s, P.far, rng, { jag: 0.6, step: 60 * s });
    } },
    { p: 0.18, paint: (g, w, h, s, base, P, rng) => {
      fortress(g, w, base - 30 * s, 0.8 * s, mix(P.far, P.mid, 0.55), P.eclipse ? P.glow : P.stars ? "#ffd27a" : null, rng);
      smoothHills(g, w, base + 10 * s, 60 * s, mix(P.far, P.mid, 0.4), rng, 0.004 / s);
    } },
    { p: 0.45, paint: (g, w, h, s, base, P, rng) => {
      for (let x = 0; x < w; x += (60 + rng() * 90) * s) pine(g, x, base - 4 * s, (0.9 + rng() * 0.5) * s, P.mid, P.snowGround && !P.eclipse ? fade("#ffffff", 0.7) : null);
      g.fillStyle = P.mid;
      g.fillRect(0, base - 6 * s, w, h);
    } },
  ],
};

const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export function fade(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------------------------------------------------------ arena object
export function createArena(id, variant, seed = 7) {
  const P = arenaPalette(id, variant);
  return { id, variant, P, seed, cache: null, cacheKey: "", parts: makeAmbient(P, seed), t: 0 };
}

function buildCache(A, v) {
  const key = `${v.W}x${v.H}@${v.dpr}`;
  if (A.cacheKey === key && A.cache) return A.cache;
  const { P } = A;
  const dpr = v.dpr;
  const W = Math.round(v.W * dpr);
  const H = Math.round(v.H * dpr);
  const s = v.s0 * dpr;
  const base = v.groundY * dpr;
  const mk = (w, h) => {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    return c;
  };
  // sky
  const sky = mk(W, H);
  {
    const g = sky.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, base);
    gr.addColorStop(0, P.sky[0]);
    gr.addColorStop(0.6, P.sky[1]);
    gr.addColorStop(1, P.sky[2]);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const rng = makeRng(A.seed * 13);
    if (P.stars) {
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.7})`;
        const r = rng() * 1.4 * dpr + 0.3;
        g.fillRect(rng() * W, rng() * base * 0.75, r, r);
      }
    }
    if (P.aurora) {
      for (let i = 0; i < 3; i++) {
        const y0 = base * (0.15 + i * 0.09);
        const gg = g.createLinearGradient(0, y0 - 60 * dpr, 0, y0 + 60 * dpr);
        gg.addColorStop(0, "rgba(90,255,190,0)");
        gg.addColorStop(0.5, `rgba(${i === 1 ? "160,120,255" : "90,255,190"},0.22)`);
        gg.addColorStop(1, "rgba(90,255,190,0)");
        g.fillStyle = gg;
        g.beginPath();
        g.moveTo(0, y0);
        for (let x = 0; x <= W; x += 20) g.lineTo(x, y0 + Math.sin(x * 0.004 + i) * 40 * dpr);
        g.lineTo(W, y0 + 80 * dpr);
        g.lineTo(0, y0 + 80 * dpr);
        g.fill();
      }
    }
    // sun / moon
    const ox = W * 0.68;
    const oy = H * P.orbY;
    const or = H * P.orbR;
    const halo = g.createRadialGradient(ox, oy, or * 0.5, ox, oy, or * 4.5);
    halo.addColorStop(0, fade(P.orb, 0.55));
    halo.addColorStop(1, fade(P.orb, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    g.fillStyle = P.orb;
    g.beginPath();
    g.arc(ox, oy, or, 0, Math.PI * 2);
    g.fill();
    if (P.eclipse) {
      g.fillStyle = "#05040a";
      g.beginPath();
      g.arc(ox + or * 0.08, oy - or * 0.04, or * 0.92, 0, Math.PI * 2);
      g.fill();
    }
    // horizon haze (baked: it never moves relative to the screen)
    const hz = g.createLinearGradient(0, base - 80 * s, 0, base);
    hz.addColorStop(0, fade(P.sky[2], 0));
    hz.addColorStop(1, fade(P.sky[2], 0.35));
    g.fillStyle = hz;
    g.fillRect(0, base - 80 * s, W, 80 * s);
    if (P.rays) {
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const x = W * (0.1 + i * 0.14 + rng() * 0.05);
        const gg = g.createLinearGradient(x, 0, x - 120 * dpr, base);
        gg.addColorStop(0, fade(P.orb, 0.18));
        gg.addColorStop(1, fade(P.orb, 0));
        g.fillStyle = gg;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 40 * dpr, 0);
        g.lineTo(x - 100 * dpr, base);
        g.lineTo(x - 200 * dpr, base);
        g.fill();
      }
      g.restore();
    }
  }
  const layers = LAYERS[A.id].map((L, i) => {
    const span = (CAM_MAX - CAM_MIN) * L.p * s;
    const w = Math.ceil(W + span + 4);
    const c = mk(w, H);
    const g = c.getContext("2d");
    const rng = makeRng(A.seed * 31 + i * 101);
    L.paint(g, w, H, s, base, P, rng);
    // atmospheric fog over the farther layers
    if (i < LAYERS[A.id].length - 1) {
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = P.fog;
      g.fillRect(0, 0, w, H);
      g.globalCompositeOperation = "source-over";
    }
    return { c, p: L.p };
  });
  A.cache = { sky, layers, s, dpr };
  A.cacheKey = key;
  return A.cache;
}

/** Background (sky + parallax layers). */
export function drawArenaBack(ctx, A, v) {
  const C = buildCache(A, v);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(C.sky, 0, 0);
  const sh = v.shakeX * v.dpr * 0.4;
  for (const L of C.layers) {
    const off = Math.max(0, (v.cx - CAM_MIN - v.W / 2 / v.s0) * L.p * C.s);
    ctx.drawImage(L.c, Math.round(-off + sh), Math.round(v.shakeY * v.dpr * 0.3));
  }
}

/** Floor + edge props (world space, zoomed). Call with the world transform reset. */
export function drawArenaFloor(ctx, A, v) {
  const { P } = A;
  const dpr = v.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gy = sy(v, 0);
  const gr = ctx.createLinearGradient(0, gy, 0, v.H);
  gr.addColorStop(0, P.ground[0]);
  gr.addColorStop(1, P.ground[1]);
  ctx.fillStyle = gr;
  ctx.fillRect(-10, gy, v.W + 20, v.H - gy + 10);
  // floor rim light
  ctx.fillStyle = fade(P.rim, 0.35);
  ctx.fillRect(-10, gy, v.W + 20, Math.max(1, 1.5 * v.s));
  // perspective lines / tiles
  const s = v.s;
  ctx.strokeStyle = fade(P.snowGround ? "#5a7090" : "#000000", P.snowGround ? 0.18 : 0.28);
  ctx.lineWidth = 1;
  const kind = A.id;
  if (kind === "temple" || kind === "rooftops") {
    const step = kind === "temple" ? 70 : 34;
    for (let x = Math.floor((v.cx - v.W / s) / step) * step; x < v.cx + v.W / s; x += step) {
      const x0 = sx(v, x);
      const x1 = v.W / 2 + (x0 - v.W / 2) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x1, v.H);
      ctx.stroke();
    }
    for (let i = 1; i < 5; i++) {
      const y = gy + (v.H - gy) * (i * i) / 25;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(v.W, y);
      ctx.stroke();
    }
  } else {
    // ripples / drifts
    const rng = makeRng(A.seed + 5);
    for (let i = 0; i < 26; i++) {
      const wx = CAM_MIN + rng() * (CAM_MAX - CAM_MIN);
      const yy = gy + (v.H - gy) * (0.1 + rng() * 0.85);
      const len = (40 + rng() * 120) * s;
      const x0 = sx(v, wx);
      ctx.beginPath();
      ctx.moveTo(x0 - len / 2, yy);
      ctx.quadraticCurveTo(x0, yy - 4 * s, x0 + len / 2, yy);
      ctx.stroke();
    }
  }
  // arena bounds: pillars / posts at the walls
  const post = P.near;
  for (const side of [-1, 1]) {
    const wx = side * (ARENA_W / 2 + 6);
    const x = sx(v, wx);
    ctx.fillStyle = post;
    if (kind === "temple") {
      ctx.fillRect(x - 14 * s, sy(v, 300), 28 * s, 300 * s + (v.H - gy));
      ctx.fillRect(x - 20 * s, sy(v, 300), 40 * s, 10 * s);
      ctx.fillStyle = P.glow;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(x - side * 26 * s, sy(v, 150), 9 * s, 13 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (kind === "forest") {
      ctx.beginPath();
      ctx.moveTo(x - 30 * s, v.H);
      ctx.lineTo(x - 18 * s, 0);
      ctx.lineTo(x + 18 * s, 0);
      ctx.lineTo(x + 34 * s, v.H);
      ctx.fill();
    } else if (kind === "rooftops") {
      ctx.fillRect(x - 6 * s, sy(v, 140), 12 * s, 140 * s);
      ctx.fillStyle = P.glow;
      ctx.fillRect(x - 3 * s, sy(v, 150), 6 * s, 10 * s);
    } else if (kind === "desert") {
      ctx.fillRect(x - 16 * s, sy(v, 210), 32 * s, 210 * s);
      ctx.fillRect(x - 22 * s, sy(v, 210), 44 * s, 8 * s);
    } else {
      ctx.fillRect(x - 10 * s, sy(v, 120), 20 * s, 120 * s);
      ctx.fillStyle = P.eclipse ? P.glow : "#ffd27a";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, sy(v, 126), 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ ambient particles (screen space, 0..1)
function makeAmbient(P, seed) {
  const rng = makeRng(seed * 977);
  const n = P.particle === "rain" ? 70 : P.particle === "snow" || P.particle === "sand" ? 60 : 34;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push({ x: rng(), y: rng(), z: 0.4 + rng() * 0.8, ph: rng() * 6.28, s: 0.5 + rng() });
  return parts;
}

export function drawAmbient(ctx, A, v, dt, effects = true) {
  if (!effects) return;
  const { P } = A;
  A.t += dt;
  const dpr = v.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = v.W;
  const H = v.H;
  const kind = P.particle;
  ctx.fillStyle = P.pc;
  ctx.strokeStyle = P.pc;
  for (const p of A.parts) {
    let vx = 0;
    let vy = 0;
    switch (kind) {
      case "petal":
      case "leaf":
        vx = 0.03 * p.z;
        vy = 0.04 * p.z;
        break;
      case "snow":
        vx = 0.012 * Math.sin(A.t + p.ph);
        vy = 0.06 * p.z;
        break;
      case "ash":
        vx = 0.01;
        vy = 0.025 * p.z;
        break;
      case "rain":
        vx = -0.15;
        vy = 1.3 * p.z;
        break;
      case "sand":
        vx = 0.22 * p.z;
        vy = 0.01 * Math.sin(A.t * 2 + p.ph);
        break;
      case "ember":
      case "spark":
        vx = 0.01 * Math.sin(A.t + p.ph);
        vy = -0.05 * p.z;
        break;
      default: // firefly / spore / dust
        vx = 0.01 * Math.sin(A.t * 0.7 + p.ph);
        vy = 0.008 * Math.cos(A.t * 0.9 + p.ph);
    }
    p.x = (p.x + vx * dt + 1) % 1;
    p.y = (p.y + vy * dt + 1) % 1;
    // slight parallax with the camera
    const px = ((p.x - v.cx * 0.0004 * p.z) % 1 + 1) % 1;
    const x = px * W;
    const y = p.y * H;
    const sz = p.s * p.z * v.s0;
    ctx.globalAlpha = kind === "firefly" || kind === "spore" ? 0.4 + 0.6 * Math.abs(Math.sin(A.t * 2 + p.ph)) : 0.75;
    if (kind === "rain") {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3 * sz, y + 16 * sz);
      ctx.stroke();
    } else if (kind === "petal" || kind === "leaf") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(A.t * 1.5 + p.ph);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 * sz, 2 * sz, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (kind === "sand") {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, y, 6 * sz, 1.2 * sz);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, (kind === "snow" ? 1.8 : 1.4) * sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export const ARENA_NAMES = { temple: "Temple", forest: "Forest", rooftops: "Rooftops", desert: "Desert", snow: "Snow Peaks" };
