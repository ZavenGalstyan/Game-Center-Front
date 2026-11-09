/**
 * Scripted solutions, one per level (see tools/bot.mjs for the step format).
 * Panel presses and prism turns are derived from the level data so the route
 * follows the clue, not a hand-counted guess. The bot fights whatever shows
 * up on the way.
 */
import { LEVELS } from "../engine/levels.js";

const L = (id) => LEVELS[id - 1];

/** E presses to set every panel of `lock` to its code symbol. */
function panels(id, lock = "L") {
  const lv = L(id);
  const lk = lv.locks[lock];
  return lv.ents
    .filter((e) => e.t === "panel" && e.lock === lock)
    .map((e) => {
      const want = lk.symbols.indexOf(lk.code[e.idx]);
      const n = (want - (e.start ?? 0) + lk.symbols.length) % lk.symbols.length;
      return ["use", e.id, n];
    })
    .filter((s) => s[2] > 0);
}
/** Generators of a sequence in their order. */
function gens(id, seq) {
  return L(id)
    .ents.filter((e) => e.t === "gen" && e.seq === seq)
    .sort((a, b) => a.order - b.order)
    .map((e) => ["use", e.id, e.fuse ? 2 : 1]);
}
/** Prism presses to reach a parity (0 = "/", 1 = "\"). */
const prism = (id, pid, want) => {
  const e = L(id).ents.find((x) => x.id === pid);
  return ["use", pid, ((want - (e.rot ?? 0)) % 2 + 2) % 2];
};

export const ROUTES = {
  1: [["use", "release"], ["use", "pistol"], ["clear"], ["use", "locker"], ["use", "liftDoor"], ["exit"]],
  2: [["use", "poster"], ["use", "locker"], ["code", "kp"], ["clear"], ["exit"]],
  3: [["use", "lockerA"], ["use", "lockerB"], ["use", "secDoor"], ["use", "term"], ["exit"]],
  4: [["use", "board"], ["use", "b1"], ["use", "b2"], ["use", "b3"], ["use", "b4"], ["clear"], ["exit"]],
  5: [["use", "noteA"], ["use", "locker"], ["use", "yDoor"], ["use", "noteB"], ["code", "kp"], ["exit"]],
  6: [["use", "locker"], ["use", "gen", 2], ["clear"], ["exit"]],
  7: [["use", "locker"], ["use", "armDoor"], ["use", "rifle"], ["use", "mon"], ...panels(7), ["exit"]],
  8: [["use", "log"], ...gens(8, "g"), ["clear"], ["exit"]],
  9: [["use", "s1"], ["use", "brk"], ["use", "crate"], ["use", "s2"], ["use", "ana"], ["clear"], ["exit"]],
  10: [["use", "locker"], prism(10, "pA", 1), ["use", "pB"], prism(10, "pB", 0), ["kill", "boss"], ["exit"]],
  11: [["use", "nurse"], ["use", "board"], ["use", "valve"], ["use", "pharm"], ["code", "kp"], ["exit"]],
  12: [["use", "cab"], ["use", "poster"], ["use", "vault"], ["use", "shotgun"], ...panels(12), ["exit"]],
  13: [["use", "locker"], ["use", "term", 2], ["code", "kp"], ["exit"]],
  14: [["use", "linen"], ["use", "vent"], ["use", "valve"], ["use", "s3"], ["use", "cellDoor"], ["use", "s1"], ["use", "s2"], ["use", "ana"], ["exit"]],
  15: [["use", "cab"], ["go", 9, 5], ["kill", "boss"], ["use", "card"], ["use", "lift"], ["exit"]],
  16: [["use", "pow"], ["clear"], prism(16, "pA", 1), prism(16, "pB", 0), prism(16, "pC", 1), ["exit"]],
  17: [["use", "mon"], ["code", "kp"], ["use", "ion"], ["clear"], ["shoot", "n1"], ["shoot", "n2"], ["shoot", "n3"], ["exit"]],
  18: [["use", "locker"], ["use", "gC"], ...gens(18, "cryo").map((s) => ["use", s[1], 1]), ["exit"]],
  19: [["use", "s1"], ["go", 8, 3], ["clear"], ["use", "pen1"], ["use", "s2"], ["go", 14, 3], ["clear"], ["use", "smp2"], ["use", "s3"], ["use", "ana"], ["exit"]],
  20: [["use", "cab"], ["go", 9, 8], ["shoot", "t1"], ["shoot", "t2"], ["use", "purge"], ["kill", "boss"], ["exit"]],
  21: [["use", "hint"], ...panels(21), ["use", "dirLocker"], ["use", "secDoor"], ["use", "term"], ["code", "kp"], ["exit"]],
  22: [["use", "v1"], ["use", "v2"], ...gens(22, "pumps"), ["shoot", "node"], ["exit"]],
  23: [["use", "f1"], ["use", "f2"], ["use", "vent"], ["use", "f3"], ["use", "safe"], ["code", "kp"], ["exit"]],
  24: [["use", "circ"], ["use", "t1", 2], ["use", "crate"], ["use", "gen", 2], ["use", "t2"], ["use", "omega"], ["code", "kp"], ["use", "exitDoor"], ["exit"]],
  25: [["use", "cab"], ["go", 11, 8], ...gens(25, "core"), ["shoot", "n1"], ["shoot", "n2"], ["kill", "boss"], ["use", "evac"], ["exit"]],
};
