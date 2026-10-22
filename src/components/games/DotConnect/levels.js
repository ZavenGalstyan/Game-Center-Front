/**
 * Dot Connect levels — built deterministically at import, solution first:
 *  1. take a Hamiltonian path through the whole grid (a snake, randomised with
 *     "backbite" moves), so every cell is covered;
 *  2. cut it into k segments (each ≥ 3 cells, ends never adjacent);
 *  3. each segment's two ends become a colour's pair of dots.
 * The segments themselves are a full solution, so no board can be unsolvable.
 *
 * Cells are indices r * n + c.
 */
export const PALETTE = [
  { name: "Red", hex: "#ff4d6a" },
  { name: "Blue", hex: "#3d8bff" },
  { name: "Green", hex: "#2ee59d" },
  { name: "Yellow", hex: "#ffd23f" },
  { name: "Orange", hex: "#ff8a2a" },
  { name: "Cyan", hex: "#2fd9ff" },
  { name: "Pink", hex: "#ff5fcf" },
  { name: "Purple", hex: "#a77bff" },
  { name: "Lime", hex: "#b6f23a" },
];

// [first level, last level, grid size, colours at start, colours at end]
const BANDS = [
  [1, 10, 5, 4, 5],
  [11, 22, 6, 5, 6],
  [23, 36, 7, 6, 7],
  [37, 50, 8, 7, 9],
];

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function neighbours(n) {
  return Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  });
}

export const adjacent = (a, b, n) =>
  (Math.abs(a - b) === n) || (Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n));

function hamiltonian(n, rand, nb) {
  const path = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
  const pos = new Int16Array(n * n);
  for (let k = 0; k < n * n * 30; k++) {
    if (rand() < 0.5) path.reverse();
    path.forEach((cell, i) => (pos[cell] = i));
    const end = path[path.length - 1];
    const opts = nb[end].filter((x) => x !== path[path.length - 2]);
    const i = pos[opts[Math.floor(rand() * opts.length)]];
    // backbite: link the end to that neighbour and reverse the tail after it
    const tail = path.splice(i + 1).reverse();
    path.push(...tail);
  }
  return path;
}

function cut(path, k, n, rand) {
  const N = path.length;
  for (let tries = 0; tries < 400; tries++) {
    const cuts = new Set();
    while (cuts.size < k - 1) cuts.add(3 + Math.floor(rand() * (N - 5)));
    const at = [0, ...[...cuts].sort((a, b) => a - b), N];
    const segs = [];
    let ok = true;
    for (let s = 0; s < k && ok; s++) {
      const seg = path.slice(at[s], at[s + 1]);
      ok = seg.length >= 3 && !adjacent(seg[0], seg[seg.length - 1], n);
      segs.push(seg);
    }
    if (ok) return segs;
  }
  return null;
}

function makeLevel(id) {
  const [from, to, n, c0, c1] = BANDS.find(([a, b]) => id >= a && id <= b);
  const k = c0 + Math.round(((id - from) / (to - from)) * (c1 - c0));
  const rand = mulberry32(id * 7919 + 17);
  const nb = neighbours(n);
  let solution = null;
  while (!solution) solution = cut(hamiltonian(n, rand, nb), k, n, rand);
  return { id, n, dots: solution.map((s) => [s[0], s[s.length - 1]]), solution };
}

export const LEVELS = Array.from({ length: 50 }, (_, i) => makeLevel(i + 1));
