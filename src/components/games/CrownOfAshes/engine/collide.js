/**
 * Static collision world: vertical circles (trees, towers, pillars), oriented
 * boxes (walls, houses, gates) with a vertical extent, and walkable
 * platforms (bridge decks, ramps, stairs, interior floors) — all in a
 * uniform spatial hash. Characters are vertical capsules approximated as a
 * circle of radius r spanning [y, y + height].
 *
 * Colliders whose top is below a character's step height are ignored by
 * horizontal resolution (you step onto platforms instead of hitting them).
 * Colliders with a `gate` id are toggled on/off at runtime (doors, gates).
 */
import { getTerrain } from "./terrain.js";
import { INTERIOR_X } from "../data/worldmap.js";

const CELL = 8;
const key = (i, j) => (i + 4096) * 8192 + (j + 4096);

export function createCollisionWorld() {
  const T = getTerrain();
  const grid = new Map();
  const pgrid = new Map();
  const all = [];
  const platforms = [];
  const gates = new Map(); // id → [collider]
  let stamp = 1;

  function insert(g, c, x0, z0, x1, z1) {
    const i0 = Math.floor(x0 / CELL);
    const i1 = Math.floor(x1 / CELL);
    const j0 = Math.floor(z0 / CELL);
    const j1 = Math.floor(z1 / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let a = g.get(k);
        if (!a) g.set(k, (a = []));
        a.push(c);
      }
  }
  function boxBounds(c) {
    const ex = Math.abs(c.cos) * c.hw + Math.abs(c.sin) * c.hd;
    const ez = Math.abs(c.sin) * c.hw + Math.abs(c.cos) * c.hd;
    return [c.x - ex, c.z - ez, c.x + ex, c.z + ez];
  }
  const W = {
    T,
    all,
    platforms,
    addCircle(x, z, r, y0, y1, o = {}) {
      const c = { t: 0, x, z, r, y0, y1, on: true, s: 0, ...o };
      all.push(c);
      insert(grid, c, x - r, z - r, x + r, z + r);
      if (c.gate) (gates.get(c.gate) || gates.set(c.gate, []).get(c.gate)).push(c);
      return c;
    },
    /** Box: centre, half extents along its local x (hw) / z (hd), yaw rot. */
    addBox(x, z, hw, hd, rot, y0, y1, o = {}) {
      const c = { t: 1, x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, on: true, s: 0, ...o };
      all.push(c);
      const b = boxBounds(c);
      insert(grid, c, b[0], b[1], b[2], b[3]);
      if (c.gate) (gates.get(c.gate) || gates.set(c.gate, []).get(c.gate)).push(c);
      return c;
    },
    /** Every gate collider (the nav grid treats their cells as dynamic). */
    gateColliders() {
      const out = [];
      for (const [id, list] of gates) for (const c of list) if (c.t === 1 && c.hw != null) out.push({ id, c });
      return out;
    },
    /**
     * Walkable top surface: a box whose top is `y` (flat) or rises linearly
     * along its local z from y0 (at −hd) to y1 (at +hd) — ramps and stairs.
     */
    addPlatform(x, z, hw, hd, rot, y0, y1 = y0, o = {}) {
      const p = { x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, on: true, s: 0, ...o };
      platforms.push(p);
      const b = boxBounds(p);
      insert(pgrid, p, b[0], b[1], b[2], b[3]);
      if (p.gate) (gates.get(p.gate) || gates.set(p.gate, []).get(p.gate)).push(p);
      return p;
    },
    setGate(id, on) {
      for (const c of gates.get(id) || []) c.on = on;
    },
    gateOn(id) {
      const a = gates.get(id);
      return !!(a && a.length && a[0].on);
    },
    /** Colliders near a point (deduplicated). */
    near(x, z, r, out = []) {
      out.length = 0;
      stamp++;
      const i0 = Math.floor((x - r) / CELL);
      const i1 = Math.floor((x + r) / CELL);
      const j0 = Math.floor((z - r) / CELL);
      const j1 = Math.floor((z + r) / CELL);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const a = grid.get(key(i, j));
          if (!a) continue;
          for (const c of a)
            if (c.s !== stamp && c.on) {
              c.s = stamp;
              out.push(c);
            }
        }
      return out;
    },
    /** Height of the floor under (x,z) for a character whose feet are at `feet`. */
    ground(x, z, feet = 1e9, step = 0.65) {
      let g = x > INTERIOR_X ? -50 : T.height(x, z);
      const a = pgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (a)
        for (const p of a) {
          if (!p.on) continue;
          const dx = x - p.x;
          const dz = z - p.z;
          const lx = dx * p.cos - dz * p.sin;
          const lz = dx * p.sin + dz * p.cos;
          if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hd) continue;
          const top = p.y0 + ((lz + p.hd) / (2 * p.hd)) * (p.y1 - p.y0);
          if (top <= feet + step && top > g) g = top;
        }
      return g;
    },
    /** True when (x,z) is on a platform (bridges keep you out of the river). */
    onPlatform(x, z, feet) {
      const a = pgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!a) return false;
      for (const p of a) {
        if (!p.on) continue;
        const dx = x - p.x;
        const dz = z - p.z;
        const lx = dx * p.cos - dz * p.sin;
        const lz = dx * p.sin + dz * p.cos;
        if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hd) continue;
        const top = p.y0 + ((lz + p.hd) / (2 * p.hd)) * (p.y1 - p.y0);
        if (Math.abs(top - feet) < 0.4) return true;
      }
      return false;
    },
    /**
     * Push a character circle out of every collider overlapping its body
     * span. Mutates pos {x,z}; returns true if anything was hit.
     */
    resolve(pos, r, feet, height = 1.8, step = 0.55) {
      let hit = false;
      const list = W.near(pos.x, pos.z, r + 1, _near);
      for (let pass = 0; pass < 2; pass++)
        for (const c of list) {
          if (c.y1 <= feet + step || c.y0 >= feet + height) continue;
          if (c.t === 0) {
            const dx = pos.x - c.x;
            const dz = pos.z - c.z;
            const d = Math.hypot(dx, dz);
            const m = r + c.r;
            if (d < m) {
              const k = d > 1e-6 ? (m - d) / d : 0;
              pos.x += d > 1e-6 ? dx * k : m;
              pos.z += d > 1e-6 ? dz * k : 0;
              hit = true;
            }
          } else {
            const dx = pos.x - c.x;
            const dz = pos.z - c.z;
            // into box space (local x along cos/sin)
            const lx = dx * c.cos - dz * c.sin;
            const lz = dx * c.sin + dz * c.cos;
            const cx = Math.max(-c.hw, Math.min(c.hw, lx));
            const cz = Math.max(-c.hd, Math.min(c.hd, lz));
            let ox = lx - cx;
            let oz = lz - cz;
            let d = Math.hypot(ox, oz);
            if (d >= r) continue;
            let px;
            let pz;
            if (d < 1e-6) {
              // centre inside: leave along the shallowest face
              const ex = c.hw - Math.abs(lx);
              const ez = c.hd - Math.abs(lz);
              if (ex < ez) {
                px = Math.sign(lx || 1) * (c.hw + r);
                pz = lz;
              } else {
                px = lx;
                pz = Math.sign(lz || 1) * (c.hd + r);
              }
            } else {
              px = cx + (ox / d) * r;
              pz = cz + (oz / d) * r;
            }
            // back to world (inverse rotation)
            pos.x = c.x + px * c.cos + pz * c.sin;
            pos.z = c.z - px * c.sin + pz * c.cos;
            hit = true;
          }
        }
      return hit;
    },
    /**
     * Ray against boxes, cylinders and the heightfield. Returns the hit
     * distance (≤ maxT) — maxT when clear.
     */
    raycast(ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
      let best = maxT;
      const steps = Math.ceil(maxT / CELL) + 1;
      stamp++;
      const s = stamp;
      for (let n = 0; n <= steps; n++) {
        const t = Math.min(maxT, n * CELL);
        const px = ox + dx * t;
        const pz = oz + dz * t;
        const i0 = Math.floor((px - CELL * 0.6) / CELL);
        const j0 = Math.floor((pz - CELL * 0.6) / CELL);
        for (let i = i0; i <= i0 + 1; i++)
          for (let j = j0; j <= j0 + 1; j++) {
            const a = grid.get(key(i, j));
            if (!a) continue;
            for (const c of a) {
              if (c.s === s || !c.on) continue;
              c.s = s;
              if (opts.skipLow && c.y1 - c.y0 < 1.2) continue;
              if (opts.noTrees && c.tree) continue;
              const h = c.t === 0 ? rayCyl(ox, oy, oz, dx, dy, dz, c, best) : rayBox(ox, oy, oz, dx, dy, dz, c, best);
              if (h >= 0 && h < best) best = h;
            }
          }
      }
      if (!opts.noTerrain && ox < INTERIOR_X) {
        // march the heightfield
        const st = 0.6;
        for (let t = 0.3; t < best; t += st) {
          const y = oy + dy * t;
          const g = T.height(ox + dx * t, oz + dz * t);
          if (y < g + 0.15) {
            best = Math.max(0, t - st);
            break;
          }
        }
      }
      return best;
    },
    /** Line of sight between two points (eye heights included by the caller). */
    los(ax, ay, az, bx, by, bz) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-3) return true;
      return W.raycast(ax, ay, az, dx / L, dy / L, dz / L, L, { skipLow: true }) >= L - 0.05;
    },
    /** Is any collider (or steep / deep ground) blocking a circle at (x,z)? Used by the nav grid. */
    blockedAt(x, z, r, feet, skipGates = false) {
      for (const c of W.near(x, z, r + 1, _near2)) {
        if (c.y1 <= feet + 0.6 || c.y0 >= feet + 1.8) continue;
        if (skipGates && c.gate) continue;
        if (c.t === 0) {
          if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
        } else {
          const dx = x - c.x;
          const dz = z - c.z;
          const lx = dx * c.cos - dz * c.sin;
          const lz = dx * c.sin + dz * c.cos;
          // thin walls (fences) are padded so a grid sampling them can't step between cells
          const hd = c.hd < 0.6 ? Math.max(c.hd, 1.05 - r) : c.hd;
          const hw = c.hw < 0.6 ? Math.max(c.hw, 1.05 - r) : c.hw;
          if (Math.abs(lx) < hw + r && Math.abs(lz) < hd + r) return true;
        }
      }
      return false;
    },
  };
  const _near = [];
  const _near2 = [];
  return W;
}

function rayCyl(ox, oy, oz, dx, dy, dz, c, maxT) {
  const fx = ox - c.x;
  const fz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - c.r * c.r;
  if (cc < 0) return -1; // inside — ignore (camera starts inside nothing)
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = oy + dy * t;
  if (y < c.y0 || y > c.y1) return -1;
  return t;
}
function rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
  // into box space
  const rx = ox - c.x;
  const rz = oz - c.z;
  const lox = rx * c.cos - rz * c.sin;
  const loz = rx * c.sin + rz * c.cos;
  const ldx = dx * c.cos - dz * c.sin;
  const ldz = dx * c.sin + dz * c.cos;
  let t0 = 0;
  let t1 = maxT;
  const slab = (o, d, mn, mx) => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let a = (mn - o) / d;
    let b = (mx - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    return t0 <= t1;
  };
  if (!slab(lox, ldx, -c.hw, c.hw)) return -1;
  if (!slab(loz, ldz, -c.hd, c.hd)) return -1;
  if (!slab(oy, dy, c.y0, c.y1)) return -1;
  if (t0 <= 0) return -1; // starting inside
  return t0;
}
