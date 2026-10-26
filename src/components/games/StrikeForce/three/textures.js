/**
 * Strike Force — procedural, seamlessly tiling PBR textures.
 *
 * Each generator paints a height field + albedo + roughness into typed
 * arrays (tileable value-noise fbm), then derives a tangent-space normal map
 * from the height. Results are cached per (id, size) and handed out as
 * THREE.CanvasTexture triplets { map, normalMap, roughnessMap, emissiveMap? }.
 * Albedo is mostly neutral where materials are tinted (containers, paint,
 * plaster) so one texture serves many colours via vertex colours.
 */
import * as THREE from "three";

const cache = new Map();
const tracked = new Set();
export function disposeTextures() {
  for (const t of tracked) t.dispose();
  tracked.clear();
  cache.clear();
}

/* ------------------------------------------------------------------ noise */
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
/** tileable fbm field of size n×n in [0,1] */
function fbm(n, seed, base = 4, octaves = 5, gain = 0.5, sx = 1, sy = 1) {
  const out = new Float32Array(n * n);
  const r = rng(seed);
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = Math.max(1, Math.round(base * sx * 2 ** o));
    const gy = Math.max(1, Math.round(base * sy * 2 ** o));
    const lat = new Float32Array(gx * gy);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * gy;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy2 = ty * ty * (3 - 2 * ty);
      const ya = (y0 % gy) * gx;
      const yb = ((y0 + 1) % gy) * gx;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * gx;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx2 = tx * tx * (3 - 2 * tx);
        const xa = x0 % gx;
        const xb = (x0 + 1) % gx;
        const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * sx2;
        const b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * sx2;
        out[y * n + x] += (a + (b - a) * sy2) * amp;
      }
    }
    tot += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
/** worley-ish cellular distance (tileable), returns nearest-point distance 0..1 */
function cells(n, count, seed) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([r() * n, r() * n]);
  const out = new Float32Array(n * n);
  const g = Math.ceil(Math.sqrt(count));
  const cellSize = n / g;
  const grid = Array.from({ length: g * g }, () => []);
  pts.forEach((p, i) => grid[Math.min(g - 1, Math.floor(p[1] / cellSize)) * g + Math.min(g - 1, Math.floor(p[0] / cellSize))].push(i));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      let best = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const gx = (cx + dx + g) % g;
          const gy = (cy + dy + g) % g;
          for (const i of grid[gy * g + gx]) {
            let ddx = Math.abs(pts[i][0] - x);
            let ddy = Math.abs(pts[i][1] - y);
            ddx = Math.min(ddx, n - ddx);
            ddy = Math.min(ddy, n - ddy);
            const d = ddx * ddx + ddy * ddy;
            if (d < best) best = d;
          }
        }
      out[y * n + x] = Math.sqrt(best) / cellSize;
    }
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/* ------------------------------------------------------------------ assembly */
function toCanvas(n, fill) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const img = g.createImageData(n, n);
  fill(img.data);
  g.putImageData(img, 0, 0);
  return c;
}
function texFrom(canvas, srgb, aniso = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  tracked.add(t);
  return t;
}
/**
 * Build texture maps from field arrays.
 * alb: Float32Array(n*n*3) 0..1, height: Float32Array(n*n) 0..1, rough: Float32Array(n*n) 0..1
 */
function build(n, { alb, height, rough, emissive, alpha, normalStrength = 2 }) {
  const out = {};
  out.map = texFrom(
    toCanvas(n, (d) => {
      for (let i = 0; i < n * n; i++) {
        d[i * 4] = clamp01(alb[i * 3]) * 255;
        d[i * 4 + 1] = clamp01(alb[i * 3 + 1]) * 255;
        d[i * 4 + 2] = clamp01(alb[i * 3 + 2]) * 255;
        d[i * 4 + 3] = alpha ? clamp01(alpha[i]) * 255 : 255;
      }
    }),
    true,
  );
  if (height) {
    out.normalMap = texFrom(
      toCanvas(n, (d) => {
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const l = height[y * n + ((x - 1 + n) % n)];
            const r = height[y * n + ((x + 1) % n)];
            const u = height[((y - 1 + n) % n) * n + x];
            const b = height[((y + 1) % n) * n + x];
            const s = normalStrength * (n / 256);
            let nx = (l - r) * s;
            let ny = (b - u) * s;
            let nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len;
            ny /= len;
            nz /= len;
            const i = (y * n + x) * 4;
            d[i] = (nx * 0.5 + 0.5) * 255;
            d[i + 1] = (ny * 0.5 + 0.5) * 255;
            d[i + 2] = (nz * 0.5 + 0.5) * 255;
            d[i + 3] = 255;
          }
      }),
      false,
    );
  }
  if (rough) {
    out.roughnessMap = texFrom(
      toCanvas(n, (d) => {
        for (let i = 0; i < n * n; i++) {
          const v = clamp01(rough[i]) * 255;
          d[i * 4] = v;
          d[i * 4 + 1] = v; // roughness is read from G
          d[i * 4 + 2] = v;
          d[i * 4 + 3] = 255;
        }
      }),
      false,
    );
  }
  if (emissive) {
    out.emissiveMap = texFrom(
      toCanvas(n, (d) => {
        for (let i = 0; i < n * n; i++) {
          d[i * 4] = clamp01(emissive[i * 3]) * 255;
          d[i * 4 + 1] = clamp01(emissive[i * 3 + 1]) * 255;
          d[i * 4 + 2] = clamp01(emissive[i * 3 + 2]) * 255;
          d[i * 4 + 3] = 255;
        }
      }),
      true,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ generators */
const GEN = {
  concrete(n, o = {}) {
    const base = fbm(n, 11 + (o.seed || 0), 3, 6, 0.55);
    const fine = fbm(n, 12, 32, 3, 0.5);
    const stain = fbm(n, 13, 2, 4, 0.6);
    const pores = fbm(n, 14, 64, 2, 0.5);
    const c0 = hex(o.color || "#9a9893");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      let v = 0.82 + (base[i] - 0.5) * 0.35 + (fine[i] - 0.5) * 0.12;
      const st = clamp01((stain[i] - 0.55) * 3);
      v *= 1 - st * 0.28;
      const pore = pores[i] < 0.22 ? 0.65 : 1;
      v *= pore;
      alb[i * 3] = (c0[0] / 255) * v;
      alb[i * 3 + 1] = (c0[1] / 255) * v;
      alb[i * 3 + 2] = (c0[2] / 255) * v * 0.98;
      h[i] = base[i] * 0.4 + fine[i] * 0.4 + (pore < 1 ? -0.3 : 0);
      r[i] = 0.82 + (fine[i] - 0.5) * 0.2 - st * 0.1;
    }
    // panel seams
    if (o.seams) {
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (x < 2 || y < 2) {
            const i = y * n + x;
            h[i] -= 0.6;
            alb[i * 3] *= 0.6;
            alb[i * 3 + 1] *= 0.6;
            alb[i * 3 + 2] *= 0.6;
          }
        }
    }
    return { alb, height: h, rough: r, normalStrength: 2.2 };
  },
  asphalt(n, o = {}) {
    const base = fbm(n, 21, 4, 5, 0.55);
    const grit = fbm(n, 22, 96, 2, 0.6);
    const wear = fbm(n, 23, 2, 4, 0.6);
    const crack = cells(n, 18, 24);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const wet = o.wet || 0;
    const puddle = fbm(n, 25, 3, 4, 0.55);
    for (let i = 0; i < n * n; i++) {
      let v = 0.2 + (base[i] - 0.5) * 0.08 + (grit[i] - 0.5) * 0.14 + clamp01((wear[i] - 0.5) * 2) * 0.06;
      const ck = crack[i] > 0.94 ? 1 : 0;
      v *= ck ? 0.55 : 1;
      alb[i * 3] = v;
      alb[i * 3 + 1] = v;
      alb[i * 3 + 2] = v * 1.04;
      h[i] = grit[i] * 0.6 + base[i] * 0.3 - ck * 0.5;
      let rr = 0.9 - (grit[i] - 0.5) * 0.2;
      if (wet) {
        const p = clamp01((puddle[i] - 0.5) * 5);
        rr = mix(rr * (1 - wet * 0.45), 0.06, p * wet);
        h[i] = mix(h[i], 0.3, p);
        alb[i * 3] *= 1 - p * 0.35;
        alb[i * 3 + 1] *= 1 - p * 0.35;
        alb[i * 3 + 2] *= 1 - p * 0.3;
      }
      r[i] = rr;
    }
    return { alb, height: h, rough: r, normalStrength: 1.6 };
  },
  plaster(n) {
    const base = fbm(n, 31, 6, 6, 0.55);
    const blot = fbm(n, 32, 2, 4, 0.6);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const v = 0.9 + (base[i] - 0.5) * 0.12 - clamp01((blot[i] - 0.6) * 2.5) * 0.2;
      alb[i * 3] = v;
      alb[i * 3 + 1] = v;
      alb[i * 3 + 2] = v;
      h[i] = base[i];
      r[i] = 0.88;
    }
    // grime gradient toward the bottom of each tile row
    for (let y = 0; y < n; y++) {
      const g = clamp01((y / n - 0.72) * 3.5) * 0.25;
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        alb[i * 3] *= 1 - g;
        alb[i * 3 + 1] *= 1 - g;
        alb[i * 3 + 2] *= 1 - g * 1.1;
      }
    }
    return { alb, height: h, rough: r, normalStrength: 1.4 };
  },
  brick(n, o = {}) {
    const rows = 8;
    const cols = 4;
    const bh = n / rows;
    const bw = n / cols;
    const mortar = Math.max(2, n / 128);
    const noise = fbm(n, 41, 16, 4, 0.5);
    const big = fbm(n, 42, 3, 3, 0.5);
    const r0 = rng(43);
    const tones = Array.from({ length: rows * cols * 2 }, () => 0.78 + r0() * 0.32);
    const c0 = hex(o.color || "#8a4a36");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      for (let x = 0; x < n; x++) {
        const xx = (x + off) % n;
        const col = Math.floor(xx / bw);
        const lx = xx - col * bw;
        const ly = y - row * bh;
        const i = y * n + x;
        const inMortar = lx < mortar || ly < mortar;
        if (inMortar) {
          const v = 0.62 + noise[i] * 0.1;
          alb[i * 3] = v;
          alb[i * 3 + 1] = v * 0.97;
          alb[i * 3 + 2] = v * 0.92;
          h[i] = 0.1 + noise[i] * 0.1;
          r[i] = 0.95;
        } else {
          const t = tones[(row * cols + col) % tones.length] * (0.92 + noise[i] * 0.16) * (0.9 + big[i] * 0.2);
          alb[i * 3] = (c0[0] / 255) * t;
          alb[i * 3 + 1] = (c0[1] / 255) * t;
          alb[i * 3 + 2] = (c0[2] / 255) * t;
          const edge = Math.min(lx - mortar, ly - mortar, bw - lx, bh - ly);
          h[i] = 0.6 + Math.min(1, edge / 3) * 0.3 + noise[i] * 0.15;
          r[i] = 0.85;
        }
      }
    }
    return { alb, height: h, rough: r, normalStrength: 2.4 };
  },
  corrugated(n, o = {}) {
    // vertical ridges, neutral grey (tinted by vertex colour), rust + dirt
    const ridges = o.ridges || 16;
    const rust = fbm(n, 51, 4, 5, 0.6);
    const streak = fbm(n, 52, 24, 3, 0.5, 1, 0.12);
    const fine = fbm(n, 53, 48, 2, 0.5);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const ph = (x / n) * ridges * Math.PI * 2;
        const ridge = Math.abs(Math.sin(ph));
        h[i] = ridge * 0.8 + fine[i] * 0.05;
        const rs = clamp01((rust[i] - 0.62) * 4) + clamp01((streak[i] - 0.6) * 3) * 0.6 * (y / n);
        const v = 0.86 - (1 - ridge) * 0.12 + (fine[i] - 0.5) * 0.06;
        alb[i * 3] = mix(v, 0.48, rs * 0.8);
        alb[i * 3 + 1] = mix(v, 0.3, rs * 0.8);
        alb[i * 3 + 2] = mix(v, 0.2, rs * 0.8);
        // grime at the bottom
        const g = clamp01((y / n - 0.8) * 4) * 0.3;
        alb[i * 3] *= 1 - g;
        alb[i * 3 + 1] *= 1 - g;
        alb[i * 3 + 2] *= 1 - g;
        r[i] = mix(0.5, 0.9, rs) + (fine[i] - 0.5) * 0.1;
      }
    return { alb, height: h, rough: r, normalStrength: 3.2 };
  },
  paintedMetal(n) {
    const base = fbm(n, 61, 4, 5, 0.55);
    const scratch = fbm(n, 62, 64, 2, 0.5, 1, 0.08);
    const chip = fbm(n, 63, 12, 4, 0.55);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const ch = clamp01((chip[i] - 0.7) * 6);
      const sc = scratch[i] > 0.78 ? 1 : 0;
      const v = 0.88 + (base[i] - 0.5) * 0.1;
      alb[i * 3] = mix(v, 0.35, ch) - sc * 0.08;
      alb[i * 3 + 1] = mix(v, 0.33, ch) - sc * 0.08;
      alb[i * 3 + 2] = mix(v, 0.32, ch) - sc * 0.08;
      h[i] = 0.5 - ch * 0.2 - sc * 0.1 + base[i] * 0.05;
      r[i] = mix(0.45, 0.7, ch) + sc * 0.1 + (base[i] - 0.5) * 0.15;
    }
    return { alb, height: h, rough: r, normalStrength: 1.2 };
  },
  wood(n, o = {}) {
    const planks = o.planks || 6;
    const grain = fbm(n, 71, 2, 5, 0.6, 0.25, 4);
    const knots = cells(n, 10, 72);
    const fine = fbm(n, 73, 64, 2, 0.5, 0.3, 3);
    const r0 = rng(74);
    const tones = Array.from({ length: planks }, () => 0.75 + r0() * 0.4);
    const c0 = hex(o.color || "#8a6440");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const pw = n / planks;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const p = Math.floor(x / pw);
        const lx = x - p * pw;
        const gap = lx < Math.max(1.5, n / 200) ? 1 : 0;
        const g = Math.sin((grain[i] * 18 + x * 0.02) * Math.PI) * 0.5 + 0.5;
        const k = knots[i] < 0.12 ? 1 - knots[i] / 0.12 : 0;
        let t = tones[p] * (0.82 + g * 0.22 + (fine[i] - 0.5) * 0.12) * (1 - k * 0.45);
        if (gap) t *= 0.35;
        alb[i * 3] = (c0[0] / 255) * t;
        alb[i * 3 + 1] = (c0[1] / 255) * t;
        alb[i * 3 + 2] = (c0[2] / 255) * t;
        h[i] = gap ? 0 : 0.6 + g * 0.15 - k * 0.2;
        r[i] = 0.78 + (g - 0.5) * 0.12;
      }
    return { alb, height: h, rough: r, normalStrength: 2 };
  },
  crate(n, o = {}) {
    const w = GEN.wood(n, { planks: 5, color: o.color || "#9a7448" });
    const fw = n * 0.1;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const frame = x < fw || x > n - fw || y < fw || y > n - fw;
        const d1 = Math.abs(x - y);
        const diag = d1 < fw * 0.55;
        if (frame || diag) {
          w.height[i] = 0.95;
          const k = 0.92;
          w.alb[i * 3] *= k;
          w.alb[i * 3 + 1] *= k;
          w.alb[i * 3 + 2] *= k;
        }
        if (frame && (x < 2 || x > n - 3 || y < 2 || y > n - 3)) w.height[i] = 0.2;
      }
    // stencil mark
    const cx = n * 0.5;
    const cy = n * 0.5;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (x - cx) / (n * 0.16);
        const dy = (y - cy) / (n * 0.06);
        if (dx * dx + dy * dy < 1 && Math.abs(x - y) > fw * 0.55) {
          const i = y * n + x;
          w.alb[i * 3] *= 0.45;
          w.alb[i * 3 + 1] *= 0.45;
          w.alb[i * 3 + 2] *= 0.45;
        }
      }
    return w;
  },
  sand(n, o = {}) {
    const base = fbm(n, 81, 3, 6, 0.55);
    const ripple = fbm(n, 82, 2, 3, 0.5);
    const grain = fbm(n, 83, 128, 1, 0.5);
    const c0 = hex(o.color || "#c9a877");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const rp = Math.sin((y / n) * Math.PI * 2 * 14 + ripple[i] * 12) * 0.5 + 0.5;
        const v = 0.88 + (base[i] - 0.5) * 0.25 + (grain[i] - 0.5) * 0.12 + rp * 0.05;
        alb[i * 3] = (c0[0] / 255) * v;
        alb[i * 3 + 1] = (c0[1] / 255) * v;
        alb[i * 3 + 2] = (c0[2] / 255) * v;
        h[i] = rp * 0.35 + base[i] * 0.4 + grain[i] * 0.25;
        r[i] = 0.95;
      }
    return { alb, height: h, rough: r, normalStrength: 1.5 };
  },
  snow(n) {
    const base = fbm(n, 91, 3, 6, 0.55);
    const fine = fbm(n, 92, 48, 3, 0.5);
    const sp = fbm(n, 93, 160, 1, 0.5);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const v = 0.9 + (base[i] - 0.5) * 0.1 + (fine[i] - 0.5) * 0.05;
      alb[i * 3] = v * 0.97;
      alb[i * 3 + 1] = v * 0.99;
      alb[i * 3 + 2] = v;
      h[i] = base[i] * 0.7 + fine[i] * 0.3;
      r[i] = sp[i] > 0.8 ? 0.35 : 0.75;
    }
    return { alb, height: h, rough: r, normalStrength: 1.8 };
  },
  grass(n, o = {}) {
    const base = fbm(n, 101, 4, 6, 0.55);
    const blades = fbm(n, 102, 96, 2, 0.5, 1, 3);
    const dirt = fbm(n, 103, 3, 4, 0.6);
    const leaf = cells(n, 140, 104);
    const g0 = hex(o.color || "#4d6b31");
    const d0 = hex("#5e4a33");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const d = clamp01((dirt[i] - 0.56) * 3.5);
      const v = 0.75 + (base[i] - 0.5) * 0.4 + (blades[i] - 0.5) * 0.4;
      const lf = leaf[i] < 0.18 ? (o.leaves ? 1 : 0) : 0;
      let rr = mix(g0[0], d0[0], d) / 255;
      let gg = mix(g0[1], d0[1], d) / 255;
      let bb = mix(g0[2], d0[2], d) / 255;
      if (lf) {
        rr = 0.42;
        gg = 0.28;
        bb = 0.13;
      }
      alb[i * 3] = rr * v;
      alb[i * 3 + 1] = gg * v;
      alb[i * 3 + 2] = bb * v;
      h[i] = blades[i] * 0.6 + base[i] * 0.3 + lf * 0.2;
      r[i] = 0.92;
    }
    return { alb, height: h, rough: r, normalStrength: 2.2 };
  },
  dirt(n, o = {}) {
    const base = fbm(n, 111, 4, 6, 0.58);
    const pebble = cells(n, 260, 112);
    const fine = fbm(n, 113, 80, 2, 0.5);
    const c0 = hex(o.color || "#6e5a43");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const pb = pebble[i] < 0.28 ? 1 - pebble[i] / 0.28 : 0;
      const v = 0.8 + (base[i] - 0.5) * 0.4 + (fine[i] - 0.5) * 0.15 + pb * 0.15;
      alb[i * 3] = (c0[0] / 255) * v;
      alb[i * 3 + 1] = (c0[1] / 255) * v;
      alb[i * 3 + 2] = (c0[2] / 255) * v;
      h[i] = base[i] * 0.4 + pb * 0.5 + fine[i] * 0.1;
      r[i] = 0.95 - pb * 0.15;
    }
    return { alb, height: h, rough: r, normalStrength: 2.4 };
  },
  rock(n, o = {}) {
    const base = fbm(n, 121, 3, 7, 0.6);
    const cr = cells(n, 30, 122);
    const lich = fbm(n, 123, 6, 4, 0.55);
    const c0 = hex(o.color || "#7d7a74");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const crack = cr[i] > 0.9 ? 1 : 0;
      const l = clamp01((lich[i] - 0.66) * 4) * (o.lichen ? 1 : 0);
      const v = 0.72 + (base[i] - 0.5) * 0.6;
      alb[i * 3] = mix((c0[0] / 255) * v, 0.38, l) * (crack ? 0.6 : 1);
      alb[i * 3 + 1] = mix((c0[1] / 255) * v, 0.45, l) * (crack ? 0.6 : 1);
      alb[i * 3 + 2] = mix((c0[2] / 255) * v, 0.25, l) * (crack ? 0.6 : 1);
      h[i] = base[i] - crack * 0.3;
      r[i] = 0.86;
    }
    return { alb, height: h, rough: r, normalStrength: 3 };
  },
  tiles(n, o = {}) {
    const t = o.tiles || 4;
    const tw = n / t;
    const base = fbm(n, 131, 8, 4, 0.5);
    const r0 = rng(132);
    const tone = Array.from({ length: t * t }, () => 0.9 + r0() * 0.12);
    const c0 = hex(o.color || "#b7b2a6");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const lx = x % tw;
        const ly = y % tw;
        const grout = lx < 2 || ly < 2;
        const k = tone[Math.floor(y / tw) * t + Math.floor(x / tw)];
        const v = grout ? 0.5 : k * (0.95 + base[i] * 0.1);
        alb[i * 3] = (c0[0] / 255) * v;
        alb[i * 3 + 1] = (c0[1] / 255) * v;
        alb[i * 3 + 2] = (c0[2] / 255) * v;
        h[i] = grout ? 0.2 : 0.7;
        r[i] = grout ? 0.95 : 0.35 + base[i] * 0.2;
      }
    return { alb, height: h, rough: r, normalStrength: 1.6 };
  },
  grate(n) {
    const s = n / 8;
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const noise = fbm(n, 141, 8, 3, 0.5);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const bar = x % s < s * 0.22 || y % (s / 2) < s * 0.12;
        const v = bar ? 0.55 + noise[i] * 0.15 : 0.12;
        alb[i * 3] = v;
        alb[i * 3 + 1] = v;
        alb[i * 3 + 2] = v * 1.05;
        h[i] = bar ? 0.9 : 0;
        r[i] = bar ? 0.45 : 0.9;
      }
    return { alb, height: h, rough: r, normalStrength: 3 };
  },
  sandbag(n, o = {}) {
    const rows = 4;
    const cols = 2;
    const bh = n / rows;
    const bw = n / cols;
    const fab = fbm(n, 151, 64, 2, 0.5);
    const base = fbm(n, 152, 4, 4, 0.5);
    const c0 = hex(o.color || "#a8946a");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const lx = ((x + off) % bw) / bw;
        const ly = (y % bh) / bh;
        const bump = Math.sin(lx * Math.PI) ** 0.6 * Math.sin(ly * Math.PI) ** 0.5;
        const weave = (x + y) % 4 < 2 ? 1 : 0.94;
        const v = (0.5 + bump * 0.5) * (0.88 + fab[i] * 0.2) * weave * (0.9 + base[i] * 0.2);
        alb[i * 3] = (c0[0] / 255) * v;
        alb[i * 3 + 1] = (c0[1] / 255) * v;
        alb[i * 3 + 2] = (c0[2] / 255) * v;
        h[i] = bump;
        r[i] = 0.95;
      }
    }
    return { alb, height: h, rough: r, normalStrength: 4 };
  },
  hesco(n) {
    const sand = GEN.sand(n, { color: "#b49a70" });
    const s = n / 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const wire = x % s < 3 || y % s < 3;
        const fab = (x + y) % 3 === 0 ? 0.92 : 1;
        const bulge = Math.sin(((x % s) / s) * Math.PI) * Math.sin(((y % s) / s) * Math.PI);
        sand.height[i] = wire ? 1 : 0.3 + bulge * 0.4;
        if (wire) {
          sand.alb[i * 3] = 0.42;
          sand.alb[i * 3 + 1] = 0.42;
          sand.alb[i * 3 + 2] = 0.38;
          sand.rough[i] = 0.5;
        } else {
          sand.alb[i * 3] *= 0.78 * fab;
          sand.alb[i * 3 + 1] *= 0.8 * fab;
          sand.alb[i * 3 + 2] *= 0.76 * fab;
        }
      }
    return sand;
  },
  facade(n, o = {}) {
    // 4 bays × 4 floors per tile; every window decides its own light
    const base = fbm(n, 161, 4, 5, 0.55);
    const r0 = rng(162 + (o.seed || 0));
    const c0 = hex(o.wall || "#8c8a86");
    const g0 = hex(o.glass || "#22303a");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const em = o.night ? new Float32Array(n * n * 3) : null;
    const G = 4;
    const cell = n / G;
    const lit = [];
    for (let i = 0; i < G * G; i++) {
      const on = r0() < (o.litChance ?? 0.4);
      const warm = r0() < 0.65;
      const k = 0.55 + r0() * 0.45;
      lit.push(on ? (warm ? [1 * k, 0.76 * k, 0.45 * k] : [0.55 * k, 0.8 * k, 1 * k]) : null);
    }
    const wx0 = cell * (o.wx0 ?? 0.16);
    const wx1 = cell * (o.wx1 ?? 0.84);
    const wy0 = cell * (o.wy0 ?? 0.2);
    const wy1 = cell * (o.wy1 ?? 0.72);
    const fr = Math.max(1, cell * 0.035);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const lx = x - cx * cell;
        const ly = y - cy * cell;
        const inWin = lx > wx0 && lx < wx1 && ly > wy0 && ly < wy1;
        const frame = inWin && (lx < wx0 + fr || lx > wx1 - fr || ly < wy0 + fr || ly > wy1 - fr || (o.mullion !== false && Math.abs(lx - cell / 2) < fr * 0.5));
        if (inWin && !frame) {
          const refl = (ly - wy0) / (wy1 - wy0);
          const L = lit[cy * G + cx];
          alb[i * 3] = (g0[0] / 255) * (0.75 + refl * 0.5);
          alb[i * 3 + 1] = (g0[1] / 255) * (0.75 + refl * 0.5);
          alb[i * 3 + 2] = (g0[2] / 255) * (0.75 + refl * 0.5);
          h[i] = 0.2;
          r[i] = 0.06;
          if (em && L) {
            const blind = (ly - wy0) % (cell * 0.07) < cell * 0.012 ? 0.55 : 1;
            em[i * 3] = L[0] * blind;
            em[i * 3 + 1] = L[1] * blind;
            em[i * 3 + 2] = L[2] * blind;
          }
        } else if (frame) {
          alb[i * 3] = 0.22;
          alb[i * 3 + 1] = 0.23;
          alb[i * 3 + 2] = 0.24;
          h[i] = 0.55;
          r[i] = 0.4;
        } else {
          const v = 0.85 + (base[i] - 0.5) * 0.2;
          const sill = ly > wy1 && ly < wy1 + cell * 0.05 && lx > wx0 - cell * 0.03 && lx < wx1 + cell * 0.03;
          const ledge = ly > cell * 0.95;
          const k = sill || ledge ? 1.1 : 1;
          const streak = ly > wy1 && lx > wx0 && lx < wx1 ? clamp01(1 - (ly - wy1) / (cell * 0.25)) * 0.14 * base[i] : 0;
          alb[i * 3] = (c0[0] / 255) * v * k * (1 - streak);
          alb[i * 3 + 1] = (c0[1] / 255) * v * k * (1 - streak);
          alb[i * 3 + 2] = (c0[2] / 255) * v * k * (1 - streak);
          h[i] = sill || ledge ? 0.9 : 0.7 + base[i] * 0.1;
          r[i] = 0.85;
        }
      }
    return { alb, height: h, rough: r, emissive: em, normalStrength: 3 };
  },
  bark(n, o = {}) {
    const st = fbm(n, 171, 3, 5, 0.6, 3, 0.4);
    const fine = fbm(n, 172, 40, 2, 0.5, 2, 0.5);
    const c0 = hex(o.color || "#5a4634");
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const ridge = Math.abs(Math.sin(st[i] * 20));
      const v = 0.6 + ridge * 0.4 + (fine[i] - 0.5) * 0.2;
      alb[i * 3] = (c0[0] / 255) * v;
      alb[i * 3 + 1] = (c0[1] / 255) * v;
      alb[i * 3 + 2] = (c0[2] / 255) * v;
      h[i] = ridge;
      r[i] = 0.95;
    }
    return { alb, height: h, rough: r, normalStrength: 3.5 };
  },
  chainlink(n) {
    const s = n / 8;
    const alb = new Float32Array(n * n * 3);
    const alpha = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const a = (x + y) % s;
        const b = (x - y + n * 4) % s;
        const wire = a < 2.2 || b < 2.2;
        alb[i * 3] = 0.62;
        alb[i * 3 + 1] = 0.64;
        alb[i * 3 + 2] = 0.66;
        alpha[i] = wire ? 1 : 0;
      }
    return { alb, alpha };
  },
  camo(n, o = {}) {
    // greyscale-ish camo blotches, tinted per team in the material colour
    const a = fbm(n, 181 + (o.seed || 0), 3, 4, 0.55);
    const b = fbm(n, 182 + (o.seed || 0), 5, 4, 0.55);
    const fab = fbm(n, 183, 96, 1, 0.5);
    const alb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        let v = a[i] > 0.56 ? 0.62 : 0.92;
        if (b[i] > 0.62) v = 0.45;
        const weave = ((x >> 1) + (y >> 1)) % 2 ? 1 : 0.94;
        v *= weave * (0.94 + fab[i] * 0.12);
        alb[i * 3] = v;
        alb[i * 3 + 1] = v;
        alb[i * 3 + 2] = v;
        h[i] = fab[i] * 0.3 + (weave < 1 ? 0 : 0.2);
        r[i] = 0.9;
      }
    return { alb, height: h, rough: r, normalStrength: 1.4 };
  },
  quay(n) {
    const c = GEN.concrete(n, { color: "#8e8c86", seams: true, seed: 3 });
    return c;
  },
};

/** get cached texture set; size 128..1024 */
export function getTextureSet(id, size = 512, opts = {}) {
  const key = `${id}|${size}|${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[id];
  if (!gen) throw new Error("unknown texture " + id);
  const fields = gen(size, opts);
  const set = build(size, fields);
  cache.set(key, set);
  return set;
}

/* ------------------------------------------------------------------ small sprite textures */
export function radialTexture(stops = [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]], size = 64) {
  const key = "radial|" + JSON.stringify(stops) + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tracked.add(t);
  cache.set(key, t);
  return t;
}

/** star-burst muzzle flash texture */
export function flashTexture() {
  if (cache.has("flash")) return cache.get("flash");
  const n = 128;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.translate(n / 2, n / 2);
  const r0 = rng(9);
  for (let k = 0; k < 9; k++) {
    g.save();
    g.rotate((k / 9) * Math.PI * 2 + r0() * 0.3);
    const len = n * (0.3 + r0() * 0.2);
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, "rgba(255,240,200,1)");
    grd.addColorStop(0.4, "rgba(255,170,60,0.75)");
    grd.addColorStop(1, "rgba(255,90,20,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -n * 0.04);
    g.lineTo(len, 0);
    g.lineTo(0, n * 0.04);
    g.fill();
    g.restore();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, n * 0.22);
  core.addColorStop(0, "rgba(255,255,240,1)");
  core.addColorStop(0.5, "rgba(255,200,110,0.7)");
  core.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = core;
  g.fillRect(-n / 2, -n / 2, n, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tracked.add(t);
  cache.set("flash", t);
  return t;
}

/** side-view flash (cone) for the first-person muzzle */
export function flashSideTexture() {
  if (cache.has("flashSide")) return cache.get("flashSide");
  const w = 128;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const r0 = rng(19);
  for (let k = 0; k < 14; k++) {
    const y = h / 2 + (r0() - 0.5) * h * 0.5;
    const len = w * (0.5 + r0() * 0.5);
    const grd = g.createLinearGradient(0, h / 2, len, y);
    grd.addColorStop(0, "rgba(255,245,210,0.95)");
    grd.addColorStop(0.35, "rgba(255,180,70,0.6)");
    grd.addColorStop(1, "rgba(255,90,20,0)");
    g.strokeStyle = grd;
    g.lineWidth = 2 + r0() * 6;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.quadraticCurveTo(len * 0.5, h / 2 + (y - h / 2) * 0.3, len, y);
    g.stroke();
  }
  const core = g.createRadialGradient(6, h / 2, 0, 6, h / 2, h * 0.45);
  core.addColorStop(0, "rgba(255,255,240,1)");
  core.addColorStop(1, "rgba(255,160,60,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tracked.add(t);
  cache.set("flashSide", t);
  return t;
}

/** soft smoke puff */
export function smokeTexture() {
  if (cache.has("smoke")) return cache.get("smoke");
  const n = 128;
  const f = fbm(n, 201, 4, 5, 0.55);
  const c = toCanvas(n, (d) => {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const dx = (x - n / 2) / (n / 2);
        const dy = (y - n / 2) / (n / 2);
        const r = Math.hypot(dx, dy);
        const a = clamp01(1 - r) ** 1.4 * clamp01(f[i] * 1.6 - 0.2);
        d[i * 4] = 255;
        d[i * 4 + 1] = 255;
        d[i * 4 + 2] = 255;
        d[i * 4 + 3] = a * 255;
      }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tracked.add(t);
  cache.set("smoke", t);
  return t;
}

/** bullet hole decal (dark crater, soft scorch ring) */
export function holeTexture() {
  if (cache.has("hole")) return cache.get("hole");
  const n = 64;
  const f = fbm(n, 211, 6, 3, 0.5);
  const c = toCanvas(n, (d) => {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
        const core = r < 0.18 ? 1 : 0;
        const ring = clamp01(1 - (r - 0.18) / 0.55) * (0.5 + f[i] * 0.5);
        const v = core ? 10 : 40;
        d[i * 4] = v;
        d[i * 4 + 1] = v;
        d[i * 4 + 2] = v;
        d[i * 4 + 3] = (core ? 1 : ring * 0.7) * 255;
      }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tracked.add(t);
  cache.set("hole", t);
  return t;
}

/** generic canvas texture helper for signs / labels */
export function canvasTexture(w, h, draw, key) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  tracked.add(t);
  if (key) cache.set(key, t);
  return t;
}
