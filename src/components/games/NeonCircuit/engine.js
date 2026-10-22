/**
 * Neon Circuit rules + GF(2) solver. A board is an int bitmask (bit r*n+c =
 * light ON); pressing cell i XORs it with the cross mask of i (itself plus
 * its orthogonal neighbours, never diagonals). Solved when the board is 0.
 */
const MASKS = {};
/** Cross masks for an n×n board, cached. */
export function masks(n) {
  if (MASKS[n]) return MASKS[n];
  const m = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let b = 1 << (r * n + c);
      if (r > 0) b |= 1 << ((r - 1) * n + c);
      if (r < n - 1) b |= 1 << ((r + 1) * n + c);
      if (c > 0) b |= 1 << (r * n + c - 1);
      if (c < n - 1) b |= 1 << (r * n + c + 1);
      m.push(b);
    }
  return (MASKS[n] = m);
}
export const press = (n, board, i) => board ^ masks(n)[i];
export const lit = (b) => {
  let k = 0;
  for (; b; b &= b - 1) k++;
  return k;
};
export const isOn = (board, i) => ((board >>> i) & 1) === 1;
/** Board produced by pressing every cell in `set` (bitmask) on an all-OFF board. */
export const apply = (n, set) => masks(n).reduce((b, m, i) => (isOn(set, i) ? b ^ m : b), 0);

/**
 * Minimal press set (bitmask) that clears `board`, or null if unsolvable.
 * Gauss-Jordan over GF(2); singular grids (4×4, 5×5) have a null space, so
 * every free-variable assignment is tried and the lightest solution kept.
 */
export function solve(n, board) {
  const N = n * n, M = masks(n);
  // the press matrix is symmetric, so row i = cells whose press flips light i = M[i]
  const a = M.slice(), b = M.map((_, i) => (board >>> i) & 1), piv = [];
  let r = 0;
  for (let c = 0; c < N && r < N; c++) {
    let p = r;
    while (p < N && !((a[p] >>> c) & 1)) p++;
    if (p === N) continue;
    [a[r], a[p]] = [a[p], a[r]];
    [b[r], b[p]] = [b[p], b[r]];
    for (let k = 0; k < N; k++)
      if (k !== r && (a[k] >>> c) & 1) (a[k] ^= a[r]), (b[k] ^= b[r]);
    piv.push(c);
    r++;
  }
  for (let k = r; k < N; k++) if (b[k]) return null;
  const pivSet = new Set(piv), free = [];
  for (let c = 0; c < N; c++) if (!pivSet.has(c)) free.push(c);
  let best = null, bestN = Infinity;
  for (let s = 0; s < 1 << free.length; s++) {
    let x = 0;
    free.forEach((c, j) => (s >> j) & 1 && (x |= 1 << c));
    let sol = x;
    for (let k = 0; k < r; k++) if (b[k] ^ (lit(a[k] & x) & 1)) sol |= 1 << piv[k];
    const w = lit(sol);
    if (w < bestN) (bestN = w), (best = sol);
  }
  return best;
}
/** Fewest presses to clear the board (0 = solved), or -1 if unsolvable. */
export const minMoves = (n, board) => {
  const s = solve(n, board);
  return s == null ? -1 : lit(s);
};
/** A cell that belongs to an optimal solution from this board, or -1. */
export const hint = (n, board, prefer = 0) => {
  const s = solve(n, board);
  if (!s) return -1;
  const N = n * n;
  for (let k = 0; k < N; k++) if (isOn(s, (prefer + k) % N)) return (prefer + k) % N;
  return -1;
};

/** Stars for finishing in `moves` when the optimum is `opt`. */
export const stars = (moves, opt) => (moves <= opt ? 3 : moves <= opt + Math.max(2, Math.ceil(opt / 2)) ? 2 : 1);

/** Smallest board value among the 8 rotations/reflections (dedupe key). */
export function canonical(n, board) {
  let best = Infinity;
  for (let t = 0; t < 8; t++) {
    let v = 0;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!isOn(board, r * n + c)) continue;
        let R = r, C = c;
        if (t & 1) C = n - 1 - C;
        if (t & 2) R = n - 1 - R;
        if (t & 4) [R, C] = [C, R];
        v |= 1 << (R * n + C);
      }
    if (v >>> 0 < best) best = v >>> 0;
  }
  return best;
}

export function rng(seed) {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random puzzle: press k random distinct cells on an all-OFF board, keep it if
 * its true optimum lies in [lo, hi] and it isn't trivial. Returns
 * { n, board, opt } or null after `tries`.
 */
export function generate(n, lo, hi, rand = Math.random, tries = 4000) {
  const N = n * n;
  for (let t = 0; t < tries; t++) {
    const k = lo + Math.floor(rand() * (Math.min(N, hi + 4) - lo + 1));
    let set = 0;
    while (lit(set) < k) set |= 1 << Math.floor(rand() * N);
    const board = apply(n, set), opt = minMoves(n, board);
    if (opt >= Math.max(2, lo) && opt <= hi && lit(board) >= 3) return { n, board, opt };
  }
  return null;
}
