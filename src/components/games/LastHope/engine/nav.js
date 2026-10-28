/**
 * Last Hope — zombie navigation on a 0.5 m grid.
 *
 * Two size classes (0: humans r≈0.4, 1: brutes r≈0.85): each has a blocked
 * mask from the static solids inflated by the class radius. Camp structures
 * live in a separate per-class `struct` layer: they are passable at a high
 * cost, so when the player hides behind walls the cheapest route leads the
 * dead *into* the weakest wall, which they then attack (siege).
 *
 *   field(cls, x, z)        Dijkstra distance field toward (x, z), radius-capped
 *   step(cls, f, x, z)      best neighbour direction down the field
 *   path(cls, a, b)         A* waypoint list (return-to-patrol)
 *   clear(cls, a, b)        straight walk possible?
 */
export const NAV_CELL = 0.5;
export const CLASS_R = [0.42, 0.9];
const SQ2 = Math.SQRT2;

export function createNav(map) {
  const W = Math.ceil(map.w / NAV_CELL);
  const H = Math.ceil(map.d / NAV_CELL);
  const ox = -map.w / 2;
  const oz = -map.d / 2;
  const N = W * H;
  const blocked = [new Uint8Array(N), new Uint8Array(N)];
  const struct = [new Int32Array(N), new Int32Array(N)]; // structure id + 1
  const structCost = new Map(); // id → cost
  const dist = [new Float32Array(N), new Float32Array(N)];
  const fieldInfo = [
    { x: 1e9, z: 1e9, t: -1 },
    { x: 1e9, z: 1e9, t: -1 },
  ];

  const ci = (x) => Math.floor((x - ox) / NAV_CELL);
  const cj = (z) => Math.floor((z - oz) / NAV_CELL);
  const cx = (i) => ox + (i + 0.5) * NAV_CELL;
  const cz = (j) => oz + (j + 0.5) * NAV_CELL;
  const idx = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i);

  function shapeDist(s, x, z) {
    if (s.k === "c") return Math.hypot(x - s.x, z - s.z) - s.r;
    const c = Math.cos(s.a || 0);
    const sn = Math.sin(s.a || 0);
    const dx = x - s.x;
    const dz = z - s.z;
    const lx = Math.abs(c * dx - sn * dz) - s.hw;
    const lz = Math.abs(sn * dx + c * dz) - s.hd;
    const ax = Math.max(lx, 0);
    const az = Math.max(lz, 0);
    return Math.hypot(ax, az) + Math.min(Math.max(lx, lz), 0);
  }
  function raster(s, cls, fn) {
    const r = CLASS_R[cls];
    const br = (s.k === "c" ? s.r : Math.hypot(s.hw, s.hd)) + r;
    const i0 = Math.max(0, ci(s.x - br));
    const i1 = Math.min(W - 1, ci(s.x + br));
    const j0 = Math.max(0, cj(s.z - br));
    const j1 = Math.min(H - 1, cj(s.z + br));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (shapeDist(s, cx(i), cz(j)) < r) fn(j * W + i);
  }
  for (const s of map.solids) for (let cls = 0; cls < 2; cls++) raster(s, cls, (k) => (blocked[cls][k] = 1));
  // map border
  for (let cls = 0; cls < 2; cls++) {
    const m = Math.ceil(CLASS_R[cls] / NAV_CELL) + 1;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) if (i < m || j < m || i >= W - m || j >= H - m) blocked[cls][j * W + i] = 1;
  }

  /** Replace the structure layer. items: [{id, shape, cost}] — cost ≤ 0 means impassable (locked doors). */
  function setStructures(items) {
    for (let cls = 0; cls < 2; cls++) struct[cls].fill(0);
    structCost.clear();
    for (const it of items) {
      structCost.set(it.id, it.cost);
      for (let cls = 0; cls < 2; cls++) raster(it.shape, cls, (k) => (struct[cls][k] = it.id + 1));
    }
    fieldInfo[0].t = fieldInfo[1].t = -1;
  }

  // ---------------------------------------------------------------- binary heap
  let hk = new Int32Array(4096);
  let hp = new Float32Array(4096);
  let hn = 0;
  const push = (k, p) => {
    if (hn >= hk.length) {
      const nk = new Int32Array(hk.length * 2);
      nk.set(hk);
      const np = new Float32Array(hp.length * 2);
      np.set(hp);
      hk = nk;
      hp = np;
    }
    let i = hn++;
    while (i > 0) {
      const p2 = (i - 1) >> 1;
      if (hp[p2] <= p) break;
      hk[i] = hk[p2];
      hp[i] = hp[p2];
      i = p2;
    }
    hk[i] = k;
    hp[i] = p;
  };
  const pop = () => {
    const top = hk[0];
    const last = hk[--hn];
    const lp = hp[hn];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hp[c + 1] < hp[c]) c++;
      if (hp[c] >= lp) break;
      hk[i] = hk[c];
      hp[i] = hp[c];
      i = c;
    }
    hk[i] = last;
    hp[i] = lp;
    return top;
  };

  const DI = [1, -1, 0, 0, 1, 1, -1, -1];
  const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  const DC = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];

  function enterCost(cls, k) {
    const sid = struct[cls][k];
    if (!sid) return 0;
    const c = structCost.get(sid - 1);
    return c == null || c <= 0 ? -1 : c;
  }

  /** Distance field toward (x,z) capped at maxD metres (cells beyond stay Infinity). */
  function field(cls, x, z, maxD = 46, now = 0) {
    const F = fieldInfo[cls];
    if (F.t >= 0 && Math.abs(F.x - x) < NAV_CELL * 0.9 && Math.abs(F.z - z) < NAV_CELL * 0.9 && now - F.t < 1.2) return dist[cls];
    F.x = x;
    F.z = z;
    F.t = now;
    const D = dist[cls];
    D.fill(Infinity);
    const B = blocked[cls];
    let si = ci(x);
    let sj = cj(z);
    let s = idx(si, sj);
    if (s < 0) return D;
    const maxC = maxD / NAV_CELL;
    hn = 0;
    D[s] = 0;
    push(s, 0);
    while (hn) {
      const k = pop();
      const dk = D[k];
      if (dk > maxC) continue;
      const i = k % W;
      const j = (k - i) / W;
      for (let n = 0; n < 8; n++) {
        const ni = i + DI[n];
        const nj = j + DJ[n];
        const nk = idx(ni, nj);
        if (nk < 0) continue;
        // the target (player) may hug a wall: expand out of inflated cells it stands in
        if (B[nk] && !B[k]) continue;
        if (!B[k] && n >= 4 && (B[idx(i + DI[n], j)] || B[idx(i, j + DJ[n])])) continue;
        if (B[nk] && dk > 6) continue;
        const ec = enterCost(cls, nk);
        if (ec < 0) continue;
        const nd = dk + DC[n] + ec;
        if (nd < D[nk]) {
          D[nk] = nd;
          push(nk, nd);
        }
      }
    }
    return D;
  }

  /**
   * Direction down the field from (x,z): {dx, dz, d (field value here),
   * sid (structure id in the next cell, or -1)}. null when unreachable.
   */
  const stepOut = { dx: 0, dz: 0, d: 0, sid: -1, nx: 0, nz: 0 };
  function step(cls, D, x, z) {
    const i = ci(x);
    const j = cj(z);
    const k = idx(i, j);
    if (k < 0) return null;
    let here = D[k];
    const B = blocked[cls];
    if (!Number.isFinite(here)) {
      // standing in an inflated cell (pushed against something): look one ring out
      let best = Infinity;
      let bk = -1;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const kk = idx(i + di, j + dj);
          if (kk >= 0 && D[kk] < best) {
            best = D[kk];
            bk = kk;
          }
        }
      if (bk < 0) return null;
      const bi = bk % W;
      const bj = (bk - bi) / W;
      stepOut.nx = cx(bi);
      stepOut.nz = cz(bj);
      stepOut.dx = cx(bi) - x;
      stepOut.dz = cz(bj) - z;
      stepOut.d = best + 2;
      stepOut.sid = struct[cls][bk] - 1;
      norm();
      return stepOut;
    }
    let best = here;
    let bn = -1;
    for (let n = 0; n < 8; n++) {
      const nk = idx(i + DI[n], j + DJ[n]);
      if (nk < 0 || B[nk]) continue;
      if (n >= 4 && (B[idx(i + DI[n], j)] || B[idx(i, j + DJ[n])])) continue;
      if (D[nk] < best) {
        best = D[nk];
        bn = n;
      }
    }
    if (bn < 0) {
      stepOut.dx = 0;
      stepOut.dz = 0;
      stepOut.d = here;
      stepOut.sid = -1;
      return stepOut;
    }
    // look two cells ahead for a smoother heading
    let ti = i + DI[bn];
    let tj = j + DJ[bn];
    const k2 = idx(ti, tj);
    let b2 = D[k2];
    let bn2 = -1;
    for (let n = 0; n < 8; n++) {
      const nk = idx(ti + DI[n], tj + DJ[n]);
      if (nk < 0 || B[nk]) continue;
      if (D[nk] < b2) {
        b2 = D[nk];
        bn2 = n;
      }
    }
    const tx = bn2 >= 0 && !struct[cls][idx(ti + DI[bn2], tj + DJ[bn2])] && !struct[cls][k2] ? cx(ti + DI[bn2]) : cx(ti);
    const tz = bn2 >= 0 && !struct[cls][idx(ti + DI[bn2], tj + DJ[bn2])] && !struct[cls][k2] ? cz(tj + DJ[bn2]) : cz(tj);
    stepOut.nx = tx;
    stepOut.nz = tz;
    stepOut.dx = tx - x;
    stepOut.dz = tz - z;
    stepOut.d = here;
    stepOut.sid = struct[cls][k2] - 1;
    norm();
    return stepOut;
  }
  function norm() {
    const l = Math.hypot(stepOut.dx, stepOut.dz) || 1;
    stepOut.dx /= l;
    stepOut.dz /= l;
  }

  /** Can a body of class `cls` walk straight from a to b (static + structures)? */
  function clear(cls, ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / (NAV_CELL * 0.5));
    const B = blocked[cls];
    const S = struct[cls];
    for (let s = 0; s <= n; s++) {
      const t = n ? s / n : 0;
      const k = idx(ci(ax + (bx - ax) * t), cj(az + (bz - az) * t));
      if (k < 0 || B[k] || S[k]) return false;
    }
    return true;
  }

  /** A* from a to b (structures impassable). Returns [[x,z], …] or null. */
  const gScore = new Float32Array(N);
  const came = new Int32Array(N);
  const seen = new Uint32Array(N);
  const closed = new Uint32Array(N);
  let seenStamp = 0;
  function path(cls, ax, az, bx, bz, limit = 9000) {
    const B = blocked[cls];
    const S = struct[cls];
    let s = idx(ci(ax), cj(az));
    const g = idx(ci(bx), cj(bz));
    if (s < 0 || g < 0 || B[g]) return null;
    seenStamp++;
    hn = 0;
    gScore[s] = 0;
    came[s] = -1;
    seen[s] = seenStamp;
    const gi = g % W;
    const gj = (g - gi) / W;
    const h = (k) => {
      const i = k % W;
      const j = (k - i) / W;
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz);
    };
    push(s, h(s));
    let it = 0;
    let found = false;
    while (hn && it < limit) {
      const k = pop();
      if (closed[k] === seenStamp) continue;
      closed[k] = seenStamp;
      it++;
      if (k === g) {
        found = true;
        break;
      }
      const i = k % W;
      const j = (k - i) / W;
      for (let n = 0; n < 8; n++) {
        const nk = idx(i + DI[n], j + DJ[n]);
        if (nk < 0) continue;
        // a start hugging a wall sits in inflated cells: let it walk out of them
        const escaping = B[k] || S[k];
        if (!escaping && (B[nk] || S[nk])) continue;
        if (!escaping && n >= 4 && (B[idx(i + DI[n], j)] || B[idx(i, j + DJ[n])])) continue;
        const ng = gScore[k] + DC[n] + (B[nk] ? 1.5 : 0);
        if (seen[nk] !== seenStamp || ng < gScore[nk]) {
          seen[nk] = seenStamp;
          gScore[nk] = ng;
          came[nk] = k;
          push(nk, ng + h(nk));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = g; k >= 0; k = came[k]) cells.push(k);
    cells.reverse();
    // string-pull
    const out = [];
    let a = 0;
    const P = (k) => [cx(k % W), cz((k - (k % W)) / W)];
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      const [px, pz] = P(cells[a]);
      while (b > a + 1) {
        const [qx, qz] = P(cells[b]);
        if (clear(cls, px, pz, qx, qz)) break;
        b--;
      }
      out.push(P(cells[b]));
      a = b;
    }
    return out;
  }

  function isBlocked(cls, x, z) {
    const k = idx(ci(x), cj(z));
    return k < 0 || !!blocked[cls][k];
  }
  function fieldAt(D, x, z) {
    const k = idx(ci(x), cj(z));
    return k < 0 ? Infinity : D[k];
  }
  /** Nearest free cell centre to (x,z) for class cls (spiral search). */
  function nearestFree(cls, x, z, maxR = 12) {
    const i0 = ci(x);
    const j0 = cj(z);
    for (let r = 0; r <= maxR; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const k = idx(i0 + di, j0 + dj);
          if (k >= 0 && !blocked[cls][k] && !struct[cls][k]) return [cx(i0 + di), cz(j0 + dj)];
        }
    return null;
  }

  return { W, H, field, step, clear, path, isBlocked, fieldAt, nearestFree, setStructures, blocked, struct };
}
