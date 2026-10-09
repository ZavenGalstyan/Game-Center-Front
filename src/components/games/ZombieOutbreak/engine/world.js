/**
 * Zombie Outbreak — the collision world of one arena.
 *
 * Every solid is an oriented box: centre (x, z), size (w, d), height h from
 * y0, rotation `rot` about Y (three.js convention, so the renderer can use
 * the same numbers). Three consumers:
 *
 *   resolveCircle   player / zombie capsules (circles on the ground) pushed
 *                   out of every box — the only movement collision there is
 *   raycast         3D slab test for bullets, line of sight, projectiles;
 *                   shots can pass OVER low cover (a sandbag wall is 1 m high)
 *   nav grid        0.5 m cells, blocked per size class (normal zombies /
 *                   big ones) by inflating each box by the class radius
 *
 * A 4 m bucket grid keeps both lookups local.
 */
import { clamp } from "./math.js";

export const CELL = 0.5;
export const NAV_RADII = [0.42, 0.78, 1.32]; // size classes: 0 = humans / normal zombies, 1 = brutes + the stalker, 2 = big bosses
const BUCKET = 4;

export function createWorld(arena, extraSolids = []) {
  const b = arena.bounds;
  const solids = [];
  for (const raw of [...arena.solids, ...extraSolids]) {
    if (raw.ghost) continue;
    const rot = raw.rot || 0;
    const s = {
      x: raw.x,
      z: raw.z,
      hw: raw.w / 2,
      hd: raw.d / 2,
      y0: raw.y0 || 0,
      h: raw.h ?? 3,
      rot,
      c: Math.cos(rot),
      s: Math.sin(rot),
      tag: raw.tag || "wall",
      surface: raw.surface || surfaceOf(raw.tag),
      blocksMove: raw.blocksMove !== false,
      blocksShots: raw.blocksShots !== false,
    };
    s.top = s.y0 + s.h;
    s.br = Math.hypot(s.hw, s.hd);
    solids.push(s);
  }

  // ---------------------------------------------------------- buckets
  const bx0 = b.minX - 2;
  const bz0 = b.minZ - 2;
  const bcols = Math.ceil((b.maxX - b.minX + 4) / BUCKET);
  const brows = Math.ceil((b.maxZ - b.minZ + 4) / BUCKET);
  const buckets = Array.from({ length: bcols * brows }, () => []);
  solids.forEach((s, i) => {
    const r = s.br + 1.3;
    const c0 = clamp(Math.floor((s.x - r - bx0) / BUCKET), 0, bcols - 1);
    const c1 = clamp(Math.floor((s.x + r - bx0) / BUCKET), 0, bcols - 1);
    const r0 = clamp(Math.floor((s.z - r - bz0) / BUCKET), 0, brows - 1);
    const r1 = clamp(Math.floor((s.z + r - bz0) / BUCKET), 0, brows - 1);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) buckets[rr * bcols + cc].push(i);
  });
  const near = (x, z) => {
    const cc = clamp(Math.floor((x - bx0) / BUCKET), 0, bcols - 1);
    const rr = clamp(Math.floor((z - bz0) / BUCKET), 0, brows - 1);
    return buckets[rr * bcols + cc];
  };

  // ---------------------------------------------------------- nav grid
  const cols = Math.ceil((b.maxX - b.minX) / CELL);
  const rows = Math.ceil((b.maxZ - b.minZ) / CELL);
  const blocked = NAV_RADII.map((r) => {
    const g = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = b.minX + (col + 0.5) * CELL;
        const z = b.minZ + (row + 0.5) * CELL;
        if (x - b.minX < r || b.maxX - x < r || z - b.minZ < r || b.maxZ - z < r) {
          g[row * cols + col] = 1;
          continue;
        }
        for (const i of near(x, z)) {
          const s = solids[i];
          if (!s.blocksMove) continue;
          if (distToBox(s, x, z) < r) {
            g[row * cols + col] = 1;
            break;
          }
        }
      }
    }
    return g;
  });

  const world = {
    arena,
    bounds: b,
    solids,
    ceiling: arena.ceiling ? arena.ceiling.h : Infinity,
    cols,
    rows,
    blocked,
    near,
    cellOf(x, z) {
      const col = clamp(Math.floor((x - b.minX) / CELL), 0, cols - 1);
      const row = clamp(Math.floor((z - b.minZ) / CELL), 0, rows - 1);
      return row * cols + col;
    },
    cellX(i) {
      return b.minX + ((i % cols) + 0.5) * CELL;
    },
    cellZ(i) {
      return b.minZ + (Math.floor(i / cols) + 0.5) * CELL;
    },
    isBlocked(cls, x, z) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
      return blocked[cls][world.cellOf(x, z)] === 1;
    },
    /** Grid line of sight for a size class (sampled every 0.25 m). */
    gridClear(cls, ax, az, bx, bz) {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const n = Math.ceil(len / 0.25);
      const g = blocked[cls];
      for (let k = 1; k < n; k++) {
        const t = k / n;
        if (g[world.cellOf(ax + dx * t, az + dz * t)] === 1) return false;
      }
      return true;
    },
    resolveCircle(p, r) {
      return resolveCircle(world, p, r);
    },
    raycast(ox, oy, oz, dx, dy, dz, maxT, out) {
      return raycast(world, ox, oy, oz, dx, dy, dz, maxT, out);
    },
    /** True when nothing solid lies between the two points. */
    clearShot(ax, ay, az, bx, by, bz) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) return true;
      return !raycast(world, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, HIT_TMP);
    },
  };
  return world;
}

const HIT_TMP = { t: 0, nx: 0, ny: 0, nz: 0, surface: "", solid: null };

function surfaceOf(tag) {
  switch (tag) {
    case "car":
    case "truck":
    case "container":
    case "shelf":
    case "machine":
    case "tank":
    case "locker":
    case "bed":
    case "pole":
    case "tower":
    case "jeep":
    case "forklift":
    case "door":
      return "metal";
    case "glass":
      return "glass";
    case "crate":
    case "pallet":
    case "desk":
    case "bench":
      return "wood";
    case "sandbag":
      return "dirt";
    default:
      return "concrete";
  }
}

/** Distance from (x, z) to an oriented box footprint (0 inside). */
export function distToBox(s, x, z) {
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = dx * s.c - dz * s.s;
  const lz = dx * s.s + dz * s.c;
  const qx = Math.max(Math.abs(lx) - s.hw, 0);
  const qz = Math.max(Math.abs(lz) - s.hd, 0);
  return Math.hypot(qx, qz);
}

/**
 * Pushes circle `p` ({x, z}) of radius r out of every nearby box and keeps it
 * inside the arena bounds. A few iterations settle corners. Returns true if
 * anything was touched.
 */
function resolveCircle(world, p, r) {
  const b = world.bounds;
  let touched = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const list = world.near(p.x, p.z);
    for (let k = 0; k < list.length; k++) {
      const s = world.solids[list[k]];
      if (!s.blocksMove) continue;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz > (s.br + r) * (s.br + r)) continue;
      // Into box space.
      const lx = dx * s.c - dz * s.s;
      const lz = dx * s.s + dz * s.c;
      const cx = clamp(lx, -s.hw, s.hw);
      const cz = clamp(lz, -s.hd, s.hd);
      let ox = lx - cx;
      let oz = lz - cz;
      const d2 = ox * ox + oz * oz;
      let nlx;
      let nlz;
      if (d2 > 1e-10) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        const push = r - d;
        nlx = lx + (ox / d) * push;
        nlz = lz + (oz / d) * push;
      } else {
        // Centre inside the box: leave by the shallowest side.
        const px = s.hw - Math.abs(lx);
        const pz = s.hd - Math.abs(lz);
        if (px < pz) {
          nlx = (lx >= 0 ? 1 : -1) * (s.hw + r);
          nlz = lz;
        } else {
          nlx = lx;
          nlz = (lz >= 0 ? 1 : -1) * (s.hd + r);
        }
      }
      // Back to world space (inverse rotation).
      p.x = s.x + nlx * s.c + nlz * s.s;
      p.z = s.z - nlx * s.s + nlz * s.c;
      moved = true;
      touched = true;
    }
    if (!moved) break;
  }
  const nx = clamp(p.x, b.minX + r, b.maxX - r);
  const nz = clamp(p.z, b.minZ + r, b.maxZ - r);
  if (nx !== p.x || nz !== p.z) {
    p.x = nx;
    p.z = nz;
    touched = true;
  }
  return touched;
}

/**
 * Ray vs every solid (oriented boxes), the floor (y = 0) and the ceiling.
 * Writes the nearest hit into `out` and returns it, or null within maxT.
 */
function raycast(world, ox, oy, oz, dx, dy, dz, maxT, out) {
  let best = maxT;
  let hit = null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let surface = "";
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t >= 0 && t < best) {
      best = t;
      hit = "floor";
      nx = 0;
      ny = 1;
      nz = 0;
      surface = world.arena.floorSurface || "concrete";
    }
  }
  if (dy > 1e-6 && world.ceiling < Infinity) {
    const t = (world.ceiling - oy) / dy;
    if (t >= 0 && t < best) {
      best = t;
      hit = "ceiling";
      nx = 0;
      ny = -1;
      nz = 0;
      surface = "concrete";
    }
  }
  // Walk the buckets the ray crosses (coarse DDA at half-bucket steps).
  const seen = world._seen || (world._seen = new Uint32Array(world.solids.length));
  const stamp = (world._stamp = ((world._stamp || 0) + 1) >>> 0) || 1;
  const step = BUCKET * 0.5;
  const hdLen = Math.hypot(dx, dz);
  const steps = hdLen < 1e-6 ? 0 : Math.ceil((Math.min(best, 200) * hdLen) / step) + 1;
  for (let k = 0; k <= steps; k++) {
    const tt = hdLen < 1e-6 ? 0 : (k * step) / hdLen;
    if (tt > best + step) break;
    const list = world.near(ox + dx * tt, oz + dz * tt);
    for (let j = 0; j < list.length; j++) {
      const i = list[j];
      if (seen[i] === stamp) continue;
      seen[i] = stamp;
      const s = world.solids[i];
      if (!s.blocksShots) continue;
      // Ray into box space.
      const rx = ox - s.x;
      const rz = oz - s.z;
      const lox = rx * s.c - rz * s.s;
      const loz = rx * s.s + rz * s.c;
      const ldx = dx * s.c - dz * s.s;
      const ldz = dx * s.s + dz * s.c;
      let tmin = 0;
      let tmax = best;
      let axis = -1;
      let sign = 0;
      // X slab
      if (Math.abs(ldx) < 1e-9) {
        if (lox < -s.hw || lox > s.hw) continue;
      } else {
        let t1 = (-s.hw - lox) / ldx;
        let t2 = (s.hw - lox) / ldx;
        let sg = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sg = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = 0;
          sign = sg;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // Y slab
      if (Math.abs(dy) < 1e-9) {
        if (oy < s.y0 || oy > s.top) continue;
      } else {
        let t1 = (s.y0 - oy) / dy;
        let t2 = (s.top - oy) / dy;
        let sg = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sg = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = 1;
          sign = sg;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // Z slab
      if (Math.abs(ldz) < 1e-9) {
        if (loz < -s.hd || loz > s.hd) continue;
      } else {
        let t1 = (-s.hd - loz) / ldz;
        let t2 = (s.hd - loz) / ldz;
        let sg = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sg = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = 2;
          sign = sg;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (tmin < best && axis !== -1) {
        best = tmin;
        hit = s;
        surface = s.surface;
        if (axis === 1) {
          nx = 0;
          ny = sign;
          nz = 0;
        } else {
          // Local normal back to world.
          const lnx = axis === 0 ? sign : 0;
          const lnz = axis === 2 ? sign : 0;
          nx = lnx * s.c + lnz * s.s;
          nz = -lnx * s.s + lnz * s.c;
          ny = 0;
        }
      }
    }
  }
  if (!hit) return null;
  out.t = best;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.surface = surface;
  out.solid = typeof hit === "string" ? null : hit;
  return out;
}
