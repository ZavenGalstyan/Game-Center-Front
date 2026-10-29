/**
 * Headless mechanic tests:  node src/components/games/FeatherFury/tools/simTest.mjs
 * Slingshot limits, launch rules, each ability (once, airborne only), blast
 * damage, win/loss timing, restart determinism, cleanup (no leaked bodies or
 * listeners), tunnelling at top speed, settling after random shots, and the
 * localStorage save format.
 */
import { LEVELS } from "../data/levels.js";
import { makeLevel } from "../data/builders.js";
import * as E from "../engine/game.js";
import { loadProgress, saveProgress, recordWin, SAVE_KEY, LEVEL_COUNT } from "../engine/save.js";
import { pullOf } from "./replay.mjs";
import { readFileSync } from "node:fs";

const SOL = JSON.parse(readFileSync(new URL("./solutions.json", import.meta.url), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
};
const section = (s) => console.log("•", s);
const bodiesExpected = (g) => g.blocks.length + g.enemies.length + g.terrain.length;
const run = (g, n) => {
  for (let i = 0; i < n; i++) E.step(g);
};
const custom = (birds, build) => makeLevel({ id: 99, world: 0, name: "test", birds, build });

section("slingshot");
{
  const p = E.clampPull(-500, 300);
  ok(Math.abs(Math.hypot(p.x, p.y) - E.MAX_PULL) < 1e-9, "pull is clamped to MAX_PULL");
  const v = E.launchVelocity(E.clampPull(-E.MAX_PULL, 0));
  ok(Math.abs(v.x - E.MAX_SPEED) < 1e-9 && v.y === 0, "full horizontal pull fires at MAX_SPEED forward");
  const pts = E.previewPath(E.clampPull(-60, 40));
  ok(pts.length > 5 && pts[1].x > pts[0].x, "preview path goes forward");
  const g = E.createGame(LEVELS[0]);
  ok(!E.launch(g, { x: -5, y: 3 }), "tiny pull is not a launch");
  ok(g.next === 0 && g.state === "ready", "…and keeps the bird");
  ok(E.launch(g, pullOf({ a: 20, p: 0.9 })), "real pull launches");
  ok(!E.launch(g, pullOf({ a: 20, p: 0.9 })), "cannot launch while a bird is flying");
  ok(g.world.bodies.length === bodiesExpected(g) + 1, "exactly one bird body in the world");
  ok(!E.triggerAbility(g), "red has no ability");
  E.runUntilIdle(g);
  ok(g.world.bodies.length === bodiesExpected(g), "spent bird removed");
  E.destroyGame(g);
}

section("abilities");
{
  const def = custom(["yellow", "blue", "black"], (b) => {
    b.hut("wood", 1300, 0);
  });
  // yellow: one dash, then nothing
  let g = E.createGame(def);
  E.launch(g, pullOf({ a: 30, p: 0.8 }));
  run(g, 10);
  const s0 = g.shot.birds[0].body.speed;
  ok(E.triggerAbility(g), "yellow dash fires");
  ok(g.shot.birds[0].body.speed > s0 * 1.3 && g.shot.birds[0].body.speed <= 30.0001, "dash speeds up (capped at 30)");
  ok(!E.triggerAbility(g), "dash only once");
  E.runUntilIdle(g);
  // blue: split into 3, all cleaned up
  ok(g.state === "ready" && E.currentBird(g) === "blue", "next bird is blue");
  E.launch(g, pullOf({ a: 30, p: 0.8 }));
  run(g, 15);
  ok(E.triggerAbility(g), "blue split fires");
  ok(g.shot.birds.length === 3 && g.world.bodies.length === bodiesExpected(g) + 3, "three birds, three bodies");
  ok(!E.triggerAbility(g), "split only once");
  E.runUntilIdle(g);
  ok(g.world.bodies.length === bodiesExpected(g), "all three split birds removed");
  // black: no ability after touching; fuse explodes it
  E.launch(g, pullOf({ a: 5, p: 0.5 }));
  let touched = false;
  for (let i = 0; i < 400 && g.shot; i++) {
    E.step(g);
    if (g.shot?.touched && !touched) {
      touched = true;
      ok(!E.triggerAbility(g), "no ability after the bird touched something");
    }
  }
  ok(touched, "black bird touched the ground");
  ok(!g.shot, "fuse exploded the black bird");
  E.runUntilIdle(g);
  E.destroyGame(g);
  // black tapped mid-air next to stone breaks it
  g = E.createGame(custom(["black", "red"], (b) => {
    b.box("stone", 700, 0, 40, 40);
    b.hut("wood", 1300, 0);
  }));
  E.launch(g, pullOf({ a: 8, p: 0.62 }));
  let exploded = false;
  for (let i = 0; i < 300 && g.shot; i++) {
    const bd = g.shot.birds[0].body;
    if (!exploded && Math.abs(bd.position.x - 700) < 60) exploded = E.triggerAbility(g);
    E.step(g);
  }
  ok(exploded, "black bird exploded in the air");
  ok(g.broken >= 1, "blast broke the stone block");
  E.destroyGame(g);
}

section("win / loss");
{
  // win: the solver's line for 1-1, and the win waits for settling
  const g = E.createGame(LEVELS[0]);
  E.launch(g, pullOf(SOL[1].shots[0]));
  let killedAt = -1, wonAt = -1;
  for (let i = 0; i < 1500 && g.state !== "won" && g.state !== "lost"; i++) {
    E.step(g);
    if (killedAt < 0 && g.defeated === g.totalEnemies) killedAt = i;
    if (g.state === "won") wonAt = i;
  }
  if (g.state === "won") {
    ok(wonAt - killedAt >= 25, `win waits for the dust to settle (${wonAt - killedAt} steps)`);
    ok(g.result.spare === 1 && g.result.bonus === E.BIRD_BONUS, "spare bird bonus");
    ok(g.score === g.result.score && g.result.stars >= 1, "result recorded");
  } else ok(false, "1-1 reference shot should win (got " + g.state + ")");
  E.destroyGame(g);
  // loss: both birds wasted into the sky
  const h = E.createGame(LEVELS[0]);
  E.launch(h, pullOf({ a: 80, p: 0.4 }));
  E.runUntilIdle(h);
  E.launch(h, pullOf({ a: 80, p: 0.4 }));
  E.runUntilIdle(h);
  ok(h.state === "lost" && h.result && !h.result.won, "out of birds with Mokos left = lost");
  ok(!E.launch(h, pullOf({ a: 20, p: 1 })), "no launch after losing");
  E.destroyGame(h);
}

section("restart / cleanup");
{
  const def = LEVELS[49];
  const a = E.createGame(def), b = E.createGame(def);
  const pos = (g) => [...g.blocks, ...g.enemies].map((e) => `${e.body.position.x},${e.body.position.y},${e.body.angle}`).join("|");
  ok(pos(a) === pos(b), "two builds of a level are identical");
  E.launch(a, pullOf({ a: 18, p: 1 }));
  run(a, 60);
  E.destroyGame(a);
  ok(a.world.bodies.length === 0 && Object.keys(a.engine.events).length === 0, "destroyGame clears bodies and listeners");
  E.step(a); // stepping a destroyed game is a no-op, not a crash
  ok(a.destroyed, "destroyed flag set");
  ok(b.world.bodies.length === bodiesExpected(b), "other game untouched");
  E.destroyGame(b);
}

section("tunnelling at top speed");
{
  for (const mat of ["glass", "wood"]) {
    const g = E.createGame(custom(["yellow", "red"], (b) => {
      b.post(mat, 650, 0, 300);
      b.hut("wood", 1300, 0);
    }));
    E.launch(g, pullOf({ a: 6, p: 1 }));
    E.step(g);
    E.triggerAbility(g);
    let passed = false;
    for (let i = 0; i < 200 && g.shot; i++) {
      E.step(g);
      const bd = g.shot?.birds[0];
      if (bd && !bd.touched && bd.body.position.x > 700) passed = true;
    }
    ok(!passed, `dashing bird cannot pass through a 20px ${mat} plank untouched`);
    E.destroyGame(g);
  }
}

section("random shots always settle (no endless movement, no NaN)");
{
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let worst = 0;
  for (let k = 0; k < 150; k++) {
    const def = LEVELS[Math.floor(rand() * LEVELS.length)];
    const g = E.createGame(def);
    while (g.state === "ready") {
      const s = { a: -6 + rand() * 80, p: 0.4 + rand() * 0.6 };
      E.launch(g, pullOf(s));
      const tap = Math.floor(rand() * 80);
      let n = 0;
      for (; n < 60 * 40 && g.state !== "ready" && g.state !== "won" && g.state !== "lost"; n++) {
        if (n === tap) E.triggerAbility(g);
        E.step(g);
      }
      worst = Math.max(worst, n);
      ok(n < 60 * 40, `level ${def.id}: shot settles (took ${n} steps)`);
      const bad = [...g.blocks, ...g.enemies].some((e) => !Number.isFinite(e.body.position.x + e.body.position.y));
      ok(!bad, `level ${def.id}: no NaN bodies`);
      if (n >= 60 * 40 || bad) break;
    }
    ok(g.world.bodies.length === bodiesExpected(g), `level ${def.id}: no leaked bodies`);
    E.destroyGame(g);
  }
  console.log(`  longest shot-to-ready: ${(worst / 60).toFixed(1)} s`);
}

section("save");
{
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  let p = loadProgress(store);
  ok(p.unlocked === 1 && !Object.keys(p.stars).length, "fresh save");
  p = recordWin(p, 1, 23000, 2);
  p = recordWin(p, 1, 18000, 1);
  ok(p.best[1] === 23000 && p.stars[1] === 2 && p.unlocked === 2, "best score/stars kept, next level unlocked");
  p = recordWin(p, LEVEL_COUNT, 50000, 3);
  ok(p.unlocked === LEVEL_COUNT, "unlock capped at level 50");
  saveProgress(p, store);
  const q = loadProgress(store);
  ok(JSON.stringify(q) === JSON.stringify(p), "round-trip");
  mem.set(SAVE_KEY, "{not json");
  ok(loadProgress(store).unlocked === 1, "corrupt save falls back to fresh");
  mem.set(SAVE_KEY, JSON.stringify({ unlocked: 999, best: { 3: -5, 4: "x", 5: 1200 }, stars: { 5: 7 } }));
  const r = loadProgress(store);
  ok(r.unlocked === LEVEL_COUNT && !r.best[3] && !r.best[4] && r.best[5] === 1200 && r.stars[5] === 3, "out-of-range values sanitised");
  ok(loadProgress(null).unlocked === 1, "no storage at all still works");
}

section("star thresholds");
for (const l of LEVELS) ok(l.stars[1] < l.stars[2] && E.starsFor(l, l.stars[2]) === 3 && E.starsFor(l, l.stars[1]) === 2 && E.starsFor(l, 0) === 1, `level ${l.id} stars`);

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} checks passed`);
process.exit(fail ? 1 : 0);
