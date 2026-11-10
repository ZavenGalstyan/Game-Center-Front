/**
 * Scripted solutions, one per level (see tools/bot.mjs for the step format).
 * Gauge / dish turns, valve orders and reflector turns are derived from the
 * level data so the route follows the clue, not a hand-counted guess. Pipe
 * boards are turned to the board's authored solution. The bot fights
 * whatever shows up on the way.
 */
import { LEVELS } from "../engine/levels.js";

const L = (id) => LEVELS[id - 1];

/** E presses to set every gauge / dish of `lock` to its code symbol. */
function panels(id, lock = "L") {
  const lv = L(id);
  const lk = lv.locks[lock];
  return lv.ents
    .filter((e) => (e.t === "panel" || e.t === "statue") && e.lock === lock)
    .map((e) => {
      const want = lk.symbols.indexOf(lk.code[e.idx]);
      const n = (want - (e.start ?? 0) + lk.symbols.length) % lk.symbols.length;
      return ["use", e.id, n];
    })
    .filter((s) => s[2] > 0);
}
/** Valves / generators of a sequence in their order (an empty one takes its part first). */
function gens(id, seq) {
  return L(id)
    .ents.filter((e) => e.t === "gen" && e.seq === seq)
    .sort((a, b) => a.order - b.order)
    .map((e) => ["use", e.id, e.fuse ? 2 : 1]);
}
/** Reflector presses to reach a parity (0 = "/", 1 = "\"). */
const prism = (id, pid, want) => {
  const e = L(id).ents.find((x) => x.id === pid);
  return ["use", pid, ((want - (e.rot ?? 0)) % 2 + 2) % 2];
};

export const ROUTES = {
  1: [["use", "breaker"], ["use", "note"], ["use", "pistol"], ["clear"], ["use", "locker"], ["use", "gate"], ["exit"]],
  2: [["use", "note"], ["use", "crate"], ["use", "gen", 2], ["use", "mlock"], ["use", "breaker"], ["exit"]],
  3: [["use", "laserSw"], ["use", "noteA"], ["use", "cab"], ["code", "kp"], ["use", "hatch"], ["use", "relic"], ["exit"]],
  4: [["use", "sign"], ["push", "b1", "e", 3], ["push", "b2", "e", 3], ["push", "b2", "s", 1], ["exit"]],
  5: [["use", "sign"], ["use", "locker"], ["use", "valve"], ["use", "gate"], ["exit"]],
  6: [["use", "harpoon"], ["use", "sign"], ...gens(6, "valves"), ["use", "hatch"], ["use", "relic"], ["exit"]],
  7: [["use", "log"], ["use", "crate"], ["use", "gen", 2], ["pipes", "board"], ["exit"]],
  8: [["use", "log"], ["use", "crate"], ["go", 9, 8], ...gens(8, "coolant"), ["use", "crW"], ["use", "crE"], ["use", "burner"], ["kill", "boss"], ["exit"]],
  9: [["use", "note"], ["use", "term"], ["use", "case"], ...panels(9, "P"), ["exit"]],
  10: [["use", "sign"], ["use", "term"], ["code", "kp"], ["use", "pulse"], ["use", "rack"], ["shoot", "n1"], ["shoot", "n2"], ["exit"]],
  11: [["use", "diag"], prism(11, "m1", 0), ["use", "card"], ["use", "hatch"], ["use", "relic"], ["use", "cab"], ["use", "m2"], prism(11, "m2", 0), ["exit"]],
  12: [["use", "log"], ["use", "crate"], ["go", 9, 8], ["shoot", "n1"], ["shoot", "n2"], ["shoot", "n3"], prism(12, "mirror", 0), ["kill", "boss"], ["exit"]],
  13: [["use", "note"], ["use", "cab"], ["kill", "b1"], ["use", "s3"], ["use", "red"], ["use", "caseR"], ["use", "caseW"], ["use", "an"], ["use", "aterm"], ["code", "kp"], ["exit"]],
  14: [["use", "sign"], ...gens(14, "ballast"), ["use", "hatch"], ["use", "case"], ["pipes", "board"], ["exit"]],
  15: [["use", "diag"], ["push", "crateB", "e", 4], ["use", "relic"], ...panels(15, "D"), ["use", "comms"], ["exit"]],
  16: [["use", "log"], ["use", "crate"], ["go", 9, 8], ["pipes", "board"], ...gens(16, "regen"), ["kill", "boss"], ["exit"]],
  17: [["use", "office"], ["use", "rterm"], ...panels(17, "R"), ["code", "safe"], ["use", "vault"], ["use", "core"], ["use", "chip"], ["exit"]],
  18: [["use", "memoA"], ["pipes", "board"], ["use", "locker"], ["code", "kp"], ["use", "cannon"], ["shoot", "n1"], ["shoot", "n2"], ["shoot", "n3"], ["exit"]],
  19: [["use", "plan"], ["use", "crB"], ["use", "genA", 2], ["use", "crA"], ["use", "genB", 2], ["use", "valve"], ["use", "bay"], ["use", "hatch"], ["use", "case"], ["use", "launch"], ["use", "launch"], ["exit"]],
  20: [["use", "log"], ["use", "crate"], ["go", 10, 10], ["shoot", "a1"], ["shoot", "a2"], ["shoot", "a3"], ["use", "crA"], ["use", "crB"], ["use", "crC"], ["use", "engine"], ["kill", "boss"], ["use", "vent"], ["exit"]],
};
export { panels, gens, prism };
