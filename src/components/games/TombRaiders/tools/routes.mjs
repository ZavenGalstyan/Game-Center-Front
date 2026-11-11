/**
 * Scripted solutions, one per level (see tools/bot.mjs for the step format).
 * Tablet / statue turns, brazier orders and mirror turns are derived from the
 * level data so the route follows the clue, not a hand-counted guess. The bot
 * fights whatever shows up on the way.
 */
import { LEVELS } from "../engine/levels.js";

const L = (id) => LEVELS[id - 1];

/** E presses to set every tablet / statue of `lock` to its code symbol. */
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
/** Braziers of a sequence in their order (an empty one takes oil first). */
function gens(id, seq) {
  return L(id)
    .ents.filter((e) => e.t === "gen" && e.seq === seq)
    .sort((a, b) => a.order - b.order)
    .map((e) => ["use", e.id, e.fuse ? 2 : 1]);
}
/** Mirror presses to reach a parity (0 = "/", 1 = "\"). */
const prism = (id, pid, want) => {
  const e = L(id).ents.find((x) => x.id === pid);
  return ["use", pid, ((want - (e.rot ?? 0)) % 2 + 2) % 2];
};

export const ROUTES = {
  1: [["use", "lever"], ["use", "bow"], ["clear"], ["use", "chest"], ["use", "gate"], ["exit"]],
  2: [["use", "scroll"], ["use", "mural"], ...panels(2), ["clear"], ["exit"]],
  3: [["use", "flameLever"], ["push", "b1", "e", 3], ["clear"], ["use", "brick"], ["use", "relic"], ["exit"]],
  4: [["use", "insc"], ["use", "urn"], ...gens(4, "dawn"), ["clear"], ["exit"]],
  5: [["use", "fragA"], ["use", "u1"], ["use", "gate"], ["use", "fragB"], ["code", "kp"], ["exit"]],
  6: [["use", "j1"], ["use", "sarc"], ["use", "valve"], ["use", "brick"], ["use", "relic"], ["use", "urn"], ["use", "altar"], ["exit"]],
  7: [["use", "mural"], ...panels(7, "S"), ["use", "chest"], ["use", "tombGate"], ["use", "blaster"], ["clear"], ["use", "tombLever"], ["exit"]],
  8: [["use", "scroll"], ["use", "brick"], ["go", 18, 4], ["use", "mural"], ...panels(8, "G"), ["use", "chest"], ["use", "scarabDoor"], ["exit"]],
  9: [["push", "b1", "s", 3], ["push", "b2", "e", 2], ["push", "b2", "n", 3], ["clear"], ["use", "brick"], ["use", "relic"], ["exit"]],
  10: [["use", "scroll"], ["use", "urn"], ["kill", "g1"], ["use", "gear2"], ["use", "mech"], ["use", "trap"], ["use", "sarc"], ["code", "kp"], ["exit"]],
  11: [["use", "tablet"], prism(11, "m1", 1), ["use", "chest"], ["use", "m2"], prism(11, "m2", 1), ["exit"]],
  12: [["use", "tablet"], prism(12, "mA", 1), prism(12, "mB", 1), ["use", "chest"], ["use", "gate"], ["use", "shutter"], ["use", "basket"], ["kill", "r2"], ["use", "mirror"], ["use", "mC"], prism(12, "mC", 0), prism(12, "mD", 0), ["use", "vault"], ["exit"]],
  13: [["use", "insc"], ["use", "urn"], ["go", 9, 8], ...gens(13, "fires"), prism(13, "mirror", 0), ["kill", "boss"], ["exit"]],
  14: [["use", "tablet"], ["push", "b1", "s", 2], ["use", "relic"], prism(14, "mirror", 1), ["push", "b2", "w", 4], ["push", "b2", "n", 2], ["exit"]],
  15: [prism(15, "m1", 1), prism(15, "m2", 0), ["use", "dial"], ["code", "kp"], ["use", "mural"], ...panels(15, "S"), ["exit"]],
  16: [["use", "scroll"], ["use", "chest"], ["use", "goldDoor"], ["use", "staff"], ["clear"], ["shoot", "n1"], ["shoot", "n2"], ["exit"]],
  17: [["use", "tablet"], ["use", "lA"], ["go", 8, 2], ["use", "lB"], ["go", 14, 3], ["use", "idol"], ["use", "lC"], ["go", 20, 2], ["use", "pedestal"], ["exit"]],
  18: [["use", "insc"], ["use", "urnA"], ["go", 11, 10], ["use", "urn"], ["kill", "e1"], ["use", "gear2"], ["use", "mech"], ["shoot", "c1"], ["shoot", "c2"], ["kill", "boss"], ["use", "key"], ["use", "vault"], ["exit"]],
  19: [["use", "tablet"], ["use", "fragA"], ["use", "chestN"], ["use", "chestW"], ["use", "fragB"], ["use", "goldDoor"], ["use", "fragC"], ["code", "kp"], ["exit"]],
  20: [["use", "scroll"], ["use", "urnW"], ["use", "brick"], ["use", "chestE"], ["kill", "e1"], ["use", "gear3"], ["use", "mech"], ["use", "mural"], ...gens(20, "fires"), ...panels(20, "S"), ["use", "sealChest"], ["use", "exitDoor"], ["exit"]],
  21: [["use", "mural"], ["use", "air"], ["use", "urnS"], ["code", "kp"], ["use", "scepter"], ["use", "urnV"], ["use", "brick"], ["use", "relic"], ["shoot", "x3"], ["shoot", "x1"], ["shoot", "x2"], ["exit"]],
  22: [["use", "insc"], ["use", "urnA"], ["go", 11, 9], ["use", "sA"], ["use", "sB"], ["use", "sC"], ["use", "altar"], ["shoot", "k1"], ["shoot", "k2"], ["kill", "boss"], ["exit"]],
  23: [prism(23, "m1", 0), prism(23, "m2", 0), ["use", "scales"], ...panels(23, "G"), ["kill", "e1"], ["use", "idol"], ["use", "mural"], ...panels(23, "S"), ["use", "pedestal"], ["exit"]],
  24: [["use", "tablet"], ["push", "b1", "s", 2], prism(24, "m1", 1), ["use", "insc"], ["push", "b2", "e", 2], ["push", "b2", "s", 2], ["code", "kp"], ["use", "sarc"], ["exit"]],
  25: [["use", "insc"], ["use", "urn"], ["go", 10, 10], ...gens(25, "fires"), ["shoot", "a1"], ["shoot", "a2"], ["shoot", "a3"], ["kill", "boss"], ["use", "evac"], ["exit"]],
};
export { panels, gens, prism };
