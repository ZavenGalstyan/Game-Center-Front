/**
 * Iron Arena — procedural, seamlessly tiling PBR textures.
 *
 * Every generator paints albedo (rgb), roughness and a height field into
 * typed arrays using periodic value noise / cellular noise; a tangent-space
 * normal map is derived from the height. Results are cached per (id, size)
 * as { map, normalMap, roughnessMap } (map alpha also carries roughness for
 * the terrain splat shader). Generated once per session, disposed on unmount.
 */
import * as THREE from "three";

const cache = new Map();
const tracked = new Set();
export function disposeTextures() {
  for (const t of tracked) t.dispose();
  tracked.clear();
  cache.clear();
}
export function track(t) {
  tracked.add(t);
  return t;
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
/** periodic fbm in [0,1]: base = lattice cells across the tile */
function fbm(n, seed, base = 4, oct = 5, gain = 0.5, sx = 1, sy = 1) {
  const out = new Float32Array(n * n);
  const r = rng(seed);
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    const gx = Math.max(1, Math.round(base * sx * 2 ** o));
    const gy = Math.max(1, Math.round(base * sy * 2 ** o));
    const lat = new Float32Array(gx * gy);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * gy;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const ya = (y0 % gy) * gx;
      const yb = ((y0 + 1) % gy) * gx;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * gx;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const xa = x0 % gx;
        const xb = (x0 + 1) % gx;
        const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx;
        const b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
        out[y * n + x] += (a + (b - a) * ty) * amp;
      }
    }
    tot += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
/** tileable cellular noise: returns {f1, f2, id} (distances in tile fractions) */
function cells(n, count, seed) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([r(), r(), r()]);
  const f1 = new Float32Array(n * n);
  const f2 = new Float32Array(n * n);
  const id = new Float32Array(n * n);
  const g = Math.max(1, Math.round(Math.sqrt(count)));
  const grid = Array.from({ length: g * g }, () => []);
  pts.forEach((p, i) => grid[Math.min(g - 1, (p[1] * g) | 0) * g + Math.min(g - 1, (p[0] * g) | 0)].push(i));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const cx = (u * g) | 0;
      const cy = (v * g) | 0;
      let d1 = 9;
      let d2 = 9;
      let best = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = (cx + ox + g) % g;
          const gy = (cy + oy + g) % g;
          for (const k of grid[gy * g + gx]) {
            let dx = Math.abs(pts[k][0] - u);
            let dy = Math.abs(pts[k][1] - v);
            if (dx > 0.5) dx = 1 - dx;
            if (dy > 0.5) dy = 1 - dy;
            const d = dx * dx + dy * dy;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = pts[k][2];
            } else if (d < d2) d2 = d;
          }
        }
      const i = y * n + x;
      f1[i] = Math.sqrt(d1);
      f2[i] = Math.sqrt(d2);
      id[i] = best;
    }
  return { f1, f2, id };
}
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hex = (c) => {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ------------------------------------------------------------------ output */
function finish(n, rgb, height, rough, nStrength = 2, opts = {}) {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    return c;
  };
  const cA = mk();
  const cN = mk();
  const cR = mk();
  const ia = cA.getContext("2d").createImageData(n, n);
  const inn = cN.getContext("2d").createImageData(n, n);
  const ir = cR.getContext("2d").createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const o = i * 4;
      ia.data[o] = Math.max(0, Math.min(255, rgb[i * 3]));
      ia.data[o + 1] = Math.max(0, Math.min(255, rgb[i * 3 + 1]));
      ia.data[o + 2] = Math.max(0, Math.min(255, rgb[i * 3 + 2]));
      ia.data[o + 3] = opts.alphaRough ? Math.max(0, Math.min(255, rough[i] * 255)) : 255;
      const hl = height[y * n + ((x - 1 + n) % n)];
      const hr = height[y * n + ((x + 1) % n)];
      const hu = height[((y - 1 + n) % n) * n + x];
      const hd = height[((y + 1) % n) * n + x];
      let nx = (hl - hr) * nStrength;
      let ny = (hu - hd) * nStrength;
      const L = Math.hypot(nx, ny, 1);
      inn.data[o] = ((nx / L) * 0.5 + 0.5) * 255;
      inn.data[o + 1] = ((ny / L) * 0.5 + 0.5) * 255;
      inn.data[o + 2] = (1 / L) * 255;
      inn.data[o + 3] = 255;
      const rv = Math.max(0, Math.min(255, rough[i] * 255));
      ir.data[o] = rv;
      ir.data[o + 1] = rv;
      ir.data[o + 2] = rv;
      ir.data[o + 3] = 255;
    }
  cA.getContext("2d").putImageData(ia, 0, 0);
  cN.getContext("2d").putImageData(inn, 0, 0);
  cR.getContext("2d").putImageData(ir, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return track(t);
  };
  return { map: tex(cA, true), normalMap: tex(cN, false), roughnessMap: tex(cR, false), size: n };
}

/* ------------------------------------------------------------------ generators */
const GEN = {
  sand(n, o) {
    const c0 = hex(o.c0 || "#d8b77a");
    const c1 = hex(o.c1 || "#b8924f");
    const big = fbm(n, 11, 3, 5);
    const fine = fbm(n, 12, 32, 3);
    const warp = fbm(n, 13, 2, 3);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const rip = Math.sin(((y / n) * 14 + warp[i] * 3.2 + (x / n) * 2) * Math.PI * 2) * 0.5 + 0.5;
        const t = big[i] * 0.7 + fine[i] * 0.3;
        const c = mix3(c1, c0, Math.min(1, t * 1.3));
        const g = 0.92 + fine[i] * 0.16 + (rip - 0.5) * 0.06;
        rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
        h[i] = rip * 0.5 + fine[i] * 0.5;
        r[i] = 0.92 - fine[i] * 0.1;
      }
    return finish(n, rgb, h, r, 1.6, o);
  },
  rock(n, o) {
    const c0 = hex(o.c0 || "#8c7a64");
    const c1 = hex(o.c1 || "#5d5145");
    const cl = cells(n, 48, 21);
    const f = fbm(n, 22, 4, 6);
    const fine = fbm(n, 23, 24, 3);
    const strata = fbm(n, 24, 2, 4, 0.5, 1, 6);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      // soft cracks + horizontal strata, not a cell pattern
      const edge = sstep(0, 0.02, cl.f2[i] - cl.f1[i]);
      const t = f[i] * 0.65 + strata[i] * 0.25 + cl.id[i] * 0.1;
      const c = mix3(c1, c0, t);
      const g = (0.78 + 0.22 * edge) * (0.82 + fine[i] * 0.34);
      rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
      h[i] = edge * 0.6 + f[i] * 0.4 + fine[i] * 0.15;
      r[i] = 0.85 + fine[i] * 0.1;
    }
    return finish(n, rgb, h, r, 3.2, o);
  },
  grass(n, o) {
    const c0 = hex(o.c0 || "#5f8a35");
    const c1 = hex(o.c1 || "#3d6122");
    const c2 = hex(o.c2 || "#8a9a45");
    const big = fbm(n, 31, 3, 4);
    const blades = fbm(n, 32, 64, 2, 0.6, 1, 3);
    const dry = fbm(n, 33, 5, 4);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      let c = mix3(c1, c0, big[i]);
      c = mix3(c, c2, sstep(0.55, 0.8, dry[i]) * 0.7);
      const g = 0.7 + blades[i] * 0.6;
      rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
      h[i] = blades[i];
      r[i] = 0.9;
    }
    return finish(n, rgb, h, r, 2.4, o);
  },
  dirt(n, o) {
    const c0 = hex(o.c0 || "#7a5a3a");
    const c1 = hex(o.c1 || "#513a24");
    const f = fbm(n, 41, 4, 5);
    const pb = cells(n, 160, 42);
    const fine = fbm(n, 43, 32, 3);
    const ruts = fbm(n, 44, 2, 3, 0.5, 1, 6);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const peb = 1 - sstep(0.0, 0.045, pb.f1[i]);
      const c = mix3(c1, c0, f[i] * 0.8 + fine[i] * 0.2);
      const g = 0.85 + fine[i] * 0.25 + peb * pb.id[i] * 0.35 - sstep(0.45, 0.7, ruts[i]) * 0.12;
      rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
      h[i] = f[i] * 0.4 + peb * 0.6 + fine[i] * 0.2;
      r[i] = 0.93 - peb * 0.15;
    }
    return finish(n, rgb, h, r, 2.6, o);
  },
  snow(n, o) {
    const c0 = hex(o.c0 || "#f2f6fb");
    const c1 = hex(o.c1 || "#c6d4e4");
    const f = fbm(n, 51, 3, 5);
    const fine = fbm(n, 52, 48, 2);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const c = mix3(c1, c0, sstep(0.25, 0.75, f[i]));
      const spark = fine[i] > 0.78 ? 1.08 : 1;
      rgb.set([c[0] * spark, c[1] * spark, c[2] * spark], i * 3);
      h[i] = f[i] * 0.7 + fine[i] * 0.3;
      r[i] = 0.75 - (spark - 1) * 3;
    }
    return finish(n, rgb, h, r, 1.2, o);
  },
  ice(n, o) {
    const c0 = hex(o.c0 || "#bfe2f2");
    const c1 = hex(o.c1 || "#6fa9c8");
    const cl = cells(n, 14, 61);
    const cl2 = cells(n, 60, 62);
    const f = fbm(n, 63, 3, 5);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const crack = 1 - sstep(0, 0.012, cl.f2[i] - cl.f1[i]);
      const crack2 = 1 - sstep(0, 0.006, cl2.f2[i] - cl2.f1[i]);
      let c = mix3(c1, c0, f[i]);
      c = mix3(c, [240, 250, 255], Math.max(crack * 0.8, crack2 * 0.4));
      rgb.set(c, i * 3);
      h[i] = 1 - crack * 0.5 - crack2 * 0.2;
      r[i] = 0.08 + crack * 0.5 + f[i] * 0.08;
    }
    return finish(n, rgb, h, r, 2, o);
  },
  asphalt(n, o) {
    const c0 = hex(o.c0 || "#3a3c40");
    const f = fbm(n, 71, 4, 4);
    const agg = fbm(n, 72, 96, 1);
    const cr = cells(n, 9, 73);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const crack = 1 - sstep(0, 0.006, cr.f2[i] - cr.f1[i]);
      const g = 0.75 + f[i] * 0.35 + (agg[i] - 0.5) * 0.4 - crack * 0.35;
      rgb.set([c0[0] * g, c0[1] * g, c0[2] * g], i * 3);
      h[i] = agg[i] * 0.6 - crack * 0.6;
      r[i] = 0.82 - f[i] * 0.25;
    }
    return finish(n, rgb, h, r, 2.2, o);
  },
  tiles(n, o) {
    const c0 = hex(o.c0 || "#8d8f94");
    const c1 = hex(o.c1 || "#6c6f75");
    const f = fbm(n, 81, 4, 4);
    const fine = fbm(n, 82, 64, 2);
    const T = o.grid || 4;
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const u = ((x / n) * T) % 1;
        const v = ((y / n) * T) % 1;
        const tileId = (Math.floor((x / n) * T) * 7 + Math.floor((y / n) * T) * 13) % 5;
        const groove = Math.min(u, 1 - u, v, 1 - v) < 0.035 ? 1 : 0;
        const c = mix3(c1, c0, tileId / 5 * 0.6 + f[i] * 0.4);
        const g = (groove ? 0.55 : 1) * (0.9 + fine[i] * 0.2);
        rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
        h[i] = groove ? 0 : 0.6 + fine[i] * 0.1;
        r[i] = groove ? 0.95 : 0.7 + f[i] * 0.2;
      }
    return finish(n, rgb, h, r, 3, o);
  },
  concrete(n, o) {
    const c0 = hex(o.c0 || "#a9a59c");
    const c1 = hex(o.c1 || "#7f7b72");
    const f = fbm(n, 91, 3, 6);
    const stain = fbm(n, 92, 2, 4, 0.55, 1, 2.5);
    const pores = fbm(n, 93, 80, 1);
    const P = o.panels || 2;
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const u = ((x / n) * P) % 1;
        const v = ((y / n) * P) % 1;
        const joint = Math.min(u, 1 - u) < 0.008 || Math.min(v, 1 - v) < 0.008 ? 1 : 0;
        let c = mix3(c1, c0, f[i]);
        const st = sstep(0.55, 0.85, stain[i]);
        c = mix3(c, [c[0] * 0.62, c[1] * 0.6, c[2] * 0.56], st);
        const g = (joint ? 0.6 : 1) * (0.94 + (pores[i] - 0.5) * 0.18);
        rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
        h[i] = (joint ? 0 : 0.6) + pores[i] * 0.15 + f[i] * 0.1;
        r[i] = 0.9 - st * 0.1;
      }
    return finish(n, rgb, h, r, 2.2, o);
  },
  /** neutral painted metal panels with rivets & scratches (tinted by material colour) */
  metal(n, o) {
    const f = fbm(n, 101, 4, 5);
    const scr = fbm(n, 102, 64, 2, 0.5, 6, 0.3);
    const grime = fbm(n, 103, 3, 4);
    const P = o.panels || 2;
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const u = ((x / n) * P) % 1;
        const v = ((y / n) * P) % 1;
        const seam = Math.min(u, 1 - u) < 0.006 || Math.min(v, 1 - v) < 0.006;
        const ru = Math.abs((((x / n) * P * 8) % 1) - 0.5);
        const rivet = (Math.min(u, 1 - u) < 0.03 || Math.min(v, 1 - v) < 0.03) && ru < 0.12 && Math.abs((((y / n) * P * 8) % 1) - 0.5) < 0.12;
        const scratch = scr[i] > 0.74 ? 1 : 0;
        const g = (seam ? 0.55 : 1) * (0.86 + f[i] * 0.2) * (1 - sstep(0.6, 0.9, grime[i]) * 0.25) + scratch * 0.25;
        rgb.set([255 * g, 255 * g, 255 * g], i * 3);
        h[i] = (seam ? 0 : 0.5) + (rivet ? 0.4 : 0) - scratch * 0.08;
        r[i] = 0.55 + f[i] * 0.2 - scratch * 0.25 + sstep(0.6, 0.9, grime[i]) * 0.2;
      }
    return finish(n, rgb, h, r, 3.5, o);
  },
  corrugated(n, o) {
    const f = fbm(n, 111, 3, 5);
    const rust = fbm(n, 112, 6, 5);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const R = o.ribs || 16;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const rib = Math.abs(((x / n) * R) % 1 - 0.5) * 2; // 0 at crest
        const rs = sstep(0.62, 0.85, rust[i]);
        const g = 0.8 + (1 - rib) * 0.15 + f[i] * 0.1;
        const c = mix3([255 * g, 255 * g, 255 * g], [150 * g, 80 * g, 40 * g], rs * 0.85);
        rgb.set(c, i * 3);
        h[i] = 1 - rib * rib;
        r[i] = 0.5 + rs * 0.4 + f[i] * 0.1;
      }
    return finish(n, rgb, h, r, 5, o);
  },
  planks(n, o) {
    const c0 = hex(o.c0 || "#8a6440");
    const c1 = hex(o.c1 || "#5c3f26");
    const grain = fbm(n, 121, 2, 4, 0.5, 1, 18);
    const f = fbm(n, 122, 4, 4);
    const B = o.boards || 6;
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const bu = (x / n) * B;
        const board = Math.floor(bu);
        const gap = Math.min(bu % 1, 1 - (bu % 1)) < 0.04;
        const t = grain[(y * n + ((x + board * 37) % n))] * 0.7 + f[i] * 0.3 + ((board * 0.37) % 1) * 0.2;
        const c = mix3(c1, c0, t);
        const g = gap ? 0.35 : 1;
        rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
        h[i] = gap ? 0 : 0.6 + grain[i] * 0.2;
        r[i] = 0.85;
      }
    return finish(n, rgb, h, r, 3, o);
  },
  brick(n, o) {
    const c0 = hex(o.c0 || "#9a5a42");
    const c1 = hex(o.c1 || "#6e3c2c");
    const f = fbm(n, 131, 6, 4);
    const fine = fbm(n, 132, 48, 2);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const RW = 8;
    const RH = 16;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const row = Math.floor((y / n) * RH);
        const u = ((x / n) * RW + (row % 2) * 0.5) % 1;
        const v = ((y / n) * RH) % 1;
        const mortar = u < 0.05 || v < 0.1;
        const bid = (Math.floor((x / n) * RW + (row % 2) * 0.5) * 13 + row * 7) % 9;
        const c = mortar ? [150, 145, 135] : mix3(c1, c0, bid / 9 * 0.7 + f[i] * 0.3);
        const g = 0.88 + fine[i] * 0.22;
        rgb.set([c[0] * g, c[1] * g, c[2] * g], i * 3);
        h[i] = mortar ? 0 : 0.7 + fine[i] * 0.2;
        r[i] = 0.9;
      }
    return finish(n, rgb, h, r, 3, o);
  },
  fabric(n, o) {
    const c0 = hex(o.c0 || "#b49c74");
    const f = fbm(n, 141, 4, 4);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const wv = (Math.sin((x / n) * Math.PI * 2 * 96) * Math.sin((y / n) * Math.PI * 2 * 96)) * 0.5 + 0.5;
        const g = 0.85 + wv * 0.12 + f[i] * 0.15;
        rgb.set([c0[0] * g, c0[1] * g, c0[2] * g], i * 3);
        h[i] = wv * 0.5 + f[i] * 0.5;
        r[i] = 0.95;
      }
    return finish(n, rgb, h, r, 1.5, o);
  },
  /** tank track tread (u along the belt) */
  tread(n, o) {
    const f = fbm(n, 151, 8, 3);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const L = 8; // links per tile
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const u = ((x / n) * L) % 1;
        const v = y / n;
        const link = u > 0.08 && u < 0.92;
        const grouser = u > 0.3 && u < 0.62 && v > 0.08 && v < 0.92;
        const pin = Math.abs(v - 0.5) < 0.07 && !grouser;
        const g = link ? (grouser ? 0.42 : 0.3) : 0.12;
        const m = 60 + f[i] * 30;
        rgb.set([m * g * 3, m * g * 2.9, m * g * 2.8], i * 3);
        h[i] = link ? (grouser ? 1 : 0.55) : 0;
        if (pin) h[i] += 0.2;
        r[i] = grouser ? 0.45 : 0.75;
      }
    return finish(n, rgb, h, r, 6, o);
  },
  /** city facade with lit windows (emissive map returned separately) */
  facade(n, o) {
    const f = fbm(n, 161 + (o.seed || 0), 4, 4);
    const rnd = rng(162 + (o.seed || 0));
    const cols = o.cols || 8;
    const rows = o.rows || 8;
    const lit = [];
    for (let k = 0; k < cols * rows; k++) lit.push(rnd() < (o.litChance ?? 0.55) ? 0.6 + rnd() * 0.4 : 0);
    const warm = [];
    for (let k = 0; k < cols * rows; k++) warm.push(rnd());
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    const em = new Uint8ClampedArray(n * n * 4);
    const base = hex(o.c0 || "#2a2e38");
    const tintA = hex(o.wA || "#ffd8a0");
    const tintB = hex(o.wB || "#9fd8ff");
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const cu = (x / n) * cols;
        const cv = (y / n) * rows;
        const u = cu % 1;
        const v = cv % 1;
        const win = u > 0.14 && u < 0.86 && v > 0.22 && v < 0.82;
        const k = Math.floor(cv) * cols + Math.floor(cu);
        const g = 0.8 + f[i] * 0.3;
        if (win) {
          const L = lit[k];
          const wc = mix3(tintA, tintB, warm[k] > 0.6 ? 1 : 0);
          rgb.set(L ? [wc[0] * 0.5, wc[1] * 0.5, wc[2] * 0.5] : [20, 26, 36], i * 3);
          const lv = L * (0.85 + 0.15 * Math.sin(v * 9));
          em.set([wc[0] * lv, wc[1] * lv, wc[2] * lv, 255], i * 4);
          h[i] = 0.1;
          r[i] = 0.08;
        } else {
          rgb.set([base[0] * g, base[1] * g, base[2] * g], i * 3);
          em.set([0, 0, 0, 255], i * 4);
          h[i] = 0.6 + (v < 0.12 ? 0.2 : 0);
          r[i] = 0.55 + f[i] * 0.2;
        }
      }
    const out = finish(n, rgb, h, r, 2.5, o);
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const ctx = c.getContext("2d");
    const id = ctx.createImageData(n, n);
    id.data.set(em);
    ctx.putImageData(id, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    out.emissiveMap = track(t);
    return out;
  },
  /** tank paint: camo pattern in the skin's colours + panel normal detail */
  camo(n, o) {
    const base = hex(o.base);
    const acc = hex(o.accent);
    const det = hex(o.detail);
    const pat = o.pattern || "plain";
    const f = fbm(n, 171, 3, 4);
    const f2 = fbm(n, 172, 2, 4, 0.55, 1, 1);
    const f3 = fbm(n, 173, 5, 3);
    const scr = fbm(n, 174, 64, 2, 0.5, 5, 0.4);
    const cl = cells(n, 18, 175);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const u = x / n;
        const v = y / n;
        let c = base;
        switch (pat) {
          case "digital": {
            const px = Math.floor(u * 32) / 32;
            const py = Math.floor(v * 32) / 32;
            const k = f[Math.floor(py * n) * n + Math.floor(px * n)];
            c = k > 0.62 ? det : k > 0.46 ? acc : base;
            break;
          }
          case "tiger": {
            const s = Math.sin((u * 6 + f2[i] * 2.4) * Math.PI * 2) * 0.5 + 0.5;
            c = s > 0.78 ? acc : s > 0.7 ? det : base;
            break;
          }
          case "hex": {
            const e = cl.f2[i] - cl.f1[i];
            c = e < 0.012 ? acc : cl.id[i] > 0.7 ? det : base;
            break;
          }
          case "splinter": {
            const a = f[i] + f3[i] * 0.4;
            const q = Math.floor(a * 6) / 6;
            c = q > 0.55 ? acc : q > 0.42 ? det : base;
            break;
          }
          case "blocks": {
            const bx = Math.floor(u * 6 + f2[i] * 0.6);
            const by = Math.floor(v * 4);
            const k = ((bx * 7 + by * 3) % 5) / 5;
            c = k > 0.75 ? acc : k > 0.5 ? det : base;
            break;
          }
          case "wave": {
            const s = Math.sin((v * 3 + Math.sin(u * Math.PI * 4) * 0.12) * Math.PI * 2);
            c = s > 0.82 ? acc : s < -0.9 ? det : base;
            break;
          }
          default: {
            c = mix3(base, acc, sstep(0.6, 0.9, f[i]) * 0.25);
          }
        }
        const P = 2;
        const pu = (u * P) % 1;
        const pv = (v * P) % 1;
        const seam = Math.min(pu, 1 - pu) < 0.004 || Math.min(pv, 1 - pv) < 0.004;
        const nearSeam = Math.min(pu, 1 - pu) < 0.03 || Math.min(pv, 1 - pv) < 0.03;
        const rv = Math.abs((((u * P * 10) % 1) - 0.5)) < 0.09 && Math.abs((((v * P * 10) % 1) - 0.5)) < 0.09;
        const rivet = nearSeam && rv && !seam;
        const scratch = scr[i] > 0.86 ? 1 : 0;
        // broad tonal variation (sun-faded / dusty patches) + fine paint grain
        const g = (seam ? 0.55 : 1) * (0.86 + f2[i] * 0.18 + (f3[i] - 0.5) * 0.06);
        let cc = [c[0] * g, c[1] * g, c[2] * g];
        if (scratch) cc = mix3(cc, [cc[0] * 1.25 + 18, cc[1] * 1.25 + 18, cc[2] * 1.22 + 16], 0.5);
        if (rivet) cc = [cc[0] * 1.12, cc[1] * 1.12, cc[2] * 1.12];
        rgb.set(cc, i * 3);
        h[i] = (seam ? 0 : 0.5) - scratch * 0.06 + (rivet ? 0.35 : 0) + f3[i] * 0.04;
        r[i] = 0.48 + f[i] * 0.2 + (scratch ? -0.15 : 0);
      }
    return finish(n, rgb, h, r, 3, o);
  },
  /** soft round leaves / frond texture with alpha (for foliage cards) */
  leaves(n, o) {
    const c0 = hex(o.c0 || "#4f7a2c");
    const c1 = hex(o.c1 || "#2c4a18");
    const f = fbm(n, 181, 6, 3);
    const rgb = new Float32Array(n * n * 3);
    const h = new Float32Array(n * n);
    const r = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const c = mix3(c1, c0, f[i]);
      rgb.set(c, i * 3);
      h[i] = f[i];
      r[i] = 0.8;
    }
    return finish(n, rgb, h, r, 2, o);
  },
};

/** cached texture set; `id` picks a generator, opts vary colours */
export function texSet(id, size = 512, opts = {}) {
  const key = id + "|" + size + "|" + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[opts.gen || id];
  const out = gen(size, opts);
  cache.set(key, out);
  return out;
}

/** small canvas texture drawn with a 2D callback (signs, decals, sprites) */
export function canvasTex(key, w, h, draw, srgb = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  track(t);
  cache.set(key, t);
  return t;
}
