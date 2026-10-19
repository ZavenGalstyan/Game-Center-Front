/**
 * Hulk: Open World 3D — collision queries over the city (framework-free).
 *
 * Static boxes live in a uniform 16 m grid; solid intact props live in a
 * second grid that the sim keeps up to date (addProp / removeProp /
 * moveProp). Everything is axis-aligned; a ramp box's walkable top varies
 * linearly along one axis.
 *
 *   groundAt(x, z, feet, step, r)  highest walkable surface ≤ feet + step
 *   pushOut(e, r, h, step)         slide a vertical cylinder out of walls
 *   raycast(o, d, maxT, opt)       first hit along a ray (boxes, props, terrain)
 *   losClear(a, b)                 static line of sight
 */
import { BOUNDS, RIVER } from "./city.js";

const CELL = 16;
const ORIGIN = BOUNDS.min - CELL;
const DIM = Math.ceil((BOUNDS.max - ORIGIN + CELL) / CELL);

export const rampTop = (b, x, z) => {
  const r = b.ramp;
  const c = r.axis === "x" ? x : z;
  const u = Math.min(1, Math.max(0, (c - r.a) / (r.b - r.a)));
  return r.h0 + (r.h1 - r.h0) * u;
};
export const boxTop = (b, x, z) => (b.ramp ? rampTop(b, x, z) : b.y1);

export class Collision {
  constructor(city) {
    this.city = city;
    this.boxes = city.boxes;
    this.stat = new Array(DIM * DIM);
    this.dyn = new Array(DIM * DIM);
    for (let i = 0; i < this.stat.length; i++) {
      this.stat[i] = [];
      this.dyn[i] = [];
    }
    for (const b of this.boxes) this._insert(this.stat, b, b);
    this.stamp = 1;
    this.mark = new Uint32Array(this.boxes.length);
    this.props = []; // prop records registered as solid (sim owns them)
  }
  _cellRange(x0, z0, x1, z1) {
    const i0 = Math.max(0, Math.floor((x0 - ORIGIN) / CELL));
    const i1 = Math.min(DIM - 1, Math.floor((x1 - ORIGIN) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - ORIGIN) / CELL));
    const j1 = Math.min(DIM - 1, Math.floor((z1 - ORIGIN) / CELL));
    return [i0, i1, j0, j1];
  }
  _insert(grid, b, item) {
    const [i0, i1, j0, j1] = this._cellRange(b.x0, b.z0, b.x1, b.z1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[j * DIM + i].push(item);
  }
  _remove(grid, b, item) {
    const [i0, i1, j0, j1] = this._cellRange(b.x0, b.z0, b.x1, b.z1);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = grid[j * DIM + i];
        const k = c.indexOf(item);
        if (k >= 0) c.splice(k, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- dynamic props */
  /** prop.box = {x0,y0,z0,x1,y1,z1} is computed by the sim */
  addProp(p) {
    if (p._in) return;
    p._in = { ...p.box };
    this._insert(this.dyn, p._in, p);
  }
  removeProp(p) {
    if (!p._in) return;
    this._remove(this.dyn, p._in, p);
    p._in = null;
  }
  moveProp(p) {
    this.removeProp(p);
    this.addProp(p);
  }
  /** solid props whose box overlaps the xz rectangle */
  propsIn(x0, z0, x1, z1, out = []) {
    const [i0, i1, j0, j1] = this._cellRange(x0, z0, x1, z1);
    const st = ++this.stamp;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const p of this.dyn[j * DIM + i]) {
          if (p._st === st) continue;
          p._st = st;
          const b = p._in;
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          out.push(p);
        }
      }
    }
    return out;
  }
  /** static boxes overlapping the xz rectangle */
  boxesIn(x0, z0, x1, z1, out = []) {
    const [i0, i1, j0, j1] = this._cellRange(x0, z0, x1, z1);
    const st = ++this.stamp;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const b of this.stat[j * DIM + i]) {
          if (this.mark[b.id] === st) continue;
          this.mark[b.id] = st;
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- ground */
  /**
   * Highest walkable surface under (x, z) whose top is ≤ feet + step.
   * `r` widens the footprint so you can stand on an edge. Returns
   * { y, box|prop|null, water }.
   */
  groundAt(x, z, feet, step = 1.2, r = 0.5, withProps = true) {
    let y = this.city.terrainH(x, z);
    let on = null;
    const lim = feet + step;
    const tmp = this._tmp || (this._tmp = []);
    tmp.length = 0;
    const fr = r * 0.6;
    this.boxesIn(x - fr, z - fr, x + fr, z + fr, tmp);
    for (const b of tmp) {
      if (x < b.x0 - fr || x > b.x1 + fr || z < b.z0 - fr || z > b.z1 + fr) continue;
      const top = b.ramp ? rampTop(b, x, z) : b.y1;
      if (top <= lim && top > y) {
        y = top;
        on = b;
      }
    }
    if (withProps) {
      tmp.length = 0;
      this.propsIn(x - fr, z - fr, x + fr, z + fr, tmp);
      for (const p of tmp) {
        if (!p.solid) continue;
        const b = p._in;
        if (x < b.x0 - fr || x > b.x1 + fr || z < b.z0 - fr || z > b.z1 + fr) continue;
        if (b.y1 <= lim && b.y1 > y) {
          y = b.y1;
          on = p;
        }
      }
    }
    const water = this.city.water(x, z) && y < RIVER.water;
    return { y, on, water };
  }

  /* ---------------------------------------------------------------- walls */
  /**
   * Push a vertical cylinder (feet at e.y, height h) out of every box it
   * overlaps that is too tall to step onto. Returns the last contact
   * normal (or null). Iterates so corners resolve cleanly.
   */
  pushOut(e, r, h, step = 1.2, withProps = true, hits = null) {
    let contact = null;
    const tmp = this._tmp2 || (this._tmp2 = []);
    const ptmp = this._tmp3 || (this._tmp3 = []);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      tmp.length = 0;
      this.boxesIn(e.x - r, e.z - r, e.x + r, e.z + r, tmp);
      let list = tmp;
      if (withProps) {
        ptmp.length = 0;
        this.propsIn(e.x - r, e.z - r, e.x + r, e.z + r, ptmp);
        if (ptmp.length) list = tmp.concat(ptmp.filter((p) => p.solid).map((p) => p._in));
      }
      for (const b of list) {
        const top = b.ramp ? rampTop(b, e.x, e.z) : b.y1;
        if (top <= e.y + step || b.y0 >= e.y + h) continue;
        if (b.ramp) continue; // ramps are walked, never pushed against
        const cx = e.x < b.x0 ? b.x0 : e.x > b.x1 ? b.x1 : e.x;
        const cz = e.z < b.z0 ? b.z0 : e.z > b.z1 ? b.z1 : e.z;
        let dx = e.x - cx;
        let dz = e.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx;
        let nz;
        let pen;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = dx / d;
          nz = dz / d;
          pen = r - d;
        } else {
          // centre inside the box: leave by the nearest face
          const l = e.x - b.x0;
          const rr = b.x1 - e.x;
          const f = e.z - b.z0;
          const k = b.z1 - e.z;
          const m = Math.min(l, rr, f, k);
          if (m === l) (nx = -1), (nz = 0), (pen = l + r);
          else if (m === rr) (nx = 1), (nz = 0), (pen = rr + r);
          else if (m === f) (nx = 0), (nz = -1), (pen = f + r);
          else (nx = 0), (nz = 1), (pen = k + r);
        }
        e.x += nx * (pen + 1e-4);
        e.z += nz * (pen + 1e-4);
        contact = { nx, nz, box: b };
        if (hits) hits.push(b);
        moved = true;
      }
      if (!moved) break;
    }
    return contact;
  }
  /** lowest box bottom above `y` over (x, z) — the ceiling */
  ceilingAt(x, z, y, r = 0.5) {
    let c = Infinity;
    const tmp = this._tmp4 || (this._tmp4 = []);
    tmp.length = 0;
    this.boxesIn(x - r, z - r, x + r, z + r, tmp);
    for (const b of tmp) {
      if (b.ramp) continue;
      if (x < b.x0 - r * 0.5 || x > b.x1 + r * 0.5 || z < b.z0 - r * 0.5 || z > b.z1 + r * 0.5) continue;
      if (b.y0 >= y - 0.05 && b.y0 < c) c = b.y0;
    }
    return c;
  }

  /* ---------------------------------------------------------------- rays */
  /**
   * First hit along o + d·t, t ∈ (0, maxT]. d need not be normalised (t is in
   * units of |d|). opt: { props: bool, terrain: bool, skipProp }.
   * Returns { t, x, y, z, nx, ny, nz, box?, prop?, terrain? } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, opt = {}) {
    let best = maxT;
    let hit = null;
    const len = Math.hypot(dx, dz);
    // grid DDA over xz cells
    let i = Math.floor((ox - ORIGIN) / CELL);
    let j = Math.floor((oz - ORIGIN) / CELL);
    const si = dx > 0 ? 1 : -1;
    const sj = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (i + 1) * CELL + ORIGIN - ox : ox - (i * CELL + ORIGIN)) / Math.abs(dx)) : Infinity;
    let tz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (j + 1) * CELL + ORIGIN - oz : oz - (j * CELL + ORIGIN)) / Math.abs(dz)) : Infinity;
    const st = ++this.stamp;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (i >= 0 && j >= 0 && i < DIM && j < DIM) {
        for (const b of this.stat[j * DIM + i]) {
          if (this.mark[b.id] === st) continue;
          this.mark[b.id] = st;
          const h = slab(b, ox, oy, oz, dx, dy, dz, best);
          if (h && h.t < best) {
            if (b.ramp) {
              const rh = rampHit(b, ox, oy, oz, dx, dy, dz, h.t, h.tOut);
              if (!rh || rh.t >= best) continue;
              best = rh.t;
              hit = { ...rh, box: b };
            } else {
              best = h.t;
              hit = { t: h.t, nx: h.nx, ny: h.ny, nz: h.nz, box: b };
            }
          }
        }
        if (opt.props) {
          for (const p of this.dyn[j * DIM + i]) {
            if (p._st === st || p === opt.skipProp) continue;
            p._st = st;
            if (!p.solid && !opt.all) continue;
            const h = slab(p._in, ox, oy, oz, dx, dy, dz, best);
            if (h && h.t < best) {
              best = h.t;
              hit = { t: h.t, nx: h.nx, ny: h.ny, nz: h.nz, prop: p };
            }
          }
        }
      }
      if (tCell > best || len < 1e-9) break;
      if (tx < tz) {
        tCell = tx;
        tx += tdx;
        i += si;
      } else {
        tCell = tz;
        tz += tdz;
        j += sj;
      }
      if (tCell > best) break;
      if (i < -1 || j < -1 || i > DIM || j > DIM) break;
    }
    if (opt.terrain !== false) {
      // march the terrain (only bumpy in the outskirts and the river)
      const L = Math.hypot(dx, dy, dz) * best;
      const n = Math.min(60, Math.max(2, Math.ceil(L / 2.5)));
      let pt = 0;
      for (let k = 1; k <= n; k++) {
        const t = (best * k) / n;
        const x = ox + dx * t;
        const y = oy + dy * t;
        const z = oz + dz * t;
        if (y < this.city.terrainH(x, z) - 0.02) {
          let a = pt;
          let b2 = t;
          for (let s = 0; s < 6; s++) {
            const m = (a + b2) / 2;
            if (oy + dy * m < this.city.terrainH(ox + dx * m, oz + dz * m)) b2 = m;
            else a = m;
          }
          if (b2 < best) {
            best = b2;
            hit = { t: b2, nx: 0, ny: 1, nz: 0, terrain: true };
          }
          break;
        }
        pt = t;
      }
    }
    if (hit) {
      hit.x = ox + dx * hit.t;
      hit.y = oy + dy * hit.t;
      hit.z = oz + dz * hit.t;
    }
    return hit;
  }
  /** static line of sight between two points (terrain + buildings) */
  losClear(ax, ay, az, bx, by, bz) {
    const h = this.raycast(ax, ay, az, bx - ax, by - ay, bz - az, 1, { terrain: true });
    return !h || h.t > 0.985;
  }
}

/** ray vs AABB slab test → {t, tOut, nx, ny, nz} (entry face) or null */
function slab(b, ox, oy, oz, dx, dy, dz, maxT) {
  let t0 = 0;
  let t1 = maxT;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  // x
  if (Math.abs(dx) < 1e-12) {
    if (ox < b.x0 || ox > b.x1) return null;
  } else {
    let a = (b.x0 - ox) / dx;
    let c = (b.x1 - ox) / dx;
    let n = -1;
    if (a > c) {
      const s = a;
      a = c;
      c = s;
      n = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = n;
      ny = 0;
      nz = 0;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  // y
  if (Math.abs(dy) < 1e-12) {
    if (oy < b.y0 || oy > b.y1) return null;
  } else {
    let a = (b.y0 - oy) / dy;
    let c = (b.y1 - oy) / dy;
    let n = -1;
    if (a > c) {
      const s = a;
      a = c;
      c = s;
      n = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = 0;
      ny = n;
      nz = 0;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  // z
  if (Math.abs(dz) < 1e-12) {
    if (oz < b.z0 || oz > b.z1) return null;
  } else {
    let a = (b.z0 - oz) / dz;
    let c = (b.z1 - oz) / dz;
    let n = -1;
    if (a > c) {
      const s = a;
      a = c;
      c = s;
      n = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = 0;
      ny = 0;
      nz = n;
    }
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return { t: t0, tOut: t1, nx, ny, nz };
}
function rampHit(b, ox, oy, oz, dx, dy, dz, tIn, tOut) {
  const under = (t) => oy + dy * t <= rampTop(b, ox + dx * t, oz + dz * t);
  if (under(tIn)) return { t: tIn, nx: 0, ny: 1, nz: 0 };
  let prev = tIn;
  for (let k = 1; k <= 10; k++) {
    const t = tIn + ((tOut - tIn) * k) / 10;
    if (under(t)) {
      let a = prev;
      let c = t;
      for (let s = 0; s < 6; s++) {
        const m = (a + c) / 2;
        if (under(m)) c = m;
        else a = m;
      }
      return { t: c, nx: 0, ny: 1, nz: 0 };
    }
    prev = t;
  }
  return null;
}
