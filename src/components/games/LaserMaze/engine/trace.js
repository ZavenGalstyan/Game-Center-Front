/**
 * Laser Maze — the ONE beam tracer.
 *
 * Everything that depends on where light goes — the rendered beam, impact
 * sparks, lit targets, powered switches, open gates, completion, the solver
 * and the hint system — reads the result of `traceBeams(level, state)`.
 * Nothing computes a path anywhere else, so visuals and logic cannot drift.
 *
 * A beam is a (cell, direction, color) triple travelling from one cell
 * center to the next. Branches (splitters, prisms) are pushed onto a queue;
 * every triple is visited at most once, which cuts mirror loops, portal
 * loops and splitter feedback without any special cases. A hard step cap is
 * a second guard that can never be reached by a valid board.
 *
 * Per-object behaviour (explicit, and the same in every world):
 *   wall / closed gate / closed shutter / crank / source  → beam stops at the
 *                                                          cell face
 *   board edge      → beam stops at the frame
 *   mirror          → reflect (double-sided, REFLECT tables)
 *   splitter        → continue straight AND reflect
 *   target          → absorbs; its received color is the OR of all beams
 *   switch          → beam passes through and powers the switch
 *   filter          → color becomes beam & filter; 0 means absorbed
 *   prism           → red component turns left, green goes straight,
 *                     blue turns right (relative to travel); others absorbed
 *   portal          → beam re-emerges from the linked portal, same direction
 *   open gate/shutter, empty slot, floor → pass through
 *
 * Gates: switches power gates, and opening a gate can only ever EXTEND
 * beams (it removes a blocker, never adds one), so we trace with all gates
 * shut, open every gate whose switch is lit, and retrace until nothing new
 * opens. That fixed point is reached in at most (#gates + 1) passes.
 */
import { DX, DY, REFLECT, ORIENTS, RED, GREEN, BLUE } from "./constants.js";

const MAX_STEPS = 20000;
const FACE = 0.44; // where a blocked beam stops, measured from the cell center

/** Build the per-state cell lookup: static board + every movable/geared part. */
export function buildCells(level, state) {
  const cells = level.grid.slice();
  const { w } = level;
  level.rotatables.forEach((r, i) => {
    cells[r.y * w + r.x] = { type: r.kind, o: ORIENTS[state.rot[i]], pid: r.id };
  });
  level.movables.forEach((m, i) => {
    const s = level.slots[state.mov[i]];
    cells[s.y * w + s.x] = { type: "mirror", o: m.o, pid: m.id, movable: true };
  });
  const phaseOf = (group) => {
    const ci = level.cranks.findIndex((c) => c.group === group);
    return state.crank[ci];
  };
  for (const g of level.geared) {
    const o = g.pattern[phaseOf(g.group) % g.pattern.length];
    cells[g.y * w + g.x] = { type: "mirror", o, geared: true };
  }
  for (const sh of level.shutters) {
    const open = sh.pattern[phaseOf(sh.group) % sh.pattern.length];
    cells[sh.y * w + sh.x] = { type: "shutter", open };
  }
  return cells;
}

function traceOnce(level, cells, openGates) {
  const { w, h } = level;
  const segments = [];
  const impacts = [];
  const targetMasks = new Array(level.targets.length).fill(0);
  const switchesOn = new Set();
  const portalHits = [];
  const visited = new Set();
  const queue = level.sources.map((s) => ({ x: s.x, y: s.y, d: s.d, c: s.c }));
  let steps = 0;
  let capped = false;

  while (queue.length) {
    let { x, y, d, c } = queue.shift();
    for (;;) {
      const key = ((y * w + x) * 4 + d) * 8 + c;
      if (visited.has(key)) break;
      visited.add(key);
      if (++steps > MAX_STEPS) {
        capped = true;
        break;
      }
      const cx = x + 0.5;
      const cy = y + 0.5;
      const nx = x + DX[d];
      const ny = y + DY[d];

      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        const ex = cx + DX[d] * 0.5;
        const ey = cy + DY[d] * 0.5;
        segments.push({ x1: cx, y1: cy, x2: ex, y2: ey, c });
        impacts.push({ x: ex, y: ey, c, kind: "edge" });
        break;
      }

      const cell = cells[ny * w + nx];
      const ncx = nx + 0.5;
      const ncy = ny + 0.5;
      const t = cell ? cell.type : null;
      const blocked =
        t === "wall" ||
        t === "source" ||
        t === "crank" ||
        (t === "gate" && !openGates.has(cell.id)) ||
        (t === "shutter" && !cell.open);

      if (blocked) {
        const ex = cx + DX[d] * (1 - FACE);
        const ey = cy + DY[d] * (1 - FACE);
        segments.push({ x1: cx, y1: cy, x2: ex, y2: ey, c });
        impacts.push({ x: ex, y: ey, c, kind: t });
        break;
      }

      segments.push({ x1: cx, y1: cy, x2: ncx, y2: ncy, c });
      x = nx;
      y = ny;

      if (!t || t === "slot" || t === "gate" || t === "shutter") continue;

      if (t === "mirror") {
        d = REFLECT[cell.o][d];
        continue;
      }
      if (t === "splitter") {
        queue.push({ x, y, d: REFLECT[cell.o][d], c });
        continue;
      }
      if (t === "target") {
        targetMasks[cell.idx] |= c;
        break;
      }
      if (t === "switch") {
        switchesOn.add(cell.id);
        continue;
      }
      if (t === "filter") {
        const nc = c & cell.c;
        if (!nc) {
          impacts.push({ x: ncx, y: ncy, c, kind: "filter" });
          break;
        }
        c = nc;
        continue;
      }
      if (t === "prism") {
        if (c & RED) queue.push({ x, y, d: (d + 3) % 4, c: RED });
        if (c & GREEN) queue.push({ x, y, d, c: GREEN });
        if (c & BLUE) queue.push({ x, y, d: (d + 1) % 4, c: BLUE });
        break;
      }
      if (t === "portal") {
        const out = level.portals[`${x},${y}`];
        portalHits.push({ from: { x, y }, to: out, c });
        x = out.x;
        y = out.y;
        continue;
      }
      // Unknown type: treat as a blocker so a data bug can never leak light.
      impacts.push({ x: ncx, y: ncy, c, kind: "unknown" });
      break;
    }
  }

  return { segments, impacts, targetMasks, switchesOn, portalHits, capped };
}

/**
 * Trace every beam for a puzzle state. Returns everything the renderer and
 * the rules need; `solved` means every target is lit with exactly its color
 * in THIS state (so targets lit in different configurations never count).
 */
export function traceBeams(level, state) {
  const cells = buildCells(level, state);
  let open = new Set();
  let res = traceOnce(level, cells, open);
  for (let i = 0; i <= level.gates.length; i++) {
    const next = new Set(level.gates.filter((g) => res.switchesOn.has(g.id)).map((g) => g.id));
    if (next.size === open.size) break;
    open = next;
    res = traceOnce(level, cells, open);
  }

  const targetLit = level.targets.map((tg, i) => res.targetMasks[i] === tg.c);
  const targetWrong = level.targets.map((tg, i) => res.targetMasks[i] !== 0 && res.targetMasks[i] !== tg.c);
  const litCount = targetLit.filter(Boolean).length;

  return {
    ...res,
    cells,
    gatesOpen: open,
    targetLit,
    targetWrong,
    litCount,
    solved: litCount === level.targets.length,
  };
}

/** Cheap solved-check for the solver (same tracer, fewer allocations kept). */
export function isSolved(level, state) {
  return traceBeams(level, state).solved;
}
