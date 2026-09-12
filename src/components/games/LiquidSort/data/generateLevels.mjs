/**
 * Liquid Sort — DEV-TIME level generator. Not imported by the app at
 * runtime; run it manually with `node generateLevels.mjs` whenever the 100
 * levels need to be (re)produced, and it (re)writes `levels.js` next to it.
 *
 * GENERATION METHOD ("start from solved, apply reversible transformations"):
 * Every level starts life as the SOLVED state (each color fills one bottle,
 * plus empty helper bottles), then N "backward" steps are applied. Each
 * backward step is the exact inverse of a legal forward pour, chosen so
 * that undoing it is ALWAYS legal:
 *
 *   pick a non-empty bottle j with top color C, top run length m
 *   pick amount k in [1, m], with k == m only allowed when that empties j
 *     entirely (otherwise j would be left with a different color on top,
 *     which a legal forward pour could never re-cover)
 *   pick a bottle i != j whose own top color isn't C (or is empty) and has
 *     room for k more units — this keeps the added run's length exactly k
 *   move k units of C from the top of j onto the top of i
 *
 * Because this is exactly the inverse of pour(i, j), the RECORDED moves
 * played back in reverse order are a guaranteed, verified solution — no
 * random-shuffle-and-hope-a-solver-finds-it required. Solvability isn't
 * probabilistic here; it's true by construction, and this script still
 * replays the recorded solution with the real applyPour() and checks
 * isSolved() before accepting a level, as a defensive double-check.
 *
 * A bounded BFS (systems/puzzleSolver.js) then tries to find a SHORTER
 * solution than the construction path, purely to tighten star thresholds;
 * if it can't finish in time that's fine, the constructed length is always
 * a safe, valid target.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyPour } from "../systems/pourRules.js";
import { isSolved } from "../systems/winDetection.js";
import { solve } from "../systems/puzzleSolver.js";
import { COLOR_IDS } from "./colors.js";

const CAPACITY = 4;
const __dirname = dirname(fileURLToPath(import.meta.url));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function topColor(bottle) { return bottle.length ? bottle[bottle.length - 1] : null; }
function topRun(bottle) {
  if (!bottle.length) return 0;
  const c = bottle[bottle.length - 1];
  let n = 0;
  for (let i = bottle.length - 1; i >= 0 && bottle[i] === c; i--) n++;
  return n;
}

/** One backward construction step. Returns { state, move } or null if stuck. */
function backwardStep(state, rng, capacity) {
  const jCandidates = shuffled(
    state.map((_, idx) => idx).filter((idx) => state[idx].length > 0),
    rng,
  );

  for (const j of jCandidates) {
    const bottleJ = state[j];
    const C = topColor(bottleJ);
    const m = topRun(bottleJ);
    const wholeBottle = bottleJ.length === m;
    const kOptions = [];
    for (let k = 1; k < m; k++) kOptions.push(k);
    if (wholeBottle) kOptions.push(m);
    if (kOptions.length === 0) continue;

    // bias toward smaller k (more fragmented, harder puzzles) without ruling out big transfers
    const weighted = shuffled(kOptions, rng).sort((a, b) => {
      const wa = a + rng() * 1.5;
      const wb = b + rng() * 1.5;
      return wa - wb;
    });

    for (const k of weighted) {
      const iCandidates = shuffled(
        state.map((_, idx) => idx).filter((idx) => idx !== j),
        rng,
      );
      for (const i of iCandidates) {
        const bottleI = state[i];
        if (bottleI.length + k > capacity) continue;
        if (bottleI.length > 0 && topColor(bottleI) === C) continue;

        const nextState = state.map((b) => b.slice());
        nextState[j] = bottleJ.slice(0, bottleJ.length - k);
        nextState[i] = bottleI.concat(Array(k).fill(C));
        return { state: nextState, move: { from: i, to: j, amount: k, color: C } };
      }
    }
  }
  return null;
}

function solvedBoard(colorCount, helperBottles) {
  const colors = COLOR_IDS.slice(0, colorCount);
  const board = colors.map((c) => Array(CAPACITY).fill(c));
  for (let h = 0; h < helperBottles; h++) board.push([]);
  return board;
}

function generateOne({ id, colorCount, helperBottles, scrambleSteps, chapter }) {
  const rng = mulberry32(id * 7919 + 13);
  let state = solvedBoard(colorCount, helperBottles);
  const moves = [];

  let attempts = 0;
  while (moves.length < scrambleSteps && attempts < scrambleSteps * 6) {
    attempts++;
    const step = backwardStep(state, rng, CAPACITY);
    if (!step) break; // stuck early — accept whatever depth we reached
    state = step.state;
    moves.push(step.move);
  }
  if (moves.length < Math.max(3, Math.floor(scrambleSteps * 0.4))) {
    throw new Error(`Level ${id}: only reached ${moves.length}/${scrambleSteps} scramble steps`);
  }

  const solution = moves.slice().reverse(); // apply in this order to reach solved

  // Defensive verification: replay with the REAL game rules.
  let replay = state.map((b) => b.slice());
  for (const mv of solution) {
    const result = applyPour(replay, mv.from, mv.to, CAPACITY);
    if (!result) throw new Error(`Level ${id}: recorded solution move was illegal on replay`);
    replay = result.board;
  }
  if (!isSolved(replay, CAPACITY)) throw new Error(`Level ${id}: replay did not reach solved state`);
  if (isSolved(state, CAPACITY)) throw new Error(`Level ${id}: generated board is already solved`);

  // Try to tighten the target with a bounded search; constructed length is the safe fallback.
  const cap = colorCount + helperBottles <= 8 ? 120000 : colorCount + helperBottles <= 11 ? 45000 : 18000;
  let optimal = solution.length;
  try {
    const found = solve(state, { capacity: CAPACITY, maxExpanded: cap });
    if (found.solved && found.moves.length < optimal) optimal = found.moves.length;
  } catch {
    /* keep constructed length */
  }

  return {
    id,
    chapter,
    colorCount,
    bottles: state,
    targetMoves: optimal,
    constructedMoves: solution.length,
  };
}

function lerp(id, range, out) {
  const [a, b] = range;
  const [oa, ob] = out;
  if (b === a) return oa;
  const t = (id - a) / (b - a);
  return Math.round(oa + (ob - oa) * t);
}

function paramsFor(id) {
  if (id <= 20) {
    if (id === 1) return { colorCount: 3, helperBottles: 2, scrambleSteps: 4 };
    if (id <= 5) return { colorCount: lerp(id, [2, 5], [3, 4]), helperBottles: 2, scrambleSteps: lerp(id, [2, 5], [5, 8]) };
    if (id <= 10) return { colorCount: lerp(id, [6, 10], [4, 5]), helperBottles: 2, scrambleSteps: lerp(id, [6, 10], [9, 13]) };
    return { colorCount: lerp(id, [11, 20], [5, 6]), helperBottles: 2, scrambleSteps: lerp(id, [11, 20], [14, 22]) };
  }
  if (id <= 40) return { colorCount: lerp(id, [21, 40], [5, 7]), helperBottles: 2, scrambleSteps: lerp(id, [21, 40], [16, 28]) };
  if (id <= 60) return { colorCount: lerp(id, [41, 60], [6, 9]), helperBottles: id <= 50 ? 2 : 1, scrambleSteps: lerp(id, [41, 60], [22, 36]) };
  if (id <= 80) return { colorCount: lerp(id, [61, 80], [8, 11]), helperBottles: id <= 70 ? 2 : 1, scrambleSteps: lerp(id, [61, 80], [30, 46]) };
  if (id === 100) return { colorCount: 12, helperBottles: 2, scrambleSteps: 52 };
  return { colorCount: lerp(id, [81, 99], [9, 12]), helperBottles: id <= 90 ? 2 : 1, scrambleSteps: lerp(id, [81, 99], [36, 54]) };
}

function chapterOf(id) {
  if (id <= 20) return "first-drops";
  if (id <= 40) return "color-mix";
  if (id <= 60) return "deep-sort";
  if (id <= 80) return "master-pour";
  return "liquid-legend";
}

const levels = [];
for (let id = 1; id <= 100; id++) {
  const p = paramsFor(id);
  let level;
  let seedBump = 0;
  // Retry with a slightly different seed if a rare construction dead-end occurs.
  while (!level) {
    try {
      level = generateOne({ id: id * 1000 + seedBump, colorCount: p.colorCount, helperBottles: p.helperBottles, scrambleSteps: p.scrambleSteps, chapter: chapterOf(id) });
      level.id = id;
    } catch (err) {
      seedBump++;
      if (seedBump > 25) throw new Error(`Level ${id} failed after ${seedBump} attempts: ${err.message}`);
      level = null;
    }
  }
  levels.push(level);
  process.stdout.write(`level ${id}: colors=${p.colorCount} helpers=${p.helperBottles} target=${level.targetMoves} (constructed ${level.constructedMoves})\n`);
}

const out = `/**
 * Liquid Sort — 100 data-driven levels, generated by generateLevels.mjs.
 * DO NOT hand-edit; re-run the generator instead.
 *
 * bottles[]: BOTTOM -> TOP color order per bottle (see systems/pourRules.js
 * for the full convention). targetMoves is the tuned move count for 3 stars
 * (see utils/progression.js): <=target 3 stars, <=target+4 2 stars, else 1.
 */
export const LEVELS = ${JSON.stringify(levels.map((l) => ({
  id: l.id, chapter: l.chapter, colorCount: l.colorCount, targetMoves: l.targetMoves, bottles: l.bottles,
})), null, 2)};

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export function getLevel(id) { return LEVEL_BY_ID[id] || null; }
`;

writeFileSync(join(__dirname, "levels.js"), out);
console.log(`\nWrote ${levels.length} levels to levels.js`);
