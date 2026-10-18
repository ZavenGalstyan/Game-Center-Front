/**
 * Vice Streets 3D — static collision (framework-free).
 *
 * Every solid is an axis-aligned box {x0,z0,x1,z1,y0,y1} stored in a uniform
 * 16 m grid. District gates are extra boxes switched on while the district
 * is locked.
 *
 *   pushCircle(p, r, feet)   slide a vertical cylinder (feet height) out of walls
 *   supportAt(x, z, r, feet) highest box top under a circle that the feet can stand on
 *   segBlocked(ax,az,ay,bx,bz,by) 3-D segment vs boxes (line of sight, camera)
 *   rayDist(o, d, max)       distance along a 3-D ray to the first box (camera)
 */
import { BOUNDS } from "./city.js";

const CELL = 16;
const OX = BOUNDS.x0 - CELL * 2;
const OZ = BOUNDS.z0 - CELL * 2;
const NX = Math.ceil((BOUNDS.x1 - OX) / CELL) + 4;
const NZ = Math.ceil((BOUNDS.z1 - OZ) / CELL) + 4;

export class Collision {
  constructor(city) {
    this.city = city;
    this.grid = new Array(NX * NZ);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    for (const s of city.solids) this.insert(s);
    this.gateBoxes = new Map();
    this.stamp = 1;
  }
  range(x0, z0, x1, z1) {
    return [
      Math.max(0, Math.floor((x0 - OX) / CELL)),
      Math.min(NX - 1, Math.floor((x1 - OX) / CELL)),
      Math.max(0, Math.floor((z0 - OZ) / CELL)),
      Math.min(NZ - 1, Math.floor((z1 - OZ) / CELL)),
    ];
  }
  insert(s) {
    const [i0, i1, j0, j1] = this.range(s.x0, s.z0, s.x1, s.z1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.grid[j * NX + i].push(s);
  }
  remove(s) {
    const [i0, i1, j0, j1] = this.range(s.x0, s.z0, s.x1, s.z1);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = this.grid[j * NX + i];
        const k = c.indexOf(s);
        if (k >= 0) c.splice(k, 1);
      }
    }
  }
  /** open / close the gates of one district */
  setGates(district, closed) {
    for (const g of this.city.gates) {
      if (g.district !== district) continue;
      let box = this.gateBoxes.get(g);
      if (closed && !box) {
        box = { x0: g.x0, z0: g.z0, x1: g.x1, z1: g.z1, y0: g.y - 1, y1: g.y + 3, kind: "gate" };
        this.gateBoxes.set(g, box);
        this.insert(box);
      } else if (!closed && box) {
        this.remove(box);
        this.gateBoxes.delete(g);
      }
    }
  }
  /** boxes near a circle (deduplicated) */
  near(x, z, r, out = []) {
    out.length = 0;
    const st = ++this.stamp;
    const [i0, i1, j0, j1] = this.range(x - r, z - r, x + r, z + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const s of this.grid[j * NX + i]) {
          if (s._st === st) continue;
          s._st = st;
          if (x + r > s.x0 && x - r < s.x1 && z + r > s.z0 && z - r < s.z1) out.push(s);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle (centre p.x/p.z, radius r, feet height `feet`, body `tall`)
   * out of every box it overlaps whose top is above the feet + step.
   * Returns the summed push normal {nx, nz, hit} (hit = deepest penetration).
   */
  pushCircle(p, r, feet, tall = 1.8, step = 0.45) {
    const res = { nx: 0, nz: 0, hit: 0, solid: null };
    const list = this.near(p.x, p.z, r, this._tmp || (this._tmp = []));
    for (let pass = 0; pass < 2; pass++) {
      for (const s of list) {
        if (s.y1 <= feet + step || s.y0 >= feet + tall) continue;
        const cx = p.x < s.x0 ? s.x0 : p.x > s.x1 ? s.x1 : p.x;
        const cz = p.z < s.z0 ? s.z0 : p.z > s.z1 ? s.z1 : p.z;
        let dx = p.x - cx;
        let dz = p.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let pen;
        if (d2 < 1e-10) {
          // centre inside the box: leave by the nearest face
          const l = p.x - s.x0;
          const rr = s.x1 - p.x;
          const t = p.z - s.z0;
          const b = s.z1 - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) (dx = -1), (dz = 0), (pen = l + r);
          else if (m === rr) (dx = 1), (dz = 0), (pen = rr + r);
          else if (m === t) (dx = 0), (dz = -1), (pen = t + r);
          else (dx = 0), (dz = 1), (pen = b + r);
        } else {
          const d = Math.sqrt(d2);
          pen = r - d;
          dx /= d;
          dz /= d;
        }
        p.x += dx * pen;
        p.z += dz * pen;
        res.nx += dx;
        res.nz += dz;
        if (pen > res.hit) {
          res.hit = pen;
          res.solid = s;
        }
      }
    }
    const L = Math.hypot(res.nx, res.nz);
    if (L > 0) {
      res.nx /= L;
      res.nz /= L;
    }
    return res;
  }

  /** highest box top under the circle that is at most `step` above the feet (or -Infinity) */
  supportAt(x, z, r, feet, step = 0.45) {
    let top = -Infinity;
    for (const s of this.near(x, z, r * 0.7, this._tmp2 || (this._tmp2 = []))) {
      if (s.y1 <= feet + step && s.y1 > top && s.kind !== "pole") top = s.y1;
    }
    return top;
  }

  /** is the 3-D segment blocked by any box? (ignores thin poles) */
  segBlocked(ax, az, ay, bx, bz, by, ignorePoles = true) {
    return this.segHit(ax, az, ay, bx, bz, by, ignorePoles) < 1;
  }
  /** fraction (0..1) along a 3-D segment of the first box hit; 1 when clear */
  segHit(ax, az, ay, bx, bz, by, ignorePoles = true) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    let best = 1;
    const st = ++this.stamp;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const [i0, i1, j0, j1] = this.range(x - 1, z - 1, x + 1, z + 1);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          for (const s of this.grid[j * NX + i]) {
            if (s._st === st) continue;
            s._st = st;
            if (ignorePoles && (s.kind === "pole" || s.kind === "fence" || s.kind === "gate")) continue;
            const h = slab(ax, ay, az, dx, dy, dz, s);
            if (h < best) best = h;
          }
        }
      }
      if (best < t) break;
    }
    return best;
  }
}

/** ray/box slab test, returns entry t in [0,1] or 1 when missed */
function slab(ax, ay, az, dx, dy, dz, s) {
  let t0 = 0;
  let t1 = 1;
  const axes = [
    [ax, dx, s.x0, s.x1],
    [ay, dy, s.y0, s.y1],
    [az, dz, s.z0, s.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return 1;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return 1;
  }
  return t0;
}
