/**
 * Web Hero — collision world. Everything solid in the city is an axis-aligned
 * box (buildings, setbacks, rooftop units, containers, parked cars, bridge
 * decks …) bucketed into a 16 m xz grid. Queries:
 *
 *   floorAt      highest walkable top under a point (or the street, or water)
 *   pushOut      horizontal capsule push-out; reports the wall it touched
 *   raycast      first box hit along a ray (web anchors, camera, sight lines)
 *   faceAt       which vertical face of a box a point is against (climbing)
 */
const CELL = 16;
const key = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);

export function createWorldGeo({ groundY = 0, water = null } = {}) {
  return { cells: new Map(), boxes: [], groundY, water, stamp: 1 };
}

export function addBox(G, b) {
  b.id = G.boxes.length;
  b.seen = 0;
  if (b.climb === undefined) b.climb = b.y1 - b.y0 > 2.6;
  G.boxes.push(b);
  const ix0 = Math.floor(b.x0 / CELL);
  const ix1 = Math.floor(b.x1 / CELL);
  const iz0 = Math.floor(b.z0 / CELL);
  const iz1 = Math.floor(b.z1 / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const k = key(ix, iz);
      let c = G.cells.get(k);
      if (!c) G.cells.set(k, (c = []));
      c.push(b);
    }
  }
  return b;
}

function each(G, x0, z0, x1, z1, fn) {
  const st = ++G.stamp;
  const ix0 = Math.floor(x0 / CELL);
  const ix1 = Math.floor(x1 / CELL);
  const iz0 = Math.floor(z0 / CELL);
  const iz1 = Math.floor(z1 / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const c = G.cells.get(key(ix, iz));
      if (!c) continue;
      for (let k = 0; k < c.length; k++) {
        const b = c[k];
        if (b.seen === st) continue;
        b.seen = st;
        if (b.off) continue;
        if (fn(b) === false) return;
      }
    }
  }
}

/** is (x,z) over water (no street)? */
export function overWater(G, x, z) {
  const w = G.water;
  return !!w && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1;
}

/**
 * Highest top with yBot <= top <= yTop under (x,z) (point test with a small
 * footprint so you can stand right at a roof edge). out: {y, box}
 */
export function floorAt(G, x, z, yTop, yBot, out, foot = 0.18) {
  let best = -Infinity;
  let bb = null;
  each(G, x - foot, z - foot, x + foot, z + foot, (b) => {
    if (x < b.x0 - foot || x > b.x1 + foot || z < b.z0 - foot || z > b.z1 + foot) return;
    const t = b.y1;
    if (t <= yTop && t >= yBot && t > best) {
      best = t;
      bb = b;
    }
  });
  const gy = G.groundY;
  if (!overWater(G, x, z) && gy <= yTop && gy >= yBot && gy > best) {
    best = gy;
    bb = null;
  }
  if (best === -Infinity) return false;
  out.y = best;
  out.box = bb;
  return true;
}

/**
 * Push a vertical capsule (feet..head, radius r) out of boxes horizontally.
 * Boxes whose top is within stepUp of the feet are steps, not walls.
 * hit = { nx, nz, n, box, face }
 */
export function pushOut(G, p, r, feet, head, stepUp, hit) {
  hit.nx = 0;
  hit.nz = 0;
  hit.n = 0;
  hit.box = null;
  each(G, p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1, (b) => {
    if (feet >= b.y1 - stepUp || head <= b.y0) return;
    if (b.nocollide) return;
    // closest point on the box footprint
    const cx = Math.max(b.x0, Math.min(p.x, b.x1));
    const cz = Math.max(b.z0, Math.min(p.z, b.z1));
    let dx = p.x - cx;
    let dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    let nx;
    let nz;
    let pen;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      nz = dz / d;
      pen = r - d;
    } else {
      // centre inside the footprint: exit through the nearest face
      const ex = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
      let m = 0;
      for (let i = 1; i < 4; i++) if (ex[i] < ex[m]) m = i;
      nx = m === 0 ? -1 : m === 1 ? 1 : 0;
      nz = m === 2 ? -1 : m === 3 ? 1 : 0;
      pen = ex[m] + r;
    }
    p.x += nx * pen;
    p.z += nz * pen;
    hit.nx += nx;
    hit.nz += nz;
    hit.n++;
    if (!hit.box || b.y1 > hit.box.y1) hit.box = b;
    dx = 0;
  });
  return hit.n > 0;
}

/** box under/around a point for wall attachment: returns the face normal the point is against */
export function wallContact(G, x, y, z, r, out) {
  let found = false;
  let bestD = Infinity;
  each(G, x - r - 0.3, z - r - 0.3, x + r + 0.3, z + r + 0.3, (b) => {
    if (!b.climb || y < b.y0 - 0.2 || y > b.y1 + 0.1) return;
    // distance to each vertical face (outside only)
    const faces = [
      [x < b.x0 && z > b.z0 - 0.05 && z < b.z1 + 0.05 ? b.x0 - x : Infinity, -1, 0],
      [x > b.x1 && z > b.z0 - 0.05 && z < b.z1 + 0.05 ? x - b.x1 : Infinity, 1, 0],
      [z < b.z0 && x > b.x0 - 0.05 && x < b.x1 + 0.05 ? b.z0 - z : Infinity, 0, -1],
      [z > b.z1 && x > b.x0 - 0.05 && x < b.x1 + 0.05 ? z - b.z1 : Infinity, 0, 1],
    ];
    for (const [d, nx, nz] of faces) {
      if (d <= r + 0.32 && d < bestD) {
        bestD = d;
        out.nx = nx;
        out.nz = nz;
        out.box = b;
        out.d = d;
        found = true;
      }
    }
  });
  return found;
}

/**
 * First box hit along o + d*t, t in [0, maxT]. d need not be unit; t is in
 * units of |d|. out: { t, x,y,z, nx,ny,nz, box }.
 */
export function raycast(G, ox, oy, oz, dx, dy, dz, maxT, out, filter) {
  const ex = ox + dx * maxT;
  const ez = oz + dz * maxT;
  let best = maxT;
  let hitBox = null;
  let hnx = 0;
  let hny = 0;
  let hnz = 0;
  each(G, Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
    if (filter && !filter(b)) return;
    let tmin = 0;
    let tmax = best;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    // slab test per axis
    const ax = [
      [ox, dx, b.x0, b.x1, 0],
      [oy, dy, b.y0, b.y1, 1],
      [oz, dz, b.z0, b.z1, 2],
    ];
    for (const [o, d, lo, hi, axis] of ax) {
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) return;
        continue;
      }
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      let sg = -1;
      if (t1 > t2) {
        const tt = t1;
        t1 = t2;
        t2 = tt;
        sg = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        nx = axis === 0 ? sg : 0;
        ny = axis === 1 ? sg : 0;
        nz = axis === 2 ? sg : 0;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return;
    }
    if (tmin > 0 && tmin < best) {
      best = tmin;
      hitBox = b;
      hnx = nx;
      hny = ny;
      hnz = nz;
    }
  });
  // the street plane
  if (dy < 0 && G.groundY !== null) {
    const tg = (G.groundY - oy) / dy;
    if (tg > 0 && tg < best && !overWater(G, ox + dx * tg, oz + dz * tg)) {
      best = tg;
      hitBox = null;
      hnx = 0;
      hny = 1;
      hnz = 0;
      if (out) out.ground = true;
    }
  }
  if (best >= maxT) return false;
  if (out) {
    out.t = best;
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
    out.nx = hnx;
    out.ny = hny;
    out.nz = hnz;
    out.box = hitBox;
    if (hitBox) out.ground = false;
  }
  return true;
}

/** clear line between two points? (ignores the street) */
export function lineClear(G, ax, ay, az, bx, by, bz) {
  const o = {};
  const ok = raycast(G, ax, ay, az, bx - ax, by - ay, bz - az, 1, o);
  return !ok || o.t > 0.98;
}

/** boxes overlapping an xz rect (callers filter) */
export function boxesIn(G, x0, z0, x1, z1, fn) {
  each(G, x0, z0, x1, z1, fn);
}

/**
 * Is a runner path segment free of solid boxes? Samples the runner's REAL
 * motion (missions.js stepRunners): linear height plus a 3 m hop arc on
 * height changes / hops. Knee-high roof units are ignored (runners vault them).
 */
export function pathClear(G, a, b) {
  const arc = Math.abs(b.y - a.y) > 0.5 || b.hop;
  const n = Math.max(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const y = a.y + (b.y - a.y) * u + (arc ? Math.sin(Math.PI * u) * 3 : 0);
    let hit = false;
    each(G, x - 0.3, z - 0.3, x + 0.3, z + 0.3, (bx) => {
      if (bx.kind === "unit") return;
      if (x > bx.x0 - 0.3 && x < bx.x1 + 0.3 && z > bx.z0 - 0.3 && z < bx.z1 + 0.3 && y + 0.3 < bx.y1 && y + 1.5 > bx.y0) {
        hit = true;
        return false;
      }
    });
    if (hit) return false;
  }
  return true;
}
