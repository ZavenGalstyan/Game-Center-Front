/**
 * Scripted solutions, one per level (see tools/bot.mjs for the step format).
 * Dial and statue presses are derived from the level data so the route
 * follows the code / target the clue describes, not a hand-counted guess.
 */
import { LEVELS } from "../engine/levels.js";
import { DIR_ORDER } from "../engine/constants.js";

const L = (id) => LEVELS[id - 1];

/** E presses to turn every dial of `lock` to its code symbol. */
function dials(id, lock = "L") {
  const lv = L(id);
  const lk = lv.locks[lock];
  return lv.ents
    .filter((e) => e.t === "dial" && e.lock === lock)
    .map((e) => {
      const want = lk.symbols.indexOf(lk.code[e.idx]);
      const n = (want - (e.start ?? 0) + lk.symbols.length) % lk.symbols.length;
      return ["use", e.id, n];
    })
    .filter((s) => s[2] > 0);
}
/** E presses to turn a statue to its target. */
function statue(id, sid) {
  const e = L(id).ents.find((x) => x.id === sid);
  const n = (DIR_ORDER.indexOf(e.target) - DIR_ORDER.indexOf(e.face) + 4) % 4;
  return ["use", sid, n];
}

export const ROUTES = {
  1: [["use", "jarB"], ["use", "door"], ["exit"]],
  2: [["use", "urn"], ["use", "chest"], ["use", "door"], ["exit"]],
  3: [...dials(3), ["exit"]],
  4: [["use", "basket"], ...dials(4), ["use", "chest"], ["use", "doorA"], ["exit"]],
  5: [["use", "jarB"], ["use", "gate"], ...dials(5), ["exit"]],
  6: [statue(6, "sA"), statue(6, "sB"), statue(6, "sC"), statue(6, "sD"), ["exit"]],
  7: [
    ["push", "bA", "w", 1],
    ["push", "bA", "n", 2],
    ["push", "bB", "e", 1],
    ["push", "bB", "n", 2],
    ["exit"],
  ],
  8: [["use", "jar"], ["use", "stone"], ["use", "sarc"], ["use", "door"], ["exit"]],
  9: [
    ["use", "urn"],
    ["use", "gateR"],
    ["use", "feather"],
    ["use", "jar"],
    statue(9, "horus"),
    ["use", "chest"],
    ["use", "pedA"],
    ["use", "pedB"],
    ["use", "pedC"],
    ["exit"],
  ],
  10: [
    ["push", "blk", "w", 2],
    ["push", "blk", "n", 4],
    ["push", "blk", "w", 1],
    statue(10, "sA"),
    statue(10, "sB"),
    ["use", "eye"],
    ["use", "altar"],
    ["exit"],
  ],
  11: [["use", "m1"], ["use", "m2"], ["exit"]],
  12: [["use", "lever"], ["use", "jar"], ["use", "door"], ["exit"]],
  13: [["use", "jar"], ["push", "blk", "n", 2], ["use", "sarc"], ["use", "stand", 2], ["exit"]],
  14: [["use", "chest"], ["use", "door"], ["exit"]],
  15: [
    ["use", "sconce"],
    ["use", "fA"],
    ["use", "fB"],
    ["use", "lever"],
    ["use", "m1"],
    ["use", "m2"],
    ["use", "m3"],
    ["exit"],
  ],
  16: [
    ["push", "blk", "w", 1],
    ["push", "blk", "n", 1],
    ["use", "sconce"],
    ["use", "moon"],
    ["use", "water"],
    ["use", "lotus"],
    ["use", "sunf"],
    ["exit"],
  ],
  17: [
    ["use", "jar"],
    ["use", "gateW"],
    ...dials(17),
    ["use", "lever"],
    ["use", "m1"],
    ["use", "m2"],
    ["use", "lotus"],
    ["use", "moonStone"],
    ["use", "sockL"],
    ["use", "sockM"],
    ["exit"],
  ],
  18: [["use", "chest"], ["use", "gateS"], ["use", "stone"], ["use", "sarc"], ["use", "gold"], ["exit"]],
  19: [
    ["push", "blk", "w", 2],
    ["use", "chestA"],
    ["use", "m1"],
    ["use", "m2"],
    ["use", "doorC"],
    ...dials(19, "V"),
    ["exit"],
  ],
  20: [
    ["use", "sconce"],
    ["use", "fSun"],
    ["use", "fMoon"],
    ["use", "fWater"],
    ["use", "chest"],
    ["use", "scroll"],
    ...dials(20),
    ["use", "flail"],
    ["use", "sockC"],
    ["use", "sockF"],
    ["use", "heart"],
    ["exit"],
  ],
};
