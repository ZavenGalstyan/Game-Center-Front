/** Headless rules tests: `node src/components/games/AirHockey/tools/engineTest.mjs` */
import { create, start, step, setTarget, togglePause, clampPaddle, predictX, W, H, PUCK_R, PAD_R, GOAL_W, MAX_PUCK_V, WIN_SCORE } from "../engine.js";

let fails = 0;
const check = (name, ok, info = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? `  (${info})` : ""}`);
  if (!ok) fails++;
};
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const game = (diff = "medium", seed = 1) => {
  const g = create(diff, seeded(seed));
  start(g);
  return g;
};
const run = (g, secs, dt = 1 / 60, each) => {
  const ev = [];
  for (let t = 0; t < secs; t += dt) {
    each?.(g);
    ev.push(...step(g, dt));
  }
  return ev;
};
// Park the AI far away so it never touches the puck.
const noAi = (g) => {
  g.ai.x = PAD_R;
  g.ai.y = PAD_R;
  g.aiTarget = { x: PAD_R, y: PAD_R };
  g.aiTimer = 1e9;
};
const bounds = (g) =>
  g.player.y >= H / 2 + PAD_R - 1e-6 && g.player.y <= H - PAD_R + 1e-6 && g.ai.y <= H / 2 - PAD_R + 1e-6 && g.ai.y >= PAD_R - 1e-6 &&
  [g.player, g.ai].every((p) => p.x >= PAD_R - 1e-6 && p.x <= W - PAD_R + 1e-6);

// --- start state
const g0 = create("easy", seeded());
check("starts ready, nothing moves", g0.status === "ready" && step(g0, 1).length === 0 && g0.puck.vx === 0);
const s = game();
check("start → playing, 0:0, puck in player's half", s.status === "playing" && s.score.player === 0 && s.score.ai === 0 && s.puck.y > H / 2);

// --- paddle boundaries
check("clamp keeps player in bottom half", clampPaddle("player", -50, 0).y === H / 2 + PAD_R && clampPaddle("player", -50, 0).x === PAD_R);
check("clamp keeps AI in top half", clampPaddle("ai", 9999, 9999).y === H / 2 - PAD_R && clampPaddle("ai", 9999, 9999).x === W - PAD_R);
const b = game();
let ok = true;
for (const [x, y] of [[-100, -100], [W + 100, H + 100], [W / 2, 0], [0, H], [W, H / 2]]) {
  setTarget(b, x, y);
  run(b, 0.5);
  ok = ok && bounds(b);
}
check("player paddle never leaves its half (AI running)", ok);
setTarget(b, 100, H - 100);
run(b, 1);
check("player paddle reaches the pointer", Math.hypot(b.player.x - 100, b.player.y - (H - 100)) < 1);
setTarget(b, W - 40, H / 2 + 40);
step(b, 1 / 60);
check("paddle speed is limited per frame", Math.hypot(b.player.x - 100, b.player.y - (H - 100)) < 50);

// --- friction + walls
const f = game();
noAi(f);
f.puck = { x: W / 2, y: H / 2 + 100, vx: 300, vy: 0 };
f.player.y = H - PAD_R;
f.target = { x: W / 2, y: H - PAD_R };
const v0 = 300;
run(f, 0.2);
check("friction slows the puck", Math.hypot(f.puck.vx, f.puck.vy) < v0 && Math.hypot(f.puck.vx, f.puck.vy) > v0 * 0.85);
const ev = run(f, 1.5);
check("side wall reflects the puck", f.puck.vx < 0 && ev.some((e) => e.type === "wall"));
check("puck stays inside side walls", f.puck.x <= W - PUCK_R && f.puck.x >= PUCK_R);

// end wall outside the goal mouth bounces, never scores
const e = game();
noAi(e);
e.puck = { x: 90, y: 200, vx: 0, vy: -900 };
const ee = run(e, 0.4);
check("end wall outside mouth bounces", e.puck.vy > 0 && !ee.some((x) => x.type === "goal") && e.puck.y >= PUCK_R);

// --- high-speed tunneling: walls and paddles
const t = game();
noAi(t);
t.puck = { x: W / 2, y: H / 2 + 60, vx: MAX_PUCK_V * 0.7, vy: MAX_PUCK_V * 0.7 };
let inside = true;
run(t, 2, 1 / 20, (g) => {
  inside = inside && g.puck.x >= PUCK_R - 1e-6 && g.puck.x <= W - PUCK_R + 1e-6;
});
check("max-speed puck never escapes side walls (20fps)", inside);
const tp = game();
noAi(tp);
tp.player.x = W / 2;
tp.player.y = H - 120;
tp.target = { x: W / 2, y: H - 120 };
tp.puck = { x: W / 2, y: H / 2 + 20, vx: 0, vy: MAX_PUCK_V };
run(tp, 0.3, 1 / 15);
check("fast puck can't pass through a paddle (15fps)", tp.puck.vy < 0 && tp.puck.y < tp.player.y);
// a fast paddle swing at a resting puck hits it instead of jumping over it
const sw = game();
noAi(sw);
sw.puck = { x: W / 2, y: H - 200, vx: 0, vy: 0 };
sw.player.x = W / 2;
sw.player.y = H - PAD_R;
setTarget(sw, W / 2, H / 2 + PAD_R);
step(sw, 1 / 20);
check("fast paddle swing strikes the puck", sw.puck.vy < -300 && sw.puck.y < sw.player.y, `vy=${sw.puck.vy.toFixed(0)}`);
check("puck speed is capped", Math.hypot(sw.puck.vx, sw.puck.vy) <= MAX_PUCK_V + 1e-6);

// --- paddle collision response
const c = game();
noAi(c);
c.puck = { x: W / 2 + 10, y: H - 200, vx: 0, vy: 400 };
c.player.x = W / 2;
c.player.y = H - 140;
c.target = { x: W / 2, y: H - 140 };
const ce = run(c, 0.3);
check("puck rebounds off a still paddle", c.puck.vy < 0 && c.puck.vx > 0 && ce.some((x) => x.type === "hit" && x.by === "player"));
check("puck never overlaps the paddle after a hit", Math.hypot(c.puck.x - c.player.x, c.puck.y - c.player.y) >= PUCK_R + PAD_R - 1e-6);

// --- goals
const gl = game();
noAi(gl);
gl.puck = { x: W / 2, y: 100, vx: 0, vy: -900 };
const ge = run(gl, 0.4);
check("puck into the top mouth = player goal", gl.score.player === 1 && gl.status === "goal" && ge.some((x) => x.type === "goal" && x.by === "player"));
while (gl.status === "goal") step(gl, 1 / 60);
check("after the goal pause: playing, puck reset to AI half, paddles home", gl.status === "playing" && gl.puck.y < H / 2 && gl.puck.vx === 0 && gl.player.x === W / 2);
const g2 = game();
noAi(g2);
g2.player.x = PAD_R;
g2.target = { x: PAD_R, y: g2.player.y };
g2.puck = { x: W / 2 + 40, y: H - 100, vx: 0, vy: 900 };
run(g2, 0.4);
check("puck into the bottom mouth = AI goal", g2.score.ai === 1 && g2.score.player === 0);
run(g2, 2);
check("conceding player serves", g2.puck.y > H / 2);
// a puck right at a post corner bounces off it
const pt = game();
noAi(pt);
pt.puck = { x: W / 2 - GOAL_W / 2 - 6, y: 60, vx: 0, vy: -800 };
run(pt, 0.3);
check("post corner deflects, no goal", pt.score.player === 0 && pt.puck.vy > 0);

// --- pause
const pz = game();
pz.puck.vx = 200;
togglePause(pz);
const before = JSON.stringify(pz.puck);
run(pz, 1);
check("paused freezes the puck", pz.status === "paused" && JSON.stringify(pz.puck) === before);
togglePause(pz);
run(pz, 0.1);
check("resume continues", pz.status === "playing" && JSON.stringify(pz.puck) !== before);

// --- victory at 7
const v = game();
noAi(v);
v.score.player = WIN_SCORE - 1;
v.puck = { x: W / 2, y: 100, vx: 0, vy: -900 };
const ve = run(v, 0.4);
check("7th goal ends the match", v.status === "over" && v.winner === "player" && v.score.player === WIN_SCORE && ve.some((x) => x.type === "win"));
check("nothing moves after game over", step(v, 1).length === 0);
start(v);
check("restart resets the score", v.status === "playing" && v.score.player === 0 && v.winner === null);

// --- AI
// from x=W-50 heading right 45° over 400 units: hits the wall at W-PUCK_R, reflects back
check("predictX reflects off walls", Math.abs(predictX(W - 50, 400, -400, 0, 400, 1) - (2 * (W - PUCK_R) - (W - 50 + 400))) < 1e-9);
const px = predictX(W / 2, 300, -300, 100, 400, 2);
check("predictX lands inside the table", px >= PUCK_R && px <= W - PUCK_R);
check("predictX straight shot", Math.abs(predictX(100, 0, -500, 50, 400, 0) - 100) < 1e-9);

const a = game("hard");
a.puck = { x: 120, y: H / 2 + 40, vx: 0, vy: -500 };
let aiOk = true;
run(a, 0.6, 1 / 60, (g) => (aiOk = aiOk && bounds(g)));
check("AI stays in its half", aiOk);
check("AI defends: moves toward the incoming line", Math.abs(a.ai.x - 120) < Math.abs(W / 2 - 120) || a.puck.vy > 0);

// AI clears a resting puck from its half
for (const diff of ["easy", "medium", "hard"]) {
  let cleared = 0;
  const spots = [[W / 2, 150], [40, 40], [W - 30, 60], [60, H / 2 - 20], [100, PUCK_R + 2], [W - 40, 200]];
  for (const [x, y] of spots) {
    const g = game(diff, 7);
    g.player.x = PAD_R;
    g.target = { x: PAD_R, y: H - PAD_R };
    g.puck = { x, y, vx: 0, vy: 0 };
    for (let i = 0; i < 60 * 6 && g.puck.y < H / 2 + PUCK_R && g.status === "playing"; i++) step(g, 1 / 60);
    if (g.puck.y >= H / 2 + PUCK_R || g.score.ai) cleared++;
  }
  check(`${diff} AI clears resting pucks from its half`, cleared === spots.length, `${cleared}/${spots.length}`);
}

// Difficulty: the same human-like bot (sees the puck 0.1 s late, hand speed
// capped) plays 8 matches against each AI.
function human(rng) {
  const seen = [];
  const hand = { x: W / 2, y: H - 90 };
  return (g, dt) => {
    seen.push({ ...g.puck });
    if (seen.length > 6) seen.shift();
    const p = seen[0];
    let tx = W / 2 + (p.x - W / 2) * 0.4;
    let ty = H - 80;
    if (p.y > H / 2 - 20) {
      tx = p.x + (rng() - 0.5) * 24;
      ty = g.player.y < p.y + 10 ? p.y + 60 : p.y - 10;
    }
    const dx = tx - hand.x;
    const dy = ty - hand.y;
    const d = Math.hypot(dx, dy);
    const m = 1400 * dt;
    if (d > m) (hand.x += (dx / d) * m), (hand.y += (dy / d) * m);
    else (hand.x = tx), (hand.y = ty);
    setTarget(g, hand.x, hand.y);
  };
}
const results = {};
for (const diff of ["easy", "medium", "hard"]) {
  let goals = 0;
  let aiWins = 0;
  let broken = 0;
  for (let m = 0; m < 8; m++) {
    const g = game(diff, 100 + m);
    const bot = human(seeded(900 + m));
    for (let i = 0; i < 60 * 600 && g.status !== "over"; i++) {
      bot(g, 1 / 60);
      step(g, 1 / 60);
      if (!bounds(g) || g.puck.x < PUCK_R - 1e-6 || g.puck.x > W - PUCK_R + 1e-6) broken++;
    }
    if (g.status !== "over") broken++;
    goals += g.score.player;
    if (g.winner === "ai") aiWins++;
  }
  results[diff] = { goals, aiWins };
  check(`${diff}: 8 bot matches all reach 7, nothing leaves the table`, broken === 0, `bot scored ${goals}, AI won ${aiWins}/8`);
}
check("harder AI concedes fewer goals", results.easy.goals > results.medium.goals && results.medium.goals > results.hard.goals);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
