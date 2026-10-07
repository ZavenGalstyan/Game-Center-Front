/**
 * Water Tanks — validates EVERY campaign level (Node, no framework):
 *   node src/components/games/WaterTanks/tools/validateLevels.mjs
 * Per level: static checks + BFS (solvable, optimal === configured), the
 * shortest solution replays through the real rules, a hint from the start
 * and from every state along that path is a legal move that keeps the
 * puzzle solvable in exactly one fewer move, and hints from a sample of
 * other reachable states are legal too. Also checks 50 levels / 5 chapters
 * and timing of the whole BFS pass.
 */
import { LEVELS } from "../data/levels.js";
import { TOTAL_LEVELS, getLevel } from "../data/index.js";
import { CHAPTERS, LEVELS_PER_CHAPTER } from "../data/chapters.js";
import { validateLevel } from "../engine/validate.js";
import { solve, hintMove } from "../engine/solver.js";
import { applyMove, initialState, isSolved, moveBlockReason, generateNextStates, serializeState, totalWater } from "../engine/rules.js";

let bad = 0;
const t0 = performance.now();
const names = new Set();
if (TOTAL_LEVELS !== 50) { console.error(`expected 50 levels, found ${TOTAL_LEVELS}`); bad++; }
if (CHAPTERS.length * LEVELS_PER_CHAPTER !== TOTAL_LEVELS) { console.error("chapters × levels ≠ total"); bad++; }

for (let id = 1; id <= TOTAL_LEVELS; id++) {
  const lv = getLevel(id);
  const errs = [];
  if (names.has(LEVELS[id - 1].name)) errs.push("duplicate name");
  names.add(LEVELS[id - 1].name);
  const v = validateLevel(lv);
  errs.push(...v.errors);
  if (v.ok) {
    // replay the shortest path; hint at every step must keep an optimal route
    let s = initialState(lv);
    for (let k = 0; k < v.solution.length; k++) {
      const h = hintMove(lv, s);
      if (!h || moveBlockReason(lv, s, h) !== null) { errs.push(`illegal hint at step ${k}`); break; }
      const after = applyMove(lv, s, h).state;
      const rest = solve(lv, after).moves;
      if (!rest || rest.length !== v.solution.length - k - 1) { errs.push(`hint at step ${k} is not on an optimal path`); break; }
      const r = applyMove(lv, s, v.solution[k]);
      if (!r) { errs.push(`solution move ${k} illegal`); break; }
      if (v.solution[k].kind === "pour" && totalWater(r.state) !== totalWater(s)) errs.push("water not conserved");
      s = r.state;
    }
    if (!isSolved(lv, s)) errs.push("solution does not solve");
    // hints from a sample of other reachable states
    const seen = new Set([serializeState(initialState(lv))]);
    let frontier = [initialState(lv)];
    let checked = 0;
    while (frontier.length && checked < 120) {
      const next = [];
      for (const st of frontier) {
        for (const { state } of generateNextStates(lv, st)) {
          const key = serializeState(state);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(state);
          if (isSolved(lv, state) || checked >= 120) continue;
          checked++;
          const h = hintMove(lv, state);
          if (h && moveBlockReason(lv, state, h) !== null) errs.push(`illegal hint from ${key}`);
        }
      }
      frontier = next;
    }
  }
  const mech = [];
  if (lv.valves.length) mech.push("valve");
  if (lv.tanks.some((t) => t.lock)) mech.push("lock");
  if (lv.tanks.some((t) => !t.pourOut)) mech.push("inlet");
  if (lv.tanks.some((t) => t.fill)) mech.push("fill");
  if (lv.tanks.some((t) => t.drain)) mech.push("drain");
  if (lv.targets.length > 1) mech.push("multi");
  const line = `${String(id).padStart(2)} ${lv.name.padEnd(18)} tanks=${lv.tanks.length} optimal=${String(v.optimal).padStart(2)} states=${String(v.explored ?? "-").padStart(4)} ${mech.join(",")}`;
  if (errs.length) {
    bad++;
    console.error(`✗ ${line}  ${errs.join("; ")}`);
  } else console.log(`✓ ${line}`);
}
console.log(`${TOTAL_LEVELS - bad} / ${TOTAL_LEVELS} levels valid · ${Math.round(performance.now() - t0)} ms`);
if (bad) process.exit(1);
