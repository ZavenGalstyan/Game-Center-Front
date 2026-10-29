/**
 * The overworld heightfield — built once, deterministically, and shared by
 * the physics (ground height, slopes, water) and the renderer (mesh, splat
 * texture, minimap). Grid spacing WORLD.cell (2 m), bilinear sampling.
 *
 * Build order: rolling noise → Frostfang mountains → rim mountains →
 * settlement flats → lakes → roads (pinned or smoothed heights) → river.
 *
 * Masks (Uint8, 0–255 per grid vertex) drive the ground shader and the
 * scatter of trees / grass: road, snow, ash, forest, field, wet (banks).
 */
import { WORLD, ROADS, RIVER, LAKES, FLATS, INTERIOR_X } from "../data/worldmap.js";
import { fbm, ridged, smooth, smoothPath, clamp, lerp } from "./math.js";

let CACHE = null;

function natural(x, z) {
  let h = 7 + fbm(x / 230, z / 230, 4, 11) * 9 + fbm(x / 62, z / 62, 3, 23) * 2.4;
  // Elderwood hills (west)
  h += ridged(x / 120, z / 120, 3, 41) * 11 * smooth(-110, -230, x);
  // gentle rise toward the south march
  h += smooth(250, 420, z) * 8 * (0.5 + 0.5 * fbm(x / 90, z / 90, 2, 5));
  // Frostfang mountains (north)
  const n = smooth(-165, -400, z);
  if (n > 0) h += n * n * (40 + ridged(x / 150, z / 150, 5, 77) * 120) + n * fbm(x / 30, z / 30, 2, 91) * 4;
  // Cinderpeak massif (north-east): a broad cone the sanctum is cut into
  const cd = Math.hypot(x - 310, z + 315);
  if (cd < 230) h = Math.max(h, 105 * Math.pow(1 - cd / 230, 1.25) + ridged(x / 70, z / 70, 4, 63) * 14 * (1 - cd / 230));
  // rim
  const B = Math.max(Math.abs(x), Math.abs(z));
  h += Math.pow(smooth(395, 505, B), 1.4) * 150 * (0.75 + 0.25 * ridged(x / 80, z / 80, 3, 7));
  return h;
}

export function getTerrain() {
  if (CACHE) return CACHE;
  const { half, cell } = WORLD;
  const N = Math.round((half * 2) / cell) + 1;
  const idx = (i, j) => j * N + i;
  const wx = (i) => -half + i * cell;
  const toI = (x) => (x + half) / cell;
  const H = new Float32Array(N * N);
  const NAT = new Float32Array(N * N);
  const water = new Float32Array(N * N).fill(-1e9);
  const M = {
    road: new Uint8Array(N * N),
    snow: new Uint8Array(N * N),
    ash: new Uint8Array(N * N),
    forest: new Uint8Array(N * N),
    field: new Uint8Array(N * N),
    wet: new Uint8Array(N * N),
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const v = natural(wx(i), wx(j));
      H[idx(i, j)] = v;
      NAT[idx(i, j)] = v;
    }
  const sampleNat = (x, z) => {
    const fi = clamp(toI(x), 0, N - 1.001);
    const fj = clamp(toI(z), 0, N - 1.001);
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const u = fi - i;
    const v = fj - j;
    return lerp(lerp(NAT[idx(i, j)], NAT[idx(i + 1, j)], u), lerp(NAT[idx(i, j + 1)], NAT[idx(i + 1, j + 1)], u), v);
  };
  /** Visit grid vertices in a world-space box. */
  const box = (x0, z0, x1, z1, fn) => {
    const i0 = Math.max(0, Math.floor(toI(Math.min(x0, x1))));
    const i1 = Math.min(N - 1, Math.ceil(toI(Math.max(x0, x1))));
    const j0 = Math.max(0, Math.floor(toI(Math.min(z0, z1))));
    const j1 = Math.min(N - 1, Math.ceil(toI(Math.max(z0, z1))));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(idx(i, j), wx(i), wx(j));
  };

  /* ------------------------------------------------------------ flats */
  for (const f of FLATS) {
    const target = (f.h ?? sampleNat(f.x, f.z)) + (f.dh || 0);
    const R = f.r + f.fall;
    box(f.x - R, f.z - R, f.x + R, f.z + R, (k, x, z) => {
      const d = Math.hypot(x - f.x, z - f.z) + fbm(x / 14, z / 14, 2, 3) * 4;
      const w = 1 - smooth(f.r, R, d);
      if (w > 0) H[k] = lerp(H[k], target + fbm(x / 20, z / 20, 2, 9) * 0.35, w);
    });
  }
  /* ------------------------------------------------------------ lakes */
  const lakes = LAKES.map((L) => {
    const surf = sampleNat(L.x, L.z) - 0.4;
    // flatten surroundings a little so the shore is continuous
    const R = L.r + 14;
    box(L.x - R, L.z - R, L.x + R, L.z + R, (k, x, z) => {
      const d = Math.hypot(x - L.x, z - L.z) + fbm(x / 10, z / 10, 2, 13) * 3;
      if (d < L.r) {
        const bed = surf - L.depth * (1 - (d / L.r) ** 2) - 0.15;
        H[k] = Math.min(H[k], bed);
        water[k] = surf;
      } else {
        const w = 1 - smooth(L.r, R, d);
        H[k] = lerp(H[k], Math.max(surf + 0.25, Math.min(H[k], surf + 3)), w);
      }
      if (d < L.r + 5) M.wet[k] = Math.max(M.wet[k], 255 * (1 - smooth(L.r - 2, L.r + 5, d)));
    });
    return { ...L, surf };
  });

  /* ------------------------------------------------------------ roads */
  const roadBest = new Float32Array(N * N).fill(1e9);
  const roadTarget = new Float32Array(N * N);
  const roadHW = new Float32Array(N * N);
  const roadSide = new Float32Array(N * N);
  const roads = [];
  for (const R of ROADS) {
    const pts = smoothPath(R.pts, 3);
    const pinned = R.pts.some((p) => p[2] != null);
    // heights along the road
    let hs = pts.map((p) => (p[2] != null && !Number.isNaN(p[2]) ? p[2] : H[idx(Math.round(toI(p[0])), Math.round(toI(p[1])))]));
    if (pinned) {
      // control points carry a height (pinned, or the land under them);
      // the road interpolates between them so it climbs evenly
      const anchor = R.pts.map((p) => (p[2] != null ? p[2] : H[idx(Math.round(toI(p[0])), Math.round(toI(p[1])))]));
      hs = pts.map((p) => lerp(anchor[p[3]], anchor[Math.min(anchor.length - 1, p[3] + 1)], p[4]));
    }
    // smooth the profile (moving average) so the road never steps
    for (let pass = 0; pass < 3; pass++) {
      const o = hs.slice();
      for (let i = 1; i < hs.length - 1; i++) o[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
      hs = o;
    }
    const hw = R.w / 2;
    const side = pinned ? 13 : 7;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s];
      const [bx, bz] = pts[s + 1];
      const m = hw + side;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      box(Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m, (k, x, z) => {
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = clamp(t, 0, 1);
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d < roadBest[k]) {
          roadBest[k] = d;
          roadTarget[k] = lerp(hs[s], hs[s + 1], t);
          roadHW[k] = hw;
          roadSide[k] = side;
          M.road[k] = Math.max(M.road[k], Math.round(255 * (1 - smooth(hw - 0.6, hw + 1.4 + fbm(x / 3, z / 3, 2, 5) * 0.8, d))));
        } else M.road[k] = Math.max(M.road[k], Math.round(255 * (1 - smooth(hw - 0.6, hw + 1.4, d))));
      });
    }
    roads.push({ id: R.id, w: R.w, pts: pts.map((p, i) => [p[0], p[1], hs[i]]), pinned });
  }
  for (let k = 0; k < N * N; k++) {
    if (roadBest[k] > 1e8) continue;
    const hw = roadHW[k];
    const side = roadSide[k];
    const w = 1 - smooth(hw, hw + side, roadBest[k]);
    if (w > 0) H[k] = lerp(H[k], roadTarget[k], w);
  }

  /* ------------------------------------------------------------ river */
  const rpts = smoothPath(RIVER.pts, 4);
  let rs = rpts.map((p) => {
    // the lowest land around the point, so the water never floats
    let lo = Infinity;
    for (let a = 0; a < 6; a++) lo = Math.min(lo, H[idx(Math.round(toI(p[0] + Math.cos(a) * 3)), Math.round(toI(p[1] + Math.sin(a) * 3)))]);
    return lo - 0.75;
  });
  for (let i = 1; i < rs.length; i++) rs[i] = Math.min(rs[i], rs[i - 1] - 0.01);
  for (let pass = 0; pass < 4; pass++) {
    const o = rs.slice();
    for (let i = 1; i < rs.length - 1; i++) o[i] = Math.min(rs[i - 1], (rs[i - 1] + rs[i] + rs[i + 1]) / 3);
    rs = o;
  }
  const rw = RIVER.w / 2;
  const rBest = new Float32Array(N * N).fill(1e9);
  for (let s = 0; s < rpts.length - 1; s++) {
    const [ax, az] = rpts[s];
    const [bx, bz] = rpts[s + 1];
    const m = rw + 9;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    box(Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m, (k, x, z) => {
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = clamp(t, 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d >= rBest[k]) return;
      rBest[k] = d;
      const surf = lerp(rs[s], rs[s + 1], t);
      const wv = rw + fbm(x / 12, z / 12, 2, 31) * 1.6;
      if (d < wv) {
        const bed = surf - 0.92 * (1 - (d / wv) ** 2) - 0.12;
        H[k] = Math.min(H[k], bed);
        water[k] = surf;
      } else {
        const w = 1 - smooth(wv, wv + 8, d);
        H[k] = Math.min(H[k], lerp(H[k], surf + 0.35, w));
        if (d < wv + 1.5) water[k] = surf;
      }
      M.wet[k] = Math.max(M.wet[k], Math.round(255 * (1 - smooth(wv - 1, wv + 5, d))));
    });
  }
  const river = { w: RIVER.w, pts: rpts.map((p, i) => [p[0], p[1], rs[i]]) };

  /* ------------------------------------------------------------ masks */
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = idx(i, j);
      const x = wx(i);
      const z = wx(j);
      const h = H[k];
      const sn = smooth(-150, -215, z + fbm(x / 40, z / 40, 3, 101) * 26) + smooth(48, 75, h + fbm(x / 30, z / 30, 2, 5) * 8) * 0.9;
      M.snow[k] = Math.round(255 * clamp(sn, 0, 1));
      const ashA = 1 - smooth(70, 120, Math.hypot(x - 300, z - 20) + fbm(x / 25, z / 25, 3, 55) * 22);
      const ashB = (1 - smooth(150, 220, Math.hypot(x - 312, z + 250))) * 0.85;
      const ashV = clamp(Math.max(ashA, ashB), 0, 1);
      if (ashB > 0.45) M.snow[k] = Math.round(M.snow[k] * clamp(1 - (ashB - 0.45) * 3, 0, 1));
      M.ash[k] = Math.round(255 * clamp(ashV * (1 - M.snow[k] / 400), 0, 1));
      const forestW = smooth(-95, -175, x + fbm(x / 60, z / 60, 3, 71) * 50);
      const groves = smooth(0.18, 0.42, fbm(x / 70, z / 70, 3, 19)) * 0.75;
      M.forest[k] = Math.round(255 * clamp(Math.max(forestW, groves), 0, 1));
      // crop fields south & west of Thornwick
      const fz = z - 240;
      const fx = x + 2;
      const inField = fz > -20 && fz < 22 && fx > -52 && fx < 60 && !(fx > 40 && fz < -6);
      M.field[k] = inField ? 255 : 0;
    }
  // settlements and roads carve the forest out
  for (let k = 0; k < N * N; k++) if (M.road[k] > 0 || M.wet[k] > 120) M.forest[k] = Math.min(M.forest[k], 255 - Math.max(M.road[k], M.wet[k]));
  for (const f of FLATS) {
    const R = f.r + 6;
    box(f.x - R, f.z - R, f.x + R, f.z + R, (k, x, z) => {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < R) M.forest[k] = Math.round(M.forest[k] * smooth(f.r * 0.6, R, d));
    });
  }

  /* ------------------------------------------------------------ sampling */
  const bil = (A, x, z) => {
    const fi = clamp(toI(x), 0, N - 1.001);
    const fj = clamp(toI(z), 0, N - 1.001);
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const u = fi - i;
    const v = fj - j;
    const a = A[idx(i, j)];
    const b = A[idx(i + 1, j)];
    const c = A[idx(i, j + 1)];
    const d = A[idx(i + 1, j + 1)];
    // match the mesh triangulation (diagonal from (i+1,j) to (i,j+1))
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const T = {
    N,
    cell,
    half,
    H,
    water,
    masks: M,
    roads,
    river,
    lakes,
    idx,
    toI,
    wx,
    /** Ground height of the heightfield (interiors handled by the collision world). */
    height(x, z) {
      if (x > INTERIOR_X) return 0;
      return bil(H, x, z);
    },
    /** Water surface at (x,z), or -Infinity. */
    waterAt(x, z) {
      if (x > INTERIOR_X) return -Infinity;
      const fi = Math.round(toI(x));
      const fj = Math.round(toI(z));
      if (fi < 0 || fj < 0 || fi >= N || fj >= N) return -Infinity;
      const w = water[idx(fi, fj)];
      return w < -1e8 ? -Infinity : w;
    },
    /** Surface gradient magnitude (rise per metre). */
    slope(x, z) {
      const e = 0.8;
      const dx = (bil(H, x + e, z) - bil(H, x - e, z)) / (2 * e);
      const dz = (bil(H, x, z + e) - bil(H, x, z - e)) / (2 * e);
      return Math.hypot(dx, dz);
    },
    normal(x, z, out = { x: 0, y: 1, z: 0 }) {
      const e = 1;
      const dx = (bil(H, x + e, z) - bil(H, x - e, z)) / (2 * e);
      const dz = (bil(H, x, z + e) - bil(H, x, z - e)) / (2 * e);
      const l = Math.hypot(dx, 1, dz);
      out.x = -dx / l;
      out.y = 1 / l;
      out.z = -dz / l;
      return out;
    },
    mask(name, x, z) {
      const fi = Math.round(toI(x));
      const fj = Math.round(toI(z));
      if (fi < 0 || fj < 0 || fi >= N || fj >= N) return 0;
      return M[name][idx(fi, fj)] / 255;
    },
  };
  CACHE = T;
  return T;
}
