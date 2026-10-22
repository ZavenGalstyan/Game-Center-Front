/**
 * Block Escape rules + solver — pure functions shared by the UI, the hint
 * system and the headless tools (tools/engineTest.mjs, tools/generate.mjs).
 *
 * A level is a 36-char row-major string over a 6×6 board: "." empty, "A" the
 * target block (horizontal, row 2), other letters are blocks. A block is
 * horizontal when its cells share a row. The exit is on the right of row 2;
 * the puzzle is solved when the target block touches it (x = 4).
 *
 * Runtime state is just `pos`: one number per block — its column (horizontal
 * blocks) or row (vertical blocks). A move slides one block any distance.
 */
export const N = 6;
export const EXIT_ROW = 2;

/** Parse a level string into static block descriptions + the start positions. */
export function parse(str) {
  const cells = {};
  [...str].forEach((ch, i) => {
    if (ch !== "." && ch !== "o") (cells[ch] ??= []).push(i);
  });
  const letters = Object.keys(cells).sort((a, b) => (a === "A" ? -1 : b === "A" ? 1 : a < b ? -1 : 1));
  const blocks = letters.map((ch, id) => {
    const c = cells[ch];
    const h = Math.floor(c[0] / N) === Math.floor(c[c.length - 1] / N);
    return { id, ch, len: c.length, h, line: h ? Math.floor(c[0] / N) : c[0] % N, target: ch === "A" };
  });
  const pos = letters.map((ch, id) => (blocks[id].h ? cells[ch][0] % N : Math.floor(cells[ch][0] / N)));
  return { blocks, pos };
}

/** Back to a level string (used by the generator). */
export function serialize(blocks, pos) {
  const out = Array(N * N).fill(".");
  blocks.forEach((b, i) => cells(b, pos[i]).forEach((c) => (out[c] = b.ch)));
  return out.join("");
}

/** Board cells covered by block `b` at position `p`. */
export function cells(b, p) {
  const out = [];
  for (let k = 0; k < b.len; k++) out.push(b.h ? b.line * N + p + k : (p + k) * N + b.line);
  return out;
}

/** Occupancy grid: block index per cell, or -1. */
export function grid(blocks, pos) {
  const g = new Int8Array(N * N).fill(-1);
  blocks.forEach((b, i) => cells(b, pos[i]).forEach((c) => (g[c] = i)));
  return g;
}

/** Furthest positions block `i` can slide to: [min, max] (inclusive). */
export function range(blocks, pos, i, g = grid(blocks, pos)) {
  const b = blocks[i], p = pos[i];
  const at = (q) => (b.h ? b.line * N + q : q * N + b.line);
  let lo = p, hi = p;
  while (lo > 0 && g[at(lo - 1)] === -1) lo--;
  while (hi + b.len < N && g[at(hi + b.len)] === -1) hi++;
  return [lo, hi];
}

export const isSolved = (blocks, pos) => pos[0] + blocks[0].len === N;
export const key = (pos) => String.fromCharCode(...pos.map((p) => p + 48));

/** Every legal single move from `pos`: [blockIndex, newPos]. */
export function moves(blocks, pos) {
  const g = grid(blocks, pos), out = [];
  for (let i = 0; i < blocks.length; i++) {
    const [lo, hi] = range(blocks, pos, i, g);
    for (let q = lo; q <= hi; q++) if (q !== pos[i]) out.push([i, q]);
  }
  return out;
}

/**
 * Breadth-first search for an optimal solution from `pos`. Returns the move
 * list ([block, newPos] pairs) or null when unsolvable / over `cap` states.
 */
export function solve(blocks, pos, cap = 400000) {
  if (isSolved(blocks, pos)) return [];
  const start = key(pos);
  const prev = new Map([[start, null]]);
  let frontier = [pos];
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      const ck = key(cur);
      for (const [i, q] of moves(blocks, cur)) {
        const np = cur.slice();
        np[i] = q;
        const nk = key(np);
        if (prev.has(nk)) continue;
        prev.set(nk, [ck, i, q]);
        if (isSolved(blocks, np)) {
          const path = [];
          for (let k = nk; prev.get(k); k = prev.get(k)[0]) path.unshift(prev.get(k).slice(1));
          return path;
        }
        if (prev.size > cap) return null;
        next.push(np);
      }
    }
    frontier = next;
  }
  return null;
}

/** Star rating for solving in `moves` with an optimum of `par`. */
export function stars(moves, par) {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(3, Math.ceil(par * 0.5))) return 2;
  return 1;
}
