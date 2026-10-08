/**
 * Mountain Journey — solid props on top of the analytic terrain.
 *
 *   box  { x, z, y (bottom), h, hw, hd, rot }   bridge decks, logs, gates,
 *                                               platforms, crates, walls
 *   cyl  { x, z, y (bottom), h, r }             stepping stones, rocks,
 *                                               trunks, posts
 *
 * A solid is walkable on top when its top is within a step of the feet, and
 * a wall otherwise (between its bottom and top). `on()` lets gates, extending
 * bridges and doors switch a solid in and out; `dyn` solids (moving platforms,
 * the crate) live in a separate list and are re-tested every query.
 *
 * Rotation follows three.js (rotation.y = rot): local → world is
 *   x = lx·cos + lz·sin,   z = −lx·sin + lz·cos
 */
import { clamp } from "./rng.js";

const CELL = 4;

function local(b, x, z) {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rot || 0);
  const s = Math.sin(b.rot || 0);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c, c, s };
}

export function createSolids() {
  const all = [];
  const dyn = [];
  const grid = new Map();
  let nextId = 1;

  const key = (gx, gz) => gx * 73856093 + gz * 19349663;
  function extent(s) {
    if (s.type === "cyl") return s.r;
    return Math.hypot(s.hw, s.hd);
  }
  function insert(s) {
    const r = extent(s) + 0.6;
    const x0 = Math.floor((s.x - r) / CELL);
    const x1 = Math.floor((s.x + r) / CELL);
    const z0 = Math.floor((s.z - r) / CELL);
    const z1 = Math.floor((s.z + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = key(gx, gz);
        let b = grid.get(k);
        if (!b) grid.set(k, (b = []));
        b.push(s);
      }
    }
  }
  const scratch = [];
  function near(x, z) {
    scratch.length = 0;
    const b = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (b) for (const s of b) scratch.push(s);
    for (const s of dyn) scratch.push(s);
    return scratch;
  }
  const active = (s) => (typeof s.on === "function" ? s.on() : s.on !== false);

  function inside(s, x, z, pad) {
    if (s.type === "cyl") {
      const dx = x - s.x;
      const dz = z - s.z;
      return dx * dx + dz * dz <= (s.r + pad) * (s.r + pad);
    }
    const { lx, lz } = local(s, x, z);
    return Math.abs(lx) <= s.hw + pad && Math.abs(lz) <= s.hd + pad;
  }
  function topOf(s, x, z) {
    if (s.slope) {
      // ramps: top rises along local z
      const { lz } = local(s, x, z);
      return s.y + s.h + clamp(lz / s.hd, -1, 1) * s.slope;
    }
    return s.y + s.h;
  }

  return {
    all,
    dyn,
    add(s) {
      const solid = { id: nextId++, surf: "stone", ...s };
      all.push(solid);
      if (solid.dynamic) dyn.push(solid);
      else insert(solid);
      return solid;
    },
    near,
    /**
     * Highest walkable top under (x, z) for feet at feetY.
     * Returns { top, solid } or null.
     */
    groundAt(x, z, feetY, stepUp, pad = 0.06) {
      let best = null;
      for (const s of near(x, z)) {
        if (!active(s) || s.noFloor || s.cameraOnly) continue;
        const p = s.type === "cyl" ? pad + (s.grip || 0.1) : pad;
        if (!inside(s, x, z, p)) continue;
        const top = topOf(s, x, z);
        if (top > feetY + stepUp) continue;
        if (!best || top > best.top) best = { top, solid: s };
      }
      return best;
    },
    /** Pushes a circle (radius r, feet..head) out of every wall-like solid. */
    pushOut(x, z, r, feetY, headY, stepUp) {
      let hit = null;
      for (let it = 0; it < 2; it++) {
        for (const s of near(x, z)) {
          if (!active(s) || s.cameraOnly) continue;
          const top = topOf(s, x, z);
          if (top <= feetY + stepUp && !s.wallAlways) continue;
          if (s.y >= headY - 0.05) continue;
          if (s.type === "cyl") {
            const dx = x - s.x;
            const dz = z - s.z;
            const d = Math.hypot(dx, dz);
            const m = s.r + r;
            if (d >= m) continue;
            if (d < 1e-5) {
              x += m;
            } else {
              x = s.x + (dx / d) * m;
              z = s.z + (dz / d) * m;
            }
            hit = s;
            continue;
          }
          const { lx, lz, c, s: sn } = local(s, x, z);
          const qx = clamp(lx, -s.hw, s.hw);
          const qz = clamp(lz, -s.hd, s.hd);
          const ox = lx - qx;
          const oz = lz - qz;
          const d = Math.hypot(ox, oz);
          let nlx = lx;
          let nlz = lz;
          if (d < 1e-5) {
            const px = s.hw - Math.abs(lx);
            const pz = s.hd - Math.abs(lz);
            if (px < pz) nlx = Math.sign(lx || 1) * (s.hw + r);
            else nlz = Math.sign(lz || 1) * (s.hd + r);
          } else if (d < r) {
            nlx = qx + (ox / d) * r;
            nlz = qz + (oz / d) * r;
          } else continue;
          x = s.x + nlx * c + nlz * sn;
          z = s.z - nlx * sn + nlz * c;
          hit = s;
        }
      }
      return { x, z, hit };
    },
    /** Lowest solid bottom above the head range (for jump ceilings). */
    ceiling(x, z, feetY, headY) {
      let best = Infinity;
      for (const s of near(x, z)) {
        if (!active(s) || s.cameraOnly) continue;
        if (s.y <= feetY + 0.3 || s.y > headY + 0.6) continue;
        if (!inside(s, x, z, 0.1)) continue;
        if (s.y < best) best = s.y;
      }
      return best;
    },
    /** True if a point is inside any solid (camera probe). */
    blocks(x, y, z, pad = 0.2) {
      for (const s of near(x, z)) {
        if (!active(s) || s.noCamera) continue;
        if (y < s.y - pad || y > topOf(s, x, z) + pad) continue;
        if (inside(s, x, z, pad)) return true;
      }
      return false;
    },
    inside,
    topOf,
    local,
  };
}
