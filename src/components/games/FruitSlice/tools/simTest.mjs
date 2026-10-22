// Fruit Slice engine checks: node src/components/games/FruitSlice/tools/simTest.mjs
import { create, step, bladeDown, bladeTo, bladeUp, togglePause, multiplier, segDist2, H } from "../engine.js";

let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const fruit = (s, x, y, extra = {}) => {
  const it = { id: s.nextId++, kind: "fruit", type: "apple", perk: null, r: 35, x, y, vx: 0, vy: -200, rot: 0, vr: 0, ...extra };
  s.items.push(it);
  return it;
};
const swipe = (s, x0, y0, x1, y1) => {
  bladeDown(s, x0, y0);
  const ev = bladeTo(s, x1, y1);
  bladeUp(s);
  return ev;
};

// segment geometry
ok(segDist2(50, 0, 0, 0, 100, 0) === 0 && segDist2(50, 10, 0, 0, 100, 0) === 100, "segment distance (mid-segment)");
ok(segDist2(-30, 0, 0, 0, 100, 0) === 900, "segment distance clamps to endpoints");

// fast swipe passing through a fruit between pointer samples still slices it
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  fruit(s, 640, 360);
  const ev = swipe(s, 200, 360, 1100, 360); // pointer samples far left/right, fruit in the middle
  ok(ev.includes("slice") && s.items.length === 0 && s.halves.length === 2 && s.score === 1, "segment slice: fast swipe through fruit → 2 halves, +1");
}
// near miss / edge accuracy
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  fruit(s, 640, 360);
  swipe(s, 500, 360 - 36, 800, 360 - 36);
  ok(s.items.length === 1 && s.score === 0, "a swipe 1 unit outside the radius misses");
  swipe(s, 500, 360 - 34, 800, 360 - 34);
  ok(s.items.length === 0 && s.score === 1, "a swipe just inside the radius slices");
}
// no double scoring: keep dragging back and forth over the halves
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  fruit(s, 640, 360);
  bladeDown(s, 500, 360);
  for (let i = 0; i < 10; i++) bladeTo(s, i % 2 ? 500 : 800, 360);
  ok(s.score === 1, "a fruit scores once no matter how often it is crossed");
}
// tap without movement does nothing
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  fruit(s, 640, 360);
  bladeDown(s, 640, 360);
  bladeTo(s, 641, 360);
  ok(s.items.length === 1, "a tap (no swipe) doesn't slice");
}
// classic bomb ends the run
{
  const s = create("classic", 5, 1280);
  s.spawnT = 99;
  s.score = 9;
  fruit(s, 640, 360, { kind: "bomb", type: undefined, r: 34 });
  const ev = swipe(s, 500, 360, 800, 360);
  ok(ev.includes("bomb") && s.phase === "over" && s.reason === "bomb" && s.best === 9, "classic: bomb ends the game and updates best");
  swipe(s, 500, 300, 800, 300);
  ok(s.score === 9, "no slicing after game over");
}
// arcade bomb = -10, game continues
{
  const s = create("arcade", 0, 1280);
  s.spawnT = 99;
  s.score = 25;
  s.streak = 15;
  fruit(s, 640, 360, { kind: "bomb", r: 34 });
  swipe(s, 500, 360, 800, 360);
  ok(s.phase === "playing" && s.score === 15 && s.streak === 0, "arcade: bomb costs 10 and resets the streak");
  s.score = 3;
  fruit(s, 640, 360, { kind: "bomb", r: 34 });
  swipe(s, 500, 360, 800, 360);
  ok(s.score === 0, "arcade: score never goes negative");
}
// misses
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  for (let i = 0; i < 3; i++) fruit(s, 300 + i * 300, H + 30, { vy: 50 });
  fruit(s, 1000, H + 30, { kind: "bomb", r: 34, vy: 50 });
  const ev = [];
  for (let i = 0; i < 30 && s.phase === "playing"; i++) ev.push(...step(s, 1 / 60, rng(1)));
  ok(s.misses === 3 && s.phase === "over" && s.reason === "misses", "classic: 3 dropped fruits end the run (dropped bombs don't count)");
}
{
  const s = create("arcade", 0, 1280);
  s.spawnT = 99;
  for (let i = 0; i < 5; i++) fruit(s, 300 + i * 100, H + 30, { vy: 50 });
  for (let i = 0; i < 30; i++) step(s, 1 / 60, rng(2));
  ok(s.phase === "playing" && s.misses === 0, "arcade: dropped fruit doesn't end the run");
}
// combos
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  for (let i = 0; i < 4; i++) fruit(s, 300 + i * 150, 360);
  swipe(s, 200, 360, 900, 360);
  ok(s.score === 4, "4 fruits in one swipe = 4 points before the combo closes");
  const ev = [];
  for (let i = 0; i < 30; i++) ev.push(...step(s, 1 / 60, rng(3)));
  ok(ev.includes("combo") && s.score === 8 && s.pops.some((p) => /4 FRUIT COMBO \+4/.test(p.text)), "classic combo bonus +4 after the window closes");
}
{
  const s = create("arcade", 0, 1280);
  s.spawnT = 99;
  for (let i = 0; i < 3; i++) fruit(s, 300 + i * 150, 360);
  swipe(s, 200, 360, 900, 360);
  for (let i = 0; i < 30; i++) step(s, 1 / 60, rng(4));
  ok(s.score === 3 + 6, "arcade combo bonus doubles (3 fruits → +6)");
}
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  fruit(s, 300, 360);
  swipe(s, 200, 360, 400, 360);
  for (let i = 0; i < 40; i++) step(s, 1 / 60, rng(5));
  fruit(s, 300, 360);
  swipe(s, 200, 360, 400, 360);
  for (let i = 0; i < 40; i++) step(s, 1 / 60, rng(5));
  ok(s.score === 2, "slices far apart in time don't combo");
}
// multiplier
{
  const s = create("arcade", 0, 1280);
  s.streak = 9;
  ok(multiplier(s) === 1, "x1 below 10 streak");
  s.streak = 10;
  ok(multiplier(s) === 2, "x2 at 10 streak");
  s.streak = 99;
  ok(multiplier(s) === 4, "multiplier caps at x4");
}
// arcade perks + timer
{
  const s = create("arcade", 0, 1280);
  s.spawnT = 99;
  fruit(s, 640, 360, { perk: "time" });
  swipe(s, 500, 360, 800, 360);
  ok(s.timeLeft === 65, "time fruit adds 5 seconds");
  fruit(s, 640, 300, { perk: "bonus" });
  swipe(s, 500, 300, 800, 300);
  ok(s.score === 1 + 11, "bonus fruit adds 10");
  let ev = [];
  for (let i = 0; i < 66 * 60 && s.phase === "playing"; i++) ev.push(...step(s, 1 / 60, rng(6)));
  ok(s.phase === "over" && s.reason === "time" && ev.includes("over"), "arcade ends when the timer hits 0");
}
// pause freezes everything
{
  const s = create("classic", 0, 1280);
  s.spawnT = 99;
  const it = fruit(s, 640, 360);
  togglePause(s);
  step(s, 0.5);
  bladeDown(s, 500, 360);
  bladeTo(s, 800, 360);
  ok(s.phase === "paused" && it.y === 360 && s.score === 0, "pause freezes motion and slicing");
  togglePause(s);
  ok(s.phase === "playing", "resume");
}
// spawning: arcs stay on screen, difficulty ramps, early game is bomb-free
{
  const s = create("classic", 0, 1280);
  const r = rng(7);
  let tooHigh = 0, offside = 0, earlyBombs = 0, spawned = 0;
  const seen = new Set();
  for (let i = 0; i < 120 * 60 && s.phase === "playing"; i++) {
    step(s, 1 / 60, r);
    for (const it of s.items) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        spawned++;
        if (it.kind === "bomb" && s.elapsed < 4) earlyBombs++;
      }
      if (it.y < it.r * 0.5) tooHigh++;
    }
    s.items = s.items.filter((it) => !(it.vy > 0 && it.y > H - 40)); // drop falling items before they count as misses

    for (const it of s.items) if (it.vy < 0 && (it.x < -it.r || it.x > s.W + it.r)) offside++;
  }
  ok(spawned > 150 && tooHigh === 0 && offside === 0 && earlyBombs === 0, `spawns stay on screen, no bombs in the first 4s (${spawned} items)`);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
