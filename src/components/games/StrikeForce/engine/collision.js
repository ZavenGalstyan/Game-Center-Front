/**
 * Strike Force — static collision world (pure JS, no Three.js).
 *
 * Every solid thing on a map is an axis-aligned box:
 *   { x0, y0, z0, x1, y1, z1, shoot, see, walk }
 *   shoot=false  bullets pass (chain-link fences, foliage)
 *   see=false    never set by maps today; LOS uses `shoot`
 * The ground is the plane y = 0. Boxes are bucketed into a uniform XZ grid
 * so movement queries and ray casts only touch nearby boxes.
 *
 * Bodies are vertical AABBs (half-width r, height h) — robust against
 * tunnelling when moved in small sub-steps, and they climb anything up to
 * STEP_H tall automatically (curbs, stairs, low platforms).
 */
export const STEP_H = 0.48;
const CELL = 4;
const EPS = 1e-4;

export function createCollision(boxes, bounds) {
  const minX = bounds.minX - 2;
  const minZ = bounds.minZ - 2;
  const nx = Math.ceil((bounds.maxX - minX + 2) / CELL);
  const nz = Math.ceil((bounds.maxZ - minZ + 2) / CELL);
  const cells = new Array(nx * nz);
  for (let i = 0; i < cells.length; i++) cells[i] = [];
  const cx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / CELL)));
  const cz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / CELL)));
  boxes.forEach((b, i) => {
    for (let ix = cx(b.x0); ix <= cx(b.x1); ix++) for (let iz = cz(b.z0); iz <= cz(b.z1); iz++) cells[ix + iz * nx].push(i);
  });
  const stamp = new Uint32Array(boxes.length);
  let tick = 1;

  /** box indices overlapping an XZ rectangle (deduplicated) */
  const out = [];
  function near(x0, z0, x1, z1) {
    out.length = 0;
    tick++;
    for (let ix = cx(x0); ix <= cx(x1); ix++)
      for (let iz = cz(z0); iz <= cz(z1); iz++) {
        const c = cells[ix + iz * nx];
        for (let k = 0; k < c.length; k++) {
          const i = c[k];
          if (stamp[i] === tick) continue;
          stamp[i] = tick;
          out.push(i);
        }
      }
    return out;
  }

  /** does a body-sized AABB at (x, y, z) overlap any box? */
  function blocked(x, y, z, r, h) {
    const list = near(x - r, z - r, x + r, z + r);
    for (let k = 0; k < list.length; k++) {
      const b = boxes[list[k]];
      if (x + r > b.x0 + EPS && x - r < b.x1 - EPS && z + r > b.z0 + EPS && z - r < b.z1 - EPS && y + h > b.y0 + EPS && y < b.y1 - EPS) return b;
    }
    return null;
  }

  /** highest box top under the body footprint within [y - down, y + up] */
  function floorAt(x, y, z, r, up = 0.05, down = 0.05) {
    let best = y - down <= 0 ? 0 : -Infinity;
    const list = near(x - r, z - r, x + r, z + r);
    for (let k = 0; k < list.length; k++) {
      const b = boxes[list[k]];
      if (x + r > b.x0 + EPS && x - r < b.x1 - EPS && z + r > b.z0 + EPS && z - r < b.z1 - EPS && b.y1 <= y + up && b.y1 >= y - down && b.y1 > best) best = b.y1;
    }
    return best;
  }

  /**
   * Move a body {x, y, z, vx, vy, vz, r, h, grounded} by its velocity over
   * dt. Horizontal motion is resolved per axis with automatic step-up;
   * vertical motion lands on tops / bumps heads. Returns the body.
   */
  function move(body, dt, gravity) {
    const sp = Math.hypot(body.vx, body.vz);
    const steps = Math.max(1, Math.ceil((sp * dt) / 0.12), Math.ceil((Math.abs(body.vy) * dt) / 0.2));
    const h = dt / steps;
    const wasGrounded = body.grounded;
    body.hitWall = false;
    for (let s = 0; s < steps; s++) {
      body.vy -= gravity * h;
      axis(body, "x", body.vx * h);
      axis(body, "z", body.vz * h);
      // vertical
      const ny = body.y + body.vy * h;
      if (body.vy <= 0) {
        const f = floorAt(body.x, body.y, body.z, body.r, 0.001, body.y - ny + 0.001);
        if (ny <= f) {
          body.y = Math.max(f, 0);
          body.vy = 0;
          body.grounded = true;
        } else {
          body.y = ny;
          body.grounded = false;
        }
      } else {
        const b = blocked(body.x, ny, body.z, body.r, body.h);
        if (b) {
          body.y = Math.min(body.y, b.y0 - body.h - EPS);
          body.vy = 0;
        } else body.y = ny;
        body.grounded = false;
      }
    }
    // stick to stairs going down
    if (wasGrounded && !body.grounded && body.vy <= 0) {
      const f = floorAt(body.x, body.y, body.z, body.r, 0.001, STEP_H);
      if (f > -Infinity && body.y - f <= STEP_H) {
        body.y = f;
        body.vy = 0;
        body.grounded = true;
      }
    }
    return body;
  }

  function axis(body, ax, d) {
    if (!d) return;
    const x = ax === "x" ? body.x + d : body.x;
    const z = ax === "z" ? body.z + d : body.z;
    const b = blocked(x, body.y, z, body.r, body.h);
    if (!b) {
      body[ax] += d;
      return;
    }
    // step up onto low obstacles (only from solid footing or while descending)
    const rise = b.y1 - body.y;
    if (rise > 0 && rise <= STEP_H && (body.grounded || body.vy <= 0) && !blocked(x, b.y1 + 0.002, z, body.r, body.h)) {
      body[ax] += d;
      body.y = b.y1 + 0.001;
      body.stepped = (body.stepped || 0) + rise;
      return;
    }
    // slide flush against the face
    if (ax === "x") body.x = d > 0 ? Math.min(body.x, b.x0 - body.r - EPS) : Math.max(body.x, b.x1 + body.r + EPS);
    else body.z = d > 0 ? Math.min(body.z, b.z0 - body.r - EPS) : Math.max(body.z, b.z1 + body.r + EPS);
    body["v" + ax] = 0;
    body.hitWall = true;
  }

  /**
   * Ray cast against boxes and the ground. Direction must be normalised.
   * Returns { t, nx, ny, nz, box } or null within maxT.
   * `all` = true also hits shoot-through boxes (used for nothing yet).
   */
  function ray(ox, oy, oz, dx, dy, dz, maxT, all = false) {
    let bestT = maxT;
    let hit = null;
    // ground
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) {
        bestT = t;
        hit = { t, nx: 0, ny: 1, nz: 0, box: null };
      }
    }
    // walk the grid cells the XZ projection crosses (2D DDA)
    tick++;
    let ix = cx(ox);
    let iz = cz(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    const bx = minX + (ix + (dx > 0 ? 1 : 0)) * CELL;
    const bz = minZ + (iz + (dz > 0 ? 1 : 0)) * CELL;
    let tmx = Math.abs(dx) > 1e-9 ? (bx - ox) / dx : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (bz - oz) / dz : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      const c = cells[ix + iz * nx];
      for (let k = 0; k < c.length; k++) {
        const i = c[k];
        if (stamp[i] === tick) continue;
        stamp[i] = tick;
        const b = boxes[i];
        if (!all && b.shoot === false) continue;
        const r = slab(b, ox, oy, oz, dx, dy, dz, bestT);
        if (r) {
          bestT = r.t;
          hit = r;
          hit.box = b;
        }
      }
      const tNext = Math.min(tmx, tmz);
      if (tNext > bestT || tNext > maxT) break;
      tCell = tNext;
      if (tmx < tmz) {
        tmx += tdx;
        ix += stepX;
        if (ix < 0 || ix >= nx) break;
      } else {
        tmz += tdz;
        iz += stepZ;
        if (iz < 0 || iz >= nz) break;
      }
    }
    void tCell;
    return hit;
  }

  /** clear line between two points (for sight checks) */
  function los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    return !ray(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05);
  }

  return { boxes, bounds, near, blocked, floorAt, move, ray, los };
}

function slab(b, ox, oy, oz, dx, dy, dz, maxT) {
  let t0 = 0;
  let t1 = maxT;
  let n = -1;
  let sgn = 0;
  // x
  if (Math.abs(dx) < 1e-12) {
    if (ox < b.x0 || ox > b.x1) return null;
  } else {
    let a = (b.x0 - ox) / dx;
    let c = (b.x1 - ox) / dx;
    let s = -1;
    if (a > c) {
      const tmp = a;
      a = c;
      c = tmp;
      s = 1;
    }
    if (a > t0) {
      t0 = a;
      n = 0;
      sgn = s;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < b.y0 || oy > b.y1) return null;
  } else {
    let a = (b.y0 - oy) / dy;
    let c = (b.y1 - oy) / dy;
    let s = -1;
    if (a > c) {
      const tmp = a;
      a = c;
      c = tmp;
      s = 1;
    }
    if (a > t0) {
      t0 = a;
      n = 1;
      sgn = s;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < b.z0 || oz > b.z1) return null;
  } else {
    let a = (b.z0 - oz) / dz;
    let c = (b.z1 - oz) / dz;
    let s = -1;
    if (a > c) {
      const tmp = a;
      a = c;
      c = tmp;
      s = 1;
    }
    if (a > t0) {
      t0 = a;
      n = 2;
      sgn = s;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  if (n < 0) return null; // origin inside the box
  return { t: t0, nx: n === 0 ? sgn : 0, ny: n === 1 ? sgn : 0, nz: n === 2 ? sgn : 0, box: null };
}
