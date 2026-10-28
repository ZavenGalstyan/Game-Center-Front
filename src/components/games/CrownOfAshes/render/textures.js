/**
 * Procedural, tileable PBR-ish textures generated at load (no image files).
 * Every surface is a height function → albedo + a normal map derived from
 * the height with wrap-around Sobel, so bricks, planks, thatch and rock all
 * catch the low sun.
 *
 *   groundArrays()  DataArrayTextures for the terrain splat shader
 *                   (0 grass · 1 forest floor · 2 dirt/road · 3 rock · 4 snow · 5 ash · 6 field)
 *   surface(kind)   {map, normalMap} for structures: stone, ruin, cobble,
 *                   plaster, timber, planks, thatch, shingle, slate, bark,
 *                   birch, cloth, crypt, metal, leaves, needles, log
 *   glowTex(), smokeTex(), flameTex(), sigilTex(kind)
 */
import * as THREE from "three";

const cache = {};

/* ------------------------------------------------------------ periodic noise */
function hash(ix, iy, s) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise, periodic with period P (integer) in both axes. */
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
/** fBm on [0,1)² tiles; base cells per tile = f. */
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
/** Worley-ish cell distance on a periodic grid (stones, cobbles). */
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

/**
 * Rasterise fn(u,v) → [r,g,b,height] (0..1) into albedo + normal pixel arrays.
 */
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
      col[k * 4 + 3] = o[4] != null ? clamp01(o[4]) * 255 : 255;
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

/* ------------------------------------------------------------ ground */
const GROUND = [
  // grass
  (u, v) => {
    const n = pf(u, v, 8, 5, 1);
    const b = pf(u, v, 64, 2, 2);
    const patch = pf(u, v, 3, 3, 3);
    const c = mixc([0.2, 0.33, 0.1], [0.36, 0.45, 0.16], n);
    const dry = mixc(c, [0.47, 0.45, 0.22], clamp01((patch - 0.55) * 3));
    const s = 0.8 + b * 0.4;
    return [dry[0] * s, dry[1] * s, dry[2] * s, n * 0.4 + b * 0.6];
  },
  // forest floor (needles, leaves, moss)
  (u, v) => {
    const n = pf(u, v, 6, 5, 11);
    const leaf = cells(u, v, 40, 12);
    const moss = pf(u, v, 4, 3, 13);
    let c = mixc([0.2, 0.15, 0.08], [0.32, 0.24, 0.12], n);
    c = mixc(c, [0.22, 0.3, 0.1], clamp01((moss - 0.5) * 2.5));
    const lf = leaf.d1 < 0.25 ? 0.05 * (0.5 + leaf.id) : 0;
    return [c[0] + lf * 1.3, c[1] + lf * 0.6, c[2], n * 0.5 + (leaf.d1 < 0.32 ? 0.3 : 0)];
  },
  // dirt / road
  (u, v) => {
    const n = pf(u, v, 6, 5, 21);
    const p = cells(u, v, 28, 22);
    const peb = p.d1 < 0.22 ? 1 - p.d1 / 0.22 : 0;
    const c = mixc([0.33, 0.25, 0.16], [0.47, 0.38, 0.26], n);
    const pc = mixc(c, [0.55, 0.52, 0.47], peb * 0.7 * (p.id > 0.4 ? 1 : 0));
    return [pc[0], pc[1], pc[2], n * 0.35 + peb * 0.5 * (p.id > 0.4 ? 1 : 0)];
  },
  // rock
  (u, v) => {
    const n = pf(u, v, 4, 6, 31);
    const strata = Math.sin((v * 9 + pf(u, v, 3, 3, 32) * 2.5) * Math.PI * 2) * 0.5 + 0.5;
    const cr = cells(u, v, 6, 33);
    const crack = cr.edge < 0.05 ? 1 - cr.edge / 0.05 : 0;
    let c = mixc([0.24, 0.23, 0.22], [0.42, 0.4, 0.37], n * 0.7 + strata * 0.3);
    c = mixc(c, [0.18, 0.17, 0.16], crack * 0.7);
    return [c[0], c[1], c[2], n * 0.7 + strata * 0.15 - crack * 0.35];
  },
  // snow
  (u, v) => {
    const n = pf(u, v, 5, 5, 41);
    const s = pf(u, v, 48, 2, 42);
    const c = mixc([0.66, 0.7, 0.78], [0.8, 0.83, 0.88], n);
    const sp = s > 0.8 ? 0.06 : 0;
    return [c[0] + sp, c[1] + sp, c[2] + sp, n * 0.6];
  },
  // ash / scorched earth with ember specks
  (u, v) => {
    const n = pf(u, v, 6, 5, 51);
    const cr = cells(u, v, 10, 52);
    const crack = cr.edge < 0.04 ? 1 - cr.edge / 0.04 : 0;
    let c = mixc([0.2, 0.18, 0.17], [0.36, 0.32, 0.29], n);
    c = mixc(c, [0.42, 0.13, 0.04], crack * 0.55 * (cr.id > 0.6 ? 1 : 0.2));
    return [c[0], c[1], c[2], n * 0.5 - crack * 0.3];
  },
  // ploughed field (furrows run along u)
  (u, v) => {
    const n = pf(u, v, 8, 4, 61);
    const row = Math.sin(v * Math.PI * 2 * 16) * 0.5 + 0.5;
    const sprout = pf(u, v, 48, 2, 62);
    let c = mixc([0.24, 0.17, 0.1], [0.38, 0.28, 0.18], n * 0.6 + row * 0.4);
    if (row > 0.7 && sprout > 0.45) c = mixc(c, [0.38, 0.46, 0.16], 0.8);
    return [c[0], c[1], c[2], row * 0.6 + n * 0.3];
  },
];

export function groundArrays(size = 256) {
  if (cache.ground) return cache.ground;
  const L = GROUND.length;
  const col = new Uint8Array(size * size * 4 * L);
  const nor = new Uint8Array(size * size * 4 * L);
  GROUND.forEach((fn, i) => {
    const r = raster(size, fn, i === 3 ? 4 : 2.2);
    col.set(r.col, i * size * size * 4);
    nor.set(r.nor, i * size * size * 4);
  });
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, L);
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  cache.ground = { map: mk(col, true), normal: mk(nor, false), layers: L };
  return cache.ground;
}

/* ------------------------------------------------------------ surfaces */
const SURF = {
  stone: (u, v) => {
    // ashlar blocks, staggered rows
    const rows = 6;
    const r = Math.floor(v * rows);
    const off = r % 2 ? 0.5 / 3 : 0;
    const cu = (u + off) * 3;
    const bu = cu - Math.floor(cu);
    const bv = v * rows - r;
    const id = hash(Math.floor(cu) % 3, r, 5);
    const mortar = Math.min(bu, 1 - bu) * 3 < 0.06 || Math.min(bv, 1 - bv) < 0.06;
    const n = pf(u, v, 8, 5, 71);
    const g = 0.42 + id * 0.16 + (n - 0.5) * 0.2;
    const c = mortar ? [0.3, 0.29, 0.27] : [g, g * 0.97, g * 0.92];
    const edge = Math.min(Math.min(bu, 1 - bu) * 3, Math.min(bv, 1 - bv) * 2);
    return [c[0], c[1], c[2], mortar ? 0 : 0.5 + Math.min(edge * 3, 0.4) + n * 0.25];
  },
  ruin: (u, v) => {
    const s = SURF.stone(u, v);
    const soot = pf(u, v, 3, 4, 81);
    const k = clamp01((soot - 0.35) * 1.8) * (1 - v * 0.4);
    return [mix(s[0], 0.08, k), mix(s[1], 0.07, k), mix(s[2], 0.07, k), s[3] - pf(u, v, 16, 3, 82) * 0.3];
  },
  crypt: (u, v) => {
    const s = SURF.stone(u, v);
    const moss = clamp01((pf(u, v, 4, 4, 91) - 0.55) * 3) * clamp01(v * 1.6 - 0.3);
    return [mix(s[0] * 0.7, 0.18, moss), mix(s[1] * 0.75, 0.26, moss), mix(s[2] * 0.8, 0.14, moss), s[3]];
  },
  cobble: (u, v) => {
    const c = cells(u, v, 10, 101);
    const n = pf(u, v, 8, 4, 102);
    const g = 0.35 + c.id * 0.2 + n * 0.1;
    const m = c.edge < 0.08;
    return m ? [0.2, 0.19, 0.17, 0] : [g, g * 0.96, g * 0.9, 0.3 + Math.min(c.edge, 0.4) + n * 0.2];
  },
  plaster: (u, v) => {
    const n = pf(u, v, 6, 5, 111);
    const st = pf(u, v, 2, 3, 112);
    const g = 0.78 + n * 0.14 - clamp01((st - 0.6) * 2) * 0.18;
    return [g, g * 0.93, g * 0.8, n * 0.3];
  },
  timber: (u, v) => {
    const grain = pf(u * 0.25, v * 4, 8, 4, 121);
    const ring = Math.sin((v * 30 + grain * 6) * Math.PI) * 0.5 + 0.5;
    const g = 0.2 + grain * 0.1 + ring * 0.05;
    return [g * 1.2, g * 0.85, g * 0.55, grain * 0.4 + ring * 0.2];
  },
  planks: (u, v) => {
    const P = 5;
    const p = Math.floor(u * P);
    const pu = u * P - p;
    const id = hash(p, 0, 131);
    const grain = pf(u * 2, v * 0.5, 8, 4, 132 + p);
    const gap = pu < 0.05 || pu > 0.95;
    const g = 0.32 + id * 0.12 + grain * 0.12;
    return gap ? [0.08, 0.06, 0.04, 0] : [g * 1.15, g * 0.85, g * 0.55, 0.6 + grain * 0.3];
  },
  log: (u, v) => {
    const grain = pf(u * 8, v * 0.6, 8, 4, 141);
    const g = 0.28 + grain * 0.14;
    const bark = pf(u, v, 32, 2, 142);
    return [g * 1.1, g * 0.8, g * 0.52, grain * 0.5 + bark * 0.3];
  },
  thatch: (u, v) => {
    const s = pf(u * 6, v * 0.5, 16, 4, 151);
    const rows = Math.sin(v * Math.PI * 2 * 10) * 0.5 + 0.5;
    const g = 0.42 + s * 0.22 - rows * 0.08;
    return [g * 1.05, g * 0.88, g * 0.52, s * 0.6 + rows * 0.3];
  },
  shingle: (u, v) => {
    const rows = 10;
    const r = Math.floor(v * rows);
    const off = r % 2 ? 0.5 : 0;
    const cu = u * 8 + off;
    const bu = cu - Math.floor(cu);
    const bv = v * rows - r;
    const id = hash(Math.floor(cu) % 8, r, 161);
    const g = 0.26 + id * 0.12;
    const edge = bu < 0.06 || bv > 0.9;
    return edge ? [0.1, 0.07, 0.05, 0] : [g * 1.2, g * 0.82, g * 0.6, 0.4 + bv * 0.5];
  },
  slate: (u, v) => {
    const rows = 10;
    const r = Math.floor(v * rows);
    const off = r % 2 ? 0.5 : 0;
    const cu = u * 7 + off;
    const bu = cu - Math.floor(cu);
    const bv = v * rows - r;
    const id = hash(Math.floor(cu) % 7, r, 171);
    const g = 0.24 + id * 0.1;
    const edge = bu < 0.05 || bv > 0.9;
    return edge ? [0.08, 0.08, 0.1, 0] : [g * 0.9, g * 0.95, g * 1.1, 0.4 + bv * 0.5];
  },
  bark: (u, v) => {
    const n = pf(u * 4, v * 0.6, 8, 5, 181);
    const ridge = Math.abs(Math.sin((u * 14 + n * 3) * Math.PI));
    const g = 0.3 + n * 0.16 + ridge * 0.08;
    return [g * 1.05, g * 0.85, g * 0.68, ridge * 0.6 + n * 0.4];
  },
  birch: (u, v) => {
    const n = pf(u, v, 8, 4, 191);
    const mark = pf(u * 2, v * 12, 8, 3, 192);
    const dark = mark > 0.68 ? 1 : 0;
    const g = 0.86 + n * 0.1;
    return dark ? [0.12, 0.11, 0.1, 0] : [g, g * 0.97, g * 0.92, 0.5 + n * 0.3];
  },
  cloth: (u, v) => {
    const wx = Math.sin(u * Math.PI * 2 * 96) * 0.5 + 0.5;
    const wy = Math.sin(v * Math.PI * 2 * 96) * 0.5 + 0.5;
    const n = pf(u, v, 6, 3, 201);
    const g = 0.8 + n * 0.15 + (wx * wy) * 0.05;
    return [g, g, g, wx * 0.3 + wy * 0.3];
  },
  metal: (u, v) => {
    const n = pf(u, v, 8, 5, 211);
    const sc = pf(u * 8, v * 0.5, 16, 2, 212);
    const g = 0.45 + n * 0.25 + sc * 0.08;
    return [g, g, g * 1.03, n * 0.2];
  },
  leaves: (u, v) => {
    const c = cells(u, v, 18, 221);
    const n = pf(u, v, 6, 4, 222);
    const g = c.d1 * 0.9 + n * 0.4;
    const base = mixc([0.2, 0.32, 0.1], [0.42, 0.55, 0.2], clamp01(g));
    return [base[0], base[1], base[2], 1 - c.d1 + n * 0.3];
  },
  needles: (u, v) => {
    const s = pf(u * 3, v * 0.8, 24, 4, 231);
    const n = pf(u, v, 4, 3, 232);
    const c = mixc([0.13, 0.24, 0.12], [0.26, 0.4, 0.2], s * 0.7 + n * 0.3);
    return [c[0], c[1], c[2], s];
  },
  hide: (u, v) => {
    const n = pf(u, v, 6, 5, 241);
    const f = pf(u * 2, v * 8, 32, 2, 242);
    const g = 0.5 + n * 0.3;
    return [g, g, g, f * 0.6 + n * 0.2];
  },
};

SURF.rock = (u, v) => GROUND[3](u, v);
SURF.ripple = (u, v) => {
  const n = pf(u, v, 6, 4, 251) * 0.6 + pf(u, v, 16, 3, 252) * 0.4;
  return [0.5, 0.5, 0.5, n];
};

export function surface(kind, size = 256) {
  if (cache[kind]) return cache[kind];
  const r = raster(size, SURF[kind], kind === "stone" || kind === "ruin" || kind === "crypt" || kind === "cobble" ? 3.2 : 2.2);
  cache[kind] = { map: tex2d(r.col, size, true), normalMap: tex2d(r.nor, size, false) };
  return cache[kind];
}

/* ------------------------------------------------------------ sprites */
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
  gr.addColorStop(0.25, "rgba(255,255,255,0.6)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}
export function smokeTex() {
  if (cache.smoke) return cache.smoke;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5;
      const dy = y / S - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const n = pf(x / S, y / S, 4, 4, 301);
      const a = clamp01((1 - r) * 1.4) * (0.55 + n * 0.6);
      const k = (y * S + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = clamp01(a) * 255;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  cache.smoke = t;
  return t;
}
/** Simple vertical flame sprite. */
export function flameTex() {
  if (cache.flame) return cache.flame;
  const c = cv(64, 128);
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 96, 2, 32, 80, 60);
  gr.addColorStop(0, "rgba(255,250,220,1)");
  gr.addColorStop(0.3, "rgba(255,190,80,0.9)");
  gr.addColorStop(0.65, "rgba(255,90,20,0.45)");
  gr.addColorStop(1, "rgba(120,20,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(54, 50, 60, 90, 32, 126);
  g.bezierCurveTo(4, 90, 10, 50, 32, 2);
  g.fill();
  cache.flame = new THREE.CanvasTexture(c);
  cache.flame.colorSpace = THREE.SRGBColorSpace;
  return cache.flame;
}

/** Heraldry for banners and shields (all original designs). */
export function sigilTex(kind, bg = "#2b4a7a") {
  const key = `sigil:${kind}:${bg}`;
  if (cache[key]) return cache[key];
  const c = cv(256, 512);
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 512);
  // border + swallowtail darkening
  g.strokeStyle = "rgba(230,200,120,0.9)";
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 484);
  g.save();
  g.translate(128, 210);
  g.fillStyle = "#e6c878";
  g.strokeStyle = "#e6c878";
  g.lineWidth = 8;
  const star = (r1, r2, n) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  };
  switch (kind) {
    case "wardens": // snowflake star over a tower
      g.fillStyle = "#e9eef7";
      star(70, 22, 6);
      g.fillRect(-24, 60, 48, 70);
      g.fillRect(-34, 50, 16, 16);
      g.fillRect(-8, 50, 16, 16);
      g.fillRect(18, 50, 16, 16);
      break;
    case "ember": // flame in a ring
      g.beginPath();
      g.arc(0, 0, 80, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -62);
      g.bezierCurveTo(40, -10, 40, 40, 0, 60);
      g.bezierCurveTo(-40, 40, -40, -10, 0, -62);
      g.fill();
      g.fillStyle = "#8a1c1c";
      g.beginPath();
      g.moveTo(0, -10);
      g.bezierCurveTo(16, 14, 16, 34, 0, 44);
      g.bezierCurveTo(-16, 34, -16, 14, 0, -10);
      g.fill();
      break;
    case "marches": // wheat sheaf + crossed scythes
      g.lineWidth = 10;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * -70, 80);
        g.lineTo(s * 60, -70);
        g.stroke();
      }
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.ellipse(i * 14, -30 + Math.abs(i) * 6, 8, 26, i * 0.15, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(-6, -10, 12, 80);
      break;
    case "redhand": // open red hand
      g.fillStyle = "#c8261c";
      g.beginPath();
      g.ellipse(0, 30, 52, 60, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 4; i++) g.fillRect(-48 + i * 26, -70, 20, 90);
      g.save();
      g.rotate(-0.7);
      g.fillRect(-90, 10, 22, 70);
      g.restore();
      break;
    case "ashen": // cracked crown
      g.fillStyle = "#b8b0a0";
      g.beginPath();
      g.moveTo(-80, 50);
      g.lineTo(-80, -40);
      g.lineTo(-40, 0);
      g.lineTo(0, -60);
      g.lineTo(40, 0);
      g.lineTo(80, -40);
      g.lineTo(80, 50);
      g.closePath();
      g.fill();
      g.strokeStyle = "#2a1a1a";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(8, -50);
      g.lineTo(-10, 0);
      g.lineTo(12, 20);
      g.lineTo(-4, 50);
      g.stroke();
      break;
    default:
      star(60, 26, 5);
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache[key] = t;
  return t;
}

export function disposeTextures() {
  for (const k of Object.keys(cache)) {
    const v = cache[k];
    if (v?.dispose) v.dispose();
    else if (v) for (const t of Object.values(v)) t?.dispose?.();
    delete cache[k];
  }
}
