/**
 * Mountain Journey — turns a level definition (data/levels.js: a list of
 * modular trail segments) into a playable world:
 *
 *   paths / rivers / lakes   → the analytic terrain (engine/terrain.js)
 *   solids                   → collision props (engine/collision.js)
 *   props                    → render-only descriptors (three/Props.jsx)
 *   checkpoints, badges, viewpoints, climbs, platforms, gates, levers,
 *   switches, keys, crates, bridges, wind zones, pits, finish
 *   route                    → the steps engine/bot.js follows to prove the
 *                              level is completable through real input
 *   veg                      → deterministic vegetation scatter
 *
 * A cursor walks forward laying trail nodes; each segment module moves it on.
 * Heading h: forward = (sin h, cos h), right = (−cos h, sin h).
 */
import { createTerrain } from "./terrain.js";
import { createSolids } from "./collision.js";
import { mulberry32, fbm, clamp, smoothstep } from "./rng.js";

const fwd = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
const rightOf = (h) => ({ x: -Math.cos(h), z: Math.sin(h) });

function makeCtx(def, region) {
  const banks = def.banks || {};
  const C = {
    def,
    region,
    cur: { x: 0, z: 0, y: 0, h: def.heading || 0, w: 2.2 },
    l: banks.l || "wall",
    r: banks.r || "wall",
    surf: def.surf || region.surf,
    main: [],
    paths: [],
    rivers: [],
    lakes: [],
    solidDefs: [],
    props: [],
    checkpoints: [],
    badges: [],
    viewpoints: [],
    climbs: [],
    platforms: [],
    gates: [],
    levers: [],
    switches: [],
    keys: [],
    crates: [],
    bridges: [],
    wind: [],
    pits: [],
    caves: [],
    falls: [],
    keepClear: [],
    route: [],
    finish: null,
    spawn: null,
    ids: 0,
    cpCount: 0,
  };
  C.paths.push({ nodes: C.main, main: true });
  return C;
}

// --- cursor helpers --------------------------------------------------------
function pt(C, dist = 0, side = 0, from = C.cur) {
  const f = fwd(from.h);
  const r = rightOf(from.h);
  return { x: from.x + f.x * dist + r.x * side, z: from.z + f.z * dist + r.z * side };
}
function node(C, o = {}, list = C.main) {
  const n = {
    x: C.cur.x,
    z: C.cur.z,
    y: C.cur.y,
    w: o.w ?? C.cur.w,
    l: o.l ?? C.l,
    r: o.r ?? C.r,
    surf: o.surf ?? C.surf,
    cave: o.cave || null,
    cap: o.cap,
    tag: o.tag,
    topY: o.topY,
  };
  list.push(n);
  return n;
}
/** Lays `len` metres of trail (arc with total `turn`, linear `rise`). */
function lay(C, len, o = {}) {
  const step = o.step || 3;
  const n = Math.max(1, Math.ceil(len / step));
  const w0 = C.cur.w;
  const w1 = o.w ?? w0;
  const turn = o.turn || 0;
  const rise = o.rise || 0;
  for (let i = 1; i <= n; i++) {
    C.cur.h += turn / n / 2;
    const f = fwd(C.cur.h);
    C.cur.x += (f.x * len) / n;
    C.cur.z += (f.z * len) / n;
    C.cur.h += turn / n / 2;
    C.cur.y += rise / n;
    C.cur.w = w0 + (w1 - w0) * (i / n);
    node(C, { ...o, w: C.cur.w });
    if (o.route !== false) C.route.push({ op: "go", x: C.cur.x, z: C.cur.z, run: o.run });
  }
}
/** A straight cliff step of `dy` (crisp: 6 cm long). */
function cliff(C, dy, o = {}) {
  const f = fwd(C.cur.h);
  C.cur.x += f.x * 0.06;
  C.cur.z += f.z * 0.06;
  C.cur.y += dy;
  node(C, o);
}
function advance(C, dist) {
  const f = fwd(C.cur.h);
  C.cur.x += f.x * dist;
  C.cur.z += f.z * dist;
}
const id = (C, p) => `${p}${++C.ids}`;
function solid(C, s) {
  C.solidDefs.push(s);
  return s;
}
function prop(C, k, o) {
  const p = { k, ...o };
  C.props.push(p);
  return p;
}
function keep(C, x, z, r) {
  C.keepClear.push({ x, z, r });
}

/** A pit across the trail: top edges at the cursor's height, floor `depth` below. */
function pit(C, len, depth, o = {}) {
  const y0 = C.cur.y;
  const a = { x: C.cur.x, z: C.cur.z };
  cliff(C, -depth, { l: o.l ?? "wall", r: o.r ?? "wall", surf: "rock", tag: "pit", topY: y0 });
  advance(C, len - 0.12);
  node(C, { l: o.l ?? "wall", r: o.r ?? "wall", surf: "rock", tag: "pit", topY: y0 });
  cliff(C, depth);
  const b = { x: C.cur.x, z: C.cur.z };
  C.pits.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, h: C.cur.h, hw: C.cur.w + 3, y: y0, len });
  return { a, b, y: y0 };
}
/** A river crossing the cursor's trail perpendicular at the given point. */
function crossRiver(C, at, o) {
  const r = rightOf(C.cur.h);
  const f = fwd(C.cur.h);
  const flow = o.flow ?? 1; // +1 flows to the right
  const nodes = [];
  const reach = o.reach ?? 120;
  const step = 10;
  const grade = o.grade ?? 0.05;
  const up = o.falls; // { dist (upstream), height }
  // upstream (left when flow = +1) to downstream
  const meander = (s) => Math.sin(s * 0.045 + (o.phase || 0)) * (o.meander ?? 5) * smoothstep(8, 40, Math.abs(s));
  const pts = [];
  for (let s = -reach; s <= reach + 0.01; s += step) pts.push(s);
  if (up) {
    // a crisp drop upstream: nodes either side of the falls line
    const sF = -flow * up.dist;
    pts.push(sF - 0.03 * flow, sF + 0.03 * flow);
  }
  pts.push(-0.01, 0.01);
  pts.sort((p, q) => (flow > 0 ? p - q : q - p));
  for (const s of pts) {
    const ds = s * flow; // distance downstream from the crossing (negative = upstream)
    let y = o.level - ds * grade;
    if (up && ds < -up.dist) y += up.height;
    const m = meander(s);
    nodes.push({
      x: at.x + r.x * s + f.x * m,
      z: at.z + r.z * s + f.z * m,
      y,
      w: o.w * (up && ds < -up.dist ? 0.75 : 1) * (1 + smoothstep(10, 60, Math.abs(s)) * (o.widen ?? 0.5)),
      depth: o.depth,
    });
  }
  const river = { nodes, flow, bankSlope: o.bank ?? 1.3, kind: o.kind || "river", falls: [], frozen: !!o.frozen };
  if (up) {
    const sF = -flow * up.dist;
    const m = meander(sF);
    const fx = at.x + r.x * sF + f.x * m;
    const fz = at.z + r.z * sF + f.z * m;
    const yTop = o.level + up.dist * grade + up.height;
    const yBot = o.level + up.dist * grade;
    const fall = { x: fx, z: fz, top: yTop, bottom: yBot, w: o.w * 0.75, h: C.cur.h + Math.PI / 2 * flow, frozen: !!o.frozen, dirX: r.x * flow, dirZ: r.z * flow };
    river.falls.push(fall);
    C.falls.push(fall);
  }
  C.rivers.push(river);
  return river;
}

function checkpointAt(C, kind) {
  const p = pt(C, 0, 0);
  const marker = pt(C, 0, C.cur.w - 0.5);
  const cp = { id: id(C, "cp"), idx: ++C.cpCount, x: p.x, z: p.z, y: C.cur.y, h: C.cur.h, r: 2.6, kind: kind || C.region.checkpoint, mx: marker.x, mz: marker.z };
  C.checkpoints.push(cp);
  keep(C, marker.x, marker.z, 2.5);
  return cp;
}

function badge(C, x, z, y, extra = {}) {
  const b = { id: id(C, "b"), idx: C.badges.length, x, z, y: y + 1.0, ...extra };
  C.badges.push(b);
  keep(C, x, z, 1.5);
  return b;
}

/** A side branch from the cursor; returns its end point (cursor restored). */
function spur(C, side, len, o = {}) {
  const save = { ...C.cur };
  const nodes = [];
  const sgn = side === "left" ? 1 : -1; // +h turns left
  const h0 = C.cur.h + (Math.PI / 2) * sgn * (o.angle ?? 1);
  C.cur = { ...C.cur, h: h0, w: o.w ?? 1.6 };
  node(C, { w: C.cur.w, l: o.l ?? "wall", r: o.r ?? "wall", surf: o.surf ?? C.surf, cave: o.cave }, nodes);
  const steps = Math.max(1, Math.ceil(len / 3));
  const route = [];
  for (let i = 1; i <= steps; i++) {
    C.cur.h += (o.turn || 0) / steps;
    advance(C, len / steps);
    // the first stretch stays level so the junction merges cleanly
    if (i > 1 || steps === 1) C.cur.y += (o.rise || 0) / Math.max(1, steps - 1);
    const last = i === steps;
    C.cur.w = last ? o.endW ?? 2.3 : o.w ?? 1.6;
    node(C, { w: C.cur.w, l: o.l ?? "wall", r: o.r ?? "wall", surf: o.surf ?? C.surf, cap: last ? o.cap : undefined, cave: o.cave }, nodes);
    route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  }
  const end = { x: C.cur.x, z: C.cur.z, y: C.cur.y, h: C.cur.h };
  C.paths.push({ nodes, spur: true });
  C.cur = save;
  return { end, route, back: [...route].reverse().slice(1).concat([{ op: "go", x: save.x, z: save.z }]) };
}

// --- segment modules ---------------------------------------------------------
const SEGMENTS = {
  start(C, o) {
    C.cur.w = o.w ?? 4.2;
    node(C, { w: C.cur.w, l: "low", r: "low", cap: "wall" });
    const kind = o.camp || (C.region.id >= 5 ? "snowCamp" : "camp");
    lay(C, 10, { w: C.cur.w, l: "low", r: "low", route: false });
    const c = pt(C, -6.5, 0);
    C.spawn = { ...pt(C, -6.2, 0.4), y: 0, h: C.cur.h };
    prop(C, "camp", { kind, x: c.x, z: c.z, h: C.cur.h, ground: true });
    prop(C, "trailSign", { ...pt(C, -1.2, C.cur.w - 0.4), h: C.cur.h, ground: true, text: C.def.name });
    keep(C, c.x, c.z, 6);
    lay(C, 3, { w: o.trailW ?? 2.2 });
    C.cur.w = o.trailW ?? 2.2;
  },

  path(C, o) {
    lay(C, o.len, o);
    if (o.decor) for (const d of o.decor) prop(C, d.k, { ...pt(C, -(d.back ?? o.len / 2), d.side ?? C.cur.w + 0.8), h: C.cur.h, ground: true, ...d });
  },

  meadow(C, o) {
    const w0 = C.cur.w;
    lay(C, 4, { w: o.w ?? 6, l: "low", r: "low" });
    lay(C, o.len ?? 16, { ...o, w: o.w ?? 6, l: "low", r: "low" });
    lay(C, 4, { w: w0, l: C.l, r: C.r });
  },

  stream(C, o) {
    const w = o.w ?? 1.7;
    lay(C, 2.5, {});
    const at = pt(C, w + 1.2, 0);
    crossRiver(C, at, { level: C.cur.y - 0.05, depth: 0.42, w, flow: o.flow ?? 1, grade: 0.07, bank: 1.6, kind: "stream", meander: 3, widen: 0.3 });
    // boulder dams up- and downstream keep the shallow channel from being a way out
    const rr = rightOf(C.cur.h);
    for (const sd of [-1, 1]) {
      const dx = at.x + rr.x * sd * (C.cur.w + 2.4);
      const dz = at.z + rr.z * sd * (C.cur.w + 2.4);
      const f = fwd(C.cur.h);
      for (let k = -1.5; k <= 1.51; k++) {
        const bx = dx + f.x * k * 1.3;
        const bz = dz + f.z * k * 1.3;
        solid(C, { type: "cyl", x: bx, z: bz, y: C.cur.y - 1, h: 3.3, r: 0.95, surf: "stone" });
      }
      prop(C, "dam", { x: dx, z: dz, y: C.cur.y - 0.3, h: C.cur.h, seed: C.ids + sd });
      keep(C, dx, dz, 2.5);
    }
    lay(C, 2 * w + 2.4, { step: 1.2 });
    // stepping rocks in the shallows (decor; low enough to walk over)
    prop(C, "streamRocks", { x: at.x, z: at.z, y: C.cur.y - 0.05, h: C.cur.h, w });
    lay(C, 2.5, {});
  },

  log(C, o) {
    lay(C, 3, {});
    const c = pt(C, 1.6, 0);
    const hw = C.cur.w + 2.6;
    solid(C, { type: "box", x: c.x, z: c.z, y: C.cur.y - 0.1, h: 0.82, hw, hd: 0.4, rot: C.cur.h, surf: "wood" });
    prop(C, "log", { x: c.x, z: c.z, y: C.cur.y, h: C.cur.h, len: hw * 2, r: 0.46, moss: o.moss ?? true });
    const take = pt(C, 0.15, 0);
    const land = pt(C, 3.3, 0);
    C.route.push({ op: "go", x: take.x, z: take.z, tol: 0.35 });
    C.route.push({ op: "jump", x: land.x, z: land.z, run: false });
    lay(C, 5, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  gap(C, o) {
    lay(C, 2.5, {});
    const take = pt(C, -0.45, 0);
    const len = o.len ?? 2.6;
    const P = pit(C, len, o.depth ?? 7);
    if (o.river !== false) {
      const mid = { x: (P.a.x + P.b.x) / 2, z: (P.a.z + P.b.z) / 2 };
      // banks steep enough that the channel never undercuts the take-off edges
      const w = Math.max(0.4, len / 2 - 0.5);
      const bank = Math.max(6, ((o.depth ?? 7) + 0.2) / Math.max(0.2, len / 2 - w - 0.05));
      crossRiver(C, mid, { level: P.y - (o.depth ?? 7) + 1.2, depth: 1.5, w, bank, grade: 0.04, kind: "gorge", meander: 2 });
    }
    prop(C, "gapEdges", { ax: P.a.x, az: P.a.z, bx: P.b.x, bz: P.b.z, y: P.y, h: C.cur.h, w: C.cur.w });
    C.route.push({ op: "go", x: take.x, z: take.z, tol: 0.3, run: true });
    const land = pt(C, 1.6, 0);
    C.route.push({ op: "jump", x: land.x, z: land.z, run: len > 2.0 });
    lay(C, 3.5, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  bridge(C, o) {
    const kind = o.kind || "wood";
    const len = o.len ?? 8;
    const depth = o.depth ?? 8;
    const w0 = C.cur.w;
    lay(C, 3, { w: 1.6 });
    const y = C.cur.y;
    const h = C.cur.h;
    const P = pit(C, len, depth);
    const mid = { x: (P.a.x + P.b.x) / 2, z: (P.a.z + P.b.z) / 2 };
    if (o.river !== false) {
      crossRiver(C, mid, {
        level: y - depth + 1.4,
        depth: 1.6,
        w: Math.max(1, len / 2 - 2.2),
        bank: 4.6,
        grade: o.grade ?? 0.05,
        kind: "gorge",
        meander: 3,
        falls: o.falls,
        flow: o.flow ?? 1,
        frozen: o.frozen,
      });
    }
    const span = len + 1.6;
    const deckHW = 1.05;
    const rails = [];
    if (kind === "rope") {
      // gentle sag, walkable in short steps
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const tm = (t0 + t1) / 2;
        const sag = Math.sin(Math.PI * tm) * Math.min(0.36, len * 0.035);
        const c = pt(C, -len - 0.8 + span * tm, 0);
        solid(C, { type: "box", x: c.x, z: c.z, y: y - sag - 0.25, h: 0.25, hw: deckHW, hd: (span / n) / 2 + 0.02, rot: h, surf: "wood", deck: true });
      }
    } else {
      const c = pt(C, -len / 2, 0);
      solid(C, { type: "box", x: c.x, z: c.z, y: y - 0.3, h: 0.32, hw: deckHW + (kind === "stone" ? 0.2 : 0), hd: span / 2, rot: h, surf: kind === "stone" ? "stone" : "wood", deck: true });
    }
    for (const s of [-1, 1]) {
      const c = pt(C, -len / 2, s * (deckHW + 0.12));
      rails.push(solid(C, { type: "box", x: c.x, z: c.z, y: y - 0.2, h: 1.25, hw: 0.08, hd: span / 2, rot: h, wallAlways: true, noCamera: true, surf: "wood" }));
    }
    prop(C, "bridge", { kind, ax: P.a.x, az: P.a.z, bx: P.b.x, bz: P.b.z, y, h, len, span, hw: deckHW, depth });
    keep(C, P.a.x, P.a.z, 3);
    keep(C, P.b.x, P.b.z, 3);
    const s0 = pt(C, -len - 1.3, 0);
    C.route.push({ op: "go", x: s0.x, z: s0.z, tol: 0.3 });
    lay(C, 3, { w: 1.6, route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z, tol: 0.4 });
    lay(C, 2, { w: w0 });
  },

  stones(C, o) {
    const n = o.n ?? 4;
    const spacing = o.spacing ?? 2.4;
    const w0 = C.cur.w;
    lay(C, 2.5, { w: 2.0 });
    const y = C.cur.y;
    const edge = o.edge ?? 1.65;
    const len = 2 * edge + (n - 1) * spacing;
    const P = pit(C, len, 2.3, { l: "wall", r: "wall" });
    const mid = { x: (P.a.x + P.b.x) / 2, z: (P.a.z + P.b.z) / 2 };
    crossRiver(C, mid, {
      level: y - 0.55,
      depth: 1.5,
      w: len / 2 - 0.25,
      bank: 6,
      grade: 0.035,
      kind: "river",
      falls: o.falls,
      flow: o.flow ?? 1,
      meander: 2,
      widen: 0.2,
      frozen: o.frozen,
    });
    const rand = mulberry32(C.def.seed * 31 + C.ids);
    const take = pt(C, -len - 0.45, 0);
    C.route.push({ op: "go", x: take.x, z: take.z, tol: 0.3 });
    for (let i = 1; i <= n; i++) {
      const d = -len + edge + spacing * (i - 1);
      const lat = (o.zigzag ?? 0.5) * (i % 2 ? 1 : -1) * (rand() * 0.5 + 0.5);
      const c = pt(C, d, lat);
      const top = y - 0.04 + (rand() - 0.5) * 0.14;
      const r = o.r ?? 0.78;
      solid(C, { type: "cyl", x: c.x, z: c.z, y: y - 3.2, h: top - (y - 3.2), r, surf: o.surf || "stone", grip: 0.16 });
      prop(C, "stone", { x: c.x, z: c.z, y: top, r, wet: true, seed: i, icy: !!o.frozen });
      C.route.push({ op: "jump", x: c.x, z: c.z, run: false, settle: true });
    }
    const land = pt(C, 0.9, 0);
    C.route.push({ op: "jump", x: land.x, z: land.z, run: false });
    lay(C, 3, { w: w0, route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  mover(C, o) {
    const len = o.len ?? 7;
    const depth = o.depth ?? 9;
    lay(C, 3, { w: 2.0 });
    const y = C.cur.y;
    const P = pit(C, len, depth);
    if (o.river !== false) {
      const mid = { x: (P.a.x + P.b.x) / 2, z: (P.a.z + P.b.z) / 2 };
      crossRiver(C, mid, { level: y - depth + 1.4, depth: 1.6, w: Math.max(1, len / 2 - 2.2), bank: 4.6, grade: 0.05, kind: "gorge", meander: 3, falls: o.falls, flow: o.flow ?? 1 });
    }
    const hw = 1.3;
    const A = pt(C, -len + hw + 0.12, 0);
    const Bp = pt(C, -hw - 0.12, 0);
    const pl = {
      id: id(C, "pl"),
      ax: A.x,
      az: A.z,
      ay: y - 0.36,
      bx: Bp.x,
      bz: Bp.z,
      by: y - 0.36,
      hw,
      hd: hw,
      h: 0.34,
      rot: C.cur.h,
      travel: o.travel ?? 2.6,
      pause: o.pause ?? 1.1,
      phase: o.phase ?? 0,
      kind: o.kind || "raft",
    };
    C.platforms.push(pl);
    prop(C, "cableway", { ax: P.a.x, az: P.a.z, bx: P.b.x, bz: P.b.z, y, h: C.cur.h, len });
    const wait = pt(C, -len - 0.9, 0);
    const off = pt(C, 1.6, 0);
    C.route.push({ op: "go", x: wait.x, z: wait.z, tol: 0.3 });
    C.route.push({ op: "ride", id: pl.id, board: { x: A.x, z: A.z }, alight: { x: off.x, z: off.z }, end: "b" });
    lay(C, 3.5, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  lift(C, o) {
    const H = o.h ?? 5;
    lay(C, 4, { w: 2.2 });
    const y = C.cur.y;
    const hw = 1.25;
    const A = pt(C, -hw - 0.1, 0);
    cliff(C, H, { surf: "rock" });
    const pl = {
      id: id(C, "pl"),
      ax: A.x,
      az: A.z,
      ay: y - 0.34,
      bx: A.x,
      bz: A.z,
      by: y + H - 0.34,
      hw,
      hd: hw,
      h: 0.32,
      rot: C.cur.h,
      travel: o.travel ?? 3.2,
      pause: o.pause ?? 1.4,
      phase: o.phase ?? 0,
      kind: "lift",
    };
    C.platforms.push(pl);
    const face = pt(C, 0, 0);
    prop(C, "liftFrame", { x: face.x, z: face.z, y, h: C.cur.h, H, px: A.x, pz: A.z });
    prop(C, "cliffFace", { x: face.x, z: face.z, y, h: C.cur.h, H, w: C.cur.w + 2 });
    const wait = pt(C, -2 * hw - 0.9, 0);
    const off = pt(C, 1.7, 0);
    C.route.push({ op: "go", x: wait.x, z: wait.z, tol: 0.3 });
    C.route.push({ op: "ride", id: pl.id, board: { x: A.x, z: A.z }, alight: { x: off.x, z: off.z }, end: "b" });
    lay(C, 4, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  ledge(C, o) {
    const H = o.h ?? 2.2;
    lay(C, 3.5, {});
    const y = C.cur.y;
    const face = pt(C, 0, 0);
    const f = fwd(C.cur.h);
    cliff(C, H, { surf: "rock" });
    const top = pt(C, 0.75, 0);
    const cl = { id: id(C, "cl"), kind: "ledge", x: face.x, z: face.z, nx: -f.x, nz: -f.z, half: C.cur.w - 0.15, baseY: y, topY: y + H, topX: top.x, topZ: top.z };
    C.climbs.push(cl);
    prop(C, "ledgeFace", { x: face.x, z: face.z, y, h: C.cur.h, H, w: C.cur.w });
    const st = pt(C, -0.65, 0);
    C.route.push({ op: "go", x: st.x, z: st.z, tol: 0.3 });
    C.route.push({ op: "climb", id: cl.id });
    lay(C, 4, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  ladder(C, o) {
    const H = o.h ?? 4;
    lay(C, 3.5, {});
    const y = C.cur.y;
    const face = pt(C, 0, o.side ?? 0);
    const f = fwd(C.cur.h);
    cliff(C, H, { surf: "rock" });
    const top = pt(C, 0.8, o.side ?? 0);
    const cl = { id: id(C, "cl"), kind: "ladder", x: face.x, z: face.z, nx: -f.x, nz: -f.z, half: 0.55, baseY: y, topY: y + H, topX: top.x, topZ: top.z };
    C.climbs.push(cl);
    prop(C, "cliffFace", { ...pt(C, 0, 0), y, h: C.cur.h, H, w: C.cur.w + 0.3 });
    prop(C, "ladder", { x: face.x, z: face.z, y, h: C.cur.h, H });
    const st = pt(C, -0.6, o.side ?? 0);
    C.route.push({ op: "go", x: st.x, z: st.z, tol: 0.25 });
    C.route.push({ op: "ladder", id: cl.id });
    lay(C, 4, { route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
  },

  leverBridge(C, o) {
    const len = o.len ?? 5;
    const depth = o.depth ?? 8;
    const w0 = C.cur.w;
    lay(C, 4, { w: 2.0 });
    const y = C.cur.y;
    const h = C.cur.h;
    const lv = pt(C, -1.6, 1.35);
    const P = pit(C, len, depth);
    const mid = { x: (P.a.x + P.b.x) / 2, z: (P.a.z + P.b.z) / 2 };
    if (o.river !== false) crossRiver(C, mid, { level: y - depth + 1.4, depth: 1.6, w: Math.max(0.8, len / 2 - 2.1), bank: 5, grade: 0.05, kind: "gorge", meander: 2 });
    const br = { id: id(C, "br"), ext: 0, ax: P.a.x, az: P.a.z, bx: P.b.x, bz: P.b.z, y, h, len, kind: o.kind || "wood" };
    C.bridges.push(br);
    const span = len + 1.4;
    const c = pt(C, -len / 2, 0);
    solid(C, { type: "box", x: c.x, z: c.z, y: y - 0.3, h: 0.32, hw: 1.05, hd: span / 2, rot: h, surf: "wood", deck: true, on: { bridge: br.id } });
    for (const s of [-1, 1]) {
      const rc = pt(C, -len / 2, s * 1.17);
      solid(C, { type: "box", x: rc.x, z: rc.z, y: y - 0.2, h: 1.2, hw: 0.08, hd: span / 2, rot: h, wallAlways: true, noCamera: true, on: { bridge: br.id } });
    }
    const lever = { id: id(C, "lv"), x: lv.x, z: lv.z, y, h, target: br.id, r: 1.6 };
    C.levers.push(lever);
    keep(C, lv.x, lv.z, 1.5);
    const near = pt(C, -len - 2.0, 0.6);
    C.route.push({ op: "go", x: near.x, z: near.z, tol: 0.35 });
    C.route.push({ op: "interact", id: lever.id });
    C.route.push({ op: "waitFlag", flag: `bridge:${br.id}` });
    const s0 = pt(C, -len - 1.2, 0);
    C.route.push({ op: "go", x: s0.x, z: s0.z, tol: 0.3 });
    lay(C, 3, { w: 2.0, route: false });
    C.route.push({ op: "go", x: C.cur.x, z: C.cur.z });
    lay(C, 2, { w: w0 });
  },

  keyGate(C, o) {
    lay(C, 3, {});
    const S = spur(C, o.side || "left", o.spurLen ?? 11, { rise: o.spurRise ?? 0.6, turn: o.spurTurn ?? 0.3 });
    const key = { id: id(C, "key"), x: S.end.x, z: S.end.z, y: S.end.y };
    C.keys.push(key);
    prop(C, "pedestal", { x: S.end.x, z: S.end.z, y: S.end.y, h: S.end.h });
    keep(C, S.end.x, S.end.z, 2);
    C.route.push(...S.route, { op: "waitFlag", flag: `key:${key.id}` }, ...S.back);
    lay(C, 5, { route: false });
    const gate = gateAt(C, { needs: { key: key.id }, kind: o.kind || "gate" });
    C.route.push({ op: "interact", id: gate.id });
    C.route.push({ op: "waitFlag", flag: `gate:${gate.id}` });
    lay(C, 4, {});
  },

  cratePlate(C, o) {
    const w0 = C.cur.w;
    lay(C, 3, { w: 3.3 });
    const lane = 1.55 * (o.side === "left" ? -1 : 1);
    const c0 = pt(C, 2.2, lane);
    const plateD = o.dist ?? 6;
    const crate = { id: id(C, "cr"), x0: c0.x, z0: c0.z, y: C.cur.y, h: C.cur.h, dx: fwd(C.cur.h).x, dz: fwd(C.cur.h).z, pos: 0, len: plateD, size: 0.55 };
    C.crates.push(crate);
    const pl = pt(C, 2.2 + plateD, lane);
    prop(C, "plate", { x: pl.x, z: pl.z, y: C.cur.y, h: C.cur.h, crate: crate.id });
    prop(C, "crateRail", { ax: c0.x, az: c0.z, bx: pl.x, bz: pl.z, y: C.cur.y, h: C.cur.h });
    const behind = pt(C, 2.2 - 1.15, lane);
    const around = pt(C, 0.6, -lane);
    C.route.push({ op: "go", x: around.x, z: around.z, tol: 0.5 });
    C.route.push({ op: "go", x: behind.x, z: behind.z, tol: 0.25 });
    C.route.push({ op: "push", id: crate.id });
    lay(C, plateD + 4, { w: 3.3, route: false });
    const gate = gateAt(C, { needs: { crate: crate.id }, kind: "gate" });
    const front = pt(C, -1.4, 0);
    C.route.push({ op: "go", x: front.x, z: front.z, tol: 0.4 });
    C.route.push({ op: "waitFlag", flag: `gate:${gate.id}` });
    lay(C, 4, { w: w0 });
  },

  switches(C, o) {
    lay(C, 3, {});
    const ids = [];
    const make = (side, len) => {
      const S = spur(C, side, len, { rise: o.rise ?? 0, endW: 2.0 });
      const sw = { id: id(C, "sw"), x: S.end.x, z: S.end.z, y: S.end.y, h: S.end.h, r: 1.7 };
      C.switches.push(sw);
      keep(C, S.end.x, S.end.z, 2);
      ids.push(sw.id);
      C.route.push(...S.route.slice(0, -1));
      const near = S.route[S.route.length - 1];
      C.route.push({ op: "go", x: near.x, z: near.z, tol: 0.9 });
      C.route.push({ op: "interact", id: sw.id }, ...S.back);
    };
    make("left", o.len ?? 8);
    lay(C, 4, {});
    make("right", o.len ?? 8);
    lay(C, 4, { route: false });
    const gate = gateAt(C, { needs: { switches: ids }, kind: o.kind || "stoneGate" });
    C.route.push({ op: "waitFlag", flag: `gate:${gate.id}` });
    lay(C, 4, {});
  },

  cave(C, o) {
    const len = o.len ?? 22;
    const w0 = C.cur.w;
    const roof = o.roof ?? 3.7;
    const caveTag = { id: id(C, "cave"), h: roof };
    const start = pt(C, 0, 0);
    lay(C, 3, { w: 2.0 });
    const entry = { x: C.cur.x, z: C.cur.z, y: C.cur.y, h: C.cur.h };
    const nodes0 = C.main.length;
    const parts = o.door ? [len * 0.45, len * 0.55] : [len];
    let door = null;
    for (let i = 0; i < parts.length; i++) {
      lay(C, parts[i], { w: o.w ?? 2.1, l: "cave", r: "cave", cave: caveTag, surf: "stone", turn: (o.turn || 0) / parts.length, rise: (o.rise || 0) / parts.length, step: 2.5 });
      if (o.door && i === 0) {
        // the crystal switch sits in a side alcove before the door
        const S = spur(C, o.alcove || "right", 5, { cave: caveTag, l: "cave", r: "cave", surf: "stone", endW: 1.8 });
        const sw = { id: id(C, "sw"), x: S.end.x, z: S.end.z, y: S.end.y, h: S.end.h, r: 1.7, crystal: true };
        C.switches.push(sw);
        C.route.push(...S.route.slice(0, -1));
        const near = S.route[S.route.length - 1];
        C.route.push({ op: "go", x: near.x, z: near.z, tol: 0.9 });
        C.route.push({ op: "interact", id: sw.id }, ...S.back);
        lay(C, 2.5, { w: o.w ?? 2.1, l: "cave", r: "cave", cave: caveTag, surf: "stone", route: false });
        door = gateAt(C, { needs: { switches: [sw.id] }, kind: "rockDoor", cave: true });
        C.route.push({ op: "waitFlag", flag: `gate:${door.id}` });
      }
    }
    const exit = { x: C.cur.x, z: C.cur.z, y: C.cur.y, h: C.cur.h };
    const nodes = C.main.slice(nodes0);
    C.caves.push({ id: caveTag.id, nodes, entry, exit, roof, crystals: o.crystals ?? true, color: o.color || (C.region.id >= 5 ? "#9fe8ff" : C.region.id === 3 ? "#b98cff" : "#7fe0ff"), pool: o.pool });
    if (o.badge) {
      const mid = nodes[Math.floor(nodes.length * 0.6)];
      const save = { ...C.cur };
      C.cur = { ...C.cur, x: mid.x, z: mid.z, y: mid.y };
      const S = spur(C, o.badge, 4.5, { cave: caveTag, l: "cave", r: "cave", surf: "stone", endW: 1.6 });
      C.cur = save;
      badge(C, S.end.x, S.end.z, S.end.y, { cave: true });
      // inserted into the route right where the main walk passes `mid`
      const at = C.route.findIndex((r) => r.op === "go" && Math.hypot(r.x - mid.x, r.z - mid.z) < 0.01);
      if (at >= 0) C.route.splice(at + 1, 0, ...S.route, ...S.back.slice(0, -1), { op: "go", x: mid.x, z: mid.z });
    }
    keep(C, start.x, start.z, 5);
    lay(C, 3, { w: w0 });
  },

  wind(C, o) {
    const len = o.len ?? 28;
    const side = o.drop || "right";
    const n0 = C.main.length;
    lay(C, len, { ...o, w: o.w ?? 1.7, l: side === "left" ? "drop" : C.l === "drop" ? "wall" : C.l, r: side === "right" ? "drop" : C.r === "drop" ? "wall" : C.r, surf: o.surf ?? C.surf });
    const nodes = C.main.slice(n0 - 1);
    const sgn = side === "right" ? 1 : -1;
    C.wind.push({ id: id(C, "wd"), nodes, sgn, base: o.base ?? 0.8, gust: o.gust ?? 2.0, period: o.period ?? 5.5, w: (o.w ?? 1.7) + 1.5 });
    if (o.rail !== false) {
      // a low stone kerb / rope rail on the drop side, with gaps if asked
      for (let i = 1; i < nodes.length; i++) {
        if (o.railGaps && i % 3 === 0) continue;
        const a = nodes[i - 1];
        const b = nodes[i];
        const hh = Math.atan2(b.x - a.x, b.z - a.z);
        const r = rightOf(hh);
        const off = (a.w + 0.25) * sgn;
        const cx = (a.x + b.x) / 2 + r.x * off;
        const cz = (a.z + b.z) / 2 + r.z * off;
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        solid(C, { type: "box", x: cx, z: cz, y: Math.min(a.y, b.y) - 0.3, h: 1.15, hw: 0.14, hd: L / 2 + 0.05, rot: hh, wallAlways: true, noCamera: true, surf: "stone" });
        prop(C, "rail", { x: cx, z: cz, y: (a.y + b.y) / 2, h: hh, len: L, kind: o.railKind || (C.region.id >= 4 ? "rope" : "stone") });
      }
    }
    prop(C, "windFlags", { nodes: nodes.map((n) => ({ x: n.x, z: n.z, y: n.y })), sgn });
  },

  ice(C, o) {
    lay(C, o.len ?? 16, { ...o, surf: "ice" });
  },

  checkpoint(C, o) {
    lay(C, 1.5, {});
    const cp = checkpointAt(C, o.kind);
    prop(C, "checkpoint", { id: cp.id, kind: cp.kind, x: cp.mx, z: cp.mz, y: cp.y, h: cp.h });
    lay(C, 2.5, {});
  },

  viewpoint(C, o) {
    const side = o.side || "right";
    // the trail beside the overlook keeps a wall on that side, so the
    // promontory isn't carved away by a drop bank
    const guard = side === "left" ? { l: "low" } : { r: "low" };
    lay(C, 3.6, guard);
    const S = spur(C, side, o.len ?? 7, { endW: 2.6, cap: "drop", rise: o.rise ?? 0.3, w: 1.7 });
    const f = fwd(S.end.h);
    const r = rightOf(S.end.h);
    const marker = { x: S.end.x - f.x * 0.8 + r.x * 0.9, z: S.end.z - f.z * 0.8 + r.z * 0.9 };
    const vp = {
      id: id(C, "vp"),
      name: o.name || "Viewpoint",
      x: marker.x,
      z: marker.z,
      y: S.end.y,
      r: 2.0,
      cam: { x: S.end.x - f.x * 3.6 - r.x * 1.3, z: S.end.z - f.z * 3.6 - r.z * 1.3, y: S.end.y + 2.4, h: S.end.h, pitch: o.pitch ?? -0.12, sweep: o.sweep ?? 0.28 },
    };
    C.viewpoints.push(vp);
    // a railing along the overlook's edge and a bench / scope
    const edge = { x: S.end.x + f.x * 2.65, z: S.end.z + f.z * 2.65 };
    solid(C, { type: "box", x: edge.x, z: edge.z, y: S.end.y - 0.5, h: 1.55, hw: 2.9, hd: 0.08, rot: S.end.h, wallAlways: true, noCamera: true, surf: "wood" });
    for (const s of [-1, 1]) {
      const sx = S.end.x + f.x * 0.9 + r.x * s * 2.7;
      const sz = S.end.z + f.z * 0.9 + r.z * s * 2.7;
      solid(C, { type: "box", x: sx, z: sz, y: S.end.y - 0.5, h: 1.55, hw: 0.08, hd: 1.9, rot: S.end.h, wallAlways: true, noCamera: true, surf: "wood" });
    }
    prop(C, "overlook", { x: S.end.x, z: S.end.z, y: S.end.y, h: S.end.h, mx: marker.x, mz: marker.z, vp: vp.id });
    // something gorgeous below: a lake in the valley
    if (o.lake !== false) {
      const lx = S.end.x + f.x * 70;
      const lz = S.end.z + f.z * 70;
      C.lakes.push({ x: lx, z: lz, y: S.end.y - C.def.valley + 1.5 - (o.lakeDrop ?? 0), r: o.lakeR ?? 34, depth: 4, valley: true });
    }
    keep(C, S.end.x, S.end.z, 4);
    C.route.push(...S.route.slice(0, -1));
    C.route.push({ op: "go", x: marker.x - f.x * 0.9, z: marker.z - f.z * 0.9, tol: 0.5 });
    C.route.push({ op: "interact", id: vp.id }, ...S.back);
    lay(C, 3.6, guard);
  },

  badge(C, o) {
    const at = o.at || "path";
    const bk = { l: o.l, r: o.r };
    if (at === "path") {
      lay(C, 2, bk);
      const p = pt(C, 1.5, o.side ?? 0);
      badge(C, p.x, p.z, C.cur.y);
      C.route.push({ op: "go", x: p.x, z: p.z, tol: 0.4 });
      lay(C, 3, bk);
    } else if (at === "high") {
      lay(C, 2, bk);
      const side = o.side ?? C.cur.w - 0.4;
      const p = pt(C, 2, side);
      const H = o.h ?? 1.05;
      solid(C, { type: "cyl", x: p.x, z: p.z, y: C.cur.y - 0.5, h: H + 0.5, r: 0.85, surf: "stone", grip: 0.05 });
      prop(C, "boulder", { x: p.x, z: p.z, y: C.cur.y, top: C.cur.y + H, r: 0.85, flat: true });
      badge(C, p.x, p.z, C.cur.y + H);
      const take = pt(C, 0.2, side * 0.45);
      C.route.push({ op: "go", x: take.x, z: take.z, tol: 0.3 });
      C.route.push({ op: "jump", x: p.x, z: p.z, run: false, settle: true });
      const off = pt(C, 4, 0);
      C.route.push({ op: "jump", x: off.x, z: off.z, run: false });
      lay(C, 4, { ...bk, route: false });
    } else {
      lay(C, 2, {});
      const S = spur(C, o.side || "left", o.len ?? 9, { rise: o.rise ?? 0.5, turn: o.turn ?? 0.4, w: o.w ?? 1.4, endW: 2.0 });
      badge(C, S.end.x, S.end.z, S.end.y);
      C.route.push(...S.route, ...S.back);
      lay(C, 2, {});
    }
  },

  waterfall(C, o) {
    // a waterfall tumbling into a shallow pool beside the trail
    lay(C, 3, {});
    const side = o.side === "left" ? -1 : 1;
    const off = C.cur.w + (o.off ?? 4.6);
    const pool = pt(C, 0, side * off);
    const L = { x: pool.x, z: pool.z, y: C.cur.y - 0.25, r: 3.6, depth: 0.45, pool: true, frozen: !!o.frozen };
    C.lakes.push(L);
    const r = rightOf(C.cur.h);
    const dirx = r.x * side;
    const dirz = r.z * side;
    const H = o.h ?? 9;
    const fd = 3.4;
    const nodes = [];
    const level = L.y;
    for (const [s, y] of [
      [0, level],
      [fd, level],
      [fd + 0.06, level + H],
      [fd + 14, level + H + 1],
      [fd + 40, level + H + 3],
      [fd + 90, level + H + 6],
    ]) {
      nodes.push({ x: pool.x + dirx * s, z: pool.z + dirz * s, y, w: s > fd ? 1.5 : 2.2, depth: 0.5 });
    }
    const fall = { x: pool.x + dirx * fd, z: pool.z + dirz * fd, top: level + H, bottom: level, w: 1.5, h: Math.atan2(-dirx, -dirz), frozen: !!o.frozen, dirX: -dirx, dirZ: -dirz, pool: true };
    C.rivers.push({ nodes, flow: -1, bankSlope: 2, kind: "falls", falls: [fall], frozen: !!o.frozen });
    C.falls.push(fall);
    keep(C, pool.x, pool.z, 5);
    prop(C, "wetRocks", { x: pool.x, z: pool.z, y: L.y, r: 3.8, seed: C.ids });
    lay(C, 3, {});
  },

  /** A wide river winding along the valley floor below a drop side (scenery). */
  vista(C, o) {
    const sgn = o.side === "left" ? -1 : 1;
    const r = rightOf(C.cur.h);
    const f = fwd(C.cur.h);
    const level = C.cur.y - C.def.valley + 0.6;
    const nodes = [];
    for (let s = -220; s <= 220; s += 12) {
      const m = Math.sin(s * 0.018 + (o.phase || 0)) * (o.meander ?? 16);
      const off = (o.dist ?? 75) + m;
      nodes.push({ x: C.cur.x + f.x * s + r.x * sgn * off, z: C.cur.z + f.z * s + r.z * sgn * off, y: level - s * 0.01, w: o.w ?? 5, depth: 2.2 });
    }
    C.rivers.push({ nodes, flow: 1, bankSlope: 3.2, kind: "valley", falls: [] });
    if (o.lake) {
      const at = { x: C.cur.x + r.x * sgn * (o.lake.dist ?? 110) + f.x * (o.lake.along ?? 40), z: C.cur.z + r.z * sgn * (o.lake.dist ?? 110) + f.z * (o.lake.along ?? 40) };
      C.lakes.push({ x: at.x, z: at.z, y: level + 0.2, r: o.lake.r ?? 40, depth: 4, valley: true });
    }
  },

  ruins(C, o) {
    lay(C, 2, {});
    const a = pt(C, 2, 0);
    prop(C, "arch", { x: a.x, z: a.z, y: C.cur.y, h: C.cur.h, w: C.cur.w + 0.5 });
    for (const s of [-1, 1]) {
      const p = pt(C, 2, s * (C.cur.w + 0.55));
      solid(C, { type: "cyl", x: p.x, z: p.z, y: C.cur.y - 0.5, h: 4.5, r: 0.45, surf: "stone" });
    }
    if (o.pillars) for (let i = 0; i < o.pillars; i++) prop(C, "pillar", { ...pt(C, 5 + i * 3.2, (i % 2 ? 1 : -1) * (C.cur.w + 0.9)), y: C.cur.y, broken: i % 2 === 1, ground: true });
    lay(C, (o.len ?? 10) - 2, {});
  },

  finish(C, o) {
    lay(C, 3, { w: 3.2, l: o.l ?? C.l, r: o.r ?? C.r });
    lay(C, 5, { w: o.w ?? 4.2, l: o.l ?? C.l, r: o.r ?? C.r, cap: o.cap });
    const last = C.main[C.main.length - 1];
    last.cap = o.cap || "wall";
    const p = pt(C, -1.6, 0);
    C.finish = { x: p.x, z: p.z, y: C.cur.y, r: 2.4, kind: o.kind || "flag", h: C.cur.h };
    prop(C, "finish", { x: p.x, z: p.z, y: C.cur.y, h: C.cur.h, kind: o.kind || "flag" });
    keep(C, p.x, p.z, 5);
    C.route.push({ op: "go", x: p.x, z: p.z, tol: 0.6 });
  },
};

function gateAt(C, o) {
  const p = pt(C, 0, 0);
  const gate = { id: id(C, "gt"), x: p.x, z: p.z, y: C.cur.y, h: C.cur.h, w: C.cur.w, needs: o.needs, kind: o.kind, open: 0, r: 2.2 };
  C.gates.push(gate);
  solid(C, { type: "box", x: p.x, z: p.z, y: C.cur.y - 0.3, h: 3.2, hw: C.cur.w + 2.2, hd: 0.3, rot: C.cur.h, surf: o.cave ? "stone" : "wood", on: { gate: gate.id } });
  prop(C, "gate", { id: gate.id, kind: o.kind, x: p.x, z: p.z, y: C.cur.y, h: C.cur.h, w: C.cur.w });
  keep(C, p.x, p.z, 3);
  const front = pt(C, -1.3, 0);
  C.route.push({ op: "go", x: front.x, z: front.z, tol: 0.5 });
  return gate;
}

// --- vegetation --------------------------------------------------------------
const VEG_KINDS = ["pine", "fir", "broad", "birch", "snowPine", "dead"];

function scatter(L, region, def) {
  const T = L.terrain;
  const rand = mulberry32(def.seed * 7919 + 13);
  const { minX, minZ, maxX, maxZ } = T.bounds;
  const M = 120;
  const veg = { trees: {}, bushes: [], grass: [], flowers: [], rocks: [] };
  for (const k of VEG_KINDS) veg.trees[k] = [];
  const V = region.veg;
  const weights = VEG_KINDS.map((k) => V[k] || 0);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const keepOut = (x, z, pad) => {
    for (const k of L.keepClear) if ((x - k.x) * (x - k.x) + (z - k.z) * (z - k.z) < (k.r + pad) * (k.r + pad)) return true;
    return false;
  };
  const density = def.treeDensity ?? 1;
  const step = 3.3;
  for (let x = minX - M; x <= maxX + M; x += step) {
    for (let z = minZ - M; z <= maxZ + M; z += step) {
      const jx = x + (rand() - 0.5) * step * 0.9;
      const jz = z + (rand() - 0.5) * step * 0.9;
      const q = T.query(jx, jz);
      if (q.d > 125) continue;
      if (q.water) continue;
      const h = q.h;
      const e = q.e;
      const n = fbm(jx * 0.03, jz * 0.03, def.seed + 41, 3);
      const sl = T.slope(jx, jz, h).g;
      // trees
      if (wsum > 0 && e > 2.7 && sl < 2.1 && !keepOut(jx, jz, 1.2)) {
        const clump = (smoothstep(0.25, 0.6, n) * 0.8 + 0.25) * density * (q.e < 14 ? 1.35 : 1);
        const bias = q.d < 35 ? 1 : 0.75;
        if (rand() < clump * 0.55 * bias) {
          let pick = rand() * wsum;
          let kind = VEG_KINDS[0];
          for (let i = 0; i < VEG_KINDS.length; i++) {
            pick -= weights[i];
            if (pick <= 0) {
              kind = VEG_KINDS[i];
              break;
            }
          }
          const s = 0.75 + rand() * 0.65 + (q.d > 40 ? 0.2 : 0);
          veg.trees[kind].push([jx, h - 0.15, jz, s, rand() * Math.PI * 2]);
          if (e < 8) L.solids.add({ type: "cyl", x: jx, z: jz, y: h - 1, h: 6, r: 0.32 * s, surf: "wood", tree: true });
          // canopies only stop the camera (it pulls in instead of clipping foliage)
          if (e < 12) L.solids.add({ type: "cyl", x: jx, z: jz, y: h + 1.7 * s, h: 4.5 * s, r: 1.15 * s, cameraOnly: true });
          continue;
        }
      }
      if ((V.bush || 0) > 0 && e > 0.9 && e < 40 && sl < 1.3 && rand() < 0.08 * V.bush && !keepOut(jx, jz, 0.5)) {
        veg.bushes.push([jx, h, jz, 0.6 + rand() * 0.7, rand() * 6.28]);
      }
      if ((V.rocks || 0) > 0 && rand() < 0.05 * V.rocks && e > 1.2 && !keepOut(jx, jz, 0.8)) {
        const s = 0.4 + rand() * (sl > 1 ? 1.8 : 1.1);
        veg.rocks.push([jx, h - 0.15 * s, jz, s, rand() * 6.28]);
        if (e < 6 && sl < 1 && s > 0.7) L.solids.add({ type: "cyl", x: jx, z: jz, y: h - 1, h: 1 + s * 0.55, r: s * 0.55, surf: "stone" });
      }
    }
  }
  // grass & flowers concentrate along the corridor edges where the player looks
  const gstep = 1.15;
  for (let x = minX - 40; x <= maxX + 40; x += gstep) {
    for (let z = minZ - 40; z <= maxZ + 40; z += gstep) {
      const jx = x + (rand() - 0.5) * gstep;
      const jz = z + (rand() - 0.5) * gstep;
      const q = T.query(jx, jz);
      if (q.e < -0.35 || q.e > 9 || q.water) continue;
      if (q.node && (q.node.cave || q.node.surf === "ice")) continue;
      const near = 1 - smoothstep(0, 9, q.e);
      if ((V.grass || 0) > 0 && rand() < (q.e < 3.5 ? 0.85 : 0.4) * near * V.grass) {
        if (!keepOut(jx, jz, -0.5)) veg.grass.push([jx, q.h, jz, 0.6 + rand() * 0.7, rand() * 6.28]);
      }
      if ((V.flowers || 0) > 0 && rand() < 0.07 * near * V.flowers && q.e > 0.1 && q.e < 3.4) {
        veg.flowers.push([jx, q.h, jz, 0.5 + rand() * 0.35, Math.floor(rand() * 4)]);
      }
    }
  }
  const cap = { grass: 5200, flowers: 900, rocks: 700, bushes: 900 };
  for (const [k, n] of Object.entries(cap)) if (veg[k].length > n) veg[k] = veg[k].filter((_, i) => i % Math.ceil(veg[k].length / n) === 0);
  return veg;
}

// --- build -----------------------------------------------------------------
export function buildLevel(def, region) {
  const C = makeCtx(def, region);
  for (const [type, opts] of def.segs) {
    const fn = SEGMENTS[type];
    if (!fn) throw new Error(`Unknown segment "${type}" in level ${def.id}`);
    fn(C, opts || {});
  }
  if (!C.finish) throw new Error(`Level ${def.id} has no finish`);
  const terrain = createTerrain({
    seed: def.seed,
    paths: C.paths,
    rivers: C.rivers,
    lakes: C.lakes,
    hillAmp: def.hillAmp ?? region.hill.amp,
    hillBase: def.hillBase ?? region.hill.base,
    valleyDepth: def.valley,
  });
  const solids = createSolids();
  for (const s of C.solidDefs) {
    const on = s.on;
    const copy = { ...s };
    delete copy.on;
    const sol = solids.add(copy);
    if (on) sol.gate = on;
  }
  const L = {
    def,
    region,
    terrain,
    solids,
    paths: C.paths,
    rivers: terrain.rivers,
    lakes: C.lakes,
    props: C.props,
    checkpoints: C.checkpoints,
    badges: C.badges,
    viewpoints: C.viewpoints,
    climbs: C.climbs,
    platforms: C.platforms,
    gates: C.gates,
    levers: C.levers,
    switches: C.switches,
    keys: C.keys,
    crates: C.crates,
    bridges: C.bridges,
    wind: C.wind,
    pits: C.pits,
    caves: C.caves,
    falls: C.falls,
    keepClear: C.keepClear,
    finish: C.finish,
    spawn: C.spawn,
    route: C.route,
  };
  // props flagged `ground` sit on the terrain
  for (const p of L.props) if (p.ground) p.y = terrain.height(p.x, p.z);
  L.spawn.y = terrain.height(L.spawn.x, L.spawn.z);
  L.veg = scatter(L, region, def);
  const b = terrain.bounds;
  L.bounds = { minX: b.minX - 30, minZ: b.minZ - 30, maxX: b.maxX + 30, maxZ: b.maxZ + 30 };
  let lo = Infinity;
  for (const n of C.main) lo = Math.min(lo, n.y);
  L.lowY = lo;
  L.length = C.main.reduce((s, n, i) => (i ? s + Math.hypot(n.x - C.main[i - 1].x, n.z - C.main[i - 1].z) : 0), 0);
  return L;
}

/**
 * Structural validation used by tools/simTest.mjs: trail centre lines sit at
 * their authored heights, corridors are enclosed (walls tall enough, or an
 * intentional drop), and every placed object stands where it should.
 */
export function validateLevel(L) {
  const T = L.terrain;
  const issues = [];
  for (const path of L.paths) {
    const N = path.nodes;
    const own = new Set(N);
    for (let i = 0; i < N.length - 1; i++) {
      const a = N[i];
      const b = N[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.4) continue; // cliffs
      if (a.tag === "pit") continue; // gap / gorge floors are fall zones
      const junction = !path.main && i === 0;
      const n = Math.ceil(len / 0.5);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const want = a.y + (b.y - a.y) * t;
        const q = T.query(x, z);
        if (q.water) continue;
        if (junction && t < 0.75) continue; // merges into the main trail's slope
        if (Math.abs(q.h - want) > 0.1) {
          issues.push(`trail height off by ${(q.h - want).toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)}) path ${path.main ? "main" : "spur"} node ${i}`);
          break;
        }
      }
      // enclosure: just outside each edge the ground must rise (wall) or fall away (drop)
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const hh = Math.atan2(b.x - a.x, b.z - a.z);
      const r = rightOf(hh);
      const yMid = (a.y + b.y) / 2;
      for (const s of [-1, 1]) {
        if (junction) break;
        const kind = s > 0 ? a.r : a.l;
        if (kind === "drop" || kind === "low") continue;
        const w = (a.w + b.w) / 2;
        let top = -Infinity;
        let wet = false;
        let low = false;
        for (let k = 1; k <= 14; k += 0.5) {
          const ox = mx + r.x * s * (w + k);
          const oz = mz + r.z * s * (w + k);
          const q = T.query(ox, oz);
          if (q.water) wet = true;
          if (L.solids.blocks(ox, yMid + 1, oz, 0)) {
            top = Infinity; // a solid (dam, wall) closes it
            break;
          }
          if (k > 2 && q.node && !own.has(q.node) && q.e < 3.4 && Math.abs(q.h - yMid) < 3) {
            low = true; // reached another trail corridor
            break;
          }
          if (q.h < yMid - 2.5) low = true; // falls away (a gorge or valley): fall → respawn
          top = Math.max(top, q.h);
        }
        if (top < yMid + 2.6 && !wet && !low) issues.push(`weak wall (${(top - yMid).toFixed(2)}m) beside ${path.main ? "main" : "spur"} node ${i} at (${mx.toFixed(1)}, ${mz.toFixed(1)}) side ${s}`);
      }
    }
  }
  const checkOn = (what, x, z, y, tol = 0.25) => {
    const h = T.height(x, z);
    let top = h;
    const g = L.solids.groundAt(x, z, y + 0.3, 0.45);
    if (g) top = Math.max(top, g.top);
    if (Math.abs(top - y) > tol) issues.push(`${what} floats/sinks by ${(top - y).toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  };
  for (const c of L.checkpoints) checkOn(`checkpoint ${c.id}`, c.x, c.z, c.y);
  for (const b of L.badges) checkOn(`badge ${b.id}`, b.x, b.z, b.y - 1.0, 0.3);
  checkOn("finish", L.finish.x, L.finish.z, L.finish.y);
  checkOn("spawn", L.spawn.x, L.spawn.z, L.spawn.y, 0.05);
  if (L.badges.length !== 3) issues.push(`expected 3 badges, found ${L.badges.length}`);
  if (L.viewpoints.length < 1) issues.push("no viewpoint");
  return issues;
}

export { clamp };
