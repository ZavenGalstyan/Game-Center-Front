/**
 * Mario Adventure 3D — collision solids.
 *
 * Every platform, block, pipe, wall, tree trunk … is one of two shapes:
 *   box  centre (x,y,z), half extents (hx,hy,hz), optional yaw (rotates
 *        around Y — rotating bars, tilted ruins)
 *   cyl  vertical cylinder: centre (x,y,z), radius r, half height hy
 *
 * Dynamic solids (movers, spinners, fallers …) are updated in place by their
 * platform entity each step and record their motion in (dx,dy,dz,dyaw) so a
 * rider can be carried exactly. The ground itself is the analytic terrain
 * (terrain.js) and is handled by the player / enemy movers, not here.
 *
 * Levels have at most a few hundred solids, so queries scan the list with a
 * cheap bounding-circle reject; nothing allocates in the hot path.
 */
export function createSolids() {
  return { list: [], nextId: 1 };
}

export function addSolid(C, s) {
  const b = {
    id: C.nextId++,
    shape: "box",
    x: 0,
    y: 0,
    z: 0,
    hx: 0.5,
    hy: 0.5,
    hz: 0.5,
    r: 0.5,
    yaw: 0,
    active: true,
    oneWay: false,
    surf: "stone",
    bounce: 0,
    hurt: false,
    camIgnore: false,
    owner: null,
    dx: 0,
    dy: 0,
    dz: 0,
    dyaw: 0,
    ...s,
  };
  setYaw(b, b.yaw);
  C.list.push(b);
  return b;
}

export function setYaw(b, yaw) {
  b.yaw = yaw;
  b.c = Math.cos(yaw);
  b.s = Math.sin(yaw);
  b.br = b.shape === "cyl" ? b.r : Math.hypot(b.hx, b.hz);
}

/** squared XZ distance from (x,z) to the solid's footprint (0 when inside) */
export function footDist2(b, x, z) {
  const dx = x - b.x;
  const dz = z - b.z;
  if (b.shape === "cyl") {
    const d = Math.sqrt(dx * dx + dz * dz) - b.r;
    return d > 0 ? d * d : 0;
  }
  const lx = dx * b.c + dz * b.s;
  const lz = -dx * b.s + dz * b.c;
  const ex = Math.abs(lx) - b.hx;
  const ez = Math.abs(lz) - b.hz;
  const ox = ex > 0 ? ex : 0;
  const oz = ez > 0 ? ez : 0;
  return ox * ox + oz * oz;
}

const near = (b, x, z, m) => {
  const dx = x - b.x;
  const dz = z - b.z;
  const R = b.br + m;
  return dx * dx + dz * dz <= R * R;
};

/**
 * Highest solid top within [yLo, yHi] under a foot circle of radius `r`.
 * One-way (jump-through) tops only count when `prevFeet` was at/above them.
 */
export function groundAt(C, x, z, r, yLo, yHi, prevFeet = Infinity, out = null) {
  let best = -Infinity;
  let bs = null;
  const rr = r * r;
  const L = C.list;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!b.active || !near(b, x, z, r)) continue;
    const top = b.y + b.hy;
    if (top < yLo || top > yHi || top <= best) continue;
    if (b.oneWay && prevFeet < top - 0.12) continue;
    if (footDist2(b, x, z) > rr) continue;
    best = top;
    bs = b;
  }
  if (out) {
    out.y = best;
    out.solid = bs;
  }
  return bs ? best : -Infinity;
}

/**
 * Pushes a vertical cylinder (feet y, height h, radius r) out of every solid
 * whose body overlaps its band above the step height. Writes the corrected
 * position into res = {x, z, hit (solid|null), nx, nz}.
 */
export function pushOut(C, x, z, y, r, h, stepUp, res) {
  res.hit = null;
  res.nx = 0;
  res.nz = 0;
  const L = C.list;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (!b.active || b.oneWay || !near(b, x, z, r)) continue;
      const top = b.y + b.hy;
      const bot = b.y - b.hy;
      if (top <= y + stepUp || bot >= y + h) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (b.shape === "cyl") {
        const d = Math.sqrt(dx * dx + dz * dz);
        const need = b.r + r;
        if (d >= need) continue;
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        x = b.x + nx * need;
        z = b.z + nz * need;
        res.hit = b;
        res.nx = nx;
        res.nz = nz;
        moved = true;
        continue;
      }
      const lx = dx * b.c + dz * b.s;
      const lz = -dx * b.s + dz * b.c;
      const cx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
      const cz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
      let ox = lx - cx;
      let oz = lz - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      let nlx;
      let nlz;
      let px;
      let pz;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        nlx = ox / d;
        nlz = oz / d;
        px = cx + nlx * r;
        pz = cz + nlz * r;
      } else {
        // centre inside the footprint: leave through the nearest face
        const fx = b.hx - Math.abs(lx);
        const fz = b.hz - Math.abs(lz);
        if (fx < fz) {
          nlx = lx >= 0 ? 1 : -1;
          nlz = 0;
          px = nlx * (b.hx + r);
          pz = lz;
        } else {
          nlx = 0;
          nlz = lz >= 0 ? 1 : -1;
          px = lx;
          pz = nlz * (b.hz + r);
        }
      }
      x = b.x + px * b.c - pz * b.s;
      z = b.z + px * b.s + pz * b.c;
      res.nx = nlx * b.c - nlz * b.s;
      res.nz = nlx * b.s + nlz * b.c;
      res.hit = b;
      moved = true;
    }
    if (!moved) break;
  }
  res.x = x;
  res.z = z;
  return res;
}

/** lowest solid bottom between the head's old and new height (null if clear) */
export function ceilingAt(C, x, z, r, headPrev, headNow) {
  let best = null;
  const rr = r * r;
  const L = C.list;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    // hidden ? blocks are inactive until bonked — but bonkable from below
    if ((!b.active && !b.reveal) || b.oneWay || !near(b, x, z, r)) continue;
    const bot = b.y - b.hy;
    if (bot < headPrev - 0.05 || bot > headNow) continue;
    if (footDist2(b, x, z) > rr) continue;
    if (!best || bot < best.y - best.hy) best = b;
  }
  return best;
}

/** Is the point inside any solid (with margin m)? */
export function pointInSolid(C, x, y, z, m = 0) {
  const L = C.list;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!b.active || b.camIgnore || !near(b, x, z, m)) continue;
    if (y < b.y - b.hy - m || y > b.y + b.hy + m) continue;
    if (footDist2(b, x, z) <= m * m) return b;
  }
  return null;
}

/**
 * Segment vs solids (boxes in their own yaw frame, cylinders as boxes),
 * inflated by `pad`. Nearest hit distance along the ray, or `len` if clear.
 */
export function raycast(C, ox, oy, oz, dx, dy, dz, len, pad = 0) {
  let best = len;
  const L = C.list;
  const mx = ox + dx * len * 0.5;
  const mz = oz + dz * len * 0.5;
  const half = len * 0.5 + pad;
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (!b.active || b.camIgnore || !near(b, mx, mz, half)) continue;
    let lox;
    let loz;
    let ldx;
    let ldz;
    let ex;
    let ez;
    if (b.shape === "cyl") {
      lox = ox - b.x;
      loz = oz - b.z;
      ldx = dx;
      ldz = dz;
      ex = b.r * 0.85 + pad;
      ez = ex;
    } else {
      const rx = ox - b.x;
      const rz = oz - b.z;
      lox = rx * b.c + rz * b.s;
      loz = -rx * b.s + rz * b.c;
      ldx = dx * b.c + dz * b.s;
      ldz = -dx * b.s + dz * b.c;
      ex = b.hx + pad;
      ez = b.hz + pad;
    }
    const loy = oy - b.y;
    const ey = b.hy + pad;
    let t0 = 0;
    let t1 = best;
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? lox : a === 1 ? loy : loz;
      const d = a === 0 ? ldx : a === 1 ? dy : ldz;
      const e = a === 0 ? ex : a === 1 ? ey : ez;
      if (Math.abs(d) < 1e-9) {
        if (o < -e || o > e) ok = false;
      } else {
        let ta = (-e - o) / d;
        let tb = (e - o) / d;
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
