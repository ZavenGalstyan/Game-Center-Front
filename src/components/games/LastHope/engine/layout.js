/**
 * Last Hope — location layout builder.
 *
 * Every location is authored as code against this builder: deterministic
 * (fixed seed per location, so node / container ids are stable across saves),
 * framework-free (the Node tests load the same maps the renderer draws).
 *
 * Coordinates: metres, x right, z toward the camera's bottom of screen, the
 * map spans [-w/2, w/2] × [-d/2, d/2]. Yaw 0 faces +z; a building's local
 * +z is its front.
 *
 * Output (L):
 *   solids      {k:'c', x, z, r, op} | {k:'b', x, z, hw, hd, a, op}  collision
 *               (op = opaque: blocks zombie sight)
 *   walls       {x0, z0, x1, z1, h, t, mat, bld, win:[[pos, w]]}   rendered walls
 *   buildings   {kind, x, z, w, d, yaw, h, roof, style, floor}
 *   props       {t, x, z, yaw, s, v}            render-only decoration
 *   nodes       {id, t, x, z, s, yaw}           harvestable resources
 *   containers  {id, t, table, x, z, yaw, contents?, name}
 *   doors       {id, x, z, yaw, w, key?, flag?, label}   locked doors
 *   spawns / animals / lights / exits / sources / paint / roads / fences
 */
import { mulberry32, rrange, clamp, dist2 } from "./util.js";

/** Half-sizes of container footprints [hw, hd] and their render height. */
export const CONTAINER_DIMS = {
  crate: [0.5, 0.4, 0.8],
  backpack_pile: [0.4, 0.35, 0.5],
  hunter_chest: [0.6, 0.4, 0.7],
  fridge: [0.45, 0.38, 1.9],
  cabinet: [0.55, 0.28, 1.0],
  wardrobe: [0.6, 0.32, 2.0],
  toolbox: [0.42, 0.25, 0.5],
  medcab: [0.38, 0.18, 0.8],
  desk: [0.75, 0.4, 0.8],
  shelf: [1.3, 0.35, 1.8],
  police_car: [1.0, 2.25, 1.5],
  car_trunk: [1.0, 2.2, 1.4],
  locker: [0.45, 0.3, 1.9],
  metal_crate: [0.6, 0.45, 0.9],
  chem_barrel: [0.38, 0.38, 1.0],
  container: [1.2, 3.0, 2.6],
  safe: [0.45, 0.45, 1.0],
  mil_crate: [0.7, 0.4, 0.7],
  bunker_locker: [0.45, 0.3, 1.9],
  lab_cabinet: [0.6, 0.28, 1.6],
  weapon_rack: [0.9, 0.3, 1.8],
  footlocker: [0.55, 0.32, 0.55],
};
const TABLE_OF = { crate: "camp_crate", shelf: "store_shelf", safe: "metal_crate", desk: "cabinet", weapon_rack: "mil_crate", footlocker: "bunker_locker" };
export const CONTAINER_NAMES = {
  crate: "Supply Crate",
  backpack_pile: "Abandoned Backpack",
  hunter_chest: "Hunter's Chest",
  fridge: "Fridge",
  cabinet: "Kitchen Cabinet",
  wardrobe: "Wardrobe",
  toolbox: "Toolbox",
  medcab: "Medicine Cabinet",
  desk: "Old Desk",
  shelf: "Store Shelf",
  police_car: "Police Cruiser",
  car_trunk: "Car Trunk",
  locker: "Worker Locker",
  metal_crate: "Metal Crate",
  chem_barrel: "Chemical Drum",
  container: "Shipping Container",
  safe: "Security Safe",
  mil_crate: "Military Crate",
  bunker_locker: "Soldier's Locker",
  lab_cabinet: "Lab Cabinet",
  weapon_rack: "Weapon Rack",
  footlocker: "Officer's Footlocker",
};

/** Solid radius of harvestable nodes (× node scale). 0 = walk-through. */
export const NODE_SOLID = { tree: 0.42, pine: 0.38, birch: 0.32, rock: 0.95, boulder: 1.35, bush: 0, branch: 0, stones: 0, mushroom: 0, scrap: 0.85, wreck: 0, machine: 0.95, berry: 0 };

export function createLayout({ id, name, w, d, seed, biome, base = "grass" }) {
  const rng = mulberry32(seed);
  const L = {
    id,
    name,
    w,
    d,
    biome,
    base,
    seed,
    paint: [],
    solids: [],
    walls: [],
    buildings: [],
    props: [],
    nodes: [],
    containers: [],
    doors: [],
    spawns: [],
    animals: [],
    lights: [],
    exits: [],
    sources: [],
    roads: [],
    fences: [],
    hazards: [],
    triggers: [],
    entry: { x: 0, z: 0, yaw: 0 },
    boss: null,
  };
  const reserved = []; // {x,z,r} or {x0,z0,x1,z1}
  const pts = []; // scattered points {x,z,r}
  const cnt = {};
  const nid = (p) => {
    cnt[p] = (cnt[p] || 0) + 1;
    return `${p}${cnt[p]}`;
  };

  const B = {
    L,
    rng,
    r: (a, b) => rrange(rng, a, b),

    /* ------------------------------------------------------------ space */
    reserve(x, z, r) {
      reserved.push({ x, z, r });
    },
    reserveRect(x0, z0, x1, z1) {
      reserved.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
    },
    /** Is a circle at (x,z) clear of reserved space and earlier scattered points? */
    free(x, z, r = 1, margin = 3) {
      if (x < -w / 2 + margin || x > w / 2 - margin || z < -d / 2 + margin || z > d / 2 - margin) return false;
      for (const q of reserved) {
        if (q.r != null) {
          if (dist2(x, z, q.x, q.z) < (q.r + r) * (q.r + r)) return false;
        } else if (x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) return false;
      }
      for (const p of pts) if (dist2(x, z, p.x, p.z) < (p.r + r) * (p.r + r)) return false;
      return true;
    },
    mark(x, z, r) {
      pts.push({ x, z, r });
    },

    /* ------------------------------------------------------------ collision */
    solidC(x, z, r, op = false) {
      L.solids.push({ k: "c", x, z, r, op });
    },
    solidB(x, z, hw, hd, a = 0, op = false) {
      L.solids.push({ k: "b", x, z, hw, hd, a, op });
    },

    /* ------------------------------------------------------------ paint */
    paintRect(ch, x0, z0, x1, z1, soft = 0.8, a = 1) {
      L.paint.push({ shape: "rect", ch, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), soft, a });
    },
    paintCircle(ch, x, z, r, soft = 1.5, a = 1) {
      L.paint.push({ shape: "circle", ch, x, z, r, soft, a });
    },
    paintLine(ch, points, width, soft = 1, a = 1) {
      L.paint.push({ shape: "line", ch, points, width, soft, a });
    },
    road(points, width = 8, opts = {}) {
      L.roads.push({ points, width, lines: opts.lines !== false, curb: opts.curb !== false, kind: opts.kind || "asphalt" });
      B.paintLine(opts.kind === "dirt" ? "dirt" : "asphalt", points, width, opts.kind === "dirt" ? 1.6 : 0.15, 1);
      if (opts.sidewalk) B.paintLine("concrete", points, width + opts.sidewalk * 2, 0.1, 1), B.paintLine("asphalt", points, width, 0.1, 1);
    },

    /* ------------------------------------------------------------ props & nodes */
    prop(t, x, z, o = {}) {
      const p = { t, x, z, yaw: o.yaw ?? 0, s: o.s ?? 1, v: o.v ?? 0 };
      if (o.h != null) p.h = o.h;
      if (o.c != null) p.c = o.c;
      L.props.push(p);
      if (o.solid === "c") B.solidC(x, z, o.r ?? 0.5, !!o.op);
      else if (o.solid === "b") B.solidB(x, z, o.hw ?? 0.5, o.hd ?? 0.5, o.yaw ?? 0, !!o.op);
      if (o.mark) pts.push({ x, z, r: o.mark });
      return p;
    },
    node(t, x, z, o = {}) {
      const s = o.s ?? 1;
      const n = { id: nid(t[0] + t[1]), t, x, z, s, yaw: o.yaw ?? rng() * Math.PI * 2 };
      if (o.v != null) n.v = o.v;
      L.nodes.push(n);
      const sr = NODE_SOLID[t] || 0;
      if (sr > 0) B.solidC(x, z, sr * s, false);
      pts.push({ x, z, r: Math.max(0.6, sr * s + 0.4) });
      return n;
    },
    container(t, x, z, yaw = 0, o = {}) {
      const c = { id: o.id || nid("c"), t, table: o.table || TABLE_OF[t] || t, x, z, yaw, name: o.name || CONTAINER_NAMES[t] || "Container" };
      if (o.contents) c.contents = o.contents;
      if (o.solid !== false) {
        const dm = CONTAINER_DIMS[t] || [0.5, 0.5, 1];
        B.solidB(x, z, dm[0], dm[1], yaw, dm[2] > 1.5);
      }
      L.containers.push(c);
      pts.push({ x, z, r: 1 });
      return c;
    },
    spawn(t, x, z, n = 1, r = 4, o = {}) {
      L.spawns.push({ t, x, z, n, r, night: !!o.night, boss: o.boss || null });
    },
    animal(t, x, z, n = 1, r = 8) {
      L.animals.push({ t, x, z, n, r });
    },
    light(x, y, z, o = {}) {
      L.lights.push({ x, y, z, color: o.color || "#ffd9a0", i: o.i ?? 1.6, r: o.r ?? 12, kind: o.kind || "lamp", flicker: o.flicker || 0, power: !!o.power });
    },
    exit(x, z, label, o = {}) {
      L.exits.push({ x, z, r: o.r ?? 3, label, yaw: o.yaw ?? 0, to: o.to || null });
    },

    /* ------------------------------------------------------------ walls */
    /**
     * A straight wall from (x0,z0) to (x1,z1) with gaps [[centerFromStart, width]]
     * (doorways). `win` [[center, width]] marks rendered windows.
     */
    wall(x0, z0, x1, z1, o = {}) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-3) return;
      const ux = (x1 - x0) / len;
      const uz = (z1 - z0) / len;
      const h = o.h ?? 2.9;
      const t = o.t ?? 0.25;
      const gaps = (o.gaps || []).map(([c, gw]) => [c - gw / 2, c + gw / 2]).sort((a, b) => a[0] - b[0]);
      const pieces = [];
      let s = 0;
      for (const [g0, g1] of gaps) {
        if (g0 > s) pieces.push([s, g0]);
        s = Math.max(s, g1);
      }
      if (s < len) pieces.push([s, len]);
      const a = Math.atan2(ux, uz); // yaw of the segment direction
      for (const [p0, p1] of pieces) {
        if (p1 - p0 < 0.05) continue;
        const ax = x0 + ux * p0;
        const az = z0 + uz * p0;
        const bx = x0 + ux * p1;
        const bz = z0 + uz * p1;
        const win = (o.win || []).filter(([c]) => c > p0 + 0.4 && c < p1 - 0.4).map(([c, ww]) => [c - p0, ww]);
        L.walls.push({ x0: ax, z0: az, x1: bx, z1: bz, h, t, mat: o.mat || "plaster", bld: o.bld ?? -1, win, cap: o.cap });
        // collision box: the segment, thickened; hd along the segment direction
        B.solidB((ax + bx) / 2, (az + bz) / 2, t / 2 + 0.02, (p1 - p0) / 2, a, o.op !== false);
      }
      if (o.door) for (const [c, gw] of o.gaps || []) L.props.push({ t: o.door, x: x0 + ux * c, z: z0 + uz * c, yaw: a + Math.PI / 2, s: gw, v: 0 });
    },
    fence(x0, z0, x1, z1, kind = "wood", gaps = []) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len;
      const uz = (z1 - z0) / len;
      const gs = gaps.map(([c, gw]) => [c - gw / 2, c + gw / 2]).sort((a, b) => a[0] - b[0]);
      let s = 0;
      const pieces = [];
      for (const [g0, g1] of gs) {
        if (g0 > s) pieces.push([s, g0]);
        s = Math.max(s, g1);
      }
      if (s < len) pieces.push([s, len]);
      const a = Math.atan2(ux, uz);
      for (const [p0, p1] of pieces) {
        if (p1 - p0 < 0.3) continue;
        const ax = x0 + ux * p0;
        const az = z0 + uz * p0;
        const bx = x0 + ux * p1;
        const bz = z0 + uz * p1;
        L.fences.push({ x0: ax, z0: az, x1: bx, z1: bz, kind });
        B.solidB((ax + bx) / 2, (az + bz) / 2, 0.12, (p1 - p0) / 2, a, false);
        reserved.push({ x: (ax + bx) / 2, z: (az + bz) / 2, r: 0.4 });
        // reserve the fence line so scattered trees keep off it
        const steps = Math.ceil((p1 - p0) / 2);
        for (let k = 0; k <= steps; k++) pts.push({ x: ax + (bx - ax) * (k / steps), z: az + (bz - az) * (k / steps), r: 0.6 });
      }
    },

    /** Local → world transform for a building at (cx,cz) with yaw. */
    xf(cx, cz, yaw) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    },

    /* ------------------------------------------------------------ buildings */
    /** Suburban house, 12 × 10 m, front door on local +z. */
    house(cx, cz, yaw, o = {}) {
      const W = 12;
      const D = 10;
      const H = 2.9;
      const P = B.xf(cx, cz, yaw);
      const bid = L.buildings.length;
      const style = o.style ?? bid % 4;
      const mir = o.mirror ? -1 : 1;
      L.buildings.push({ kind: "house", x: cx, z: cz, w: W, d: D, yaw, h: H, roof: "gable", style, floor: "wood", name: o.name || "House", broken: !!o.broken });
      const wl = (x0, z0, x1, z1, gaps, win) => {
        const [ax, az] = P(x0 * mir, z0);
        const [bx, bz] = P(x1 * mir, z1);
        B.wall(ax, az, bx, bz, { h: H, t: 0.26, mat: `siding${style}`, bld: bid, gaps, win, door: undefined });
      };
      // front (door at local x=-2 → 4 m from the left corner)
      wl(-6, 5, 6, 5, [[4, 1.6]], [[1.6, 1.4], [9.5, 1.8]]);
      wl(6, -5, -6, -5, [], [[3, 1.4], [9, 1.4]]);
      wl(-6, -5, -6, 5, [], [[5, 1.4]]);
      wl(6, 5, 6, -5, [], [[3, 1.4], [7.4, 1.2]]);
      // interior partition with a doorway
      const [p0x, p0z] = P(1 * mir, -5);
      const [p1x, p1z] = P(1 * mir, 5);
      B.wall(p0x, p0z, p1x, p1z, { h: H - 0.05, t: 0.16, mat: "interior", bld: bid, gaps: [[6.2, 1.6]] });
      // porch + steps, a broken front door hanging open
      const [px, pz] = P(-2 * mir, 5.9);
      L.props.push({ t: "porch", x: px, z: pz, yaw, s: 1, v: style });
      const [dx, dz] = P(-2.7 * mir, 5.05);
      L.props.push({ t: "door_open", x: dx, z: dz, yaw: yaw + (mir > 0 ? -1.2 : 1.2), s: 1, v: style });
      // furniture (local coords; solid boxes)
      const F = (t, lx, lz, lyaw, hw, hd, op = false) => {
        const [x, z] = P(lx * mir, lz);
        L.props.push({ t, x, z, yaw: yaw + lyaw * mir, s: 1, v: style });
        if (hw) B.solidB(x, z, hw, hd, yaw + lyaw * mir, op);
      };
      const C = (t, lx, lz, lyaw, extra = {}) => {
        const [x, z] = P(lx * mir, lz);
        return B.container(t, x, z, yaw + lyaw * mir, extra);
      };
      F("counter", -3.2, -4.45, 0, 1.6, 0.32);
      C("fridge", -5.35, -2.6, Math.PI / 2);
      C("cabinet", -0.9, -4.55, 0);
      F("table", -3.4, -1.6, 0, 0.75, 0.5);
      F("chair", -4.5, -1.6, Math.PI / 2, 0, 0);
      F("chair", -2.3, -1.6, -Math.PI / 2, 0, 0);
      F("sofa", -3.4, 3.3, Math.PI, 1.1, 0.42);
      F("rug", -3.3, 1.9, 0, 0, 0);
      F("tv", -3.4, 0.85, 0, 0.5, 0.18);
      F("bed", 3.8, -3.3, 0, 0.85, 1.15);
      C(o.bedroomContainer || "wardrobe", 5.35, 2.4, -Math.PI / 2, o.bedroomExtra || {});
      if (o.medcab !== false) C("medcab", 1.35, -3.9, Math.PI / 2);
      F("lamp", 5.3, -4.4, 0, 0, 0);
      if (o.extra) o.extra({ F, C, P: (lx, lz) => P(lx * mir, lz) });
      B.reserveRect(...P(-6.6, -5.6), ...P(6.6, 7.2));
      const [ex, ez] = P(-2 * mir, 7.4);
      return { door: [ex, ez], bid };
    },

    /** Generic rectangular building: walls on all four sides, front (+z) gaps. */
    box(cx, cz, yaw, W, D, o = {}) {
      const H = o.h ?? 3;
      const P = B.xf(cx, cz, yaw);
      const bid = L.buildings.length;
      L.buildings.push({ kind: o.kind || "box", x: cx, z: cz, w: W, d: D, yaw, h: H, roof: o.roof || "flat", style: o.style ?? 0, floor: o.floor || "concrete", name: o.name || "Building", sign: o.sign });
      const mat = o.mat || "concrete";
      const t = o.t ?? 0.3;
      const seg = (x0, z0, x1, z1, gaps = [], win = []) => {
        const [ax, az] = P(x0, z0);
        const [bx, bz] = P(x1, z1);
        B.wall(ax, az, bx, bz, { h: H, t, mat, bld: bid, gaps, win });
      };
      seg(-W / 2, D / 2, W / 2, D / 2, o.front || [], o.frontWin || []);
      seg(W / 2, -D / 2, -W / 2, -D / 2, o.back || [], o.backWin || []);
      seg(-W / 2, -D / 2, -W / 2, D / 2, o.left || [], o.leftWin || []);
      seg(W / 2, D / 2, W / 2, -D / 2, o.right || [], o.rightWin || []);
      B.reserveRect(...P(-W / 2 - 0.6, -D / 2 - 0.6), ...P(W / 2 + 0.6, D / 2 + 0.6));
      return { P, bid };
    },

    /** A small log cabin, 8 × 6 m, door on local +z. */
    cabin(cx, cz, yaw, o = {}) {
      const { P, bid } = B.box(cx, cz, yaw, 8, 6, { kind: "cabin", h: 2.6, roof: "gable", mat: "logs", floor: "wood", front: [[2.6, 1.6]], frontWin: [[6, 1.2]], leftWin: [[3, 1.1]], name: o.name || "Hunter's Cabin" });
      const F = (t, lx, lz, lyaw, hw, hd) => {
        const [x, z] = P(lx, lz);
        L.props.push({ t, x, z, yaw: yaw + lyaw, s: 1, v: 0 });
        if (hw) B.solidB(x, z, hw, hd, yaw + lyaw);
      };
      F("bed", 2.6, -1.6, 0, 0.85, 1.15);
      F("table", -1.4, -1.2, 0, 0.75, 0.5);
      F("chair", -2.5, -1.2, Math.PI / 2);
      F("stove", -3.3, -2.3, 0, 0.45, 0.4);
      F("rug", 0, 0.8, 0);
      const [cx2, cz2] = P(3.2, 1.9);
      B.container("hunter_chest", cx2, cz2, yaw - Math.PI / 2, o.chest || {});
      const [px, pz] = P(-1.4, 3.6);
      L.props.push({ t: "porch", x: px, z: pz, yaw, s: 0.8, v: 9 });
      return bid;
    },

    /** Industrial warehouse with a wide roll-up opening on local +z. */
    warehouse(cx, cz, yaw, W, D, o = {}) {
      const { P, bid } = B.box(cx, cz, yaw, W, D, {
        kind: "warehouse",
        h: 6.5,
        roof: "flat",
        mat: "corrugated",
        floor: "concrete",
        t: 0.35,
        front: [[W / 2 - (o.doorOff || 0), o.doorW || 8]],
        back: o.back || [],
        right: o.side ? [[D / 2, 1.6]] : [],
        frontWin: [],
        name: o.name || "Warehouse",
        style: o.style ?? 0,
        sign: o.sign,
      });
      L.props.push({ t: "rollup", x: P(-(o.doorOff || 0), D / 2)[0], z: P(-(o.doorOff || 0), D / 2)[1], yaw, s: o.doorW || 8, v: 0 });
      // racks along the back half
      const racks = o.racks ?? 3;
      const xs = o.rackX || Array.from({ length: racks }, (_, k) => -W / 2 + 3 + k * ((W - 6) / Math.max(1, racks - 1)));
      for (const lx of xs) {
        const k = xs.indexOf(lx);
        const [x, z] = P(lx, -D / 2 + 4.2);
        L.props.push({ t: "rack", x, z, yaw: yaw + Math.PI / 2, s: 1, v: k });
        B.solidB(x, z, 0.6, 2.8, yaw + Math.PI / 2, false);
      }
      return { P, bid };
    },
  };
  return B;
}

/** Turns a cell grid (rows of strings, '#' solid) into merged wall rectangles. */
export function gridWalls(rows, cell, ox, oz) {
  const H = rows.length;
  const W = rows[0].length;
  const used = rows.map((r) => [...r].map(() => false));
  const out = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (rows[j][i] !== "#" || used[j][i]) continue;
      let w = 1;
      while (i + w < W && rows[j][i + w] === "#" && !used[j][i + w]) w++;
      let h = 1;
      outer: while (j + h < H) {
        for (let k = 0; k < w; k++) if (rows[j + h][i + k] !== "#" || used[j + h][i + k]) break outer;
        h++;
      }
      for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) used[j + a][i + b] = true;
      out.push({ x0: ox + i * cell, z0: oz + j * cell, x1: ox + (i + w) * cell, z1: oz + (j + h) * cell });
    }
  return out;
}

export { clamp };
