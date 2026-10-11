/**
 * Alpine Rush — the mountain around a course, as a heightfield grid.
 * Pure (Node-testable); the meshes, tree scatter and camera all sample it.
 *
 *   1. every grid cell finds its nearest piste sample
 *   2. cells on the band (out to the net + a flat buffer on net sides, to the
 *      edge on cliff sides) are LOCKED at the piste height — so the snow
 *      under a skier is exactly the physics ground
 *   3. low SEEDS: below cliff edges and under bridges (a frozen creek)
 *   4. a two-pass chamfer distance transform fills everything else with
 *      min(neighbour + slope·distance): banks rising from the piste,
 *      continuous everywhere, cliffs where a seed meets a locked band
 *   5. drifts and far-off ridges, scaled up with distance from the piste
 */
import { NET_MARGIN, DROP_MARGIN, BUFFER, rollerLift } from "./course.js";
import { fbm, ridged, smoothstep, clamp } from "./rng.js";

const SLOPE = 0.55;
const PAD = 190;

export function buildTerrain(T, opts = {}) {
  const cell = opts.cell ?? 3.5;
  const noiseSeed = T.def.seed || 1;
  const S = T.samples;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of S) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const x0 = minX - PAD;
  const z0 = minZ - PAD;
  const nx = Math.ceil((maxX - minX + PAD * 2) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ + PAD * 2) / cell) + 1;
  const n = nx * nz;
  const H = new Float32Array(n).fill(1e9);
  const lock = new Uint8Array(n);
  const D = new Float32Array(n).fill(1e9);
  const near = new Int32Array(n).fill(-1);
  const nearD = new Float32Array(n).fill(1e9);
  const R = 70;
  const rc = Math.ceil(R / cell);

  // 1. nearest sample per cell
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const cx = Math.round((p.x - x0) / cell);
    const cz = Math.round((p.z - z0) / cell);
    for (let dz = -rc; dz <= rc; dz++) {
      const iz = cz + dz;
      if (iz < 0 || iz >= nz) continue;
      for (let dx = -rc; dx <= rc; dx++) {
        const ix = cx + dx;
        if (ix < 0 || ix >= nx) continue;
        const k = iz * nx + ix;
        const d2 = (x0 + ix * cell - p.x) ** 2 + (z0 + iz * cell - p.z) ** 2;
        if (d2 < nearD[k]) {
          nearD[k] = d2;
          near[k] = i;
        }
      }
    }
  }

  // 2–3. locks and seeds
  const bridges = T.feats.filter((f) => f.type === "bridge");
  const rollers = T.feats.filter((f) => f.type === "roller");
  const liftAt = (s) => {
    let l = 0;
    for (const r of rollers) l = Math.max(l, rollerLift(r, s));
    return l;
  };
  const seed = (k, v) => {
    if (!lock[k] && v < H[k]) H[k] = v;
  };
  for (let k = 0; k < n; k++) {
    const i = near[k];
    if (i < 0) continue;
    const px = x0 + (k % nx) * cell;
    const pz = z0 + Math.floor(k / nx) * cell;
    const p = S[i];
    const dx = px - p.x;
    const dz = pz - p.z;
    const along = dx * p.tx + dz * p.tz;
    const lat = dx * p.nx + dz * p.nz;
    const al = Math.abs(lat);
    if ((i === 0 && along < -1) || (i === S.length - 1 && along > 1)) continue;
    const drop = lat >= 0 ? p.dropL : p.dropR;
    const ext = drop ? p.w + DROP_MARGIN + 0.4 : p.w + NET_MARGIN + BUFFER;
    const s = p.s + along;
    const y = p.y + along * -p.grade + (rollers.length ? liftAt(s) : 0);
    const br = bridges.find((g) => s > g.s0 + 3 && s < g.s1 - 3);
    if (br) {
      if (al < 80) seed(k, y - 18 - al * 0.05);
      continue;
    }
    if (al <= ext) {
      lock[k] = 1;
      H[k] = y;
    } else if (drop && al < p.w + 60) {
      seed(k, y - 26 - (al - p.w) * 0.2);
    }
  }
  for (let k = 0; k < n; k++) if (lock[k]) D[k] = 0;

  // 4. chamfer passes (heights and distance-to-band)
  const d1 = cell;
  const d2 = cell * Math.SQRT2;
  const fwd = [
    [-1, 0, d1],
    [0, -1, d1],
    [-1, -1, d2],
    [1, -1, d2],
  ];
  const bwd = [
    [1, 0, d1],
    [0, 1, d1],
    [1, 1, d2],
    [-1, 1, d2],
  ];
  function relax(ix, iz, nbs) {
    const k = iz * nx + ix;
    let h = H[k];
    let d = D[k];
    for (const [ox, oz, w] of nbs) {
      const jx = ix + ox;
      const jz = iz + oz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jz * nx + jx;
      if (!lock[k]) {
        const v = H[j] + SLOPE * w;
        if (v < h) h = v;
      }
      const dv = D[j] + w;
      if (dv < d) d = dv;
    }
    H[k] = h;
    D[k] = d;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) relax(ix, iz, fwd);
    for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) relax(ix, iz, bwd);
  }

  // 5. snow drifts + ridges, growing with distance from the piste
  const rough = T.def.terrainRough ?? 1;
  for (let k = 0; k < n; k++) {
    if (lock[k]) continue;
    const px = x0 + (k % nx) * cell;
    const pz = z0 + Math.floor(k / nx) * cell;
    const far = D[k];
    const a = smoothstep(4, 60, far);
    H[k] += (fbm(px / 70, pz / 70, noiseSeed) - 0.45) * 18 * a * rough;
    H[k] += ridged(px / 240, pz / 240, noiseSeed + 9) * 110 * smoothstep(45, 180, far) * rough;
  }

  const idx = (ix, iz) => clamp(iz, 0, nz - 1) * nx + clamp(ix, 0, nx - 1);
  function heightAt(x, z) {
    const fx = (x - x0) / cell;
    const fz = (z - z0) / cell;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = H[idx(ix, iz)];
    const b = H[idx(ix + 1, iz)];
    const c = H[idx(ix, iz + 1)];
    const d = H[idx(ix + 1, iz + 1)];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  function distAt(x, z) {
    return D[idx(Math.round((x - x0) / cell), Math.round((z - z0) / cell))];
  }
  let minY = Infinity;
  for (let i = 0; i < H.length; i += 7) if (H[i] < minY) minY = H[i];
  return { x0, z0, cell, nx, nz, H, D, lock, heightAt, distAt, minY, bounds: { minX, maxX, minZ, maxZ } };
}

/**
 * Terrain checks: the visible snow on every piste sample matches the physics
 * ground (no skier floating or sinking), and nothing is unfilled.
 */
export function validateTerrain(T, G) {
  const issues = [];
  let bad = 0;
  let worst = 0;
  const S = T.samples;
  const skip = (s) => T.feats.some((f) => f.type === "bridge" && s > f.s0 - 3 && s < f.s1 + 3);
  const nearCliff = (i) => {
    for (let k = -7; k <= 7; k++) {
      const q = S[Math.max(0, Math.min(S.length - 1, i + k))];
      if (q.dropL || q.dropR) return true;
    }
    return false;
  };
  for (const p of S) {
    if (skip(p.s) || p.s < 3 || p.s > T.length - 3 || nearCliff(p.i)) continue;
    for (const lat of [0, p.w * 0.9, -p.w * 0.9]) {
      const x = p.x + p.nx * lat;
      const z = p.z + p.nz * lat;
      let lift = 0;
      for (const f of T.featAt[p.i]) if (f.type === "roller") lift = Math.max(lift, rollerLift(f, p.s));
      const d = Math.abs(G.heightAt(x, z) - p.y - lift);
      worst = Math.max(worst, d);
      if (d > 0.4) bad++;
    }
  }
  if (bad > 0) issues.push(`terrain off the piste height at ${bad} points (worst ${worst.toFixed(2)} m)`);
  for (let i = 0; i < G.H.length; i += 13)
    if (!Number.isFinite(G.H[i]) || G.H[i] > 1e8) {
      issues.push("terrain has unfilled cells");
      break;
    }
  return issues;
}
