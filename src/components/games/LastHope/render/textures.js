/**
 * Last Hope — procedural, tileable surface textures (no image files).
 *
 * Every texture is painted on a canvas from a seeded tileable value-noise
 * field; height fields also produce a normal map (Sobel) so ground, walls,
 * roofs and floors read as real materials under the sun and the flashlight.
 * Results are cached; disposeTextures() frees them with the world.
 */
import * as THREE from "three";

const cache = new Map();
let aniso = 4;
export function setAnisotropy(a) {
  aniso = a;
}

/* ---------------------------------------------------------------- noise */
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Tileable value noise with integer period p. */
function vnoise(x, y, p, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = hash(m(xi), m(yi), s);
  const b = hash(m(xi + 1), m(yi), s);
  const c = hash(m(xi), m(yi + 1), s);
  const d = hash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, p, oct = 4, s = 1) {
  let f = 0;
  let amp = 0.5;
  let per = p;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    f += vnoise(x * (per / p), y * (per / p), per, s + o * 17) * amp;
    tot += amp;
    amp *= 0.5;
    per *= 2;
  }
  return f / tot;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- canvas helpers */
function canvas(size) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}
function toTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Paint a texture pixel-by-pixel: fn(u, v, x, y) → [r, g, b, height]. */
function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r[0];
      img.data[i + 1] = r[1];
      img.data[i + 2] = r[2];
      img.data[i + 3] = 255;
      h[y * size + x] = r[3] ?? 0.5;
    }
  ctx.putImageData(img, 0, 0);
  return { c, ctx, h, size };
}
function normalMap(h, size, strength = 2) {
  const c = canvas(size);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return toTex(c, false);
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
const col = (r, g, b, k = 1) => [clamp(r * k), clamp(g * k), clamp(b * k)];

/* ---------------------------------------------------------------- recipes */
const RECIPES = {
  grass(size) {
    const p = paint(size, (u, v) => {
      const big = fbm(u * 2, v * 2, 2, 3, 9);
      const n = fbm(u * 6, v * 6, 6, 4, 3);
      const fine = vnoise(u * 64, v * 64, 64, 4);
      const g = mix(0.86, 1.08, n) * mix(0.95, 1.03, fine);
      const dry = Math.max(0, big - 0.5) * 1.8;
      const lush = Math.max(0, 0.45 - big) * 1.6;
      return [...col(mix(mix(78, 64, lush), 124, dry), mix(mix(124, 128, lush), 126, dry), mix(mix(48, 44, lush), 58, dry), g), n * 0.7 + fine * 0.3];
    });
    // soft blade strokes, close to the base tones
    const r = rng(11);
    const ctx = p.ctx;
    for (let k = 0; k < size * 5; k++) {
      const x = r() * size;
      const y = r() * size;
      const len = (3 + r() * 6) * (size / 512);
      const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const t = r();
      ctx.strokeStyle = t < 0.6 ? `rgba(${96 + r() * 30},${146 + r() * 30},${58 + r() * 16},0.32)` : `rgba(${46 + r() * 16},${80 + r() * 16},${32},0.32)`;
      ctx.lineWidth = 1 + r();
      for (const ox of [0, size, -size])
        for (const oy of [0, size, -size]) {
          if (x + ox < -10 || x + ox > size + 10 || y + oy < -10 || y + oy > size + 10) continue;
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
          ctx.stroke();
        }
    }
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  moss(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5, 21);
      const fine = vnoise(u * 80, v * 80, 80, 5);
      const k = mix(0.7, 1.1, n) * mix(0.85, 1.05, fine);
      const brown = Math.max(0, fbm(u * 4, v * 4, 4, 3, 33) - 0.45) * 2;
      return [...col(mix(52, 92, brown), mix(74, 70, brown), mix(38, 44, brown), k), n];
    });
    const r = rng(23);
    const ctx = p.ctx;
    // pine needles + twigs
    for (let k = 0; k < size * 6; k++) {
      const x = r() * size;
      const y = r() * size;
      const len = 3 + r() * 6;
      const a = r() * Math.PI * 2;
      ctx.strokeStyle = r() < 0.6 ? `rgba(${120 + r() * 40},${86 + r() * 20},${46},0.55)` : `rgba(${60},${84 + r() * 30},${40},0.5)`;
      ctx.lineWidth = 0.8 + r() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  dirt(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 5, 41);
      const fine = vnoise(u * 120, v * 120, 120, 6);
      const k = mix(0.75, 1.1, n) * mix(0.88, 1.06, fine);
      return [...col(116, 88, 60, k), n * 0.7 + fine * 0.3];
    });
    // pebbles: stamped inside their own bounding boxes (wrapping)
    const img = p.ctx.getImageData(0, 0, size, size);
    const r0 = rng(5);
    const peb = Math.round((90 * size * size) / (512 * 512));
    for (let q = 0; q < peb; q++) {
      const px = r0() * size;
      const py = r0() * size;
      const pr = (1.5 + r0() * 4) * (size / 512);
      const t = r0();
      for (let yy = Math.floor(py - pr); yy <= Math.ceil(py + pr); yy++)
        for (let xx = Math.floor(px - pr); xx <= Math.ceil(px + pr); xx++) {
          const d = Math.hypot(xx - px, yy - py);
          if (d >= pr) continue;
          const e = 1 - d / pr;
          const wx = ((xx % size) + size) % size;
          const wy = ((yy % size) + size) % size;
          const i = wy * size + wx;
          p.h[i] += e * 0.6;
          const k = 0.85 + e * 0.3;
          img.data[i * 4] = clamp((104 + t * 34) * k);
          img.data[i * 4 + 1] = clamp((94 + t * 28) * k);
          img.data[i * 4 + 2] = clamp((82 + t * 22) * k);
        }
    }
    p.ctx.putImageData(img, 0, 0);
    return { map: toTex(p.c), normal: normalMap(p.h, size, 4) };
  },
  asphalt(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 5, v * 5, 5, 4, 51);
      const fine = hash(Math.floor(u * size), Math.floor(v * size), 7);
      const agg = fine > 0.93 ? 1.35 : fine < 0.06 ? 0.7 : 1;
      const k = mix(0.82, 1.08, n) * agg;
      const patch = fbm(u * 2, v * 2, 2, 2, 61) > 0.62 ? 0.82 : 1;
      return [...col(58, 60, 64, k * patch), n * 0.4 + fine * 0.6];
    });
    // cracks
    const ctx = p.ctx;
    const r = rng(77);
    ctx.strokeStyle = "rgba(20,20,22,0.55)";
    for (let k = 0; k < 9; k++) {
      let x = r() * size;
      let y = r() * size;
      ctx.lineWidth = 0.8 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let a = r() * 6.28;
      for (let s = 0; s < 14; s++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * 7;
        y += Math.sin(a) * 7;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return { map: toTex(p.c), normal: normalMap(p.h, size, 2.5) };
  },
  concrete(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 5, v * 5, 5, 5, 71);
      const fine = vnoise(u * 140, v * 140, 140, 8);
      const stain = Math.max(0, fbm(u * 3, v * 3, 3, 3, 81) - 0.58) * 2.2;
      const seam = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.004 || u < 0.004 || v < 0.004 ? 0.72 : 1;
      const k = mix(0.86, 1.06, n) * mix(0.93, 1.04, fine) * (1 - stain * 0.35) * seam;
      return [...col(150, 148, 142, k), seam < 1 ? 0.1 : n * 0.5 + fine * 0.5];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 2) };
  },
  /* -------- walls (greyish; tinted per style by material colour) */
  siding(size) {
    const p = paint(size, (u, v) => {
      const board = (v * 8) % 1;
      const groove = board < 0.08 ? 0.62 : board > 0.92 ? 0.88 : 1;
      const grain = vnoise(u * 60, v * 8 * 6, 60, 9) * 0.08;
      const n = fbm(u * 4, v * 4, 4, 4, 91);
      const dirt = Math.max(0, 0.4 - v) * 0.5 * n;
      const k = groove * (0.92 + grain) * mix(0.9, 1.04, n) * (1 - dirt);
      return [...col(232, 230, 224, k), board < 0.08 ? 0 : 0.5 + board * 0.3];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  brick(size) {
    const p = paint(size, (u, v) => {
      const row = Math.floor(v * 16);
      const off = row % 2 ? 0.5 / 8 : 0;
      const bu = ((u + off) * 8) % 1;
      const bv = (v * 16) % 1;
      const mortar = bu < 0.06 || bv < 0.12;
      const id = hash(Math.floor((u + off) * 8), row, 13);
      const n = fbm(u * 8, v * 8, 8, 3, 101);
      const k = mortar ? 0.95 : mix(0.75, 1.1, id) * mix(0.9, 1.05, n);
      return mortar ? [...col(170, 162, 150, mix(0.85, 1, n)), 0.15] : [...col(148, 74, 56, k), 0.6 + n * 0.2];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3.5) };
  },
  logs(size) {
    const p = paint(size, (u, v) => {
      const lv = (v * 6) % 1;
      const round = Math.sin(lv * Math.PI);
      const grain = fbm(u * 30, v * 6 * 3, 30, 3, 111);
      const id = hash(Math.floor(v * 6), 0, 17);
      const k = mix(0.55, 1, round) * mix(0.85, 1.08, grain) * mix(0.88, 1.06, id);
      return [...col(122, 86, 56, k), round * 0.8 + grain * 0.2];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 4) };
  },
  corrugated(size) {
    const p = paint(size, (u, v) => {
      const ridge = Math.sin(u * 24 * Math.PI * 2) * 0.5 + 0.5;
      const rust = Math.max(0, fbm(u * 4, v * 4, 4, 4, 121) - 0.52) * 2.4;
      const streak = vnoise(u * 40, v * 3, 40, 12) * 0.12;
      const k = mix(0.8, 1.05, ridge) * (1 - streak);
      return [...col(mix(176, 130, rust), mix(182, 84, rust), mix(186, 52, rust), k), ridge];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  wallconcrete(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 4, v * 4, 4, 5, 131);
      const fine = vnoise(u * 100, v * 100, 100, 14);
      const panel = (u * 2) % 1 < 0.01 || (v * 2) % 1 < 0.012 ? 0.7 : 1;
      const holes = hash(Math.floor(u * 8), Math.floor(v * 8), 15) > 0.5 && Math.hypot(((u * 8) % 1) - 0.5, ((v * 8) % 1) - 0.5) < 0.04 ? 0.6 : 1;
      const k = mix(0.82, 1.05, n) * mix(0.93, 1.04, fine) * panel * holes;
      return [...col(168, 166, 160, k), panel < 1 || holes < 1 ? 0 : n];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 2) };
  },
  bunker(size) {
    const p = paint(size, (u, v) => {
      const n = fbm(u * 4, v * 4, 4, 5, 141);
      const fine = vnoise(u * 90, v * 90, 90, 16);
      const band = v > 0.86 ? ((Math.floor(u * 16 + v * 16) % 2) ? [210, 170, 40] : [30, 30, 30]) : null;
      const seam = (u * 4) % 1 < 0.012 ? 0.7 : 1;
      const k = mix(0.78, 1.04, n) * mix(0.92, 1.04, fine) * seam;
      const c = band || [124, 128, 126];
      const wet = Math.max(0, fbm(u * 6, v * 2, 6, 3, 151) - 0.6) * (1 - v) * 1.5;
      return [...col(c[0], c[1], c[2], k * (1 - wet * 0.4)), n];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 2.5) };
  },
  interior(size) {
    const p = paint(size, (u, v) => {
      const stripe = Math.floor(u * 20) % 2 ? 1 : 0.94;
      const n = fbm(u * 4, v * 4, 4, 4, 161);
      const peel = Math.max(0, fbm(u * 6, v * 6, 6, 4, 171) - 0.66) * 3;
      const k = stripe * mix(0.88, 1.03, n);
      return peel > 0.1 ? [...col(150, 140, 120, 0.9), 0.2] : [...col(214, 200, 176, k), 0.5];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 1.5) };
  },
  planks(size) {
    const p = paint(size, (u, v) => {
      const row = Math.floor(u * 6);
      const off = hash(row, 0, 19);
      const pv = (v + off) % 1;
      const plankEnd = (pv * 2) % 1 < 0.012;
      const gap = (u * 6) % 1 < 0.03;
      const grain = fbm(u * 6 * 4, v * 40, 24, 3, 181);
      const tone = mix(0.8, 1.1, hash(row, Math.floor((v + off) * 2), 21));
      const k = gap || plankEnd ? 0.45 : tone * mix(0.85, 1.08, grain);
      return [...col(150, 108, 70, k), gap || plankEnd ? 0 : 0.6 + grain * 0.3];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  tile(size) {
    const p = paint(size, (u, v) => {
      const tu = (u * 8) % 1;
      const tv = (v * 8) % 1;
      const grout = tu < 0.05 || tv < 0.05;
      const chk = (Math.floor(u * 8) + Math.floor(v * 8)) % 2;
      const n = fbm(u * 4, v * 4, 4, 3, 191);
      const dirt = Math.max(0, n - 0.55) * 1.4;
      const base = chk ? [214, 206, 188] : [168, 160, 146];
      return grout ? [...col(110, 104, 96), 0] : [...col(base[0], base[1], base[2], 1 - dirt * 0.35), 0.6];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 2.5) };
  },
  shingles(size) {
    const p = paint(size, (u, v) => {
      const row = Math.floor(v * 10);
      const off = row % 2 ? 0.5 / 6 : 0;
      const su = ((u + off) * 6) % 1;
      const sv = (v * 10) % 1;
      const edge = su < 0.05 ? 0.6 : 1;
      const shade = mix(1, 0.7, sv);
      const id = hash(Math.floor((u + off) * 6), row, 23);
      const n = fbm(u * 6, v * 6, 6, 3, 201);
      const moss = Math.max(0, fbm(u * 3, v * 3, 3, 3, 211) - 0.6) * 2;
      const k = edge * shade * mix(0.8, 1.1, id) * mix(0.9, 1.05, n);
      return [...col(mix(84, 70, moss), mix(70, 90, moss), mix(66, 50, moss), k), (1 - sv) * edge];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 4) };
  },
  metalroof(size) {
    const p = paint(size, (u, v) => {
      const ridge = Math.abs(((u * 10) % 1) - 0.5) < 0.05 ? 1 : 0;
      const rust = Math.max(0, fbm(u * 5, v * 5, 5, 4, 221) - 0.55) * 2;
      const n = vnoise(u * 8, v * 50, 8, 24) * 0.1;
      return [...col(mix(120, 128, rust), mix(126, 80, rust), mix(130, 50, rust), 1 - n + ridge * 0.15), ridge];
    });
    return { map: toTex(p.c), normal: normalMap(p.h, size, 3) };
  },
  /** Grass-blade card for instanced tufts (alpha). */
  blades(size) {
    const c = canvas(size);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const r = rng(31);
    for (let k = 0; k < 26; k++) {
      const x = size * (0.12 + r() * 0.76);
      const h = size * (0.45 + r() * 0.5);
      const lean = (r() - 0.5) * size * 0.3;
      const w = size * (0.025 + r() * 0.025);
      const g = ctx.createLinearGradient(0, size, 0, size - h);
      const t = r();
      g.addColorStop(0, "rgb(70,108,40)");
      g.addColorStop(1, t < 0.75 ? `rgb(${120 + r() * 40},${170 + r() * 30},${70})` : `rgb(${176},${176},${96})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w, size);
      ctx.quadraticCurveTo(x + lean * 0.4, size - h * 0.5, x + lean, size - h);
      ctx.quadraticCurveTo(x + lean * 0.4 + w * 0.3, size - h * 0.5, x + w, size);
      ctx.fill();
    }
    const t = toTex(c, true, false);
    return { map: t };
  },
  /** Soft round blob (particles, fake shadows). */
  soft(size) {
    const c = canvas(size);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return { map: toTex(c, false, false) };
  },
  /** Puffy smoke particle. */
  smoke(size) {
    const p = paint(size, (u, v) => {
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = fbm(u * 4, v * 4, 4, 4, 241);
      const a = Math.max(0, 1 - d) * mix(0.5, 1.2, n);
      const k = clamp(a * 255);
      return [k, k, k, 0];
    });
    return { map: toTex(p.c, false, false) };
  },
};

/** Get (and cache) a texture set: {map, normal?}. */
export function tex(name, size = 512) {
  const key = `${name}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const t = RECIPES[name](size);
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) {
    t.map?.dispose();
    t.normal?.dispose();
  }
  cache.clear();
}
