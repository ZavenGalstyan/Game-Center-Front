/**
 * Breach Protocol — the terminal hacking minigame (pure logic).
 *
 * A grid of hex codes. Pick cells into a buffer, alternating axes: the first
 * pick comes from the top row, the next from that cell's column, the next
 * from that cell's row, and so on. The target sequence must appear
 * contiguously in the buffer before it fills or the timer runs out.
 * Every puzzle is generated around a valid solution path, so it is always
 * solvable; hacking power adds buffer slots and time.
 */
const CODES = ["1C", "55", "BD", "E9", "7A", "FF"];

export function newBreach(rand, tier = 1, hackPower = 1) {
  const n = tier >= 3 ? 6 : 5;
  const L = tier >= 2 ? 4 : 3;
  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => CODES[Math.floor(rand() * CODES.length)]));
  // solution path: alternating row/column moves starting in row 0, never reusing a cell
  let path;
  for (let attempt = 0; attempt < 200 && !path; attempt++) {
    const used = new Set();
    const p = [];
    let r = 0;
    let c = Math.floor(rand() * n);
    let axis = "col"; // next pick moves along the column of the current cell
    // optional lead-in picks before the sequence starts
    const lead = rand() < 0.5 ? 1 : 0;
    let ok = true;
    for (let k = 0; k < L + lead; k++) {
      if (k > 0) {
        const opts = [];
        for (let i = 0; i < n; i++) {
          const rr = axis === "col" ? i : r;
          const cc = axis === "col" ? c : i;
          if (!used.has(rr * n + cc) && !(rr === r && cc === c)) opts.push([rr, cc]);
        }
        if (!opts.length) {
          ok = false;
          break;
        }
        [r, c] = opts[Math.floor(rand() * opts.length)];
        axis = axis === "col" ? "row" : "col";
      }
      used.add(r * n + c);
      p.push([r, c]);
    }
    if (ok) path = { cells: p, lead };
  }
  const seq = [];
  for (let k = path.lead; k < path.cells.length; k++) {
    const [r, c] = path.cells[k];
    seq.push(grid[r][c]);
  }
  return {
    n,
    grid,
    seq,
    buffer: [],
    picked: [],
    size: L + 2 + Math.floor(hackPower / 2) + path.lead,
    time: 18 + 4 * hackPower + (tier >= 2 ? 6 : 0),
    t: 0,
    axis: "row0", // first pick: any cell of row 0
    last: null,
    status: "active",
    solution: path.cells,
  };
}

/** Cells that may be picked right now. */
export function allowed(B, r, c) {
  if (B.status !== "active") return false;
  if (B.picked.some(([pr, pc]) => pr === r && pc === c)) return false;
  if (B.axis === "row0") return r === 0;
  if (B.axis === "col") return c === B.last[1];
  return r === B.last[0];
}

export function pick(B, r, c) {
  if (!allowed(B, r, c)) return B;
  const buffer = [...B.buffer, B.grid[r][c]];
  const picked = [...B.picked, [r, c]];
  const axis = B.axis === "row0" || B.axis === "row" ? "col" : "row";
  let status = "active";
  if (contains(buffer, B.seq)) status = "success";
  else if (buffer.length >= B.size) status = "fail";
  else {
    // dead end: no legal cell left
    const nb = { ...B, buffer, picked, axis, last: [r, c] };
    let any = false;
    for (let i = 0; i < B.n && !any; i++) for (let j = 0; j < B.n && !any; j++) if (allowed(nb, i, j)) any = true;
    if (!any) status = "fail";
  }
  return { ...B, buffer, picked, axis, last: [r, c], status };
}

export function tick(B, dt) {
  if (B.status !== "active") return B;
  const t = B.t + dt;
  return { ...B, t, status: t >= B.time ? "fail" : "active" };
}

export function contains(buf, seq) {
  for (let i = 0; i + seq.length <= buf.length; i++) {
    let ok = true;
    for (let k = 0; k < seq.length; k++) if (buf[i + k] !== seq[k]) ok = false;
    if (ok) return true;
  }
  return false;
}
