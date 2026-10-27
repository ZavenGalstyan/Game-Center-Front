/**
 * Oceanbound — the raft: a grid of foundations plus pieces on cells and
 * cell edges, with every placement / removal rule, connectivity checks and
 * the collision boxes the player physics uses.
 *
 * Raft-local frame: deck surface at y = 0, cell (i, j) spans
 * x ∈ [i·CELL, (i+1)·CELL], z ∈ [j·CELL, (j+1)·CELL]. The raft itself only
 * translates in the world (R.x, R.y, R.z); rocking is cosmetic.
 *
 * Edges: side "x" at x = i·CELL between cells (i-1, j) and (i, j);
 *        side "z" at z = j·CELL between cells (i, j-1) and (i, j).
 * Levels: 0 = deck, 1 = roof level (y = WALL_H).
 */
import { PIECES, PLACEABLE, ITEMS } from "../data/items.js";

export const CELL = 1.6;
export const WALL_H = 2.5;
export const DECK_T = 0.42;
export const FOUNDATION_HP = 100;
export const MAX_CELLS = 120;
export const GRID_LIMIT = 14;

export const cellKey = (i, j) => `${i}:${j}`;
export const objKey = (i, j, l) => `${i}:${j}:${l}`;
export const edgeKey = (side, i, j, l) => `${side}:${i}:${j}:${l}`;
export const edgeCells = (side, i, j) => (side === "x" ? [[i - 1, j], [i, j]] : [[i, j - 1], [i, j]]);
export const cellEdges = (i, j) => [
  ["x", i, j],
  ["x", i + 1, j],
  ["z", i, j],
  ["z", i, j + 1],
];
const NB = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const isWallType = (t) => t === "wall" || t === "window" || t === "door";

export function createRaft() {
  const R = {
    x: 0,
    y: 0.3,
    z: 0,
    vx: 0,
    vz: 0,
    cells: new Map(),
    pieces: new Map(),
    edges: new Map(),
    objs: new Map(),
    nextId: 1,
    version: 1,
    sail: { open: false, heading: 0 },
    anchored: false,
    aground: false,
    colliders: [],
    colVersion: 0,
  };
  for (const [i, j] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ])
    R.cells.set(cellKey(i, j), { i, j, hp: FOUNDATION_HP });
  return R;
}

export const hasCell = (R, i, j) => R.cells.has(cellKey(i, j));
export const pieceAtEdge = (R, side, i, j, l) => R.pieces.get(R.edges.get(edgeKey(side, i, j, l)));
export const pieceAtCell = (R, i, j, l) => R.pieces.get(R.objs.get(objKey(i, j, l)));

const slotOf = (type) => {
  if (PIECES[type]) return PIECES[type].slot;
  if (PLACEABLE[type]) return PLACEABLE[type].slot;
  return null;
};
export const pieceKind = (type) => (PIECES[type] ? "piece" : PLACEABLE[type] ? "place" : null);

/** does this roof cell have its own wall support below? */
function roofDirectSupport(R, i, j, ignoreId) {
  for (const [s, a, b] of cellEdges(i, j)) {
    const p = pieceAtEdge(R, s, a, b, 0);
    if (p && p.id !== ignoreId && isWallType(p.type)) return true;
  }
  return false;
}
function roofSupported(R, i, j, ignoreId) {
  if (roofDirectSupport(R, i, j, ignoreId)) return true;
  for (const [di, dj] of NB) {
    const n = pieceAtCell(R, i + di, j + dj, 1);
    if (n && n.id !== ignoreId && n.type === "roof" && roofDirectSupport(R, i + di, j + dj, ignoreId)) return true;
  }
  return false;
}

/** slot = { kind: "cell", i, j, level } | { kind: "edge", side, i, j, level } */
export function canPlace(R, type, slot) {
  const kind = slotOf(type);
  if (!kind || kind !== slot.kind) return { ok: false, reason: "Wrong spot for this piece" };
  const { i, j } = slot;
  if (Math.abs(i) > GRID_LIMIT || Math.abs(j) > GRID_LIMIT) return { ok: false, reason: "Too far from the raft's core" };
  if (type === "foundation") {
    if (hasCell(R, i, j)) return { ok: false, reason: "Already a foundation here" };
    if (R.cells.size >= MAX_CELLS) return { ok: false, reason: "The raft can't grow any bigger" };
    if (!NB.some(([di, dj]) => hasCell(R, i + di, j + dj))) return { ok: false, reason: "Must connect to the raft" };
    return { ok: true };
  }
  if (slot.kind === "cell") {
    const l = slot.level || 0;
    if (!hasCell(R, i, j)) return { ok: false, reason: "Needs a foundation below" };
    if (R.objs.has(objKey(i, j, l))) return { ok: false, reason: "This spot is taken" };
    if (type === "roof") {
      if (l !== 1) return { ok: false, reason: "Roofs go on the upper level" };
      const below = pieceAtCell(R, i, j, 0);
      if (below && below.type === "stairs") return { ok: false, reason: "Leave headroom above stairs" };
      if (!roofSupported(R, i, j)) return { ok: false, reason: "Needs a wall below or a supported roof beside it" };
      return { ok: true };
    }
    if (l !== 0) return { ok: false, reason: "Place this on the deck" };
    if (type === "stairs" && pieceAtCell(R, i, j, 1)) return { ok: false, reason: "A roof blocks the stairs" };
    const pl = PLACEABLE[type];
    if (pl?.max && [...R.pieces.values()].filter((p) => p.type === type).length >= pl.max) return { ok: false, reason: `Only ${pl.max} ${ITEMS[type].name.toLowerCase()} per raft` };
    return { ok: true };
  }
  // edges
  const l = slot.level || 0;
  if (R.edges.has(edgeKey(slot.side, i, j, l))) return { ok: false, reason: "This edge is taken" };
  const cs = edgeCells(slot.side, i, j);
  const nF = cs.filter(([a, b]) => hasCell(R, a, b)).length;
  if (type === "net" || type === "trap") {
    if (l !== 0) return { ok: false, reason: "Place this at deck level" };
    if (nF !== 1) return { ok: false, reason: "Place on an outer edge of the raft" };
    return { ok: true };
  }
  if (l === 1) {
    if (type !== "railing") return { ok: false, reason: "Only railings fit up here" };
    if (!cs.some(([a, b]) => pieceAtCell(R, a, b, 1)?.type === "roof")) return { ok: false, reason: "Needs a roof beside it" };
    return { ok: true };
  }
  if (nF === 0) return { ok: false, reason: "Needs a foundation beside it" };
  return { ok: true };
}

export function addPiece(R, type, slot, rot = 0, state = null) {
  if (type === "foundation") {
    R.cells.set(cellKey(slot.i, slot.j), { i: slot.i, j: slot.j, hp: FOUNDATION_HP });
    R.version++;
    return { id: cellKey(slot.i, slot.j), type };
  }
  const p = { id: R.nextId++, type, kind: slot.kind, i: slot.i, j: slot.j, side: slot.side || null, level: slot.level || 0, rot: rot & 3, state: state || initState(type) };
  if (p.kind === "edge") {
    // outward direction for outer-edge gear (+1: toward higher index)
    const cs = edgeCells(p.side, p.i, p.j);
    p.out = hasCell(R, cs[1][0], cs[1][1]) ? -1 : 1;
    R.edges.set(edgeKey(p.side, p.i, p.j, p.level), p.id);
  } else R.objs.set(objKey(p.i, p.j, p.level), p.id);
  R.pieces.set(p.id, p);
  R.version++;
  return p;
}

export function initState(type) {
  switch (type) {
    case "door":
      return { open: false };
    case "chest":
      return { slots: new Array(20).fill(null) };
    case "purifier":
    case "purifier2":
      return { water: 0, t: 0, fresh: 0, fuel: 0 };
    case "grill":
    case "grill2":
      return { items: [], fuel: 0 };
    case "smelter":
      return { ore: 0, t: 0, ingots: 0, fuel: 0 };
    case "net":
      return { items: {} };
    case "trap":
      return { fish: 0, t: 0 };
    case "sail":
      return {};
    case "anchor":
      return {};
    default:
      return {};
  }
}

/** can the piece / foundation be removed? */
export function canRemove(R, target) {
  if (target.type === "foundation") {
    const { i, j } = target;
    if (!hasCell(R, i, j)) return { ok: false, reason: "Nothing here" };
    if (R.cells.size <= 1) return { ok: false, reason: "That's the last foundation!" };
    if (R.objs.has(objKey(i, j, 0)) || R.objs.has(objKey(i, j, 1))) return { ok: false, reason: "Remove what's on it first" };
    for (const [s, a, b] of cellEdges(i, j)) {
      for (const l of [0, 1]) {
        const p = pieceAtEdge(R, s, a, b, l);
        if (!p) continue;
        const others = edgeCells(s, a, b).filter(([x, z]) => !(x === i && z === j) && hasCell(R, x, z));
        if (others.length === 0 || p.type === "net" || p.type === "trap") return { ok: false, reason: "Remove the pieces on its edges first" };
      }
    }
    if (!connectedWithout(R, i, j)) return { ok: false, reason: "The raft would split apart" };
    return { ok: true };
  }
  const p = R.pieces.get(target.id);
  if (!p) return { ok: false, reason: "Nothing here" };
  if (isWallType(p.type)) {
    for (const [a, b] of edgeCells(p.side, p.i, p.j)) {
      const roof = pieceAtCell(R, a, b, 1);
      if (roof && roof.type === "roof" && !roofSupported(R, a, b, p.id)) return { ok: false, reason: "This wall holds up a roof" };
      for (const [di, dj] of NB) {
        const nr = pieceAtCell(R, a + di, b + dj, 1);
        if (nr && nr.type === "roof" && !roofSupported(R, a + di, b + dj, p.id)) return { ok: false, reason: "This wall holds up a roof" };
      }
    }
  }
  if (p.type === "roof") {
    for (const [di, dj] of NB) {
      const nr = pieceAtCell(R, p.i + di, p.j + dj, 1);
      if (nr && nr.type === "roof" && !roofSupported(R, p.i + di, p.j + dj, p.id)) return { ok: false, reason: "A neighbouring roof leans on this one" };
    }
    for (const [s, a, b] of cellEdges(p.i, p.j)) {
      const rail = pieceAtEdge(R, s, a, b, 1);
      if (!rail) continue;
      const other = edgeCells(s, a, b).some(([x, z]) => !(x === p.i && z === p.j) && pieceAtCell(R, x, z, 1)?.type === "roof");
      if (!other) return { ok: false, reason: "Remove the roof railings first" };
    }
  }
  return { ok: true };
}

export function removePiece(R, target) {
  if (target.type === "foundation") {
    R.cells.delete(cellKey(target.i, target.j));
    R.version++;
    return true;
  }
  const p = R.pieces.get(target.id);
  if (!p) return false;
  R.pieces.delete(p.id);
  if (p.kind === "edge") R.edges.delete(edgeKey(p.side, p.i, p.j, p.level));
  else R.objs.delete(objKey(p.i, p.j, p.level));
  R.version++;
  return true;
}

/** is the raft still in one piece if cell (i, j) is removed? */
export function connectedWithout(R, i, j) {
  const rest = [...R.cells.values()].filter((c) => !(c.i === i && c.j === j));
  if (rest.length === 0) return false;
  const seen = new Set([cellKey(rest[0].i, rest[0].j)]);
  const q = [rest[0]];
  while (q.length) {
    const c = q.pop();
    for (const [di, dj] of NB) {
      const k = cellKey(c.i + di, c.j + dj);
      if (seen.has(k) || (c.i + di === i && c.j + dj === j) || !R.cells.has(k)) continue;
      seen.add(k);
      q.push(R.cells.get(k));
    }
  }
  return seen.size === rest.length;
}
export function isEdgeCell(R, i, j) {
  return NB.some(([di, dj]) => !hasCell(R, i + di, j + dj));
}
/** pieces that would be destroyed together with foundation (i, j) (shark) */
export function dependents(R, i, j) {
  const out = [];
  for (const l of [0, 1]) {
    const p = pieceAtCell(R, i, j, l);
    if (p) out.push(p);
  }
  for (const [s, a, b] of cellEdges(i, j)) {
    for (const l of [0, 1]) {
      const p = pieceAtEdge(R, s, a, b, l);
      if (!p) continue;
      const others = edgeCells(s, a, b).filter(([x, z]) => !(x === i && z === j) && hasCell(R, x, z));
      if (others.length === 0 || p.type === "net" || p.type === "trap" || l === 1) out.push(p);
    }
  }
  // roofs that lose support once the walls above go
  return out;
}

/** raft extents in local coords */
export function bounds(R) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of R.cells.values()) {
    x0 = Math.min(x0, c.i * CELL);
    x1 = Math.max(x1, (c.i + 1) * CELL);
    z0 = Math.min(z0, c.j * CELL);
    z1 = Math.max(z1, (c.j + 1) * CELL);
  }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 };
}

/* ------------------------------------------------------------------ colliders */
const OBJ_BOX = {
  chest: [1.05, 0.72, 0.64],
  purifier: [0.86, 1.05, 0.86],
  purifier2: [0.95, 1.35, 0.95],
  grill: [1.1, 0.9, 0.8],
  grill2: [1.25, 1.0, 0.95],
  smelter: [1.15, 1.45, 1.15],
  sail: [0.3, 5.2, 0.3],
  anchor: [0.95, 0.85, 0.95],
};
export const objBox = (type) => OBJ_BOX[type] || [0.8, 0.8, 0.8];
const WT = 0.16;
const DOOR_W = 0.92;

/** geometry for an edge piece in raft-local coords: {x0,x1,z0,z1} (thin box) */
export function edgeBox(p, t = WT) {
  if (p.side === "x") {
    const x = p.i * CELL;
    return { x0: x - t / 2, x1: x + t / 2, z0: p.j * CELL, z1: (p.j + 1) * CELL };
  }
  const z = p.j * CELL;
  return { x0: p.i * CELL, x1: (p.i + 1) * CELL, z0: z - t / 2, z1: z + t / 2 };
}
export function stairsDir(rot) {
  return [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ][rot & 3];
}

export function buildColliders(R) {
  const C = [];
  for (const c of R.cells.values()) {
    C.push({ x0: c.i * CELL, x1: (c.i + 1) * CELL, z0: c.j * CELL, z1: (c.j + 1) * CELL, y0: -DECK_T, y1: 0, ref: "cell", i: c.i, j: c.j, deck: true });
  }
  for (const p of R.pieces.values()) {
    const y = p.level * WALL_H;
    if (p.kind === "edge") {
      if (p.type === "net" || p.type === "trap") continue;
      const b = edgeBox(p);
      const h = p.type === "railing" ? 1.0 : WALL_H - 0.02;
      if (p.type === "door" && p.state.open) {
        // two jambs, gap in the middle
        const along = p.side === "x" ? ["z0", "z1"] : ["x0", "x1"];
        const a0 = b[along[0]];
        const a1 = b[along[1]];
        const mid = (a0 + a1) / 2;
        const j1 = { ...b, [along[1]]: mid - DOOR_W / 2 };
        const j2 = { ...b, [along[0]]: mid + DOOR_W / 2 };
        C.push({ ...j1, y0: y, y1: y + h, ref: p.id });
        C.push({ ...j2, y0: y, y1: y + h, ref: p.id });
        C.push({ ...b, y0: y + 2.1, y1: y + h, ref: p.id });
      } else C.push({ ...b, y0: y, y1: y + h, ref: p.id });
      continue;
    }
    const x0 = p.i * CELL;
    const z0 = p.j * CELL;
    if (p.type === "roof") {
      C.push({ x0, x1: x0 + CELL, z0, z1: z0 + CELL, y0: WALL_H - 0.14, y1: WALL_H, ref: p.id, deck: true });
      continue;
    }
    if (p.type === "stairs") {
      const [dx, dz] = stairsDir(p.rot);
      C.push({ x0, x1: x0 + CELL, z0, z1: z0 + CELL, y0: 0, y1: WALL_H, ramp: { dx, dz }, ref: p.id });
      continue;
    }
    const [w, h, d] = objBox(p.type);
    const rw = p.rot & 1 ? d : w;
    const rd = p.rot & 1 ? w : d;
    const cx = x0 + CELL / 2;
    const cz = z0 + CELL / 2;
    C.push({ x0: cx - rw / 2, x1: cx + rw / 2, z0: cz - rd / 2, z1: cz + rd / 2, y0: 0, y1: h, ref: p.id, solid: true });
  }
  R.colliders = C;
  R.colVersion = R.version;
  return C;
}
/** top height of a ramp collider at local (x, z) */
export function rampTop(c, x, z) {
  const { dx, dz } = c.ramp;
  let t;
  if (dx) t = dx > 0 ? (x - c.x0) / (c.x1 - c.x0) : (c.x1 - x) / (c.x1 - c.x0);
  else t = dz > 0 ? (z - c.z0) / (c.z1 - c.z0) : (c.z1 - z) / (c.z1 - c.z0);
  t = Math.max(0, Math.min(1, t));
  return c.y0 + (c.y1 - c.y0) * t;
}

/* ------------------------------------------------------------------ save */
export function raftToJSON(R) {
  return {
    x: R.x,
    z: R.z,
    cells: [...R.cells.values()].map((c) => [c.i, c.j, Math.round(c.hp)]),
    pieces: [...R.pieces.values()].map((p) => ({ t: p.type, k: p.kind, i: p.i, j: p.j, s: p.side, l: p.level, r: p.rot, st: p.state })),
    sail: R.sail,
    anchored: R.anchored,
  };
}
export function raftFromJSON(d) {
  const R = createRaft();
  if (!d || !Array.isArray(d.cells) || d.cells.length === 0) return R;
  R.cells.clear();
  for (const e of d.cells) {
    if (!Array.isArray(e)) continue;
    const i = e[0] | 0;
    const j = e[1] | 0;
    R.cells.set(cellKey(i, j), { i, j, hp: Math.max(1, Math.min(FOUNDATION_HP, +e[2] || FOUNDATION_HP)) });
  }
  if (R.cells.size === 0) return createRaft();
  if (Number.isFinite(d.x)) R.x = d.x;
  if (Number.isFinite(d.z)) R.z = d.z;
  // re-add pieces through the rules so a stale save can't create overlaps
  const pend = Array.isArray(d.pieces) ? d.pieces.filter((p) => p && (PIECES[p.t] || PLACEABLE[p.t]) && p.t !== "foundation") : [];
  for (let pass = 0; pass < 3 && pend.length; pass++) {
    for (let k = pend.length - 1; k >= 0; k--) {
      const q = pend[k];
      const slot = q.k === "edge" ? { kind: "edge", side: q.s === "z" ? "z" : "x", i: q.i | 0, j: q.j | 0, level: q.l | 0 } : { kind: "cell", i: q.i | 0, j: q.j | 0, level: q.l | 0 };
      if (canPlace(R, q.t, slot).ok) {
        addPiece(R, q.t, slot, q.r | 0, sanitizeState(q.t, q.st));
        pend.splice(k, 1);
      }
    }
  }
  if (d.sail && typeof d.sail === "object") R.sail = { open: !!d.sail.open, heading: +d.sail.heading || 0 };
  R.anchored = !!d.anchored;
  return R;
}
function sanitizeState(type, st) {
  const base = initState(type);
  if (!st || typeof st !== "object") return base;
  if (type === "chest") {
    const slots = Array.isArray(st.slots) ? st.slots.slice(0, 20) : [];
    base.slots = base.slots.map((_, i) => {
      const s = slots[i];
      return s && ITEMS[s.id] ? { id: s.id, n: Math.max(1, Math.min(ITEMS[s.id].stack, s.n | 0 || 1)), ...(s.dur != null ? { dur: s.dur | 0 } : {}) } : null;
    });
    return base;
  }
  if (type === "grill" || type === "grill2") {
    base.items = Array.isArray(st.items) ? st.items.filter((x) => x && ITEMS[x.id]).map((x) => ({ id: x.id, t: +x.t || 0, done: !!x.done })).slice(0, 2) : [];
    base.fuel = +st.fuel || 0;
    return base;
  }
  if (type === "net") {
    base.items = {};
    if (st.items && typeof st.items === "object") for (const k in st.items) if (ITEMS[k]) base.items[k] = Math.max(0, st.items[k] | 0);
    return base;
  }
  for (const k in base) if (typeof base[k] === typeof st[k]) base[k] = st[k];
  return base;
}
