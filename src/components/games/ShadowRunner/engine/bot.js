/**
 * Shadow Runner — level-proving bot. Time-layered breadth-first search over the
 * SAME sim the player uses: every DECIDE steps it picks one of
 *   0 none · 1 hold jump · 2 down (slide / fast-fall) · 3 brake
 * and only ever writes s.input — exactly what the keyboard does. States are
 * de-duplicated on (position, velocity, mode[, time]) buckets, so dead ends
 * are explored once.
 *
 * Used by tools/validateLevels.mjs (finish / all-coins / nerfed-physics
 * margin / timing tolerance) and tools/simTest.mjs.
 */
import { createSim, cloneSim, step } from "./sim.js";

export const DECIDE = 6; // sim steps per decision (0.05 s)

const INPUTS = [
  { jump: false, down: false, brake: false },
  { jump: true, down: false, brake: false },
  { jump: false, down: true, brake: false },
  { jump: false, down: false, brake: true },
];

function advance(s, a) {
  s.input = INPUTS[a];
  for (let i = 0; i < DECIDE; i++) {
    step(s);
    if (s.phase !== "play") return;
  }
}

/**
 * Time-layered breadth-first search: every layer is one decision later, so
 * the first state to reach the finish is a fastest route (par time).
 * States are de-duplicated globally (static levels) or per time bucket
 * (levels with movers / timed lasers); each layer keeps at most `beam`
 * states, preferring the furthest along.
 *
 * opts: { tune, allCoins, beam, maxLayers, noBrake }
 * Returns { ok, actions, time, coins, minGap, nodes, maxX }.
 */
const CELL_CAP = 8;

/** solve(), retried once with a much wider beam if the first pass fails. */
export function solve(L, opts = {}) {
  const r = solveOnce(L, opts);
  if (r.ok || opts.beam) return r;
  const r2 = solveOnce(L, { ...opts, beam: 3000 });
  r2.nodes += r.nodes;
  return r2;
}

function solveOnce(L, opts = {}) {
  const beam = opts.beam ?? 700;
  const Q = opts.q ?? 7;
  const maxLayers = opts.maxLayers ?? 1600;
  const root = createSim(L, { bot: true, tune: opts.tune });
  const coins = L.coins;
  const allCoins = !!opts.allCoins;
  // time only matters when something in the level moves or switches
  const timed = L.movers.length > 0 || L.lasers.some((z) => z.on || z.mx || z.my) || L.crumbles.length > 0;
  const acts = opts.noBrake ? [0, 1, 2] : [0, 1, 2, 3];
  const seen = new Set();
  let layer = [{ s: root, a: -1, parent: null }];
  let nodes = 0;
  let maxX = 0;

  const missedCoin = (s) => {
    const px = s.p.x;
    for (let i = 0; i < coins.length; i++) if (!s.coins[i] && coins[i].x < px - 70) return true;
    return false;
  };
  const keyOf = (s) => {
    const p = s.p;
    let key = ((p.x / Q) | 0) + "," + ((p.y / Q) | 0) + "," + ((p.vx / 40) | 0) + "," + ((p.vy / 90) | 0) + "," + p.mode + p.airJumps + (s.input.jump ? 1 : 0);
    if (allCoins) key += "," + s.coinCount;
    if (timed) key += "," + ((s.t / 0.1) | 0);
    if (L.crumbles.length) {
      let c = 0;
      for (let i = 0; i < s.crumble.length; i++) if (s.crumble[i] >= 0) c = c * 3 + (s.crumble[i] === Infinity ? 2 : 1);
      key += "," + c;
    }
    return key;
  };

  for (let depth = 0; depth < maxLayers && layer.length; depth++) {
    const next = [];
    let best = null;
    for (const node of layer) {
      for (const a of acts) {
        const s = cloneSim(node.s);
        advance(s, a);
        nodes++;
        if (s.p.x > maxX) maxX = s.p.x;
        if (s.phase === "done") {
          if (allCoins && s.coinCount < coins.length) continue;
          if (!best || s.time < best.s.time) best = { s, a, parent: node };
          continue;
        }
        if (s.phase !== "play") continue;
        if (allCoins && missedCoin(s)) continue;
        const k = keyOf(s);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ s, a, parent: node });
      }
    }
    if (best) {
      const actions = [];
      for (let n = best; n && n.a >= 0; n = n.parent) actions.push(n.a);
      actions.reverse();
      const s = best.s;
      return { ok: true, actions, time: s.time, coins: s.coinCount, minGap: s.minGap, nodes, maxX };
    }
    if (next.length > beam) {
      // furthest first, but at most CELL_CAP per (x, y, mode) cell so slower
      // lines (braking for a gate, waiting on a lift) survive the cut
      next.sort((u, v) => (allCoins ? v.s.coinCount - u.s.coinCount : 0) || v.s.p.x - u.s.p.x);
      const keep = [];
      const rest = [];
      const cells = new Map();
      for (const n of next) {
        const c = ((n.s.p.x / 48) | 0) + ":" + ((n.s.p.y / 48) | 0) + n.s.p.mode;
        const k = cells.get(c) || 0;
        if (k < CELL_CAP && keep.length < beam) {
          cells.set(c, k + 1);
          keep.push(n);
        } else rest.push(n);
      }
      for (let i = 0; keep.length < beam && i < rest.length; i++) keep.push(rest[i]);
      next.length = 0;
      next.push(...keep);
    }
    layer = next;
  }
  return { ok: false, nodes, maxX };
}

/** Replay an action list; returns the final sim. */
export function replay(L, actions, opts = {}) {
  const s = createSim(L, { bot: true, tune: opts.tune });
  for (const a of actions) {
    advance(s, a);
    if (s.phase !== "play") break;
  }
  // keep running (no input) a moment in case the finish is a few steps off
  for (let i = 0; i < 240 && s.phase === "play"; i++) {
    s.input = INPUTS[0];
    step(s);
  }
  return s;
}

/**
 * Timing tolerance: delay or advance every jump press of a solution by
 * `steps` sim steps (one at a time) and count how many still finish. A level
 * that only works on exact frames scores low.
 */
export function tolerance(L, actions, steps = 3) {
  const presses = [];
  for (let i = 0; i < actions.length; i++) if (actions[i] === 1 && actions[i - 1] !== 1) presses.push(i);
  let ok = 0;
  let total = 0;
  for (const i of presses) {
    for (const d of [-steps, steps]) {
      total++;
      const s = createSim(L, { bot: true });
      const stepsArr = [];
      for (const a of actions) for (let j = 0; j < DECIDE; j++) stepsArr.push(a);
      const at = i * DECIDE;
      // shift the press edge: extend/trim the preceding "none" run
      const shifted = stepsArr.slice();
      if (d > 0) for (let j = 0; j < d; j++) shifted[at + j] = shifted[at - 1] ?? 0;
      else for (let j = d; j < 0; j++) if (at + j >= 0) shifted[at + j] = 1;
      for (let k = 0; k < shifted.length && s.phase === "play"; k++) {
        s.input = INPUTS[shifted[k]];
        step(s);
      }
      for (let j = 0; j < 240 && s.phase === "play"; j++) {
        s.input = INPUTS[0];
        step(s);
      }
      if (s.phase === "done") ok++;
    }
  }
  return { ok, total };
}
