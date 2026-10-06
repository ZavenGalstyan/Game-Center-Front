/**
 * Lost Toy — collision world.
 *
 * Every solid thing the toy can touch is an axis-aligned box. The visible
 * furniture can be as detailed as it likes; gameplay collides with these
 * boxes only, which keeps the controller stable and predictable. Every box
 * is produced by the same kit call that produces the furniture's mesh
 * (data/kit.js), so visuals and collision cannot drift apart.
 *
 *   box = { id, min:[x,y,z], max:[x,y,z], solid, dynamic, active,
 *           mat (footstep material), bounce (launch speed, 0 = none),
 *           climb (climbable faces), slip (low grip), conveyor:[vx,vz],
 *           noLedge, noCamera, camOnly (blocks the camera only), vel:[x,y,z] }
 *
 * Static boxes live in a uniform XZ grid; dynamic boxes (movers, pushables)
 * are few and always tested. Queries never allocate in the hot path: results
 * go into a reused array and duplicates are skipped with a stamp.
 */
const CELL = 4;
const KEY_OFF = 2048;
const cellKey = (ix, iz) => (ix + KEY_OFF) * 8192 + (iz + KEY_OFF);

export function createColliders() {
  return { statics: [], dynamics: [], all: [], grid: new Map(), stamp: 1, out: [], nextId: 1 };
}

export function addBox(C, box) {
  const b = {
    id: C.nextId++,
    solid: true,
    dynamic: false,
    active: true,
    noLedge: false,
    noCamera: false,
    camOnly: false,
    climb: false,
    slip: false,
    bounce: 0,
    conveyor: null,
    mat: "wood",
    kind: "static",
    vel: [0, 0, 0],
    _q: 0,
    ...box,
  };
  b.min = box.min.slice();
  b.max = box.max.slice();
  if (b.camOnly) b.solid = false;
  C.all.push(b);
  if (b.dynamic) {
    C.dynamics.push(b);
  } else {
    C.statics.push(b);
    const x0 = Math.floor(b.min[0] / CELL);
    const x1 = Math.floor(b.max[0] / CELL);
    const z0 = Math.floor(b.min[2] / CELL);
    const z1 = Math.floor(b.max[2] / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = cellKey(ix, iz);
        let arr = C.grid.get(k);
        if (!arr) C.grid.set(k, (arr = []));
        arr.push(b);
      }
    }
  }
  return b;
}

/** Boxes whose XZ footprint touches the rectangle [x0,x1]×[z0,z1]. Reused output array. */
export function queryRect(C, x0, z0, x1, z1) {
  const out = C.out;
  out.length = 0;
  const s = ++C.stamp;
  const ix0 = Math.floor(x0 / CELL);
  const ix1 = Math.floor(x1 / CELL);
  const iz0 = Math.floor(z0 / CELL);
  const iz1 = Math.floor(z1 / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const arr = C.grid.get(cellKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (b._q === s) continue;
        b._q = s;
        if (b.max[0] < x0 || b.min[0] > x1 || b.max[2] < z0 || b.min[2] > z1) continue;
        out.push(b);
      }
    }
  }
  for (let i = 0; i < C.dynamics.length; i++) {
    const b = C.dynamics[i];
    if (!b.active) continue;
    if (b.max[0] < x0 || b.min[0] > x1 || b.max[2] < z0 || b.min[2] > z1) continue;
    out.push(b);
  }
  return out;
}

/** squared distance from (x,z) to the box's XZ rectangle, plus the closest point */
export function rectClosest(b, x, z, out) {
  const cx = x < b.min[0] ? b.min[0] : x > b.max[0] ? b.max[0] : x;
  const cz = z < b.min[2] ? b.min[2] : z > b.max[2] ? b.max[2] : z;
  out[0] = cx;
  out[1] = cz;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz;
}

const tmp2 = [0, 0];

/** Does a vertical cylinder (feet y, height h, radius r) overlap any solid box? */
export function cylinderBlocked(C, x, y, z, r, h, ignore = null, eps = 0.01) {
  const list = queryRect(C, x - r, z - r, x + r, z + r);
  const rr = (r - eps) * (r - eps);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.solid || b === ignore) continue;
    if (b.max[1] <= y + eps || b.min[1] >= y + h - eps) continue;
    if (rectClosest(b, x, z, tmp2) < rr) return b;
  }
  return null;
}

/** Highest solid top under the circle within [y - down, y + up]; null if none. */
export function groundBelow(C, x, y, z, r, down, up = 0.05, ignore = null) {
  const list = queryRect(C, x - r, z - r, x + r, z + r);
  const rr = r * r;
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.solid || b === ignore) continue;
    const top = b.max[1];
    if (top > y + up || top < y - down) continue;
    if (rectClosest(b, x, z, tmp2) >= rr) continue;
    if (!best || top > best.max[1]) best = b;
  }
  return best;
}

/**
 * Segment vs boxes (slab test), boxes inflated by `pad`. Returns the nearest
 * hit distance along the segment or `len` if clear. Used by the camera boom
 * (solid + camera-only boxes) and by line-of-sight checks (suction, pets).
 */
export function raycast(C, ox, oy, oz, dx, dy, dz, len, pad = 0, forCamera = true) {
  const ex = ox + dx * len;
  const ez = oz + dz * len;
  const list = queryRect(C, Math.min(ox, ex) - pad, Math.min(oz, ez) - pad, Math.max(ox, ex) + pad, Math.max(oz, ez) + pad);
  let best = len;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (forCamera) {
      if (!(b.solid || b.camOnly) || b.noCamera) continue;
    } else if (!b.solid) continue;
    let t0 = 0;
    let t1 = best;
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = b.min[a] - pad;
      const hi = b.max[a] + pad;
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) ok = false;
      } else {
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) {
          const t = ta;
          ta = tb;
          tb = t;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

/** Is a point strictly inside any solid (or camera-blocking) box (with margin)? */
export function pointInside(C, x, y, z, m = 0, forCamera = false) {
  const list = queryRect(C, x - m, z - m, x + m, z + m);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (forCamera ? !(b.solid || b.camOnly) || b.noCamera : !b.solid) continue;
    if (x > b.min[0] - m && x < b.max[0] + m && y > b.min[1] - m && y < b.max[1] + m && z > b.min[2] - m && z < b.max[2] + m) return b;
  }
  return null;
}

/** Clear line between two points (solid boxes only)? */
export function lineClear(C, ax, ay, az, bx, by, bz, ignore = null) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const ex = ax + dx;
  const ez = az + dz;
  const list = queryRect(C, Math.min(ax, ex), Math.min(az, ez), Math.max(ax, ex), Math.max(az, ez));
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.solid || b === ignore || b.dynamic) continue;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? ax : a === 1 ? ay : az;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      if (Math.abs(d) < 1e-9) {
        if (o <= b.min[a] || o >= b.max[a]) ok = false;
      } else {
        let ta = (b.min[a] - o) / d;
        let tb = (b.max[a] - o) / d;
        if (ta > tb) {
          const t = ta;
          ta = tb;
          tb = t;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 >= t1) ok = false;
      }
    }
    if (ok) return false;
  }
  return true;
}
