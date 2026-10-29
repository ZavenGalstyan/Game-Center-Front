/**
 * Procedural textures generated at load — no image files. Each surface is a
 * height function → albedo + a normal map (wrap-around Sobel), so stone
 * blocks, slates and planks catch the light. Periodic noise helpers are
 * shared with Crown of Ashes' generator.
 *
 *   surface(kind) → { map, normalMap }   castle · flag · hallFloor · wood ·
 *                   darkWood · slate · grass · path · forest · bark · plaster ·
 *                   hidden · arena · carpet · sand
 *   bookTex() · bannerTex(house) · glassTex(kind) · glowTex() · runeTex(sym)
 */
import * as THREE from "three";

const cache = {};

/* ------------------------------------------------------------ periodic noise */
function hash(ix, iy, s) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pn(x, y, P, s = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % P) + P) % P;
  const a = hash(m(ix), m(iy), s);
  const b = hash(m(ix + 1), m(iy), s);
  const c = hash(m(ix), m(iy + 1), s);
  const d = hash(m(ix + 1), m(iy + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function pf(u, v, f, oct = 4, s = 0) {
  let sum = 0;
  let amp = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    sum += pn(u * f, v * f, f, s + i * 13) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / n;
}
function cells(u, v, f, s = 0) {
  const x = u * f;
  const y = v * f;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const mx = ((cx % f) + f) % f;
      const my = ((cy % f) + f) % f;
      const px = cx + hash(mx, my, s);
      const py = cy + hash(mx, my, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(mx, my, s + 3);
      } else if (d < d2) d2 = d;
    }
  return { d1, d2, edge: d2 - d1, id };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function raster(size, fn, strength = 2.5) {
  const col = new Uint8Array(size * size * 4);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = fn(x / size, y / size);
      const k = y * size + x;
      col[k * 4] = clamp01(o[0]) * 255;
      col[k * 4 + 1] = clamp01(o[1]) * 255;
      col[k * 4 + 2] = clamp01(o[2]) * 255;
      col[k * 4 + 3] = 255;
      hgt[k] = o[3];
    }
  const nor = new Uint8Array(size * size * 4);
  const H = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      nor[k] = (-dx / l) * 127 + 128;
      nor[k + 1] = (dy / l) * 127 + 128;
      nor[k + 2] = (1 / l) * 127 + 128;
      nor[k + 3] = 255;
    }
  return { col, nor };
}
function tex2d(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------ surfaces */
/** Ashlar courses: rows of blocks with staggered joints. Tile = 4 rows. */
function ashlar(u, v, rows, cols, seed, light, dark, mortar = [0.36, 0.34, 0.31]) {
  const r = Math.floor(v * rows);
  const off = (r % 2) * 0.5 + hash(r, 3, seed) * 0.3;
  const uu = u * cols + off;
  const c = Math.floor(uu);
  const fu = uu - c;
  const fv = v * rows - r;
  const id = hash(((c % cols) + cols) % cols, r, seed);
  const edge = Math.min(fu, 1 - fu) / cols * rows * 0.5 + 0;
  const ev = Math.min(fv, 1 - fv);
  const e = Math.min(edge * 1.0, ev);
  const joint = 1 - sstep(0.02, 0.07, e);
  const n = pf(u, v, 8, 4, seed + 5);
  const chip = pf(u, v, 32, 2, seed + 9);
  let col = mixc(dark, light, id * 0.7 + n * 0.3);
  col = mixc(col, [col[0] * 0.8, col[1] * 0.82, col[2] * 0.8], sstep(0.6, 0.8, chip) * 0.5);
  // weathering streaks toward the bottom of each block
  col = mixc(col, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.83], fv * 0.25);
  col = mixc(col, mortar, joint);
  const h = (1 - joint) * (0.7 + n * 0.3) - sstep(0.75, 0.9, chip) * 0.2 + (1 - Math.min(1, e * 8)) * -0.1;
  return [col[0], col[1], col[2], h];
}
const SURF = {
  castle: (u, v) => ashlar(u, v, 6, 3, 11, [0.74, 0.69, 0.6], [0.52, 0.48, 0.42]),
  hidden: (u, v) => {
    const o = ashlar(u, v, 6, 3, 23, [0.42, 0.42, 0.44], [0.24, 0.24, 0.27], [0.15, 0.15, 0.16]);
    const moss = pf(u, v, 5, 3, 29);
    const c = mixc(o, [0.22, 0.3, 0.2], sstep(0.62, 0.8, moss) * 0.5);
    return [c[0], c[1], c[2], o[3]];
  },
  plaster: (u, v) => {
    const n = pf(u, v, 6, 5, 41);
    const c = mixc([0.62, 0.56, 0.48], [0.76, 0.7, 0.6], n);
    return [c[0], c[1], c[2], n * 0.3];
  },
  flag: (u, v) => {
    const c = cells(u, v, 5, 51);
    const n = pf(u, v, 10, 4, 52);
    const joint = 1 - sstep(0.03, 0.09, c.edge);
    let col = mixc([0.42, 0.4, 0.37], [0.62, 0.58, 0.52], c.id * 0.6 + n * 0.4);
    col = mixc(col, [0.2, 0.19, 0.18], joint);
    return [col[0], col[1], col[2], (1 - joint) * (0.6 + n * 0.4)];
  },
  hallFloor: (u, v) => {
    // big square slabs, alternately tinted, polished
    const N = 4;
    const iu = Math.floor(u * N);
    const iv = Math.floor(v * N);
    const fu = u * N - iu;
    const fv = v * N - iv;
    const e = Math.min(fu, 1 - fu, fv, 1 - fv);
    const joint = 1 - sstep(0.01, 0.035, e);
    const n = pf(u, v, 12, 4, 61);
    const vein = Math.abs(Math.sin((u * 7 + pf(u, v, 4, 3, 62) * 3) * Math.PI));
    const odd = (iu + iv) % 2;
    let col = odd ? [0.5, 0.45, 0.4] : [0.38, 0.34, 0.31];
    col = mixc(col, [col[0] * 1.2, col[1] * 1.18, col[2] * 1.15], n * 0.5);
    col = mixc(col, [0.66, 0.6, 0.52], sstep(0.92, 1, vein) * 0.35);
    col = mixc(col, [0.14, 0.12, 0.1], joint);
    return [col[0], col[1], col[2], (1 - joint) * 0.8];
  },
  wood: (u, v) => {
    const plank = Math.floor(v * 4);
    const fv = v * 4 - plank;
    const grain = pf(u * 0.6 + plank * 0.37, v * 8, 6, 4, 71 + plank);
    const ring = Math.sin((u * 30 + grain * 6 + plank * 3) * Math.PI) * 0.5 + 0.5;
    const joint = 1 - sstep(0.02, 0.08, Math.min(fv, 1 - fv));
    let col = mixc([0.3, 0.18, 0.09], [0.48, 0.3, 0.16], grain * 0.6 + ring * 0.25 + hash(plank, 1, 7) * 0.2);
    col = mixc(col, [0.12, 0.07, 0.04], joint);
    return [col[0], col[1], col[2], (1 - joint) * (0.7 + ring * 0.1)];
  },
  darkWood: (u, v) => {
    const g = pf(u, v * 6, 6, 5, 81);
    const ring = Math.sin((u * 24 + g * 5) * Math.PI) * 0.5 + 0.5;
    const col = mixc([0.14, 0.08, 0.05], [0.28, 0.16, 0.09], g * 0.7 + ring * 0.3);
    return [col[0], col[1], col[2], ring * 0.3 + g * 0.3];
  },
  slate: (u, v) => {
    const rows = 10;
    const r = Math.floor(v * rows);
    const off = (r % 2) * 0.5;
    const uu = u * 8 + off;
    const c = Math.floor(uu);
    const fu = uu - c;
    const fv = v * rows - r;
    const id = hash(((c % 8) + 8) % 8, r, 91);
    const n = pf(u, v, 12, 3, 92);
    const joint = 1 - sstep(0.03, 0.1, Math.min(fu, 1 - fu)) * sstep(0.0, 0.12, 1 - fv);
    let col = mixc([0.17, 0.19, 0.24], [0.3, 0.33, 0.4], id * 0.6 + n * 0.4);
    col = mixc(col, [0.08, 0.09, 0.11], joint * 0.8);
    return [col[0], col[1], col[2], fv * 0.6 + (1 - joint) * 0.3];
  },
  grass: (u, v) => {
    const n = pf(u, v, 6, 5, 101);
    const b = pf(u, v, 48, 2, 102);
    const patch = pf(u, v, 3, 3, 103);
    let c = mixc([0.2, 0.32, 0.11], [0.34, 0.46, 0.16], n);
    c = mixc(c, [0.42, 0.44, 0.2], sstep(0.55, 0.75, patch) * 0.5);
    const s = 0.82 + b * 0.36;
    return [c[0] * s, c[1] * s, c[2] * s, n * 0.4 + b * 0.6];
  },
  path: (u, v) => {
    const n = pf(u, v, 6, 5, 111);
    const p = cells(u, v, 22, 112);
    const peb = p.d1 < 0.25 ? 1 - p.d1 / 0.25 : 0;
    let c = mixc([0.4, 0.33, 0.24], [0.56, 0.47, 0.35], n);
    c = mixc(c, [0.62, 0.6, 0.55], peb * 0.6 * (p.id > 0.45 ? 1 : 0));
    return [c[0], c[1], c[2], n * 0.35 + peb * 0.5 * (p.id > 0.45 ? 1 : 0)];
  },
  forest: (u, v) => {
    const n = pf(u, v, 6, 5, 121);
    const leaf = cells(u, v, 36, 122);
    const moss = pf(u, v, 4, 3, 123);
    let c = mixc([0.13, 0.11, 0.07], [0.24, 0.19, 0.11], n);
    c = mixc(c, [0.14, 0.22, 0.1], sstep(0.5, 0.75, moss) * 0.7);
    const lf = leaf.d1 < 0.25 ? 0.05 * (0.5 + leaf.id) : 0;
    return [c[0] + lf * 1.4, c[1] + lf * 0.6, c[2], n * 0.5 + (leaf.d1 < 0.3 ? 0.3 : 0)];
  },
  bark: (u, v) => {
    const n = pf(u * 3, v, 4, 5, 131);
    const ridge = Math.abs(Math.sin((u * 10 + pf(u, v, 4, 3, 132) * 2) * Math.PI));
    const c = mixc([0.12, 0.09, 0.07], [0.32, 0.25, 0.19], ridge * 0.6 + n * 0.4);
    return [c[0], c[1], c[2], ridge * 0.7 + n * 0.3];
  },
  arena: (u, v) => {
    const c = cells(u, v, 4, 141);
    const n = pf(u, v, 8, 5, 142);
    const crack = pf(u, v, 20, 3, 143);
    const joint = 1 - sstep(0.02, 0.07, c.edge);
    let col = mixc([0.24, 0.24, 0.27], [0.4, 0.39, 0.42], c.id * 0.5 + n * 0.5);
    col = mixc(col, [0.08, 0.08, 0.09], joint);
    col = mixc(col, [0.1, 0.1, 0.11], sstep(0.72, 0.76, crack) * 0.8);
    return [col[0], col[1], col[2], (1 - joint) * 0.8 - sstep(0.72, 0.76, crack) * 0.3];
  },
  carpet: (u, v) => {
    const n = pf(u, v, 16, 3, 151);
    const border = Math.min(u, 1 - u);
    let c = mixc([0.42, 0.06, 0.07], [0.55, 0.1, 0.1], n);
    if (border < 0.08) c = [0.72, 0.56, 0.22];
    else if (border < 0.11) c = [0.3, 0.04, 0.05];
    const diamond = Math.abs(((v * 8) % 1) - 0.5) + Math.abs(u - 0.5);
    if (diamond < 0.12) c = mixc(c, [0.75, 0.58, 0.24], 0.8);
    return [c[0], c[1], c[2], n * 0.3];
  },
};

export function surface(kind, size = 256) {
  if (cache[kind]) return cache[kind];
  const r = raster(size, SURF[kind], kind === "castle" || kind === "hidden" || kind === "flag" || kind === "arena" ? 3.4 : 2.2);
  cache[kind] = { map: tex2d(r.col, size, true), normalMap: tex2d(r.nor, size, false) };
  return cache[kind];
}

/* ------------------------------------------------------------ canvas sprites */
const cv = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
export function glowTex() {
  if (cache.glow) return cache.glow;
  const c = cv(64, 64);
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}
/** Book spines for shelves: rows of coloured spines with gilt bands. */
export function bookTex() {
  if (cache.books) return cache.books;
  const W = 512;
  const H = 512;
  const c = cv(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#2a170c";
  g.fillRect(0, 0, W, H);
  const cols = ["#6a1a18", "#1d3a5e", "#2c4a24", "#5a3a1a", "#3a2050", "#7a5a20", "#1e1e22", "#6e2a14", "#2a4a4a", "#5e1e3a"];
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const shelfH = H / 4;
  for (let row = 0; row < 4; row++) {
    const y1 = (row + 1) * shelfH - 10;
    let x = 4;
    while (x < W - 6) {
      const w = 10 + r() * 16;
      const h = shelfH * (0.62 + r() * 0.3);
      const col = cols[Math.floor(r() * cols.length)];
      g.fillStyle = col;
      const lean = r() < 0.06 ? 4 : 0;
      g.save();
      g.translate(x, y1);
      g.transform(1, 0, lean / h, 1, 0, 0);
      g.fillRect(0, -h, w, h);
      // spine shading
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "rgba(0,0,0,0.35)");
      gr.addColorStop(0.4, "rgba(255,255,255,0.08)");
      gr.addColorStop(1, "rgba(0,0,0,0.4)");
      g.fillStyle = gr;
      g.fillRect(0, -h, w, h);
      // gilt bands + title block
      g.fillStyle = "rgba(220,180,90,0.85)";
      g.fillRect(1, -h + 6, w - 2, 2);
      g.fillRect(1, -10, w - 2, 2);
      if (r() < 0.6) g.fillRect(w * 0.25, -h * 0.6, w * 0.5, h * 0.18);
      g.restore();
      x += w + 1 + (r() < 0.08 ? 8 : 0);
    }
    // shelf plank
    g.fillStyle = "#3a2212";
    g.fillRect(0, y1, W, 10);
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(0, y1 + 8, W, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.books = t;
  return t;
}
/** House banners — colours and simple original emblems (not official crests). */
export const HOUSE = {
  gryffindor: { bg: "#7a1418", fg: "#d8a62a", emblem: "sun" },
  slytherin: { bg: "#13462a", fg: "#c0c6cc", emblem: "wave" },
  ravenclaw: { bg: "#1a2e6a", fg: "#b88a4a", emblem: "star" },
  hufflepuff: { bg: "#c09a18", fg: "#1c1c1c", emblem: "leaf" },
  hogwarts: { bg: "#3a2a5a", fg: "#d8b25a", emblem: "key" },
};
export function bannerTex(house) {
  const key = `banner:${house}`;
  if (cache[key]) return cache[key];
  const H = HOUSE[house];
  const c = cv(128, 320);
  const g = c.getContext("2d");
  g.fillStyle = H.bg;
  g.fillRect(0, 0, 128, 320);
  // woven texture
  for (let y = 0; y < 320; y += 3) {
    g.fillStyle = `rgba(0,0,0,${0.05 + (y % 6 ? 0 : 0.04)})`;
    g.fillRect(0, y, 128, 1);
  }
  // border + swallowtail
  g.strokeStyle = H.fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 112, 270);
  g.fillStyle = H.fg;
  g.save();
  g.translate(64, 130);
  g.beginPath();
  switch (H.emblem) {
    case "sun":
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
        g.lineTo(Math.cos(a + 0.13) * 40, Math.sin(a + 0.13) * 40);
        g.lineTo(Math.cos(a + 0.26) * 22, Math.sin(a + 0.26) * 22);
      }
      g.fill();
      g.beginPath();
      g.arc(0, 0, 20, 0, Math.PI * 2);
      break;
    case "wave":
      g.lineWidth = 9;
      g.strokeStyle = H.fg;
      g.moveTo(-34, -30);
      g.bezierCurveTo(30, -40, -30, 0, 30, 0);
      g.bezierCurveTo(-30, 10, 34, 30, -20, 40);
      g.stroke();
      g.beginPath();
      g.arc(-34, -30, 8, 0, Math.PI * 2);
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 16 : 40;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case "leaf":
      g.moveTo(0, -42);
      g.quadraticCurveTo(36, -6, 0, 40);
      g.quadraticCurveTo(-36, -6, 0, -42);
      break;
    case "key":
      g.arc(0, -22, 14, 0, Math.PI * 2);
      g.rect(-4, -10, 8, 50);
      g.rect(4, 26, 12, 6);
      g.rect(4, 36, 9, 5);
      break;
  }
  g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache[key] = t;
  return t;
}
/** Leaded stained-glass window (emissive). */
export function glassTex(kind = "warm") {
  const key = `glass:${kind}`;
  if (cache[key]) return cache[key];
  const W = 128;
  const H = 256;
  const c = cv(W, H);
  const g = c.getContext("2d");
  const pal = kind === "cold" ? ["#2a4a8a", "#3a6aa8", "#5a8ac8", "#1a2a5a", "#7a9ad8"] : kind === "dark" ? ["#1a3a2a", "#2a4a3a", "#3a2a4a", "#14141a", "#3a5a4a"] : ["#d8a040", "#c86a2a", "#e8c870", "#8a3a2a", "#3a5a8a", "#c8b878"];
  let s = kind.length * 31 + 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // gothic arch mask
  g.save();
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 64);
  g.quadraticCurveTo(0, 0, W / 2, 0);
  g.quadraticCurveTo(W, 0, W, 64);
  g.lineTo(W, H);
  g.closePath();
  g.clip();
  for (let y = 0; y < H; y += 22)
    for (let x = 0; x < W; x += 22) {
      g.fillStyle = pal[Math.floor(r() * pal.length)];
      g.beginPath();
      g.moveTo(x + r() * 4, y + r() * 4);
      g.lineTo(x + 22 + r() * 4, y + r() * 4);
      g.lineTo(x + 22 + r() * 4, y + 22 + r() * 4);
      g.lineTo(x + r() * 4, y + 22 + r() * 4);
      g.fill();
    }
  // central medallion
  g.fillStyle = kind === "cold" ? "#c8e0ff" : "#fff0c0";
  g.beginPath();
  g.arc(W / 2, 96, 24, 0, Math.PI * 2);
  g.fill();
  // leading
  g.strokeStyle = "#141010";
  g.lineWidth = 3;
  for (let y = 0; y < H; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y + (r() - 0.5) * 6);
    g.stroke();
  }
  for (let x = 0; x < W; x += 22) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (r() - 0.5) * 6, H);
    g.stroke();
  }
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W / 2, 96, 24, 0, Math.PI * 2);
  g.moveTo(W / 2, 0);
  g.lineTo(W / 2, H);
  g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache[key] = t;
  return t;
}
/** A glowing glyph (puzzle carvings, brazier runes, track marks). */
export function runeTex(sym) {
  const key = `rune:${sym}`;
  if (cache[key]) return cache[key];
  const c = cv(128, 128);
  const g = c.getContext("2d");
  g.strokeStyle = "#fff";
  g.fillStyle = "#fff";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.translate(64, 64);
  g.beginPath();
  switch (sym) {
    case "lion":
      // a maned head: circle with flame-like mane
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 26, Math.sin(a) * 26);
        g.lineTo(Math.cos(a + 0.2) * 46, Math.sin(a + 0.2) * 46);
      }
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 22, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(-8, -4, 3, 0, 7);
      g.arc(8, -4, 3, 0, 7);
      g.fill();
      return finish();
    case "serpent":
      g.moveTo(-40, 30);
      g.bezierCurveTo(-10, 50, 30, 20, 0, 0);
      g.bezierCurveTo(-30, -20, 10, -50, 40, -30);
      g.stroke();
      g.beginPath();
      g.arc(40, -30, 6, 0, 7);
      g.fill();
      return finish();
    case "eagle":
      g.moveTo(-46, -10);
      g.quadraticCurveTo(-20, -30, 0, -6);
      g.quadraticCurveTo(20, -30, 46, -10);
      g.moveTo(0, -6);
      g.lineTo(0, 34);
      g.moveTo(-14, 24);
      g.lineTo(0, 40);
      g.lineTo(14, 24);
      g.moveTo(0, -6);
      g.arc(0, -16, 9, Math.PI / 2, Math.PI * 2.5);
      g.stroke();
      return finish();
    case "badger":
      g.ellipse(0, 4, 30, 36, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(-12, -28);
      g.lineTo(-6, 36);
      g.moveTo(12, -28);
      g.lineTo(6, 36);
      g.stroke();
      return finish();
    case "track":
      for (const [x, y, a] of [[-18, 30, 0.2], [14, 6, -0.1], [-12, -18, 0.15], [18, -40, -0.1]]) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, 0, 7, 13, 0, 0, 7);
        g.fill();
        g.restore();
      }
      return finish();
    default: {
      // roman numerals I-IV
      const n = { I: 1, II: 2, III: 3, IV: 4 }[sym] || 1;
      g.font = "bold 64px serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(["I", "II", "III", "IV"][n - 1], 0, 4);
      return finish();
    }
  }
  function finish() {
    const t = new THREE.CanvasTexture(c);
    cache[key] = t;
    return t;
  }
}
export function disposeTextures() {
  for (const k of Object.keys(cache)) {
    const v = cache[k];
    if (v?.map) {
      v.map.dispose();
      v.normalMap.dispose();
    } else v?.dispose?.();
    delete cache[k];
  }
}
