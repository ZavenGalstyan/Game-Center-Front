/**
 * Police Escape 3D — builds a compact handcrafted city from a block layout.
 *
 * The city is a grid of blocks separated by roads:
 *
 *   cols / rows   block sizes (m) along x / z
 *   avenues       { x: [line indices], z: [...] } — wide 4-lane roads
 *   closed        removed road segments: ["h", i, j] = road on row line j
 *                 between column lines i..i+1; ["v", i, j] = road on column
 *                 line i between row lines j..j+1
 *   blocks        { "i,j": "park" | "water" | "yard" | "plaza" } (default
 *                 "build" — buildings)
 *   alleys        [[i, j, "x" | "z"]] — a narrow shortcut through a block
 *   tunnels       segment specs drawn as tunnels
 *   rain          segment specs with wet, low-grip asphalt
 *   zone          { block: [i, j], side: "N"|"S"|"E"|"W", kind } — the
 *                 escape point: a notch cut into that block from that side
 *
 * It produces:
 *   graph   nodes (intersections, alley / zone junctions) + straight edges
 *           (road | alley | tunnel | bridge) — what police and traffic drive
 *   solids  axis-aligned rectangles the cars collide with (buildings,
 *           water, parks, closed roads, the map border), in a spatial grid
 *   blocks  per-block rectangles for rendering
 * plus queries: surfaceAt, locate (nearest edge), fieldFrom (Dijkstra
 * distance field over the graph), lineOfSight.
 *
 * Coordinates: x east, z "south" (three.js ground plane), metres.
 */
import { clamp } from "./util.js";

export const ROAD_W = 14;
export const AVENUE_W = 20;
export const ALLEY_W = 9;
export const SIDEWALK = 3.5;
const NOTCH_W = 16;
const NOTCH_D = 20;
const CELL = 40;

const segKey = (s) => `${s[0]},${s[1]},${s[2]}`;

export function buildCity(def) {
  const cols = def.cols;
  const rows = def.rows;
  const nc = cols.length; // blocks along x → column lines 0..nc
  const nr = rows.length;
  const avx = new Set(def.avenues?.x || []);
  const avz = new Set(def.avenues?.z || []);
  const wx = (i) => (avx.has(i) ? AVENUE_W : ROAD_W); // width of column line i (vertical road)
  const wz = (j) => (avz.has(j) ? AVENUE_W : ROAD_W);
  const X = [0];
  for (let i = 0; i < nc; i++) X.push(X[i] + wx(i) / 2 + cols[i] + wx(i + 1) / 2);
  const Z = [0];
  for (let j = 0; j < nr; j++) Z.push(Z[j] + wz(j) / 2 + rows[j] + wz(j + 1) / 2);
  const closed = new Set((def.closed || []).map(segKey));
  const tunnelSet = new Set((def.tunnels || []).map(segKey));
  const rainSet = new Set((def.rain || []).map(segKey));
  const btype = (i, j) => (i < 0 || j < 0 || i >= nc || j >= nr ? "edge" : def.blocks?.[`${i},${j}`] || "build");

  // --- blocks -------------------------------------------------------------------
  const blocks = [];
  for (let i = 0; i < nc; i++)
    for (let j = 0; j < nr; j++) {
      const x0 = X[i] + wx(i) / 2;
      const x1 = X[i + 1] - wx(i + 1) / 2;
      const z0 = Z[j] + wz(j) / 2;
      const z1 = Z[j + 1] - wz(j + 1) / 2;
      blocks.push({ i, j, type: btype(i, j), x0, x1, z0, z1, alley: null, notch: null });
    }
  const blockAt = (i, j) => blocks[i * nr + j];

  // --- graph --------------------------------------------------------------------
  const nodes = [];
  const edges = [];
  const nodeAt = new Map(); // "x,z" → id
  const addNode = (x, z, kind = "int") => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (nodeAt.has(k)) return nodeAt.get(k);
    const id = nodes.length;
    nodes.push({ id, x, z, kind, adj: [] });
    nodeAt.set(k, id);
    return id;
  };
  // split points per grid segment (alley mouths, zone driveway)
  const splits = new Map();
  const addSplit = (spec, pos, info) => {
    const k = segKey(spec);
    if (!splits.has(k)) splits.set(k, []);
    splits.get(k).push({ pos, ...info });
  };

  // alleys
  for (const [i, j, axis, at = 0.5] of def.alleys || []) {
    const b = blockAt(i, j);
    if (axis === "x") {
      const zc = b.z0 + (b.z1 - b.z0) * at;
      b.alley = { axis, c: zc };
      addSplit(["v", i, j], zc, { alley: b.alley });
      addSplit(["v", i + 1, j], zc, { alley: b.alley });
    } else {
      const xc = b.x0 + (b.x1 - b.x0) * at;
      b.alley = { axis, c: xc };
      addSplit(["h", i, j], xc, { alley: b.alley });
      addSplit(["h", i, j + 1], xc, { alley: b.alley });
    }
  }
  // escape zone notch
  let zone = null;
  if (def.zone) {
    const [i, j] = def.zone.block;
    const b = blockAt(i, j);
    const side = def.zone.side;
    const at = def.zone.at ?? 0.5;
    let spec;
    let pos;
    if (side === "N" || side === "S") {
      pos = b.x0 + (b.x1 - b.x0) * at;
      spec = ["h", i, side === "N" ? j : j + 1];
    } else {
      pos = b.z0 + (b.z1 - b.z0) * at;
      spec = ["v", side === "W" ? i : i + 1, j];
    }
    if (closed.has(segKey(spec))) throw new Error(`escape zone in block ${i},${j} faces a closed road (${segKey(spec)})`);
    b.notch = { side, pos };
    zone = { block: b, side, pos, kind: def.zone.kind || "garage", spec };
    addSplit(spec, pos, { zone: true });
  }

  const segRect = (spec) => {
    const [o, i, j] = spec;
    if (o === "h") return { x0: X[i], x1: X[i + 1], z0: Z[j] - wz(j) / 2, z1: Z[j] + wz(j) / 2, w: wz(j), axis: "x" };
    return { x0: X[i] - wx(i) / 2, x1: X[i] + wx(i) / 2, z0: Z[j], z1: Z[j + 1], w: wx(i), axis: "z" };
  };
  const edgeKind = (spec) => {
    if (tunnelSet.has(segKey(spec))) return "tunnel";
    const [o, i, j] = spec;
    const sides = o === "h" ? [btype(i, j - 1), btype(i, j)] : [btype(i - 1, j), btype(i, j)];
    if (sides.every((t) => t === "water" || t === "edge") && sides.includes("water")) return "bridge";
    return "road";
  };
  const addEdge = (a, b, w, kind, extra = {}) => {
    const A = nodes[a];
    const B = nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const id = edges.length;
    const e = { id, a, b, w, kind, len, axis: Math.abs(B.x - A.x) > Math.abs(B.z - A.z) ? "x" : "z", ...extra };
    edges.push(e);
    A.adj.push({ e: id, to: b });
    B.adj.push({ e: id, to: a });
    return e;
  };
  const openSegs = [];
  for (let j = 0; j <= nr; j++)
    for (let i = 0; i < nc; i++) {
      const spec = ["h", i, j];
      if (!closed.has(segKey(spec))) openSegs.push(spec);
    }
  for (let i = 0; i <= nc; i++)
    for (let j = 0; j < nr; j++) {
      const spec = ["v", i, j];
      if (!closed.has(segKey(spec))) openSegs.push(spec);
    }
  const segEdges = new Map();
  for (const spec of openSegs) {
    const [o, i, j] = spec;
    const p0 = o === "h" ? [X[i], Z[j]] : [X[i], Z[j]];
    const p1 = o === "h" ? [X[i + 1], Z[j]] : [X[i], Z[j + 1]];
    const w = o === "h" ? wz(j) : wx(i);
    const kind = edgeKind(spec);
    const pts = [{ pos: o === "h" ? p0[0] : p0[1] }, ...(splits.get(segKey(spec)) || []), { pos: o === "h" ? p1[0] : p1[1] }].sort((a, b) => a.pos - b.pos);
    let prev = addNode(p0[0], p0[1]);
    const list = [];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k];
      const n = o === "h" ? addNode(p.pos, Z[j], k === pts.length - 1 ? "int" : "mid") : addNode(X[i], p.pos, k === pts.length - 1 ? "int" : "mid");
      if (n !== prev) list.push(addEdge(prev, n, w, kind, { seg: spec, rain: rainSet.has(segKey(spec)) }));
      if (p.alley) (p.alley.mouths = p.alley.mouths || []).push(n);
      if (p.zone) zone.mouth = n;
      prev = n;
    }
    segEdges.set(segKey(spec), list);
  }
  // alley edges
  for (const b of blocks) {
    if (!b.alley || !b.alley.mouths || b.alley.mouths.length < 2) continue;
    const [m0, m1] = b.alley.mouths;
    addEdge(m0, m1, ALLEY_W, "alley", { block: b });
  }
  // zone driveway
  if (zone && zone.mouth != null) {
    const b = zone.block;
    const M = nodes[zone.mouth];
    const inward = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[zone.side];
    const depth = NOTCH_D;
    const edgeCoord = zone.side === "N" ? b.z0 : zone.side === "S" ? b.z1 : zone.side === "W" ? b.x0 : b.x1;
    const zx = zone.side === "N" || zone.side === "S" ? zone.pos : edgeCoord + inward[0] * depth * 0.6;
    const zz = zone.side === "N" || zone.side === "S" ? edgeCoord + inward[1] * depth * 0.6 : zone.pos;
    const zn = addNode(zx, zz, "zone");
    addEdge(zone.mouth, zn, NOTCH_W, "drive");
    zone.node = zn;
    zone.x = zx;
    zone.z = zz;
    // trigger rectangle: the inner part of the notch
    const half = NOTCH_W / 2 - 1;
    if (zone.side === "N" || zone.side === "S") zone.rect = { x0: zone.pos - half, x1: zone.pos + half, z0: Math.min(edgeCoord + inward[1] * 6, edgeCoord + inward[1] * depth), z1: Math.max(edgeCoord + inward[1] * 6, edgeCoord + inward[1] * depth) };
    else zone.rect = { x0: Math.min(edgeCoord + inward[0] * 6, edgeCoord + inward[0] * depth), x1: Math.max(edgeCoord + inward[0] * 6, edgeCoord + inward[0] * depth), z0: zone.pos - half, z1: zone.pos + half };
  }
  // intersections without any open road become solid
  const deadInts = [];
  for (let i = 0; i <= nc; i++)
    for (let j = 0; j <= nr; j++) {
      const id = nodeAt.get(`${Math.round(X[i] * 10)},${Math.round(Z[j] * 10)}`);
      if (id == null) deadInts.push([i, j]);
      else nodes[id].gi = [i, j];
    }
  // traffic lights at real crossroads (3+ ways)
  for (const n of nodes) n.light = n.kind === "int" && n.adj.length >= 3;

  // --- solids ---------------------------------------------------------------------
  const solids = [];
  const addSolid = (x0, z0, x1, z1, kind, extra = {}) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    solids.push({ x0, z0, x1, z1, kind, ...extra });
  };
  for (const b of blocks) {
    const sw = b.type === "plaza" ? 0 : SIDEWALK;
    const ix0 = b.x0 + sw;
    const ix1 = b.x1 - sw;
    const iz0 = b.z0 + sw;
    const iz1 = b.z1 - sw;
    b.inner = { x0: ix0, x1: ix1, z0: iz0, z1: iz1 };
    if (b.type === "plaza") continue;
    const kind = b.type === "water" ? "water" : b.type === "park" ? "park" : "building";
    // rectangles of the block's solid, cut by an alley and / or a notch
    let rects = [{ x0: ix0, x1: ix1, z0: iz0, z1: iz1 }];
    if (b.alley) {
      const h = ALLEY_W / 2;
      if (b.alley.axis === "x") rects = [{ x0: ix0, x1: ix1, z0: iz0, z1: b.alley.c - h }, { x0: ix0, x1: ix1, z0: b.alley.c + h, z1: iz1 }];
      else rects = [{ x0: ix0, x1: b.alley.c - h, z0: iz0, z1: iz1 }, { x0: b.alley.c + h, x1: ix1, z0: iz0, z1: iz1 }];
    }
    if (b.notch) {
      const n = b.notch;
      const hw = NOTCH_W / 2;
      const out = [];
      for (const r of rects) {
        if (n.side === "N" || n.side === "S") {
          const cz = n.side === "N" ? [r.z0, Math.min(r.z1, b.z0 + NOTCH_D)] : [Math.max(r.z0, b.z1 - NOTCH_D), r.z1];
          const hit = n.pos + hw > r.x0 && n.pos - hw < r.x1 && cz[1] > cz[0];
          if (!hit) {
            out.push(r);
            continue;
          }
          out.push({ ...r, x1: n.pos - hw }, { ...r, x0: n.pos + hw });
          if (n.side === "N") out.push({ x0: n.pos - hw, x1: n.pos + hw, z0: cz[1], z1: r.z1 });
          else out.push({ x0: n.pos - hw, x1: n.pos + hw, z0: r.z0, z1: cz[0] });
        } else {
          const cx = n.side === "W" ? [r.x0, Math.min(r.x1, b.x0 + NOTCH_D)] : [Math.max(r.x0, b.x1 - NOTCH_D), r.x1];
          const hit = n.pos + hw > r.z0 && n.pos - hw < r.z1 && cx[1] > cx[0];
          if (!hit) {
            out.push(r);
            continue;
          }
          out.push({ ...r, z1: n.pos - hw }, { ...r, z0: n.pos + hw });
          if (n.side === "W") out.push({ z0: n.pos - hw, z1: n.pos + hw, x0: cx[1], x1: r.x1 });
          else out.push({ z0: n.pos - hw, z1: n.pos + hw, x0: r.x0, x1: cx[0] });
        }
      }
      rects = out;
      b.notchRect = zone.rect;
    }
    b.rects = rects.filter((r) => r.x1 - r.x0 > 0.05 && r.z1 - r.z0 > 0.05);
    for (const r of b.rects) addSolid(r.x0, r.z0, r.x1, r.z1, kind, { block: b });
  }
  // closed road segments: filled across the road and both sidewalks
  const closedRects = [];
  for (const k of closed) {
    const spec = k.split(",").map((v, idx) => (idx ? Number(v) : v));
    const r = segRect(spec);
    let { x0, x1, z0, z1 } = r;
    if (r.axis === "x") {
      x0 += wx(spec[1]) / 2;
      x1 -= wx(spec[1] + 1) / 2;
      z0 -= SIDEWALK;
      z1 += SIDEWALK;
    } else {
      z0 += wz(spec[2]) / 2;
      z1 -= wz(spec[2] + 1) / 2;
      x0 -= SIDEWALK;
      x1 += SIDEWALK;
    }
    closedRects.push({ x0, x1, z0, z1, spec });
    addSolid(x0, z0, x1, z1, "closed");
  }
  for (const [i, j] of deadInts) addSolid(X[i] - wx(i) / 2 - SIDEWALK, Z[j] - wz(j) / 2 - SIDEWALK, X[i] + wx(i) / 2 + SIDEWALK, Z[j] + wz(j) / 2 + SIDEWALK, "closed");
  // border walls
  const B0x = X[0] - wx(0) / 2 - SIDEWALK;
  const B1x = X[nc] + wx(nc) / 2 + SIDEWALK;
  const B0z = Z[0] - wz(0) / 2 - SIDEWALK;
  const B1z = Z[nr] + wz(nr) / 2 + SIDEWALK;
  const T = 30;
  addSolid(B0x - T, B0z - T, B1x + T, B0z, "wall");
  addSolid(B0x - T, B1z, B1x + T, B1z + T, "wall");
  addSolid(B0x - T, B0z, B0x, B1z, "wall");
  addSolid(B1x, B0z, B1x + T, B1z, "wall");

  // spatial grid
  const gx0 = B0x - T;
  const gz0 = B0z - T;
  const gw = Math.ceil((B1x + T - gx0) / CELL) + 1;
  const gh = Math.ceil((B1z + T - gz0) / CELL) + 1;
  const grid = Array.from({ length: gw * gh }, () => []);
  solids.forEach((s, idx) => {
    for (let cx = Math.floor((s.x0 - gx0) / CELL); cx <= Math.floor((s.x1 - gx0) / CELL); cx++)
      for (let cz = Math.floor((s.z0 - gz0) / CELL); cz <= Math.floor((s.z1 - gz0) / CELL); cz++) {
        if (cx >= 0 && cz >= 0 && cx < gw && cz < gh) grid[cz * gw + cx].push(idx);
      }
  });
  // edge grid (for locate)
  const egrid = Array.from({ length: gw * gh }, () => []);
  edges.forEach((e) => {
    const A = nodes[e.a];
    const Bn = nodes[e.b];
    const x0 = Math.min(A.x, Bn.x) - e.w / 2;
    const x1 = Math.max(A.x, Bn.x) + e.w / 2;
    const z0 = Math.min(A.z, Bn.z) - e.w / 2;
    const z1 = Math.max(A.z, Bn.z) + e.w / 2;
    for (let cx = Math.floor((x0 - gx0) / CELL); cx <= Math.floor((x1 - gx0) / CELL); cx++)
      for (let cz = Math.floor((z0 - gz0) / CELL); cz <= Math.floor((z1 - gz0) / CELL); cz++) if (cx >= 0 && cz >= 0 && cx < gw && cz < gh) egrid[cz * gw + cx].push(e.id);
  });

  const city = {
    def,
    X,
    Z,
    wx,
    wz,
    nc,
    nr,
    blocks,
    nodes,
    edges,
    solids,
    closedRects,
    zone,
    bounds: { x0: B0x, x1: B1x, z0: B0z, z1: B1z },
    grid: { x0: gx0, z0: gz0, w: gw, h: gh, cells: grid, ecells: egrid },
    intNode: (i, j) => nodeAt.get(`${Math.round(X[i] * 10)},${Math.round(Z[j] * 10)}`),
    segEdges: (spec) => segEdges.get(segKey(spec)) || [],
  };
  return city;
}

// --- queries ------------------------------------------------------------------------------
function cellsNear(city, x0, z0, x1, z1, which = "cells") {
  const g = city.grid;
  const out = new Set();
  for (let cx = Math.floor((x0 - g.x0) / CELL); cx <= Math.floor((x1 - g.x0) / CELL); cx++)
    for (let cz = Math.floor((z0 - g.z0) / CELL); cz <= Math.floor((z1 - g.z0) / CELL); cz++) {
      if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) continue;
      for (const i of g[which][cz * g.w + cx]) out.add(i);
    }
  return out;
}

/** Solid rectangles near a point (indices into city.solids). */
export function solidsNear(city, x, z, r) {
  return cellsNear(city, x - r, z - r, x + r, z + r, "cells");
}

export function insideSolid(city, x, z, pad = 0) {
  for (const i of solidsNear(city, x, z, pad + 1)) {
    const s = city.solids[i];
    if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) return s;
  }
  return null;
}

/** Nearest graph edge to a point: { e, t (m from node a), lat (signed), d, x, z }. */
export function locate(city, x, z, r = 30) {
  let best = null;
  let ids = cellsNear(city, x - r, z - r, x + r, z + r, "ecells");
  if (!ids.size) ids = city.edges.map((e) => e.id);
  for (const id of ids) {
    const e = city.edges[id];
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / (e.len * e.len), 0, 1);
    const px = A.x + dx * t;
    const pz = A.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d - e.w * 0.25 < best.score) {
      // signed lateral offset: + = left of the a→b direction
      const lat = ((x - px) * -dz + (z - pz) * dx) / -e.len;
      best = { e: id, t: t * e.len, lat, d, x: px, z: pz, score: d - e.w * 0.25 };
    }
  }
  return best;
}

/** Is the point on a road / alley / intersection (vs sidewalk)? */
export function onRoad(city, x, z) {
  const q = locate(city, x, z, 20);
  if (!q) return false;
  const e = city.edges[q.e];
  return q.d <= e.w / 2 + 0.3;
}

/** Ground under a point: "road" | "side" (sidewalk / plaza) | "solid"; wet flag. */
export function surfaceAt(city, x, z) {
  const q = locate(city, x, z, 20);
  if (q) {
    const e = city.edges[q.e];
    if (q.d <= e.w / 2 + 0.3) return { kind: "road", wet: !!e.rain || !!city.def.allWet, q };
  }
  return { kind: insideSolid(city, x, z) ? "solid" : "side", wet: !!city.def.allWet, q };
}

/**
 * Dijkstra distance field over the graph from sources [{ node, cost }].
 * Returns Float64Array of path lengths (Infinity where unreachable).
 */
export function fieldFrom(city, sources) {
  const n = city.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = [];
  const push = (d, v) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const s of sources) {
    if (s.cost < dist[s.node]) {
      dist[s.node] = s.cost;
      push(s.cost, s.node);
    }
  }
  while (heap.length) {
    const [d, v] = pop();
    if (d > dist[v]) continue;
    for (const { e, to } of city.nodes[v].adj) {
      const ed = city.edges[e];
      if (ed.blocked) continue;
      const nd = d + ed.len;
      if (nd < dist[to]) {
        dist[to] = nd;
        push(nd, to);
      }
    }
  }
  return dist;
}

/** Field sources for a point on the road network (both ends of its edge). */
export function sourcesAt(city, q) {
  const e = city.edges[q.e];
  return [
    { node: e.a, cost: q.t },
    { node: e.b, cost: e.len - q.t },
  ];
}

/** Graph distance from a located point using a field. */
export function fieldDist(city, field, q) {
  const e = city.edges[q.e];
  return Math.min(q.t + field[e.a], e.len - q.t + field[e.b]);
}

/** 2D line of sight between two points (no solid rectangle in the way). */
export function lineOfSight(city, x0, z0, x1, z1) {
  const ids = cellsNear(city, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), "cells");
  for (const i of ids) {
    const s = city.solids[i];
    if (segRectHit(x0, z0, x1, z1, s)) return false;
  }
  return true;
}

/** Fraction along a segment where it first enters a rectangle, or null. */
export function segRectT(x0, z0, x1, z1, s) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (clip(-dx, x0 - s.x0) && clip(dx, s.x1 - x0) && clip(-dz, z0 - s.z0) && clip(dz, s.z1 - z0)) return t0;
  return null;
}
const segRectHit = (x0, z0, x1, z1, s) => segRectT(x0, z0, x1, z1, s) != null;

/** Nearest graph node to a point (optionally reachable on the field). */
export function nearestNode(city, x, z, filter = () => true) {
  let best = -1;
  let bd = Infinity;
  for (const n of city.nodes) {
    if (!filter(n)) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

/** Point on an edge at distance t from node a, offset sideways (+ = left of a→b). */
export function edgePoint(city, e, t, lat = 0) {
  const A = city.nodes[e.a];
  const B = city.nodes[e.b];
  const ux = (B.x - A.x) / e.len;
  const uz = (B.z - A.z) / e.len;
  // left of direction (ux, uz) with heading convention forward=(sin h, cos h): left = (uz, -ux)
  return { x: A.x + ux * t + uz * lat, z: A.z + uz * t - ux * lat, h: Math.atan2(ux, uz) };
}
