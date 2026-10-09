/**
 * Downhill Riders — the mountain around a trail, as a heightfield grid.
 * Pure (Node-testable); the meshes, tree scatter and camera all sample it.
 *
 *   1. every grid cell finds its nearest trail sample (main + shortcut)
 *   2. cells on a band (out to the barrier + a flat buffer on wall sides,
 *      to the edge on drop sides) are LOCKED at the trail height — so the
 *      ground under a rider is exactly the physics ground
 *   3. low SEEDS: below drop edges (cliffs), under bridges (ravines) and
 *      along gap rivers
 *   4. a two-pass chamfer distance transform fills everything else with
 *      min(neighbour + slope·distance): valley walls rising from the trail,
 *      continuous everywhere, cliffs where a seed meets a locked band
 *   5. noise and far-off ridges, scaled up with distance from the trail
 */
import { WALL_MARGIN, DROP_MARGIN, BUFFER } from "./trail.js";
import { fbm, ridged, smoothstep, clamp } from "./rng.js";

const SLOPE = 0.62;
const PAD = 170;

export function buildTerrain(T, opts = {}) {
  const cell = opts.cell ?? 3;
  const noiseSeed = T.def.seed || 1;
  const bands = [{ S: T.samples, main: true }];
  if (T.shortcut) bands.push({ S: T.shortcut.samples, main: false, sc: T.shortcut });
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of bands)
    for (const p of b.S) {
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
  const near = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
  const nearD = [new Float32Array(n).fill(1e9), new Float32Array(n).fill(1e9)];
  const R = 62;
  const rc = Math.ceil(R / cell);

  // 1. nearest sample per cell (rasterised from the samples)
  bands.forEach((b, bi) => {
    const NI = near[bi];
    const ND = nearD[bi];
    for (let i = 0; i < b.S.length; i++) {
      const p = b.S[i];
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
          if (d2 < ND[k]) {
            ND[k] = d2;
            NI[k] = i;
          }
        }
      }
    }
  });

  // 2–3. locks and seeds
  const gaps = T.feats.filter((f) => f.type === "gap");
  const bridges = T.feats.filter((f) => f.type === "bridge");
  const lockLat = new Float32Array(n).fill(1e9);
  const lockMain = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const px = x0 + (k % nx) * cell;
    const pz = z0 + Math.floor(k / nx) * cell;
    for (let bi = 0; bi < bands.length; bi++) {
      const i = near[bi][k];
      if (i < 0) continue;
      const b = bands[bi];
      const p = b.S[i];
      const dx = px - p.x;
      const dz = pz - p.z;
      const along = dx * p.tx + dz * p.tz;
      const lat = dx * p.nx + dz * p.nz;
      const al = Math.abs(lat);
      const atEnd = (i === 0 && along < -1) || (i === b.S.length - 1 && along > 1);
      if (atEnd) continue;
      const drop = lat >= 0 ? p.dropL : p.dropR;
      const ext = drop ? p.w + DROP_MARGIN + 0.4 : p.w + (b.main ? WALL_MARGIN : 0.6) + BUFFER;
      const s = p.s + along;
      const y = p.y + along * -p.grade;
      if (b.main) {
        const gap = gaps.find((g) => !g.onShort && s > g.s0 + 0.4 && s < g.s1 - 0.4);
        if (gap) {
          if (al < 75) seed(k, y - gap.depth - (al > ext ? (al - ext) * 0.05 : 0));
          continue;
        }
        const br = bridges.find((g) => s > g.s0 + 3 && s < g.s1 - 3);
        if (br) {
          if (al < 70) seed(k, y - (br.kind === "suspended" ? 34 : 16));
          continue;
        }
      } else if (b.sc.kind === "bridge" && p.dropL && p.dropR) {
        if (al < 40) seed(k, y - 16);
        continue;
      } else if (b.sc.feats.length) {
        const g = b.sc.feats.find((f) => f.type === "gap" && s > f.s0 - 0.6 && s < f.s1 + 0.6);
        if (g) {
          if (al < 30) seed(k, y - g.depth);
          continue;
        }
      }
      if (al <= ext) {
        // the main trail always wins a cell; the shortcut only claims ground off it
        if (!b.main && lock[k] === 1 && lockMain[k]) continue;
        if (al < lockLat[k] || (b.main && !lockMain[k])) {
          lockMain[k] = b.main ? 1 : 0;
          lockLat[k] = al;
          lock[k] = 1;
          H[k] = y;
        }
      } else if (drop && al < p.w + 52) {
        seed(k, y - 22 - (al - p.w) * 0.18);
      }
    }
  }
  function seed(k, v) {
    if (!lock[k] && v < H[k]) H[k] = v;
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
  for (let pass = 0; pass < 2; pass++) {
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) relax(ix, iz, fwd);
    for (let iz = nz - 1; iz >= 0; iz--)
      for (let ix = nx - 1; ix >= 0; ix--) relax(ix, iz, bwd);
  }
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

  // 5. noise + ridges, growing with distance from the trail
  for (let k = 0; k < n; k++) {
    if (lock[k]) continue;
    const px = x0 + (k % nx) * cell;
    const pz = z0 + Math.floor(k / nx) * cell;
    const far = D[k];
    const a = smoothstep(6, 70, far);
    H[k] += (fbm(px / 80, pz / 80, noiseSeed) - 0.45) * 22 * a;
    H[k] += ridged(px / 260, pz / 260, noiseSeed + 9) * 90 * smoothstep(50, 170, far);
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
  return { x0, z0, cell, nx, nz, H, D, lock, heightAt, distAt, minY: Math.min(...sampleMin(H)), bounds: { minX, maxX, minZ, maxZ } };
}

function sampleMin(H) {
  let m = Infinity;
  for (let i = 0; i < H.length; i += 7) if (H[i] < m) m = H[i];
  return [m];
}

/**
 * Terrain checks: the visible ground on every band sample matches the
 * physics ground (no rider floating or sinking), and nothing is unfilled.
 */
export function validateTerrain(T, G) {
  const issues = [];
  let bad = 0;
  let worst = 0;
  const skip = (s) => T.feats.some((f) => (f.type === "gap" || f.type === "bridge") && s > f.s0 - 3 && s < f.s1 + 3);
  // ledge ends: the cliff notches the ground under the ribbon edge (hidden, physics unaffected)
  const S = T.samples;
  const nearLedge = (i) => {
    for (let k = -6; k <= 6; k++) {
      const q = S[Math.max(0, Math.min(S.length - 1, i + k))];
      if (q.dropL || q.dropR) return true;
    }
    return false;
  };
  for (const p of T.samples) {
    if (skip(p.s) || p.s < 3 || p.s > T.length - 3 || nearLedge(p.i)) continue;
    // (drop sides dip under the ribbon edge into the cliff — not a mismatch)
    for (const lat of [0, p.dropL ? 0 : p.w * 0.9, p.dropR ? 0 : -p.w * 0.9]) {
      const x = p.x + p.nx * lat;
      const z = p.z + p.nz * lat;
      const d = Math.abs(G.heightAt(x, z) - p.y);
      worst = Math.max(worst, d);
      if (d > 0.35) bad++;
    }
  }
  if (bad > 0) issues.push(`terrain off the trail height at ${bad} points (worst ${worst.toFixed(2)} m)`);
  for (let i = 0; i < G.H.length; i += 13) if (!Number.isFinite(G.H[i]) || G.H[i] > 1e8) {
    issues.push("terrain has unfilled cells");
    break;
  }
  return issues;
}
