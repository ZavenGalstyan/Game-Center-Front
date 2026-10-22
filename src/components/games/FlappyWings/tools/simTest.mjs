// Headless checks for the Flappy Wings engine: node src/components/games/FlappyWings/tools/simTest.mjs
import { create, begin, flap, togglePause, step, birdX, PLAY_H, HIT_R, PIPE_W, gapFor, speedFor } from "../engine.js";

let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const run = (s, sec, rand, each) => {
  const ev = [];
  for (let t = 0; t < sec && (!each || each(s) !== false); t += 1 / 60) ev.push(...step(s, 1 / 60, rand));
  return ev;
};
const toPlaying = (W = 480) => {
  const s = create(0, W);
  begin(s);
  const ev = run(s, 3.05, rng(1));
  return { s, ev };
};

// countdown
{
  const { s, ev } = toPlaying();
  ok(ev.filter((e) => e === "tick").length === 2 && ev.includes("go"), "countdown ticks 3-2-1 then go");
  ok(s.phase === "playing", "countdown ends in playing");
}
// menu ignores flap
{
  const s = create();
  ok(!flap(s) && s.phase === "menu", "flap ignored on menu");
}
// gravity -> ground
{
  const { s } = toPlaying();
  const ev = run(s, 4, rng(2), (st) => st.phase === "playing");
  ok(s.phase === "over" && ev.includes("hit") && s.bird.y + HIT_R <= PLAY_H + 0.01, "no input: falls and dies on the ground");
  ok(s.score === 0, "no score without passing a pipe");
}
// ceiling
{
  const { s } = toPlaying();
  run(s, 4, rng(3), (st) => {
    flap(st);
    return st.phase === "playing";
  });
  ok(s.phase === "over" && s.bird.y - HIT_R <= 1, "constant flapping dies on the ceiling");
}
// pipe hit: hover at the top of the play area → must collide with a top pipe, not the ceiling
{
  const { s } = toPlaying();
  let died = null;
  run(s, 20, rng(4), (st) => {
    if (st.bird.y > 110 && st.bird.vy > 0) flap(st);
    if (st.phase === "over") {
      died = st.bird.y;
      return false;
    }
  });
  const near = s.pipes.find((p) => p.x - 5 <= birdX(s) + HIT_R && p.x + PIPE_W + 5 >= birdX(s) - HIT_R);
  ok(s.phase === "over" && died > HIT_R + 1 && near, "hugging the ceiling collides with a pipe");
}
// pause
{
  const { s } = toPlaying();
  togglePause(s);
  const y = s.bird.y;
  run(s, 1, rng(5));
  ok(s.phase === "paused" && s.bird.y === y, "pause freezes the world");
  togglePause(s);
  ok(s.phase === "playing", "resume returns to playing");
}
// fairness: an autopilot survives long runs on many seeds, scoring only by passing
const bot = (st) => {
  const bx = birdX(st);
  const i = st.pipes.findIndex((p) => p.x + PIPE_W + 6 > bx - HIT_R);
  const next = st.pipes[i];
  const after = st.pipes[i + 1];
  // like a player: ride the low side of a gap when the next one is lower
  const bias = after && after.cy > next.cy + 60 ? 0.3 : 0.12;
  const target = next ? next.cy + next.gap * bias : PLAY_H * 0.5;
  if (st.bird.y > target && st.bird.vy > -40) flap(st);
  return st.phase === "playing";
};
let worst = Infinity;
for (let seed = 1; seed <= 25; seed++) {
  const { s } = toPlaying([360, 600, 1100][seed % 3]);
  const r = rng(seed * 97);
  let lastScore = 0;
  let monotonic = true;
  run(s, 200, r, (st) => {
    if (st.score < lastScore || st.score > lastScore + 1) monotonic = false;
    lastScore = st.score;
    for (const p of st.pipes) if (p.scored && p.x + PIPE_W >= birdX(st)) monotonic = false;
    return bot(st);
  });
  worst = Math.min(worst, s.score);
  if (!monotonic) ok(false, `seed ${seed}: score only +1 after passing`);
}
ok(worst >= 100, `autopilot passes >=100 pipes on every seed (worst ${worst})`);
// gap reachability bounds
{
  const s = create(0, 480);
  begin(s);
  run(s, 3.05, rng(6));
  s.score = 999;
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    step(s, 1 / 60, rng(i));
    s.bird.y = PLAY_H / 2;
    s.bird.vy = 0;
    s.phase = "playing";
    for (let k = 1; k < s.pipes.length; k++) {
      const d = s.pipes[k].cy - s.pipes[k - 1].cy;
      if (d < -130.01 || d > 170.01) bad++;
    }
  }
  ok(bad === 0, "consecutive gaps stay within climb/drop limits");
  ok(gapFor(1e6) >= 140 && speedFor(1e6) <= 250, "difficulty caps (gap >= 140, speed <= 250)");
}
// best score
{
  const s = create(5, 480);
  begin(s);
  run(s, 3.05, rng(7));
  s.score = 9;
  run(s, 5, rng(7), (st) => st.phase === "playing");
  ok(s.best === 9, "best score updates on game over");
  begin(s);
  ok(s.best === 9 && s.score === 0 && s.phase === "countdown", "play again keeps best, resets score");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
