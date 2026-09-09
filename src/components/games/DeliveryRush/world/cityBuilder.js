/**
 * Delivery Rush — city layout builder (pure data, no Three.js).
 *
 * A zone layout is authored by calling a handful of high-level methods
 * (road, block, park, lot, water, location) and finish() returns a plain
 * description of the district:
 *
 *   roads     — centreline segments; the road *surface* and the traffic lane
 *               graph are both derived from these
 *   walks     — sidewalk slabs (block rect inflated by SIDEWALK_W)
 *   buildings — every placed building with its exact size/height/palette index
 *   props     — street furniture, trees, parked cars
 *   solids    — oriented boxes the player collides with
 *   surfaces  — rects tagged grass / sand / water / lot, for physics grip
 *   locations — named pickup & drop-off points referenced by missions
 *
 * Everything is generated from the zone seed, so a district is identical on
 * every visit and mission pickupId/dropoffId always point at the same corner.
 */

import { makeRng } from "../utils/rng.js";

export const SIDEWALK_W = 2.9; // sidewalk ring around every block
export const CURB_H = 0.16;

export const ROAD_W = {
  main: 17,
  street: 11,
  narrow: 8.4,
  alley: 5.6,
  service: 7.5,
};

/** how far from the centreline traffic drives, per road type */
export const LANE_OFFSET = {
  main: 4.2,
  street: 2.7,
  narrow: 2.0,
  alley: 0,
  service: 1.9,
};

const key = (x, z) => Math.round(x * 2) + ":" + Math.round(z * 2);

export class CityBuilder {
  constructor({ seed = 1, zone = null } = {}) {
    this.rng = makeRng(seed);
    this.zone = zone;
    this.roads = [];
    this.walks = [];
    this.buildings = [];
    this.props = [];
    this.solids = [];
    this.surfaces = [];
    this.locations = [];
    this.decals = [];
    this.min = [Infinity, Infinity];
    this.max = [-Infinity, -Infinity];
    this.spawn = { x: 0, z: 0, yaw: 0 };
  }

  /* ------------------------------------------------------------------ roads */

  road(ax, az, bx, bz, type = "street") {
    const w = ROAD_W[type] || ROAD_W.street;
    this.roads.push({ ax, az, bx, bz, w, type });
    this._grow(Math.min(ax, bx) - w, Math.min(az, bz) - w);
    this._grow(Math.max(ax, bx) + w, Math.max(az, bz) + w);
    return this;
  }

  /** A curved road given as a polyline — each leg becomes its own segment. */
  polyRoad(points, type = "street") {
    for (let i = 0; i < points.length - 1; i++) {
      this.road(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], type);
    }
    return this;
  }

  /* ----------------------------------------------------------------- blocks */

  /**
   * A city block: sidewalk ring + buildings around the perimeter.
   *
   * opts.kinds    building families to draw from
   * opts.heights  [min,max] storeys
   * opts.fill     "perimeter" (default) or "row" (one side only)
   * opts.shops    probability a ground floor gets a shopfront
   */
  block(x0, z0, x1, z1, opts = {}) {
    const r = this.rng;
    const rect = norm(x0, z0, x1, z1);
    this.walks.push({ ...inflate(rect, SIDEWALK_W), inner: rect });
    this._growRect(inflate(rect, SIDEWALK_W));

    const {
      kinds = ["apartment", "office", "shop", "townhouse"],
      heights = [3, 7],
      fill = "perimeter",
      shops = 0.45,
      trees = 2.4,
      lamps = 2.0,
      treeKind = "tree",
      minDepth = 9,
      maxDepth = 15,
      widthRange = [7, 15],
      sides = null,
    } = opts;

    const edges = [
      { n: "south", a: [rect.x0, rect.z1], b: [rect.x1, rect.z1], yaw: 0 },
      { n: "north", a: [rect.x1, rect.z0], b: [rect.x0, rect.z0], yaw: Math.PI },
      { n: "east", a: [rect.x1, rect.z1], b: [rect.x1, rect.z0], yaw: Math.PI / 2 },
      { n: "west", a: [rect.x0, rect.z0], b: [rect.x0, rect.z1], yaw: -Math.PI / 2 },
    ].filter((e) => !sides || sides.includes(e.n));

    const useEdges = fill === "row" ? edges.slice(0, 1) : edges;
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    const maxDep = Math.min(maxDepth, Math.min(w, d) / 2 - 0.5);
    if (maxDep < 5) return this;

    for (const e of useEdges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const dirX = (e.b[0] - e.a[0]) / len;
      const dirZ = (e.b[1] - e.a[1]) / len;
      const inX = -dirZ;
      const inZ = dirX;
      const cx = (rect.x0 + rect.x1) / 2;
      const cz = (rect.z0 + rect.z1) / 2;
      const toCentre = (cx - e.a[0]) * inX + (cz - e.a[1]) * inZ;
      const nX = toCentre >= 0 ? inX : -inX;
      const nZ = toCentre >= 0 ? inZ : -inZ;

      let t = r.range(0.5, 2.6);
      let guard = 0;
      while (t < len - 5 && guard++ < 60) {
        const bw = Math.min(r.range(widthRange[0], widthRange[1]), len - t - 0.5);
        if (bw < 5.5) break;
        const bd = r.range(minDepth, maxDep);
        const storeys = Math.round(r.range(heights[0], heights[1]));
        const mx = e.a[0] + dirX * (t + bw / 2) + nX * (bd / 2);
        const mz = e.a[1] + dirZ * (t + bw / 2) + nZ * (bd / 2);
        this.building(r.pick(kinds), mx, mz, e.yaw, {
          w: bw,
          d: bd,
          storeys,
          shop: r.chance(shops),
        });
        t += bw + r.range(0.15, 1.4);
      }
    }

    this._decorateWalk(rect, { trees, lamps, treeKind });
    return this;
  }

  /** Sidewalk furniture around a block: lamps, trees, bins, benches, hydrants. */
  _decorateWalk(rect, { trees = 2.4, lamps = 2.0, treeKind = "tree" } = {}) {
    const r = this.rng;
    const off = SIDEWALK_W * 0.5;
    const ring = inflate(rect, off);
    const edges = [
      { a: [ring.x0, ring.z0], b: [ring.x1, ring.z0], yaw: Math.PI },
      { a: [ring.x1, ring.z1], b: [ring.x0, ring.z1], yaw: 0 },
      { a: [ring.x0, ring.z1], b: [ring.x0, ring.z0], yaw: -Math.PI / 2 },
      { a: [ring.x1, ring.z0], b: [ring.x1, ring.z1], yaw: Math.PI / 2 },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      if (len < 8) continue;
      const dx = (e.b[0] - e.a[0]) / len;
      const dz = (e.b[1] - e.a[1]) / len;
      const lampGap = Math.max(16, 100 / Math.max(0.4, lamps));
      const treeGap = Math.max(11, 100 / Math.max(0.4, trees));
      for (let t = r.range(4, 9); t < len - 3; t += lampGap) {
        this.prop("streetlight", e.a[0] + dx * t, e.a[1] + dz * t, e.yaw);
      }
      if (trees > 0) {
        for (let t = r.range(7, 14); t < len - 3; t += treeGap) {
          this.prop(treeKind, e.a[0] + dx * t, e.a[1] + dz * t, r.range(0, 6.28), {
            scale: r.range(0.85, 1.25),
          });
        }
      }
      for (let t = r.range(10, 24); t < len - 4; t += r.range(26, 48)) {
        const kind = r.pick(["bench", "bin", "hydrant", "bin", "planter", "mailbox"]);
        this.prop(kind, e.a[0] + dx * t, e.a[1] + dz * t, e.yaw);
      }
    }
  }

  /* ------------------------------------------------------- special surfaces */

  park(x0, z0, x1, z1, opts = {}) {
    const rect = norm(x0, z0, x1, z1);
    this.walks.push({ ...inflate(rect, SIDEWALK_W), inner: rect, park: true });
    this.surfaces.push({ ...rect, kind: "grass" });
    this._growRect(inflate(rect, SIDEWALK_W));
    const r = this.rng;
    const { trees = 14, path = true, pond = false, benches = 5, treeKind = "tree" } = opts;
    const midZ = (rect.z0 + rect.z1) / 2;
    if (path) {
      const pathRect = {
        x0: rect.x0 - SIDEWALK_W,
        z0: midZ - 2.8,
        x1: rect.x1 + SIDEWALK_W,
        z1: midZ + 2.8,
      };
      this.decals.push({ kind: "path", ...pathRect });
      this.surfaces.push({ ...pathRect, kind: "path" });
    }
    if (pond) {
      const px0 = rect.x0 + (rect.x1 - rect.x0) * 0.58;
      const pz0 = rect.z0 + (rect.z1 - rect.z0) * 0.08;
      this.surfaces.push({ x0: px0, z0: pz0, x1: px0 + 17, z1: pz0 + 12, kind: "water", pond: true });
    }
    for (let i = 0; i < trees; i++) {
      const x = r.range(rect.x0 + 3, rect.x1 - 3);
      const z = r.range(rect.z0 + 3, rect.z1 - 3);
      if (path && Math.abs(z - midZ) < 5.5) continue;
      this.prop(r.chance(0.25) ? "bush" : treeKind, x, z, r.range(0, 6.28), {
        scale: r.range(0.9, 1.5),
      });
    }
    for (let i = 0; i < benches; i++) {
      this.prop(
        "bench",
        r.range(rect.x0 + 4, rect.x1 - 4),
        midZ + r.sign() * r.range(3.8, 4.8),
        r.chance(0.5) ? 0 : Math.PI,
      );
    }
    return this;
  }

  /** Paved parking area — drivable, painted bays, a few parked cars. */
  lot(x0, z0, x1, z1, opts = {}) {
    const rect = norm(x0, z0, x1, z1);
    this.surfaces.push({ ...rect, kind: "lot" });
    this.decals.push({ kind: "lot", ...rect });
    this._growRect(rect);
    const r = this.rng;
    const { cars = 0.5, rows = null } = opts;
    const bayW = 2.7;
    const rowD = 5.2;
    const nRows = rows ?? Math.max(1, Math.floor((rect.z1 - rect.z0 - 6) / (rowD * 2)));
    for (let ri = 0; ri < nRows; ri++) {
      const z = rect.z0 + 3.5 + ri * rowD * 2;
      if (z + rowD > rect.z1) break;
      for (let x = rect.x0 + 2; x < rect.x1 - bayW - 1; x += bayW) {
        this.decals.push({ kind: "bay", x0: x, z0: z, x1: x + bayW - 0.22, z1: z + rowD - 0.4 });
        if (r.chance(cars)) {
          this.prop("parked-car", x + bayW / 2, z + rowD / 2, 0, { variant: r.int(0, 4) });
        }
      }
    }
    return this;
  }

  water(x0, z0, x1, z1) {
    const rect = norm(x0, z0, x1, z1);
    this.surfaces.push({ ...rect, kind: "water" });
    this._growRect(rect);
    return this;
  }

  sand(x0, z0, x1, z1) {
    const rect = norm(x0, z0, x1, z1);
    this.surfaces.push({ ...rect, kind: "sand" });
    this._growRect(rect);
    return this;
  }

  plaza(x0, z0, x1, z1) {
    const rect = norm(x0, z0, x1, z1);
    this.walks.push({ ...rect, inner: inflate(rect, -SIDEWALK_W), plaza: true });
    this._growRect(rect);
    return this;
  }

  /* --------------------------------------------------------------- objects */

  building(kind, x, z, yaw, opts = {}) {
    const r = this.rng;
    const b = {
      kind,
      x,
      z,
      yaw,
      w: opts.w ?? r.range(9, 14),
      d: opts.d ?? r.range(9, 13),
      storeys: opts.storeys ?? r.int(3, 6),
      shop: opts.shop ?? false,
      pal: opts.pal ?? r.int(0, 6),
      roofPal: r.int(0, 2),
      sign: opts.sign ?? null,
      signPal: r.int(0, 4),
      seed: r.int(0, 100000),
    };
    this.buildings.push(b);
    this.solid(x, z, b.w / 2, b.d / 2, yaw);
    return b;
  }

  prop(kind, x, z, yaw = 0, opts = {}) {
    const p = { kind, x, z, yaw, scale: opts.scale ?? 1, variant: opts.variant ?? 0, ...opts };
    this.props.push(p);
    const c = PROP_COLLIDER[kind];
    if (c) this.solid(x, z, c[0] * p.scale, c[1] * p.scale, yaw, c[2]);
    return p;
  }

  /** An oriented collision box. soft > 0 costs less speed on impact. */
  solid(x, z, hw, hd, yaw = 0, soft = 0) {
    this.solids.push({ x, z, hw, hd, yaw, soft });
    return this;
  }

  /** A visible barrier: wall / fence / guardrail, with matching collider. */
  barrier(x0, z0, x1, z1, kind = "fence") {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    this.props.push({ kind, x: cx, z: cz, yaw, len });
    this.solid(cx, cz, 0.35, len / 2, yaw, kind === "fence" ? 0.4 : 0);
    return this;
  }

  /**
   * A named delivery point. x,z is the marker centre — put it on the road
   * shoulder so the player can actually drive into it.
   */
  location(id, name, x, z, opts = {}) {
    this.locations.push({
      id,
      name,
      x,
      z,
      kind: opts.kind || "shop",
      yaw: opts.yaw ?? 0,
      radius: opts.radius ?? 6.5,
      zone: this.zone,
    });
    return this;
  }

  setSpawn(x, z, yaw) {
    this.spawn = { x, z, yaw };
    return this;
  }

  /* ---------------------------------------------------------------- finish */

  _grow(x, z) {
    if (x < this.min[0]) this.min[0] = x;
    if (z < this.min[1]) this.min[1] = z;
    if (x > this.max[0]) this.max[0] = x;
    if (z > this.max[1]) this.max[1] = z;
  }
  _growRect(r) {
    this._grow(r.x0, r.z0);
    this._grow(r.x1, r.z1);
  }

  finish() {
    const bounds = {
      minX: this.min[0] - 10,
      minZ: this.min[1] - 10,
      maxX: this.max[0] + 10,
      maxZ: this.max[1] + 10,
    };
    // The drivable envelope, which is what the mini-map frames and what the
    // "you left the city" check uses. It ignores scenery like the open sea,
    // so an ocean 200m wide never zooms the mini-map out to uselessness.
    const play = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const r of this.roads) {
      play.minX = Math.min(play.minX, r.ax - r.w, r.bx - r.w);
      play.maxX = Math.max(play.maxX, r.ax + r.w, r.bx + r.w);
      play.minZ = Math.min(play.minZ, r.az - r.w, r.bz - r.w);
      play.maxZ = Math.max(play.maxZ, r.az + r.w, r.bz + r.w);
    }
    for (const w of this.walks) {
      play.minX = Math.min(play.minX, w.x0);
      play.maxX = Math.max(play.maxX, w.x1);
      play.minZ = Math.min(play.minZ, w.z0);
      play.maxZ = Math.max(play.maxZ, w.z1);
    }
    const lanes = buildLaneGraph(this.roads);
    const crossings = buildCrossings(this.roads);
    return {
      zone: this.zone,
      roads: this.roads,
      walks: this.walks,
      buildings: this.buildings,
      props: this.props,
      solids: this.solids,
      surfaces: this.surfaces,
      decals: this.decals.concat(crossings.decals),
      locations: this.locations,
      junctions: crossings.junctions,
      lanes,
      bounds,
      playBounds: play,
      spawn: this.spawn,
    };
  }
}

/* ---------------------------------------------------------------- helpers */

const PROP_COLLIDER = {
  streetlight: [0.24, 0.24, 0.5],
  "traffic-light": [0.26, 0.26, 0.5],
  tree: [0.55, 0.55, 0.45],
  palm: [0.42, 0.42, 0.5],
  pine: [0.6, 0.6, 0.45],
  planter: [0.95, 0.95, 0.3],
  bench: [1.0, 0.4, 0.6],
  "bus-stop": [2.2, 0.9, 0.2],
  container: [3.05, 1.25, 0],
  "parked-car": [0.95, 2.15, 0.35],
  kiosk: [1.5, 1.3, 0],
  hydrant: [0.28, 0.28, 0.7],
  bollard: [0.2, 0.2, 0.7],
  bin: [0.42, 0.42, 0.7],
  mailbox: [0.36, 0.36, 0.7],
  crate: [0.8, 0.8, 0.4],
  bush: null,
};

function norm(x0, z0, x1, z1) {
  return {
    x0: Math.min(x0, x1),
    z0: Math.min(z0, z1),
    x1: Math.max(x0, x1),
    z1: Math.max(z0, z1),
  };
}
function inflate(r, n) {
  return { x0: r.x0 - n, z0: r.z0 - n, x1: r.x1 + n, z1: r.z1 + n };
}

/**
 * Directed lane graph for traffic.
 *
 * Every drivable road becomes two directed edges (one per direction) offset
 * laterally from the centreline. Edges join at shared endpoints, so a car
 * reaching a node can continue onto any edge leaving it.
 */
export function buildLaneGraph(roads) {
  const nodes = new Map();
  const edges = [];

  const nodeAt = (x, z) => {
    const k = key(x, z);
    let n = nodes.get(k);
    if (!n) {
      n = { id: nodes.size, x, z, out: [], in: [] };
      nodes.set(k, n);
    }
    return n;
  };

  for (const r of roads) {
    const off = LANE_OFFSET[r.type] ?? 0;
    if (!off) continue; // alleys carry no traffic
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    if (len < 6) continue;
    const dx = (r.bx - r.ax) / len;
    const dz = (r.bz - r.az) / len;
    for (const dir of [1, -1]) {
      const sx = dir > 0 ? r.ax : r.bx;
      const sz = dir > 0 ? r.az : r.bz;
      const ex = dir > 0 ? r.bx : r.ax;
      const ez = dir > 0 ? r.bz : r.az;
      const ux = dir * dx;
      const uz = dir * dz;
      // right-hand traffic: the lane sits to the right of the travel direction
      const ox = uz * off;
      const oz = -ux * off;
      const a = nodeAt(sx, sz);
      const b = nodeAt(ex, ez);
      const e = {
        id: edges.length,
        from: a.id,
        to: b.id,
        ax: sx + ox,
        az: sz + oz,
        bx: ex + ox,
        bz: ez + oz,
        ux,
        uz,
        len,
        type: r.type,
        speed: r.type === "main" ? 15 : r.type === "street" ? 11.5 : 8.5,
        axis: Math.abs(dx) > Math.abs(dz) ? 0 : 1,
      };
      edges.push(e);
      a.out.push(e.id);
      b.in.push(e.id);
    }
  }

  const nodeList = [...nodes.values()];
  for (const n of nodeList) n.junction = n.out.length > 2;
  return { nodes: nodeList, edges };
}

/**
 * Where two roads cross, generate intersection paint: crosswalk bands on each
 * approach plus the junction patch that hides the lane markings.
 */
function buildCrossings(roads) {
  const junctions = [];
  const decals = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i];
      const b = roads[j];
      const aH = Math.abs(a.az - a.bz) < 0.01;
      const bH = Math.abs(b.az - b.bz) < 0.01;
      const aV = Math.abs(a.ax - a.bx) < 0.01;
      const bV = Math.abs(b.ax - b.bx) < 0.01;
      if (!((aH && bV) || (aV && bH))) continue;
      const h = aH ? a : b;
      const v = aH ? b : a;
      const x = v.ax;
      const z = h.az;
      const within =
        x >= Math.min(h.ax, h.bx) - 0.5 &&
        x <= Math.max(h.ax, h.bx) + 0.5 &&
        z >= Math.min(v.az, v.bz) - 0.5 &&
        z <= Math.max(v.az, v.bz) + 0.5;
      if (!within) continue;
      const hw = h.w / 2;
      const vw = v.w / 2;
      junctions.push({ x, z, hw: vw, hd: hw, hType: h.type, vType: v.type });
      const band = 3.4;
      decals.push({ kind: "crosswalk", x0: x - vw, z0: z - hw - band, x1: x + vw, z1: z - hw - 0.5, axis: 0 });
      decals.push({ kind: "crosswalk", x0: x - vw, z0: z + hw + 0.5, x1: x + vw, z1: z + hw + band, axis: 0 });
      decals.push({ kind: "crosswalk", x0: x - vw - band, z0: z - hw, x1: x - vw - 0.5, z1: z + hw, axis: 1 });
      decals.push({ kind: "crosswalk", x0: x + vw + 0.5, z0: z - hw, x1: x + vw + band, z1: z + hw, axis: 1 });
      decals.push({ kind: "junction", x0: x - vw, z0: z - hw, x1: x + vw, z1: z + hw });
    }
  }
  return { junctions, decals };
}
