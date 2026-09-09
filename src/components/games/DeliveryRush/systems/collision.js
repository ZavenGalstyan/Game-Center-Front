/**
 * Delivery Rush — world queries: what am I driving on, and what am I hitting.
 *
 * The visual mesh is never used for collision. Instead the layout hands over
 * a list of oriented boxes (buildings, walls, containers, lamp posts, parked
 * cars) and a list of surface rectangles, and both are bucketed into a uniform
 * grid at load time. Every physics step then touches only the handful of
 * objects in the cells around the car, which is what keeps collision cost flat
 * whether the district has 200 solids or 1,200.
 *
 * The car itself is approximated by two circles (front axle and rear axle)
 * rather than a box: it slides along walls instead of catching on corners,
 * which is exactly the arcade feel we want.
 */

const CELL = 18;

/** Per-surface handling. `accel` scales engine force, `grip` scales cornering. */
export const SURFACES = {
  road: { grip: 1.0, accel: 1.0, y: 0.022, rough: 0 },
  lot: { grip: 0.97, accel: 0.98, y: 0.016, rough: 0 },
  path: { grip: 0.88, accel: 0.82, y: 0.166, rough: 0.35 },
  sidewalk: { grip: 0.9, accel: 0.7, y: 0.16, rough: 0.8 },
  grass: { grip: 0.7, accel: 0.55, y: 0.006, rough: 0.55 },
  parkgrass: { grip: 0.7, accel: 0.55, y: 0.152, rough: 0.55 },
  sand: { grip: 0.58, accel: 0.44, y: 0.008, rough: 0.7 },
  water: { grip: 0.35, accel: 0.12, y: -0.05, rough: 0.2, drown: true },
  ground: { grip: 0.66, accel: 0.5, y: 0, rough: 0.6 },
};

export class WorldIndex {
  constructor(layout) {
    this.layout = layout;
    this.bounds = layout.playBounds;
    this.solidGrid = new Map();
    this.roadGrid = new Map();
    this.rectGrid = new Map();

    layout.solids.forEach((s, i) => {
      const r = Math.hypot(s.hw, s.hd);
      this._put(this.solidGrid, s.x - r, s.z - r, s.x + r, s.z + r, i);
    });

    // roads are stored with their derived direction so the surface test is a
    // point-to-segment distance rather than a polygon test
    this.roads = layout.roads.map((r) => {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1;
      return {
        ax: r.ax, az: r.az,
        ux: (r.bx - r.ax) / len, uz: (r.bz - r.az) / len,
        len, hw: r.w / 2, type: r.type,
      };
    });
    this.roads.forEach((r, i) => {
      const x0 = Math.min(r.ax, r.ax + r.ux * r.len) - r.hw;
      const x1 = Math.max(r.ax, r.ax + r.ux * r.len) + r.hw;
      const z0 = Math.min(r.az, r.az + r.uz * r.len) - r.hw;
      const z1 = Math.max(r.az, r.az + r.uz * r.len) + r.hw;
      this._put(this.roadGrid, x0, z0, x1, z1, i);
    });

    // every rectangular surface: pavement, park lawn, lot, sand, water, path
    this.rects = [];
    for (const w of layout.walks) {
      this.rects.push({ ...w, kind: w.park ? "parkring" : "sidewalk", pri: 2 });
      if (w.park) this.rects.push({ ...w.inner, kind: "parkgrass", pri: 3 });
    }
    for (const s of layout.surfaces) {
      const pri = s.kind === "path" ? 5 : s.kind === "lot" ? 4 : s.kind === "water" ? 6 : 1;
      this.rects.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, kind: s.kind, pri, pond: s.pond });
    }
    this.rects.forEach((r, i) => this._put(this.rectGrid, r.x0, r.z0, r.x1, r.z1, i));

    this._tmp = [];
  }

  _put(grid, x0, z0, x1, z1, idx) {
    const cx0 = Math.floor(x0 / CELL);
    const cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL);
    const cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 73856093 + cz * 19349663;
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(idx);
      }
    }
  }

  _cell(grid, x, z) {
    return grid.get(Math.floor(x / CELL) * 73856093 + Math.floor(z / CELL) * 19349663);
  }

  /* ------------------------------------------------------------- surfaces */

  /**
   * What the car is standing on. Roads win over everything, then paths, lots
   * and pavement, then open ground — so a road crossing a park still drives
   * like a road.
   */
  surfaceAt(x, z) {
    const rl = this._cell(this.roadGrid, x, z);
    if (rl) {
      for (let i = 0; i < rl.length; i++) {
        const r = this.roads[rl[i]];
        const dx = x - r.ax;
        const dz = z - r.az;
        const t = dx * r.ux + dz * r.uz;
        if (t < -1 || t > r.len + 1) continue;
        const px = dx - r.ux * t;
        const pz = dz - r.uz * t;
        if (px * px + pz * pz <= r.hw * r.hw) return SURFACES.road;
      }
    }

    let best = null;
    let bestPri = -1;
    const cl = this._cell(this.rectGrid, x, z);
    if (cl) {
      for (let i = 0; i < cl.length; i++) {
        const r = this.rects[cl[i]];
        if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
        if (r.pri > bestPri) {
          bestPri = r.pri;
          best = r;
        }
      }
    }
    if (!best) return SURFACES.ground;
    switch (best.kind) {
      case "water": return SURFACES.water;
      case "path": return SURFACES.path;
      case "lot": return SURFACES.lot;
      case "parkgrass": return SURFACES.parkgrass;
      case "parkring":
      case "sidewalk": return SURFACES.sidewalk;
      case "sand": return SURFACES.sand;
      case "grass": return SURFACES.grass;
      default: return SURFACES.ground;
    }
  }

  outOfBounds(x, z, margin = 30) {
    const b = this.bounds;
    return x < b.minX - margin || x > b.maxX + margin || z < b.minZ - margin || z > b.maxZ + margin;
  }

  /* ------------------------------------------------------------ collision */

  /**
   * Push a circle out of every solid it overlaps.
   *
   * Returns null when nothing was hit, otherwise the total correction plus the
   * deepest contact normal and how "soft" that object was (a lamp post barely
   * slows you; a building stops you dead).
   */
  resolveCircle(x, z, radius) {
    const list = this._cell(this.solidGrid, x, z);
    if (!list) return null;
    const solids = this.layout.solids;
    let px = 0;
    let pz = 0;
    let depth = 0;
    let nx = 0;
    let nz = 0;
    let soft = 1;
    let hit = false;

    for (let i = 0; i < list.length; i++) {
      const s = solids[list[i]];
      const dx = x - s.x;
      const dz = z - s.z;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      // into box space (inverse of the yaw rotation used when placing it)
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      const cx = lx < -s.hw ? -s.hw : lx > s.hw ? s.hw : lx;
      const cz = lz < -s.hd ? -s.hd : lz > s.hd ? s.hd : lz;
      let ox = lx - cx;
      let oz = lz - cz;
      let d2 = ox * ox + oz * oz;
      if (d2 > radius * radius) continue;

      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        // centre is inside the box: escape through the nearest face
        const toX = s.hw - Math.abs(lx);
        const toZ = s.hd - Math.abs(lz);
        if (toX < toZ) {
          ox = lx >= 0 ? 1 : -1;
          oz = 0;
          d = -toX;
        } else {
          ox = 0;
          oz = lz >= 0 ? 1 : -1;
          d = -toZ;
        }
      } else {
        ox /= d;
        oz /= d;
      }
      const pen = radius - d;
      if (pen <= 0) continue;
      // back to world space
      const wx = ox * c + oz * sn;
      const wz = -ox * sn + oz * c;
      px += wx * pen;
      pz += wz * pen;
      hit = true;
      if (pen > depth) {
        depth = pen;
        nx = wx;
        nz = wz;
        soft = s.soft || 0;
      }
    }
    if (!hit) return null;
    return { px, pz, nx, nz, depth, soft };
  }

  /* -------------------------------------------------------------- respawn */

  /** Nearest point on any road centreline, with the road's heading. */
  nearestRoadPoint(x, z) {
    let bestD = Infinity;
    let out = { x: 0, z: 0, yaw: 0 };
    for (const r of this.roads) {
      const dx = x - r.ax;
      const dz = z - r.az;
      let t = dx * r.ux + dz * r.uz;
      t = t < 4 ? 4 : t > r.len - 4 ? Math.max(4, r.len - 4) : t;
      const cx = r.ax + r.ux * t;
      const cz = r.az + r.uz * t;
      const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
      if (d < bestD) {
        bestD = d;
        // sit in the right-hand lane, pointing along the road
        const off = Math.min(3.2, r.hw * 0.45);
        out = {
          x: cx + r.uz * off,
          z: cz - r.ux * off,
          yaw: Math.atan2(r.ux, r.uz),
        };
      }
    }
    return out;
  }
}
