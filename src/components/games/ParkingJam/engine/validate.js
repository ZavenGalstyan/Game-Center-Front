/**
 * Parking Jam — structural + solvability validation of a compiled level.
 * Pure; used by tools/validateLevels.mjs (and cheap enough for dev asserts).
 */
import { DIRS, VEHICLE_TYPES, cellsOf } from "./level.js";
import { initialState, applyExit, isSolved, solve, peel, exitIsOpen } from "./logic.js";

export function validateLevel(level) {
  const errors = [];
  const { rows, cols } = level;
  const owner = new Map();
  const claim = (r, c, who) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) {
      errors.push(`${who} out of bounds at ${r},${c}`);
      return;
    }
    const k = `${r},${c}`;
    if (owner.has(k)) errors.push(`${who} overlaps ${owner.get(k)} at ${k}`);
    else owner.set(k, who);
  };

  const ids = new Set();
  for (const v of level.vehicles) {
    if (ids.has(v.id)) errors.push(`duplicate vehicle id ${v.id}`);
    ids.add(v.id);
    if (!DIRS[v.dir]) errors.push(`vehicle ${v.id}: bad direction ${v.dir}`);
    const t = VEHICLE_TYPES[v.type];
    if (!t) errors.push(`vehicle ${v.id}: unknown type ${v.type}`);
    else if (t.length !== v.length) errors.push(`vehicle ${v.id}: type ${v.type} needs length ${t.length}, has ${v.length}`);
    const horiz = v.dir === "left" || v.dir === "right";
    if (horiz !== (v.orientation === "horizontal")) errors.push(`vehicle ${v.id}: direction ${v.dir} vs ${v.orientation}`);
    for (const [r, c] of cellsOf(v)) claim(r, c, `vehicle ${v.id}`);
    if (!exitIsOpen(level, v)) errors.push(`vehicle ${v.id} faces a closed edge — it can never leave`);
  }
  for (const o of level.obstacles) {
    if (!["pillar", "planter", "barrier", "bollard"].includes(o.type)) errors.push(`obstacle ${o.id}: bad type ${o.type}`);
    for (let r = o.row; r < o.row + o.h; r++) for (let c = o.col; c < o.col + o.w; c++) claim(r, c, `obstacle ${o.id}`);
  }
  if (!level.vehicles.length) errors.push("level has no vehicles");

  let result = null;
  if (!errors.length) {
    const p = peel(level);
    const s = solve(level);
    if (!p.solvable) {
      errors.push(`UNSOLVABLE — stuck: ${p.stuck.map((i) => level.vehicles[i].id).join(" ")}`);
    }
    if (p.solvable !== s.solvable) errors.push(`solver disagreement (peel ${p.solvable}, dfs ${s.solvable})`);
    if (s.solvable) {
      // Replay the DFS solution through the very same move function the game uses.
      let st = initialState(level);
      for (const i of s.solution) {
        st = applyExit(level, st, i);
        if (!st) {
          errors.push(`solution replay failed at vehicle ${level.vehicles[i].id}`);
          break;
        }
      }
      if (st && !isSolved(st)) errors.push("solution replay did not clear the lot");
    }
    result = {
      solvable: s.solvable && p.solvable,
      solution: s.solution ? s.solution.map((i) => level.vehicles[i].id) : null,
      length: s.solution ? s.solution.length : 0,
      depth: p.layers.length,
      freeAtStart: p.layers[0] ? p.layers[0].length : 0,
    };
  }
  return { ok: errors.length === 0, errors, result };
}
