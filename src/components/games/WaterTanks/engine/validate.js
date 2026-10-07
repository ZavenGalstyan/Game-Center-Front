/**
 * Water Tanks — static + solver validation of one compiled level.
 * Returns { ok, errors: string[], optimal, solution }. Used by
 * tools/validateLevels.mjs (every campaign level) and in DEV on load.
 */
import { initialState, totalWater } from "./rules.js";
import { solve } from "./solver.js";

export function validateLevel(level) {
  const errors = [];
  const n = level.tanks.length;
  if (n < 2 || n > 6) errors.push(`needs 2–6 tanks, has ${n}`);
  const ids = new Set(level.tanks.map((t) => t.id));
  if (ids.size !== n) errors.push("duplicate tank ids");

  level.tanks.forEach((t) => {
    if (!Number.isInteger(t.capacity) || t.capacity <= 0) errors.push(`${t.id}: capacity must be a positive integer`);
    if (!Number.isInteger(t.initial) || t.initial < 0) errors.push(`${t.id}: initial must be an integer ≥ 0`);
    if (t.initial > t.capacity) errors.push(`${t.id}: initial above capacity`);
    if (t.lock) {
      if (!(t.lock.tank >= 0 && t.lock.tank < n)) errors.push(`${t.id}: lock references a missing tank`);
      else if (t.lock.tank === t.index) errors.push(`${t.id}: lock references itself`);
      else if (level.tanks[t.lock.tank].lock) errors.push(`${t.id}: lock depends on another locked tank`);
      else if (t.lock.amount > level.tanks[t.lock.tank].capacity) errors.push(`${t.id}: lock amount above capacity`);
    }
  });

  if (!level.targets.length) errors.push("no targets");
  level.targets.forEach((t, k) => {
    if (!Number.isInteger(t.amount) || t.amount <= 0) errors.push(`target ${k}: amount must be a positive integer`);
    if (t.tank !== null) {
      if (!(t.tank >= 0 && t.tank < n)) errors.push(`target ${k}: references a missing tank`);
      else if (t.amount > level.tanks[t.tank].capacity) errors.push(`target ${k}: above that tank's capacity`);
    } else if (!level.tanks.some((tk) => tk.capacity >= t.amount)) {
      errors.push(`target ${k}: no tank can hold ${t.amount} L`);
    }
  });
  const bound = level.targets.filter((t) => t.tank !== null).map((t) => t.tank);
  if (new Set(bound).size !== bound.length) errors.push("two targets on the same tank");

  const pairs = new Set();
  level.valves.forEach((v) => {
    if (!(v.from >= 0 && v.from < n && v.to >= 0 && v.to < n) || v.from === v.to) errors.push("valve references invalid tanks");
    const key = [v.from, v.to].sort().join("-");
    if (pairs.has(key)) errors.push("two valves on the same pair");
    pairs.add(key);
  });

  if (errors.length) return { ok: false, errors, optimal: null, solution: null };

  const start = initialState(level);
  const hasSourceOrSink = level.tanks.some((t) => t.fill || t.drain);
  if (!hasSourceOrSink && totalWater(start) === 0) errors.push("no water and no fill valve");
  const res = solve(level, start);
  if (res.capped) errors.push(`solver guard tripped (${res.explored} states)`);
  if (!res.moves) errors.push("UNSOLVABLE");
  else if (res.moves.length === 0) errors.push("already solved at start");
  const optimal = res.moves ? res.moves.length : null;
  if (optimal !== null && level.optimalMoves !== null && level.optimalMoves !== optimal) {
    errors.push(`optimalMoves ${level.optimalMoves} ≠ solver ${optimal}`);
  }
  return { ok: errors.length === 0, errors, optimal, solution: res.moves, explored: res.explored };
}
