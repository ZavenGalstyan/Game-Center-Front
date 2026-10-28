/**
 * Collision world: axis-aligned boxes and vertical cylinders with a y-span,
 * pits (the ground drops away), moving platforms and the arena's keep-inside
 * ring. Everything a 1.8 m capsule can step onto (top within STEP of its
 * feet) is floor; everything taller that overlaps its body is wall.
 *
 * Static shapes live in an 8 m spatial hash; dynamic ones (gates, slabs, the
 * bridge, platforms…) are few and checked every query.
 */
import { LAYOUT, PITS, PLATFORMS, ARENA } from "../data/layout.js";

export const STEP = 0.48;
const CELL = 8;
const PIT_FLOOR = -60;

export function createCollision() {
  const hash = new Map();
  const key = (cx, cz) => cx * 73856093 + cz * 19349663;
  const insert = (s, x0, x1, z0, z1) => {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz);
        let a = hash.get(k);
        if (!a) hash.set(k, (a = []));
        a.push(s);
      }
  };
  const statics = [];
  for (const b of LAYOUT.boxes) {
    const s = { t: "b", ...b, on: true };
    statics.push(s);
    insert(s, b.x0, b.x1, b.z0, b.z1);
  }
  for (const c of LAYOUT.circles) {
    const s = { t: "c", ...c, on: true };
    statics.push(s);
    insert(s, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
  }
  const dyn = new Map(); // id → shape
  const platforms = PLATFORMS.map((p) => ({ t: "b", id: p.id, kind: "floor", platform: true, def: p, on: true, x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0, dx: 0, dy: 0, dz: 0 }));
  let ring = null;
  let stamp = 0;

  function near(x0, x1, z0, z1, out) {
    stamp++;
    out.length = 0;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const a = hash.get(key(cx, cz));
        if (!a) continue;
        for (const s of a) {
          if (s._st === stamp) continue;
          s._st = stamp;
          out.push(s);
        }
      }
    for (const s of dyn.values()) if (s.on) out.push(s);
    for (const s of platforms) if (s.on) out.push(s);
    return out;
  }
  const tmp = [];

  function inPit(x, z) {
    for (const p of PITS) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
    return false;
  }

  const api = {
    statics,
    platforms,
    /** Register / replace a dynamic collider: {x0,x1,z0,z1,y0,y1} or {x,z,r,y0,y1}. */
    setDynamic(id, shape, on = true) {
      const s = shape.r != null ? { t: "c", ...shape } : { t: "b", ...shape };
      s.id = id;
      s.on = on;
      s.kind = shape.kind || (s.y1 <= STEP ? "floor" : "wall");
      dyn.set(id, s);
      return s;
    },
    getDynamic: (id) => dyn.get(id),
    enable(id, on) {
      const s = dyn.get(id);
      if (s) s.on = on;
    },
    setRing(r) {
      ring = r;
    },
    get ring() {
      return ring;
    },
    inPit,
    /** Move platforms to time t (seconds). Stores per-step deltas. */
    updatePlatforms(t, active = () => true) {
      for (const s of platforms) {
        const p = s.def;
        const on = active(p.id);
        const u = (t / p.period + p.phase) % 1;
        // ping-pong with a dwell at each end so there is time to step on / off
        const tri = u < 0.5 ? u * 2 : 2 - u * 2;
        const m = Math.min(1, Math.max(0, (tri - 0.18) / 0.64));
        const k = on ? m * m * (3 - 2 * m) : 0;
        const cx = p.a[0] + (p.b[0] - p.a[0]) * k;
        const cy = p.a[1] + (p.b[1] - p.a[1]) * k;
        const cz = p.a[2] + (p.b[2] - p.a[2]) * k;
        const ox = (s.x0 + s.x1) / 2;
        const oz = (s.z0 + s.z1) / 2;
        const oy = s.y1;
        const first = s.x1 === 0 && s.x0 === 0;
        s.x0 = cx - p.w / 2;
        s.x1 = cx + p.w / 2;
        s.z0 = cz - p.d / 2;
        s.z1 = cz + p.d / 2;
        s.y1 = cy;
        s.y0 = cy - 0.35;
        s.dx = first ? 0 : cx - ox;
        s.dz = first ? 0 : cz - oz;
        s.dy = first ? 0 : cy - oy;
      }
    },
    /**
     * Highest walkable surface under (x,z) not above y+STEP.
     * Returns the height; `api.lastFloor` is the shape stood on (or null).
     */
    ground(x, z, y = 0, r = 0.22) {
      let g = inPit(x, z) ? PIT_FLOOR : 0;
      let on = null;
      if (ring && Math.hypot(x - ring.x, z - ring.z) > ring.r + 6) g = PIT_FLOOR;
      const lim = y + STEP + 0.01;
      for (const s of near(x - r, x + r, z - r, z + r, tmp)) {
        if (!s.on || s.y1 > lim || s.y1 < g - 1e-3) continue;
        if (s.t === "b") {
          if (x + r < s.x0 || x - r > s.x1 || z + r < s.z0 || z - r > s.z1) continue;
        } else if ((x - s.x) ** 2 + (z - s.z) ** 2 > (s.r + r) ** 2) continue;
        if (Math.abs(s.y1 - g) <= 1e-3 && on) {
          // level tie (two platforms side by side): the one we're more over wins
          const dc = (q) => (q.t === "b" ? Math.hypot(x - (q.x0 + q.x1) / 2, z - (q.z0 + q.z1) / 2) : Math.hypot(x - q.x, z - q.z));
          if (!(s.platform && (!on.platform || dc(s) < dc(on)))) continue;
        } else if (s.y1 <= g) continue;
        g = s.y1;
        on = s;
      }
      api.lastFloor = on;
      return g;
    },
    /**
     * Push a body of radius r and height h standing at y out of everything
     * solid. Mutates e.x / e.z. Returns true if something was hit.
     */
    resolve(e, r, h = 1.8) {
      let hit = false;
      const y = e.y;
      for (let pass = 0; pass < 2; pass++) {
        for (const s of near(e.x - r - 0.1, e.x + r + 0.1, e.z - r - 0.1, e.z + r + 0.1, tmp)) {
          if (!s.on || s.y1 <= y + STEP || s.y0 >= y + h) continue;
          if (s.t === "b") {
            const cx = Math.max(s.x0, Math.min(e.x, s.x1));
            const cz = Math.max(s.z0, Math.min(e.z, s.z1));
            let dx = e.x - cx;
            let dz = e.z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            hit = true;
            if (d2 > 1e-9) {
              const d = Math.sqrt(d2);
              e.x = cx + (dx / d) * r;
              e.z = cz + (dz / d) * r;
            } else {
              // centre inside: leave by the shallowest side
              const pl = e.x - s.x0;
              const pr = s.x1 - e.x;
              const pb = e.z - s.z0;
              const pf = s.z1 - e.z;
              const m = Math.min(pl, pr, pb, pf);
              if (m === pl) e.x = s.x0 - r;
              else if (m === pr) e.x = s.x1 + r;
              else if (m === pb) e.z = s.z0 - r;
              else e.z = s.z1 + r;
            }
          } else {
            const dx = e.x - s.x;
            const dz = e.z - s.z;
            const R = s.r + r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= R * R) continue;
            hit = true;
            const d = Math.sqrt(d2) || 1e-4;
            e.x = s.x + (dx / d) * R;
            e.z = s.z + (dz / d) * R;
          }
        }
      }
      if (ring) {
        const dx = e.x - ring.x;
        const dz = e.z - ring.z;
        const d = Math.hypot(dx, dz);
        if (d > ring.r - r) {
          e.x = ring.x + (dx / d) * (ring.r - r);
          e.z = ring.z + (dz / d) * (ring.r - r);
          hit = true;
        }
      }
      return hit;
    },
    /**
     * Ray → distance to the first solid hit (≤ max). opts.noTrees skips
     * foliage; opts.noFloors ignores walkable shapes; opts.skip(shape).
     */
    raycast(px, py, pz, dx, dy, dz, max, opts = {}) {
      let best = max;
      const ex = px + dx * max;
      const ez = pz + dz * max;
      for (const s of near(Math.min(px, ex) - 1, Math.max(px, ex) + 1, Math.min(pz, ez) - 1, Math.max(pz, ez) + 1, tmp)) {
        if (!s.on) continue;
        if (opts.noTrees && s.tree) continue;
        if (opts.noFloors && s.y1 <= STEP + 0.6) continue;
        if (opts.noLow && s.y1 < 1.6 && s.kind !== "floor") continue;
        if (s.kind === "thicket" && opts.noTrees) continue;
        if (opts.skip && opts.skip(s)) continue;
        const t = s.t === "b" ? rayBox(px, py, pz, dx, dy, dz, s) : rayCyl(px, py, pz, dx, dy, dz, s);
        if (t >= 0 && t < best) best = t;
      }
      if (inPit(px, pz) || inPit(ex, ez)) {
        // pits have no floor: nothing to hit there
      } else if (dy < -1e-6 && !opts.noGround) {
        const t = (0 - py) / dy;
        if (t >= 0 && t < best) best = t;
      }
      return best;
    },
    /** Clear line between two points? */
    los(ax, ay, az, bx, by, bz, opts = { noTrees: false }) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-4) return true;
      return api.raycast(ax, ay, az, dx / L, dy / L, dz / L, L, { ...opts, noGround: true }) >= L - 0.05;
    },
    lastFloor: null,
  };
  if (ARENA) api.arena = ARENA;
  return api;
}

function rayBox(px, py, pz, dx, dy, dz, s) {
  let t0 = -Infinity;
  let t1 = Infinity;
  const ax = [
    [px, dx, s.x0, s.x1],
    [py, dy, s.y0, s.y1],
    [pz, dz, s.z0, s.z1],
  ];
  for (const [p, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return -1;
    } else {
      let a = (lo - p) / d;
      let b = (hi - p) / d;
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  if (t1 < 0) return -1;
  return t0 >= 0 ? t0 : 0;
}
function rayCyl(px, py, pz, dx, dy, dz, s) {
  const ox = px - s.x;
  const oz = pz - s.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - s.r * s.r;
  let t;
  if (c <= 0) t = 0;
  else {
    if (a < 1e-9) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return -1;
  }
  const y = py + dy * t;
  if (y < s.y0 || y > s.y1) {
    // could still enter through a cap — rare for our uses; ignore
    return -1;
  }
  return t;
}
