/**
 * Iron Arena — the static collision world of a map: terrain heightfield,
 * solid colliders and driveable decks (bridges, ramps, platforms), indexed in
 * a uniform spatial hash.
 *
 * Collider shapes (all with a vertical extent y0..y1):
 *   box  — oriented rectangle footprint (rotation `rot` about +Y)
 *   cyl  — vertical cylinder
 *   deck — oriented slab whose top rises linearly from `ya` (local z = -hd)
 *          to `yb` (local z = +hd) with thickness `thick`; tanks drive ON it
 *          when they approach within step height, and are blocked by its
 *          sides otherwise. Space under a high deck stays passable (tunnels).
 *
 * Raycasts clip segments against convex shapes (Cyrus–Beck), so hits are
 * exact for boxes and sloped decks; the terrain is ray-marched + bisected.
 */
import { clamp } from "./util.js";

const CELL = 8;
export const STEP_UP = 0.85; // tallest ledge a tank can climb onto (terrain / decks)
const LOW = 0.35; // solid props lower than this above the hull base are ignored (kerbs); anything taller blocks

const ARENA_CACHE = new WeakMap();
/** one shared (read-only) arena per built map */
export function getArena(map) {
  if (!ARENA_CACHE.has(map)) ARENA_CACHE.set(map, createArena(map));
  return ARENA_CACHE.get(map);
}

export function createArena(map) {
  const H = map.H;
  const E = H + 10; // heightfield extent (half)
  const RES = 1;
  const N = Math.round((2 * E) / RES) + 1;
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) heights[j * N + i] = map.height(-E + i * RES, -E + j * RES);

  function groundAt(x, z) {
    const fx = clamp((x + E) / RES, 0, N - 1.001);
    const fz = clamp((z + E) / RES, 0, N - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * N + i;
    const a = heights[k];
    const b = heights[k + 1];
    const c = heights[k + N];
    const d = heights[k + N + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  function normalAt(x, z, out = {}) {
    const e = 0.75;
    const dx = groundAt(x + e, z) - groundAt(x - e, z);
    const dz = groundAt(x, z + e) - groundAt(x, z - e);
    const L = Math.hypot(dx, 2 * e, dz);
    out.x = -dx / L;
    out.y = (2 * e) / L;
    out.z = -dz / L;
    return out;
  }

  /* ---------------------------------------------------------------- colliders */
  const cols = [];
  const decks = [];
  for (const c0 of map.colliders) {
    const c = { ...c0 };
    if (c.type === "box" || c.type === "deck") {
      const r = c.rot || 0;
      c.c = Math.cos(r);
      c.s = Math.sin(r);
      c.br = Math.hypot(c.hw, c.hd);
      if (c.type === "deck") {
        c.k = (c.yb - c.ya) / (2 * c.hd);
        c.m = (c.ya + c.yb) / 2;
        c.y1 = Math.max(c.ya, c.yb);
        c.y0 = Math.min(c.ya, c.yb) - c.thick;
        decks.push(c);
      }
    } else c.br = c.r;
    c.idx = cols.length;
    cols.push(c);
  }
  const GN = Math.ceil((2 * E) / CELL);
  const grid = Array.from({ length: GN * GN }, () => []);
  const cellOf = (v) => clamp(Math.floor((v + E) / CELL), 0, GN - 1);
  for (const c of cols) {
    const i0 = cellOf(c.x - c.br);
    const i1 = cellOf(c.x + c.br);
    const j0 = cellOf(c.z - c.br);
    const j1 = cellOf(c.z + c.br);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * GN + i].push(c);
  }
  let stamp = 1;
  const seen = new Uint32Array(cols.length);
  /** colliders whose bounds may touch the circle (x,z,r) */
  function near(x, z, r, out) {
    out.length = 0;
    stamp++;
    const i0 = cellOf(x - r);
    const i1 = cellOf(x + r);
    const j0 = cellOf(z - r);
    const j1 = cellOf(z + r);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cell = grid[j * GN + i];
        for (let k = 0; k < cell.length; k++) {
          const c = cell[k];
          if (seen[c.idx] === stamp) continue;
          seen[c.idx] = stamp;
          if (Math.abs(c.x - x) > c.br + r || Math.abs(c.z - z) > c.br + r) continue;
          out.push(c);
        }
      }
    return out;
  }
  const tmpNear = [];

  /** deck top at world (x,z) or NaN when outside its footprint */
  function deckTop(d, x, z, margin = 0) {
    const dx = x - d.x;
    const dz = z - d.z;
    const lx = dx * d.c - dz * d.s;
    const lz = dx * d.s + dz * d.c;
    if (Math.abs(lx) > d.hw + margin || Math.abs(lz) > d.hd + margin) return NaN;
    return d.m + d.k * clamp(lz, -d.hd, d.hd);
  }

  /** highest walkable surface at (x,z) reachable from height y */
  const surf = { h: 0, deck: null };
  function surfaceAt(x, z, y = Infinity, step = STEP_UP) {
    let h = groundAt(x, z);
    let deck = null;
    near(x, z, 0.1, tmpNear);
    for (let k = 0; k < tmpNear.length; k++) {
      const c = tmpNear[k];
      if (c.type !== "deck") continue;
      const t = deckTop(c, x, z);
      if (t === t && t > h && t <= y + step) {
        h = t;
        deck = c;
      }
    }
    surf.h = h;
    surf.deck = deck;
    return surf;
  }

  /**
   * Push a vertical cylinder (x,z,r) spanning [yb, yb+ht] out of solid
   * geometry. Returns {x, z, hit, nx, nz} with the corrected position.
   */
  const push = { x: 0, z: 0, hit: false, nx: 0, nz: 0, depth: 0 };
  function collideCircle(x, z, r, yb, ht) {
    let px = x;
    let pz = z;
    let hit = false;
    let nx = 0;
    let nz = 0;
    let depth = 0;
    for (let pass = 0; pass < 2; pass++) {
      near(px, pz, r, tmpNear);
      for (let k = 0; k < tmpNear.length; k++) {
        const c = tmpNear[k];
        if (c.y0 >= yb + ht) continue;
        if (c.type === "cyl") {
          if (c.y1 <= yb + LOW) continue;
          const dx = px - c.x;
          const dz = pz - c.z;
          const d = Math.hypot(dx, dz);
          const pen = c.r + r - d;
          if (pen > 0) {
            const ux = d > 1e-6 ? dx / d : 1;
            const uz = d > 1e-6 ? dz / d : 0;
            px += ux * pen;
            pz += uz * pen;
            nx += ux;
            nz += uz;
            depth = Math.max(depth, pen);
            hit = true;
          }
          continue;
        }
        const dx = px - c.x;
        const dz = pz - c.z;
        const lx = dx * c.c - dz * c.s;
        const lz = dx * c.s + dz * c.c;
        const qx = clamp(lx, -c.hw, c.hw);
        const qz = clamp(lz, -c.hd, c.hd);
        if (c.type === "deck") {
          const top = c.m + c.k * qz;
          if (top <= yb + STEP_UP || top - c.thick >= yb + ht) continue;
        } else if (c.y1 <= yb + LOW) continue;
        let ex = lx - qx;
        let ez = lz - qz;
        let d = Math.hypot(ex, ez);
        let pen;
        if (d < 1e-6) {
          // centre inside: leave through the nearest face
          const fx = c.hw - Math.abs(lx);
          const fz = c.hd - Math.abs(lz);
          if (fx < fz) {
            ex = Math.sign(lx) || 1;
            ez = 0;
            pen = fx + r;
          } else {
            ex = 0;
            ez = Math.sign(lz) || 1;
            pen = fz + r;
          }
          d = 1;
        } else {
          pen = r - d;
          if (pen <= 0) continue;
        }
        const ulx = ex / d;
        const ulz = ez / d;
        // local → world
        const wx = ulx * c.c + ulz * c.s;
        const wz = -ulx * c.s + ulz * c.c;
        px += wx * pen;
        pz += wz * pen;
        nx += wx;
        nz += wz;
        depth = Math.max(depth, pen);
        hit = true;
      }
    }
    // arena boundary
    const B = H - r;
    if (px > B) (px = B), (nx -= 1), (hit = true);
    if (px < -B) (px = -B), (nx += 1), (hit = true);
    if (pz > B) (pz = B), (nz -= 1), (hit = true);
    if (pz < -B) (pz = -B), (nz += 1), (hit = true);
    const nl = Math.hypot(nx, nz) || 1;
    push.x = px;
    push.z = pz;
    push.hit = hit;
    push.nx = nx / nl;
    push.nz = nz / nl;
    push.depth = depth;
    return push;
  }

  /** true if the point is inside any solid collider (used by tests / spawns) */
  function solidAt(x, z, r, yb, ht) {
    const p = collideCircle(x, z, r, yb, ht);
    return Math.hypot(p.x - x, p.z - z) > 0.01;
  }

  /* ---------------------------------------------------------------- raycast */
  const hitOut = { t: 1, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, what: null, col: null };
  // Cyrus–Beck on a convex shape given as local planes n·p <= d
  function clipConvex(planes, ax, ay, az, dx, dy, dz) {
    let t0 = 0;
    let t1 = 1;
    let ni = -1;
    for (let p = 0; p < planes.length; p += 4) {
      const nx = planes[p];
      const ny = planes[p + 1];
      const nz = planes[p + 2];
      const d = planes[p + 3];
      const num = d - (nx * ax + ny * ay + nz * az);
      const den = nx * dx + ny * dy + nz * dz;
      if (Math.abs(den) < 1e-12) {
        if (num < 0) return null;
        continue;
      }
      const t = num / den;
      if (den < 0) {
        if (t > t0) {
          t0 = t;
          ni = p;
        }
      } else if (t < t1) t1 = t;
      if (t0 > t1) return null;
    }
    return { t: t0, ni };
  }
  const planesBox = new Float64Array(24);
  function shapeHit(c, ax, ay, az, bx, by, bz) {
    if (c.type === "cyl") {
      const dx = bx - ax;
      const dz = bz - az;
      const fx = ax - c.x;
      const fz = az - c.z;
      const A = dx * dx + dz * dz;
      const B = 2 * (fx * dx + fz * dz);
      const C = fx * fx + fz * fz - c.r * c.r;
      let t;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (C <= 0) {
        // start inside the circle footprint: only the caps can be hit
        if (ay > c.y1 && by <= c.y1) {
          t = (ay - c.y1) / (ay - by);
          ny = 1;
        } else if (ay >= c.y0 && ay <= c.y1) {
          t = 0;
          ny = 1;
        } else return null;
      } else {
        if (A < 1e-12) return null;
        const disc = B * B - 4 * A * C;
        if (disc < 0) return null;
        t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t < 0 || t > 1) return null;
        const y = ay + (by - ay) * t;
        if (y > c.y1) {
          // may enter through the top cap
          if (by >= c.y1) return null;
          const tc = (ay - c.y1) / (ay - by);
          const hx = fx + dx * tc;
          const hz = fz + dz * tc;
          if (tc < 0 || tc > 1 || hx * hx + hz * hz > c.r * c.r) return null;
          t = tc;
          ny = 1;
        } else if (y < c.y0) return null;
        else {
          nx = (fx + dx * t) / c.r;
          nz = (fz + dz * t) / c.r;
        }
      }
      return { t, nx, ny, nz };
    }
    // box / deck in local frame
    const lax = (ax - c.x) * c.c - (az - c.z) * c.s;
    const laz = (ax - c.x) * c.s + (az - c.z) * c.c;
    const lbx = (bx - c.x) * c.c - (bz - c.z) * c.s;
    const lbz = (bx - c.x) * c.s + (bz - c.z) * c.c;
    const P = planesBox;
    P.set([1, 0, 0, c.hw, -1, 0, 0, c.hw, 0, 0, 1, c.hd, 0, 0, -1, c.hd]);
    // planes are [nx, ny, nz, d] in the local frame (n·p <= d inside)
    if (c.type === "box") P.set([0, 1, 0, c.y1, 0, -1, 0, -c.y0], 16);
    // deck: top y <= m + k·z, bottom y >= m + k·z − thick
    else P.set([0, 1, -c.k, c.m, 0, -1, c.k, -(c.m - c.thick)], 16);
    const r = clipConvex(P, lax, ay, laz, lbx - lax, by - ay, lbz - laz);
    if (!r) return null;
    let lnx = 0;
    let lny = 1;
    let lnz = 0;
    if (r.ni >= 0) {
      lnx = P[r.ni];
      lny = P[r.ni + 1];
      lnz = P[r.ni + 2];
      const L = Math.hypot(lnx, lny, lnz);
      lnx /= L;
      lny /= L;
      lnz /= L;
    }
    return { t: r.t, nx: lnx * c.c + lnz * c.s, ny: lny, nz: -lnx * c.s + lnz * c.c };
  }

  /**
   * First solid hit along segment a→b (terrain + colliders). Returns the
   * shared hitOut object (t ∈ [0,1], point, normal, what: 'terrain'|'col')
   * or null. `skip(c)` may exclude colliders.
   */
  function raycast(ax, ay, az, bx, by, bz, skip) {
    let best = 2;
    let bn = null;
    let bc = null;
    // colliders: 2D DDA through the hash grid
    const dx = bx - ax;
    const dz = bz - az;
    stamp++;
    let ci = cellOf(ax);
    let cj = cellOf(az);
    const ei = cellOf(bx);
    const ej = cellOf(bz);
    const si = dx > 0 ? 1 : -1;
    const sj = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    const cx0 = -E + (ci + (si > 0 ? 1 : 0)) * CELL;
    const cz0 = -E + (cj + (sj > 0 ? 1 : 0)) * CELL;
    let tmx = Math.abs(dx) > 1e-9 ? (cx0 - ax) / dx : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (cz0 - az) / dz : Infinity;
    for (let guard = 0; guard < 4 * GN; guard++) {
      const cell = grid[cj * GN + ci];
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        if (seen[c.idx] === stamp) continue;
        seen[c.idx] = stamp;
        if (skip && skip(c)) continue;
        const h = shapeHit(c, ax, ay, az, bx, by, bz);
        if (h && h.t < best) {
          best = h.t;
          bn = h;
          bc = c;
        }
      }
      // stop once the next cell starts beyond the best hit
      const tNext = Math.min(tmx, tmz);
      if (tNext > best || (ci === ei && cj === ej)) break;
      if (tmx < tmz) {
        ci += si;
        tmx += tdx;
      } else {
        cj += sj;
        tmz += tdz;
      }
      if (ci < 0 || cj < 0 || ci >= GN || cj >= GN) break;
    }
    // terrain march
    const L = Math.hypot(dx, by - ay, dz);
    const steps = Math.max(1, Math.ceil(L / 0.9));
    const tMax = Math.min(1, best);
    let tPrev = 0;
    let above = ay - groundAt(ax, az);
    let tTer = -1;
    if (above < 0) tTer = 0;
    else
      for (let s = 1; s <= steps; s++) {
        const t = (s / steps) * 1;
        if (tPrev > tMax) break;
        const y = ay + (by - ay) * t;
        const a2 = y - groundAt(ax + dx * t, az + dz * t);
        if (a2 < 0) {
          let lo = tPrev;
          let hi = t;
          for (let it = 0; it < 7; it++) {
            const mid = (lo + hi) / 2;
            const ym = ay + (by - ay) * mid;
            if (ym - groundAt(ax + dx * mid, az + dz * mid) < 0) hi = mid;
            else lo = mid;
          }
          tTer = hi;
          break;
        }
        above = a2;
        tPrev = t;
      }
    if (tTer >= 0 && tTer < best) {
      const hx = ax + dx * tTer;
      const hz = az + dz * tTer;
      normalAt(hx, hz, hitOut);
      hitOut.t = tTer;
      hitOut.x = hx;
      hitOut.y = ay + (by - ay) * tTer;
      hitOut.z = hz;
      hitOut.what = "terrain";
      hitOut.col = null;
      return hitOut;
    }
    if (best <= 1) {
      hitOut.t = best;
      hitOut.x = ax + dx * best;
      hitOut.y = ay + (by - ay) * best;
      hitOut.z = az + dz * best;
      hitOut.nx = bn.nx;
      hitOut.ny = bn.ny;
      hitOut.nz = bn.nz;
      hitOut.what = "col";
      hitOut.col = bc;
      return hitOut;
    }
    return null;
  }
  const los = (ax, ay, az, bx, by, bz) => !raycast(ax, ay, az, bx, by, bz);

  /* ---------------------------------------------------------------- surfaces */
  const water = map.water || null;
  function inWater(x, z) {
    return !!water && groundAt(x, z) < water.level - 0.35;
  }
  function surfaceType(x, z, deck) {
    if (deck) return deck.surface || "metal";
    if (inWater(x, z)) return "water";
    return map.surface ? map.surface(x, z, groundAt(x, z)) : "dirt";
  }

  return {
    map,
    H,
    E,
    N,
    RES,
    heights,
    groundAt,
    normalAt,
    surfaceAt,
    deckTop,
    collideCircle,
    solidAt,
    raycast,
    los,
    near,
    cols,
    decks,
    inWater,
    surfaceType,
    water,
  };
}
