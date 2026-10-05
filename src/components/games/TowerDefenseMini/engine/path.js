/**
 * Tower Defense Mini — enemy roads.
 *
 * A road is authored as waypoints; every interior corner is rounded with a
 * quadratic fillet and the result is resampled at a FIXED arc-length step.
 * Enemies only ever store "distance travelled" and look their position up by
 * index, so they cannot leave the road, skip a corner, teleport or walk
 * backwards — distance only grows.
 */
export const PATH_STEP = 0.05;
const FILLET = 1.7;

function dense(wps) {
  const out = [[wps[0][0], wps[0][1]]];
  for (let i = 1; i < wps.length - 1; i++) {
    const [ax, az] = wps[i - 1];
    const [bx, bz] = wps[i];
    const [cx, cz] = wps[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az);
    const l2 = Math.hypot(cx - bx, cz - bz);
    const r = Math.min(FILLET, l1 * 0.45, l2 * 0.45);
    const p0 = [bx + ((ax - bx) / l1) * r, bz + ((az - bz) / l1) * r];
    const p2 = [bx + ((cx - bx) / l2) * r, bz + ((cz - bz) / l2) * r];
    out.push(p0);
    const N = 14;
    for (let k = 1; k < N; k++) {
      const t = k / N;
      const u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * bz + t * t * p2[1]]);
    }
    out.push(p2);
  }
  const L = wps[wps.length - 1];
  out.push([L[0], L[1]]);
  return out;
}

export function buildPath(waypoints) {
  const d = dense(waypoints);
  const cum = [0];
  for (let i = 1; i < d.length; i++) cum.push(cum[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
  const len = cum[cum.length - 1];
  const n = Math.floor(len / PATH_STEP) + 1;
  const xs = new Float32Array(n + 1);
  const zs = new Float32Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(len, i * PATH_STEP);
    while (j < d.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (s - cum[j]) / seg;
    xs[i] = d[j][0] + (d[j + 1][0] - d[j][0]) * t;
    zs[i] = d[j][1] + (d[j + 1][1] - d[j][1]) * t;
  }
  return { waypoints, dense: d, len, n, xs, zs };
}

/** Position + unit tangent at distance `s` (clamped to the road). */
export function samplePath(p, s, out) {
  const f = Math.max(0, Math.min(p.len, s)) / PATH_STEP;
  const i = Math.min(p.n - 1, Math.floor(f));
  const t = f - i;
  const x0 = p.xs[i];
  const z0 = p.zs[i];
  const x1 = p.xs[i + 1];
  const z1 = p.zs[i + 1];
  out.x = x0 + (x1 - x0) * t;
  out.z = z0 + (z1 - z0) * t;
  // tangent over a short window so corners turn smoothly
  const a = Math.max(0, i - 4);
  const b = Math.min(p.n, i + 5);
  let tx = p.xs[b] - p.xs[a];
  let tz = p.zs[b] - p.zs[a];
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l;
  out.tz = tz / l;
  return out;
}

/** Shortest distance from (x, z) to the road centreline. */
export function distToPath(p, x, z) {
  let best = Infinity;
  const d = p.dense;
  for (let i = 0; i < d.length - 1; i++) {
    const [ax, az] = d[i];
    const [bx, bz] = d[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const dx = ax + vx * t - x;
    const dz = az + vz * t - z;
    const dd = dx * dx + dz * dz;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
}

/** Length of road (in units) within `r` of (x, z) — how much a tower covers. */
export function coverage(p, x, z, r) {
  let n = 0;
  const r2 = r * r;
  for (let i = 0; i <= p.n; i += 4) {
    const dx = p.xs[i] - x;
    const dz = p.zs[i] - z;
    if (dx * dx + dz * dz <= r2) n++;
  }
  return n * PATH_STEP * 4;
}
