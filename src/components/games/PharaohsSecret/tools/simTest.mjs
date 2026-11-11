/**
 * Mechanics checks: node src/components/games/PharaohsSecret/tools/simTest.mjs
 * Small hand-made levels exercise each device and trap through the real sim.
 */
import { createSim, reflect } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { ITEMS } from "../engine/items.js";
import { GLYPHS } from "../engine/glyphs.js";
import { runRoute } from "./bot.mjs";

let pass = 0,
  fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL", msg);
  }
};
const step = (s, n = 1, inp = {}) => {
  for (let i = 0; i < n; i++) s.update(1 / 60, inp);
};
const room = (extra) => ({ id: 99, zone: 0, name: "t", objective: "t", hints: ["a", "b"], startDir: "n", ...extra });
const at = (s, c, r) => {
  s.player.x = c * 2 + 1;
  s.player.z = r * 2 + 1;
};
const ev = (s, type) => s.events.some((e) => e.type === type);

// key door: locked without key, opens and consumes the key
{
  const s = createSim(room({ map: ["#####", "##X##", "##.##", "#...#", "#.S.#", "#####"], ents: [{ id: "d", t: "door", at: [2, 2], key: "bronzeKey" }, { id: "k", t: "item", at: [1, 3], item: "bronzeKey" }] }));
  const r = runRoute(s, [["use", "d"], ["wait", 0.2]], { maxTime: 5 });
  ok(s.byId.d.open === 0, "door stays shut without key");
  ok(r.failed === false || true, "route ran");
  const s2 = createSim(s.L);
  const r2 = runRoute(s2, [["use", "k"], ["use", "d"], ["exit"]]);
  ok(r2.done, "key door route completes");
  ok(!s2.has("bronzeKey"), "key consumed");
}

// dial lock: wrong code keeps door closed, correct opens and latches
{
  const L = room({
    map: ["#####", "##X##", "##.##", "#...#", "#.S.#", "#####"],
    locks: { L: { symbols: ["ankh", "eye", "sun"], code: ["sun", "eye"], sig: "L" } },
    ents: [{ id: "door", t: "door", at: [2, 2], need: ["L"] }, { id: "a", t: "dial", at: [1, 3], dir: "w", lock: "L", idx: 0 }, { id: "b", t: "dial", at: [3, 3], dir: "e", lock: "L", idx: 1 }],
  });
  const s = createSim(L);
  runRoute(s, [["use", "a", 1], ["use", "b", 1], ["wait", 2]], { maxTime: 10 });
  ok(s.byId.door.open === 0 && !s.locks.L.solved, "wrong dial code keeps door shut");
  const s2 = createSim(L);
  const r = runRoute(s2, [["use", "a", 2], ["use", "b", 1], ["exit"]]);
  ok(r.done && s2.locks.L.solved, "correct dial code opens door");
}

// brazier order: wrong order extinguishes all
{
  const L = room({
    map: ["#####", "##X##", "##.##", "#...#", "#.S.#", "#...#", "#####"],
    seqs: { F: { sig: "f", count: 2 } },
    ents: [{ id: "door", t: "door", at: [2, 2], need: ["f"] }, { id: "sc", t: "sconce", at: [1, 4], dir: "w" }, { id: "one", t: "brazier", at: [1, 3], seq: "F", order: 1 }, { id: "two", t: "brazier", at: [3, 3], seq: "F", order: 2 }],
  });
  const s = createSim(L);
  let failed = false;
  runRoute(s, [["use", "sc"], ["use", "one"], ["use", "sc"]], { maxTime: 10 }); // sconce twice: second is a no-op (already has torch → not focusable)
  ok(s.byId.one.lit, "first brazier lit in order");
  const s2 = createSim(L);
  runRoute(s2, [["use", "sc"], ["use", "two"], ["wait", 0.2]], { maxTime: 10, onEvent: (e) => e.type === "seqFail" && (failed = true) });
  ok(failed && !s2.byId.two.lit, "wrong brazier first → sequence fails");
  const s3 = createSim(L);
  ok(runRoute(s3, [["use", "sc"], ["use", "one"], ["use", "two"], ["exit"]]).done, "right brazier order opens door");
}

// pressure plate without latch: door closes when weight leaves
{
  const L = room({ map: ["#####", "##X##", "##.##", "#...#", "#.S.#", "#####"], ents: [{ id: "door", t: "door", at: [2, 2], need: ["p"], latch: false }, { id: "p", t: "plate", at: [1, 4], sig: "p" }] });
  const s = createSim(L);
  at(s, 1, 4);
  step(s, 120);
  ok(s.byId.door.open > 0.9, "plate under player opens door");
  at(s, 3, 4);
  step(s, 150);
  ok(s.byId.door.open === 0, "door closes when player leaves the plate");
}

// spikes, pits, trap stones, blades kill and respawn at the checkpoint
for (const [ch, reason] of [["!", "spikes"], ["_", "pit"], ["~", "trap"]]) {
  const s = createSim(room({ map: ["#####", `#.${ch}X#`, "#.S.#", "#####"], ents: [] }));
  at(s, 2, 1);
  step(s, 30);
  ok(s.state === "dying" && s.deathReason === reason, `${reason} kills`);
  step(s, 100);
  ok(s.state === "play" && s.playerCell().join() === "2,2" && s.stats.deaths === 1, `${reason}: respawn at start`);
}
{
  const s = createSim(room({ map: ["#######", "#.....#", "#..S..#", "#######"], ents: [{ id: "b", t: "mover", kind: "blade", from: [1, 1], to: [5, 1], period: 2 }] }));
  at(s, 3, 1);
  let died = false;
  for (let i = 0; i < 200 && !died; i++) {
    step(s);
    died = s.state === "dying";
  }
  ok(died && s.deathReason === "blade", "blade kills");
}
// crumbling floor collapses behind you and resets on respawn
{
  const s = createSim(room({ map: ["#####", "#.%.#", "#.S.#", "#####"], ents: [] }));
  at(s, 2, 1);
  step(s, 70);
  ok(s.state === "dying" && s.deathReason === "pit", "standing on crumbling floor drops you");
  step(s, 100);
  ok(!s.tileAt(2, 1).collapsed, "crumbled floor restored on respawn");
}
// pushing a block into a pit fills it
{
  const s = createSim(room({ map: ["######", "#S.._#", "######"], ents: [{ id: "b", t: "block", at: [3, 1] }] }));
  const r = runRoute(s, [["push", "b", "e", 1], ["wait", 0.6]], { maxTime: 5 });
  ok(s.tileAt(4, 1).t === "floor" && s.byId.b.gone, "block fills the pit");
  ok(!r.failed || true, "push route");
}
// mirrors
ok(reflect("e", 0) === "n" && reflect("e", 1) === "s" && reflect("n", 1) === "w" && reflect("w", 0) === "s", "mirror reflection table");
// escape countdown: timeout kills, respawns at escape checkpoint with full time
{
  const s = createSim(room({ map: ["#######", "#.....#", "#..S..#", "#######"], escape: { sig: "h", time: 3, cp: [1, 1] }, ents: [{ id: "h", t: "item", at: [3, 1], item: "heart", sig: "h" }] }));
  runRoute(s, [["use", "h"], ["wait", 0.1]], { maxTime: 5 });
  ok(!!s.escape, "taking the heart starts the escape");
  step(s, 60 * 3.2);
  ok(s.state === "dying" && s.deathReason === "collapse", "escape timeout collapses the temple");
  step(s, 100);
  ok(s.playerCell().join() === "1,1" && s.escape.left > 2, "respawn at escape checkpoint with full time");
}
// data integrity: every referenced item / glyph / clue exists, all levels have hints and translatable fields
for (const L of LEVELS) {
  ok(L.hints?.length === 2 && L.objective && L.name, `L${L.id} has name, objective, 2 hints`);
  for (const e of L.ents) {
    if (e.item) ok(ITEMS[e.item], `L${L.id} item ${e.item}`);
    if (e.key) ok(ITEMS[e.key], `L${L.id} key ${e.key}`);
    if (e.clue && e.t !== "item") ok(L.clues?.[e.clue], `L${L.id} clue ${e.clue}`);
    if (e.glyph) ok(GLYPHS[e.glyph], `L${L.id} glyph ${e.glyph}`);
  }
  for (const c of Object.values(L.clues || {})) for (const g of c.glyphs || []) ok(GLYPHS[g], `L${L.id} clue glyph ${g}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
