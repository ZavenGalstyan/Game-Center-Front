/**
 * Iron Arena — navigation graph for AI tanks, generated from the arena.
 *
 * Nodes sit on a regular grid; every walkable surface at a grid point
 * (terrain, bridge decks, ramps, platforms) becomes its own node, so the
 * graph is multi-level (over/under a highway). A directed edge exists when a
 * simulated tank "walk" between two nodes — using the same surface-following
 * and collision rules as the tank physics — succeeds without hitting
 * anything, climbing too steeply or ending on the wrong level. Only the
 * largest connected component is kept.
 */
import { STEP_UP } from "./arena.js";

const G = 6; // grid spacing (m)
const BODY_R = 2.1; // clearance radius used for walks (largest hull circle ≈ 2.06)
const BODY_H = 2.6;
const MAX_RISE = 0.6; // max climb per metre (~31°)

export function walk(A, ax, az, ay, bx, bz, step = 0.8) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(L / step));
  let y = ay;
  let px = ax;
  let pz = az;
  let water = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t;
    const z = az + dz * t;
    const s = A.surfaceAt(x, z, y + 0.05);
    const rise = s.h - y;
    const run = Math.hypot(x - px, z - pz) || step;
    if (rise > STEP_UP || rise / run > MAX_RISE + (s.deck ? 0.25 : 0)) return -1;
    y = s.h;
    if (A.solidAt(x, z, BODY_R, y, BODY_H)) return -1;
    if (A.inWater(x, z)) water++;
    px = x;
    pz = z;
  }
  return { y, water: water / n };
}

export function buildNav(A) {
  const H = A.H - 3;
  const nodes = [];
  const cells = new Map();
  const key = (i, j) => i * 1000 + j;
  const n = Math.floor(H / G);
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const x = i * G;
      const z = j * G;
      const ys = [A.groundAt(x, z)];
      for (const d of A.decks) {
        if (d.kind === "rail") continue;
        const t = A.deckTop(d, x, z, -1.2);
        if (t === t) ys.push(t);
      }
      for (const y0 of ys) {
        const s = A.surfaceAt(x, z, y0 + 0.05);
        const y = s.h;
        if (Math.abs(y - y0) > 0.05) continue; // a higher surface caps this one
        if (A.solidAt(x, z, BODY_R + 0.3, y, BODY_H)) continue;
        if (!s.deck) {
          const nr = A.normalAt(x, z);
          if (nr.y < 0.84) continue;
        }
        if (nodes.some((o) => o.i === i && o.j === j && Math.abs(o.y - y) < 1.5)) continue;
        const node = { id: nodes.length, i, j, x, z, y, deck: !!s.deck, water: A.inWater(x, z), edges: [], comp: -1 };
        nodes.push(node);
        const k = key(i, j);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(node);
      }
    }
  // edges to 8 neighbours plus knight moves (smoother diagonals)
  // extra nodes along deck centre lines (bridges, ramps, piers, highway)
  for (const d of A.decks) {
    if (d.kind === "rail") continue;
    const n2 = Math.max(1, Math.floor((2 * d.hd - 2) / 5));
    for (let k = 0; k <= n2; k++) {
      const lz = -d.hd + 1 + (k * (2 * d.hd - 2)) / n2;
      const x = d.x + lz * d.s;
      const z = d.z + lz * d.c;
      const y = d.m + d.k * lz;
      if (Math.max(Math.abs(x), Math.abs(z)) > H) continue;
      const s2 = A.surfaceAt(x, z, y + 0.05);
      if (Math.abs(s2.h - y) > 0.05 || A.solidAt(x, z, BODY_R + 0.1, y, BODY_H)) continue;
      if (nodes.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5 && Math.abs(o.y - y) < 1.5)) continue;
      const i = Math.round(x / G);
      const j = Math.round(z / G);
      const node = { id: nodes.length, i, j, x, z, y, deck: true, water: false, edges: [], comp: -1 };
      nodes.push(node);
      const kk = key(i, j);
      if (!cells.has(kk)) cells.set(kk, []);
      cells.get(kk).push(node);
    }
  }
  // edges: every node within 13.5 m (covers 8-neighbours and knight moves)
  for (const a of nodes)
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const list = cells.get(key(a.i + di, a.j + dj));
        if (!list) continue;
        for (const b of list) {
          if (b === a) continue;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len > 13.5 || len < 0.5) continue;
          const r = walk(A, a.x, a.z, a.y, b.x, b.z);
          if (r === -1 || Math.abs(r.y - b.y) > 0.6) continue;
          a.edges.push({ to: b.id, cost: len * (1 + r.water * 1.4) + Math.max(0, b.y - a.y) * 0.8 });
        }
      }
  // largest strongly-ish connected component (undirected over mutual edges)
  let best = -1;
  let bestN = 0;
  let comp = 0;
  const adj = nodes.map(() => []);
  for (const a of nodes) for (const e of a.edges) if (nodes[e.to].edges.some((f) => f.to === a.id)) adj[a.id].push(e.to);
  for (const s of nodes) {
    if (s.comp >= 0) continue;
    const stack = [s.id];
    s.comp = comp;
    let cnt = 0;
    while (stack.length) {
      const id = stack.pop();
      cnt++;
      for (const t of adj[id])
        if (nodes[t].comp < 0) {
          nodes[t].comp = comp;
          stack.push(t);
        }
    }
    if (cnt > bestN) {
      bestN = cnt;
      best = comp;
    }
    comp++;
  }
  for (const a of nodes) {
    a.ok = a.comp === best;
    a.edges = a.edges.filter((e) => nodes[e.to].comp === best);
  }
  const good = nodes.filter((a) => a.ok);

  /* ------------------------------------------------------------ queries */
  function nearest(x, z, y = null, mustWalk = true) {
    const ci = Math.round(x / G);
    const cj = Math.round(z / G);
    const cand = [];
    for (let r = 0; r <= 3 && cand.length < 6; r++)
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          const list = cells.get(key(i, j));
          if (list) for (const nd of list) if (nd.ok) cand.push(nd);
        }
    if (!cand.length) {
      let bd = Infinity;
      let bn = good[0];
      for (const nd of good) {
        const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
        if (d < bd) {
          bd = d;
          bn = nd;
        }
      }
      return bn;
    }
    const score = (nd) => Math.hypot(nd.x - x, nd.z - z) + (y == null ? 0 : Math.abs(nd.y - y) * 4);
    cand.sort((a, b) => score(a) - score(b));
    if (mustWalk && y != null)
      for (let k = 0; k < Math.min(4, cand.length); k++) {
        const r = walk(A, x, z, y, cand[k].x, cand[k].z, 1);
        if (r !== -1 && Math.abs(r.y - cand[k].y) < 0.8) return cand[k];
      }
    return cand[0];
  }

  // A* with a binary heap
  const gScore = new Float64Array(nodes.length);
  const came = new Int32Array(nodes.length);
  const closed = new Uint32Array(nodes.length);
  const opened = new Uint32Array(nodes.length);
  let gen = 0;
  function path(from, to, penalty) {
    if (!from || !to) return null;
    gen++;
    const heap = [];
    const fsc = [];
    const push = (id, f) => {
      heap.push(id);
      fsc.push(f);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (fsc[p] <= fsc[i]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        [fsc[p], fsc[i]] = [fsc[i], fsc[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const lastId = heap.pop();
      const lastF = fsc.pop();
      if (heap.length) {
        heap[0] = lastId;
        fsc[0] = lastF;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && fsc[l] < fsc[m]) m = l;
          if (r < heap.length && fsc[r] < fsc[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          [fsc[m], fsc[i]] = [fsc[i], fsc[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (nd) => Math.hypot(nd.x - to.x, nd.z - to.z);
    gScore[from.id] = 0;
    came[from.id] = -1;
    opened[from.id] = gen;
    push(from.id, h(from));
    let iter = 0;
    while (heap.length && iter++ < 6000) {
      const id = pop();
      if (closed[id] === gen) continue;
      closed[id] = gen;
      if (id === to.id) break;
      const a = nodes[id];
      for (const e of a.edges) {
        if (closed[e.to] === gen) continue;
        const extra = penalty ? penalty(nodes[e.to]) : 0;
        const g = gScore[id] + e.cost + extra;
        if (opened[e.to] !== gen || g < gScore[e.to]) {
          opened[e.to] = gen;
          gScore[e.to] = g;
          came[e.to] = id;
          push(e.to, g + h(nodes[e.to]));
        }
      }
    }
    if (closed[to.id] !== gen) return null;
    const out = [];
    for (let id = to.id; id !== -1; id = came[id]) out.push(nodes[id]);
    out.reverse();
    return out;
  }

  /** a spread of spawn points for free-for-all (farthest-point sampling) */
  function spreadPoints(count, seedPts = []) {
    const flat = good.filter((nd) => !nd.water && !nd.deck && nd.edges.length >= 6 && Math.max(Math.abs(nd.x), Math.abs(nd.z)) < A.H - 10);
    const pts = [...seedPts];
    const out = [];
    while (out.length < count && flat.length) {
      let bn = null;
      let bd = -1;
      for (const nd of flat) {
        let d = Infinity;
        for (const p of pts) d = Math.min(d, Math.hypot(nd.x - p.x, nd.z - p.z));
        if (!pts.length) d = -Math.hypot(nd.x, nd.z + 80);
        if (d > bd) {
          bd = d;
          bn = nd;
        }
      }
      out.push(bn);
      pts.push(bn);
    }
    return out;
  }

  return { nodes, good, nearest, path, spreadPoints, G };
}

const NAV_CACHE = new WeakMap();
export function getNav(A) {
  if (!NAV_CACHE.has(A.map)) NAV_CACHE.set(A.map, buildNav(A));
  return NAV_CACHE.get(A.map);
}
