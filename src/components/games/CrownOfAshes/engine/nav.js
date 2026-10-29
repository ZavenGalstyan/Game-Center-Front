/**
 * Navigation for AI and the test bot: 8-connected A* on walkability grids.
 *
 *  • Overworld — 2 m cells over the heightfield, computed lazily per 32×32
 *    chunk (steep slopes, deep water, structures and trees are blocked;
 *    bridges are walkable).
 *  • Interiors — one cell per ASCII map char (walls, pillars, braziers; the
 *    crypt seal is dynamic and follows its gate collider).
 *
 * Paths are string-pulled (grid line-of-sight) so agents walk straight lines.
 */
import { ICELL } from "../data/interiors.js";
import { INTERIOR_X, WORLD } from "../data/worldmap.js";

const CH = 32;

export function createNav(col, T, interiors) {
  const C = 2;
  const N = Math.round((T.half * 2) / C);
  const blocked = new Uint8Array(N * N); // 0 unknown, 1 open, 2 blocked
  const done = new Uint8Array((N / CH) * (N / CH));
  const toI = (x) => Math.floor((x + T.half) / C);
  const wx = (i) => -T.half + (i + 0.5) * C;
  // cells under gates (doors, portcullises) follow the gate's state at query time
  const gateCells = new Map();
  for (const { id, c } of col.gateColliders()) {
    if (c.interior || c.x > INTERIOR_X) continue;
    const ext = Math.abs(c.cos) * c.hw + Math.abs(c.sin) * c.hd + 0.6;
    const ezt = Math.abs(c.sin) * c.hw + Math.abs(c.cos) * c.hd + 0.6;
    for (let j = toI(c.z - ezt); j <= toI(c.z + ezt); j++)
      for (let i = toI(c.x - ext); i <= toI(c.x + ext); i++) {
        const dx = wx(i) - c.x;
        const dz = wx(j) - c.z;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hw + 0.6 && Math.abs(lz) < c.hd + 0.6) gateCells.set(j * N + i, id);
      }
  }

  function computeChunk(ci, cj) {
    done[cj * (N / CH) + ci] = 1;
    for (let j = cj * CH; j < (cj + 1) * CH; j++)
      for (let i = ci * CH; i < (ci + 1) * CH; i++) {
        const x = wx(i);
        const z = wx(j);
        let b = Math.max(Math.abs(x), Math.abs(z)) > WORLD.play;
        if (!b) {
          const feet = col.ground(x, z);
          const onP = col.onPlatform(x, z, feet);
          if (!onP && T.slope(x, z) > 0.85) b = true;
          const w = T.waterAt(x, z);
          if (!b && !onP && w > feet + 1.25) b = true;
          if (!b && col.blockedAt(x, z, 0.5, feet, true)) b = true;
        }
        blocked[j * N + i] = b ? 2 : 1;
      }
  }
  function overBlocked(i, j) {
    if (i < 0 || j < 0 || i >= N || j >= N) return true;
    const k = j * N + i;
    if (!blocked[k]) computeChunk(Math.floor(i / CH), Math.floor(j / CH));
    if (blocked[k] === 2) return true;
    const g = gateCells.get(k);
    return g ? col.gateOn(g) : false;
  }

  /** A grid view: {cell, toI(x), toJ(z), x(i), z(j), blocked(i,j), w, h} */
  const over = { cell: C, w: N, h: N, toI, toJ: toI, x: wx, z: wx, blocked: overBlocked };
  const inside = {};
  for (const [id, I] of Object.entries(interiors)) {
    const map = I.map;
    const solid = new Set(["#", "p", "B"]);
    inside[id] = {
      cell: ICELL,
      w: I.cols,
      h: I.rows,
      toI: (x) => Math.round((x - I.x) / ICELL),
      toJ: (z) => Math.round((z - I.z) / ICELL),
      x: (i) => I.x + i * ICELL,
      z: (j) => I.z + j * ICELL,
      blocked: (i, j) => {
        if (i < 0 || j < 0 || i >= I.cols || j >= I.rows) return true;
        const ch = map[j][i];
        if (solid.has(ch)) return true;
        if (ch === "G") return col.gateOn("seal");
        return false;
      },
    };
  }
  function gridFor(x, z) {
    if (x < INTERIOR_X) return over;
    let best = null;
    let bd = Infinity;
    for (const [id, I] of Object.entries(interiors)) {
      const d = Math.hypot(x - (I.x + I.cols * ICELL * 0.5), z - (I.z + I.rows * ICELL * 0.5));
      if (d < bd) {
        bd = d;
        best = inside[id];
      }
    }
    return best;
  }

  function lineClear(G, i0, j0, i1, j1) {
    // Bresenham walk; a diagonal step also needs both orthogonal neighbours
    // open so agents never cut a wall corner
    let x = i0;
    let y = j0;
    const dx = Math.abs(i1 - i0);
    const dy = Math.abs(j1 - j0);
    const sx = i1 > i0 ? 1 : -1;
    const sy = j1 > j0 ? 1 : -1;
    let err = dx - dy;
    let guard = dx + dy + 2;
    while ((x !== i1 || y !== j1) && guard-- > 0) {
      const e2 = err * 2;
      let mx = false;
      let my = false;
      if (e2 > -dy) {
        err -= dy;
        mx = true;
      }
      if (e2 < dx) {
        err += dx;
        my = true;
      }
      if (mx && my && (G.blocked(x + sx, y) || G.blocked(x, y + sy))) return false;
      if (mx) x += sx;
      if (my) y += sy;
      if (G.blocked(x, y)) return false;
    }
    return true;
  }

  /** Nearest open cell to (i,j) within r rings. */
  function nearestOpen(G, i, j, r = 6) {
    if (!G.blocked(i, j)) return [i, j];
    for (let k = 1; k <= r; k++)
      for (let a = -k; a <= k; a++)
        for (const [di, dj] of [
          [a, -k],
          [a, k],
          [-k, a],
          [k, a],
        ])
          if (!G.blocked(i + di, j + dj)) return [i + di, j + dj];
    return null;
  }

  // binary heap keyed by f
  let heapK = new Int32Array(4096);
  let heapF = new Float32Array(4096);
  let hn = 0;
  const push = (k, f) => {
    if (hn >= heapK.length) {
      const nk = new Int32Array(heapK.length * 2);
      nk.set(heapK);
      heapK = nk;
      const nf = new Float32Array(heapF.length * 2);
      nf.set(heapF);
      heapF = nf;
    }
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapK[i] = heapK[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapK[i] = k;
    heapF[i] = f;
  };
  const pop = () => {
    const top = heapK[0];
    const k = heapK[--hn];
    const f = heapF[hn];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= hn) break;
      if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= f) break;
      heapK[i] = heapK[c];
      heapF[i] = heapF[c];
      i = c;
    }
    heapK[i] = k;
    heapF[i] = f;
    return top;
  };

  const gScore = new Map();
  const came = new Map();
  /**
   * Path from A to B as [[x,z], …] (excluding the start), or null.
   * maxNodes bounds the search (AI asks small, the bot asks big).
   */
  function path(ax, az, bx, bz, maxNodes = 4000) {
    const G = gridFor(ax, az);
    if (G !== gridFor(bx, bz)) return null;
    const s = nearestOpen(G, G.toI(ax), G.toJ(az), 3);
    const g = nearestOpen(G, G.toI(bx), G.toJ(bz), 8);
    if (!s || !g) return null;
    const W = G.w;
    const sk = s[1] * W + s[0];
    const gk = g[1] * W + g[0];
    if (sk === gk) return [[bx, bz]];
    if (lineClear(G, s[0], s[1], g[0], g[1])) return [[bx, bz]];
    gScore.clear();
    came.clear();
    hn = 0;
    const h = (i, j) => {
      const dx = Math.abs(i - g[0]);
      const dy = Math.abs(j - g[1]);
      return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * 1.02;
    };
    gScore.set(sk, 0);
    push(sk, h(s[0], s[1]));
    let expanded = 0;
    let found = false;
    let bestK = sk;
    let bestH = Infinity;
    while (hn > 0 && expanded < maxNodes) {
      const k = pop();
      if (k === gk) {
        found = true;
        break;
      }
      const i = k % W;
      const j = (k - i) / W;
      const gk0 = gScore.get(k);
      expanded++;
      const hh = h(i, j);
      if (hh < bestH) {
        bestH = hh;
        bestK = k;
      }
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (G.blocked(ni, nj)) continue;
          if (di && dj && (G.blocked(i + di, j) || G.blocked(i, j + dj))) continue;
          const nk = nj * W + ni;
          const ng = gk0 + (di && dj ? Math.SQRT2 : 1);
          const old = gScore.get(nk);
          if (old !== undefined && old <= ng) continue;
          gScore.set(nk, ng);
          came.set(nk, k);
          push(nk, ng + h(ni, nj));
        }
    }
    const endK = found ? gk : bestK;
    if (endK === sk) return null;
    const cells = [];
    for (let k = endK; k !== sk && k !== undefined; k = came.get(k)) cells.push(k);
    cells.reverse();
    // string-pull
    const out = [];
    let ci = s[0];
    let cj = s[1];
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let t = cells.length - 1; t > idx; t--) {
        const ti = cells[t] % W;
        const tj = (cells[t] - ti) / W;
        if (lineClear(G, ci, cj, ti, tj)) {
          far = t;
          break;
        }
      }
      const fi = cells[far] % W;
      const fj = (cells[far] - fi) / W;
      out.push([G.x(fi), G.z(fj)]);
      ci = fi;
      cj = fj;
      idx = far + 1;
    }
    if (found) out[out.length - 1] = [bx, bz];
    out.partial = !found;
    return out;
  }

  return {
    path,
    walkable(x, z) {
      const G = gridFor(x, z);
      return !G.blocked(G.toI(x), G.toJ(z));
    },
    clear(ax, az, bx, bz) {
      const G = gridFor(ax, az);
      if (G !== gridFor(bx, bz)) return false;
      return lineClear(G, G.toI(ax), G.toJ(az), G.toI(bx), G.toJ(bz));
    },
    grids: { over, inside },
  };
}
