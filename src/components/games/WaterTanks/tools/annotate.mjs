/**
 * Water Tanks — design report for the campaign: BFS optimum per level, plus
 * the optimum with each special mechanic removed (shows whether a valve /
 * lock / limited use actually changes the puzzle) and the state-space size.
 *   node src/components/games/WaterTanks/tools/annotate.mjs [ids…]
 */
import { LEVELS } from "../data/levels.js";
import { compileLevel } from "../engine/level.js";
import { validateLevel } from "../engine/validate.js";
import { solve } from "../engine/solver.js";
import { initialState } from "../engine/rules.js";

const ids = process.argv.slice(2).map(Number);
const opt = (raw) => {
  try {
    const lv = compileLevel({ ...raw, optimal: undefined }, { id: 0 });
    const r = solve(lv, initialState(lv));
    return r.moves ? r.moves.length : "∞";
  } catch (e) { return "err"; }
};
const fmtMove = (lv, m) => (m.kind === "pour" ? `${lv.tanks[m.from].id}${lv.tanks[m.to].id}` : `${m.kind[0].toUpperCase()}${lv.tanks[m.tank].id}`);
LEVELS.forEach((raw, k) => {
  const id = k + 1;
  if (ids.length && !ids.includes(id)) return;
  const lv = compileLevel({ ...raw, optimal: undefined }, { id });
  const v = validateLevel(lv);
  const parts = [`${String(id).padStart(2)} ${raw.name.padEnd(18)} opt=${v.optimal ?? "-"} cfg=${raw.optimal ?? "-"}${v.ok ? "" : " !! " + v.errors.join("; ")} states=${v.explored ?? "-"}`];
  if (raw.valves?.length) parts.push(`noValve=${opt({ ...raw, valves: [] })}`);
  if (raw.tanks.some((t) => t.lock)) parts.push(`noLock=${opt({ ...raw, tanks: raw.tanks.map(({ lock, ...t }) => t) })}`);
  if (raw.tanks.some((t) => t.inlet)) parts.push(`noInlet=${opt({ ...raw, tanks: raw.tanks.map(({ inlet, ...t }) => t) })}`);
  if (raw.tanks.some((t) => Number.isInteger(t.fill) || Number.isInteger(t.drain))) {
    parts.push(`unlimited=${opt({ ...raw, tanks: raw.tanks.map((t) => ({ ...t, fill: t.fill ? true : undefined, drain: t.drain ? true : undefined })) })}`);
  }
  if (v.solution) parts.push(v.solution.map((m) => fmtMove(lv, m)).join(" "));
  console.log(parts.join("  "));
});
