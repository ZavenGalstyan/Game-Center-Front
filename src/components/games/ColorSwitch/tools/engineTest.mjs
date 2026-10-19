/** Headless rules tests: `node src/components/games/ColorSwitch/tools/engineTest.mjs` */
import { create, step, jump, togglePause, ringHits, segmentAt, difficulty, setViewHeight, GRAVITY, JUMP_V, BALL_R, RING_T } from "../engine.js";

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const run = (g, secs, dt = 1 / 120) => {
  const ev = [];
  for (let t = 0; t < secs; t += dt) ev.push(...step(g, dt));
  return ev;
};
// A game with no obstacles in the way, for pure physics checks.
const empty = () => {
  const g = create(0, seeded());
  g.obstacles = [];
  g.nextY = -1e9;
  return g;
};

// --- start state
const g0 = create(7, seeded());
check("starts ready, best kept, ball at rest", g0.status === "ready" && g0.best === 7 && g0.ball.y === 0 && g0.ball.vy === 0);
check("obstacles spawned ahead", g0.obstacles.length >= 2 && g0.obstacles.every((o) => o.y < 0));
const y0 = g0.ball.y;
run(g0, 1);
check("no gravity while ready", g0.ball.y === y0 && g0.status === "ready");
check("rings spin while ready", g0.obstacles[0].rings[0].rot !== create(7, seeded()).obstacles[0].rings[0].rot);

// --- jump physics and gravity
const p = empty();
check("jump starts the game", jump(p) && p.status === "playing" && p.ball.vy === JUMP_V);
step(p, 0.01);
check("gravity integrates velocity", near(p.ball.vy, JUMP_V + GRAVITY * 0.01));
let apex = 0;
for (let i = 0; i < 200; i++) {
  step(p, 1 / 240);
  apex = Math.min(apex, p.ball.y);
}
const ideal = (JUMP_V * JUMP_V) / (2 * GRAVITY);
check(`jump apex ~${ideal.toFixed(0)}px (got ${(-apex).toFixed(1)})`, Math.abs(-apex - ideal) < 4);
check("ball falls after apex", p.ball.vy > 0);
const p2 = empty();
jump(p2);
step(p2, 0.1);
const vMid = p2.ball.vy;
jump(p2);
check("jump resets velocity mid-air", p2.ball.vy === JUMP_V && vMid !== JUMP_V);
const p3 = empty();
jump(p3);
for (let i = 0; i < 60; i++) step(p3, 1 / 60);
const yA = p3.ball.y;
const p4 = empty();
jump(p4);
for (let i = 0; i < 240; i++) step(p4, 1 / 240);
check("frame-rate independent (60 vs 240 fps within 3px)", Math.abs(yA - p4.ball.y) < 3);
const p5 = empty();
jump(p5);
step(p5, 1); // a huge hitch is clamped to 50ms
check("dt clamped", p5.time <= 0.05 + 1e-9);

// --- falling off the bottom ends the game
const f = empty();
jump(f);
const ev = run(f, 3);
check("falling off-screen is game over", f.status === "over" && ev.some((e) => e.type === "die"));
check("no jump after game over", !jump(f) && f.status === "over");

// --- segment colours and collisions
const ring = { r: 110, rot: 0, speed: 0 };
// canvas angles (y down): segment k spans [rot + k*90°, rot + (k+1)*90°)
check("segment at 45° is 0", segmentAt(ring, Math.PI / 4) === 0);
check("bottom (90°) of rot=0.1 is segment 0", segmentAt({ ...ring, rot: 0.1 }, Math.PI / 2) === 0);
check("top (-90°) is segment 3 at rot=0", segmentAt(ring, -Math.PI / 2 + 0.2) === 3);
const bottomRing = { r: 110, rot: Math.PI / 4, speed: 0 }; // bottom (90°) mid-segment 0
check("matching colour passes the band", !ringHits(bottomRing, 110, 0));
check("mismatched colour hits the band", ringHits(bottomRing, 110, 1));
check("inside the ring is safe", !ringHits(bottomRing, 40, 1));
check("outside the ring is safe", !ringHits(bottomRing, 110 + RING_T / 2 + BALL_R + 1, 1));
check("touching the band's outer edge counts", ringHits(bottomRing, 110 + RING_T / 2 + BALL_R - 1, 1));
check("straddling a seam hits (bottom at exact seam)", ringHits({ ...ring, rot: 0 }, 110, 0) || ringHits({ ...ring, rot: 0 }, 110, 1));
check("on a seam both neighbours count", ringHits({ ...ring, rot: Math.PI / 2 }, 110, 0) && ringHits({ ...ring, rot: Math.PI / 2 }, 110, 3));

// double rings are mirrored: the same colour at the top and bottom at every moment
let mirrored = true;
for (let seed = 1; seed < 30; seed++) {
  const g = create(0, seeded(seed));
  setViewHeight(g, 40000);
  for (const o of g.obstacles.filter((o) => o.rings.length === 2)) {
    for (let t = 0; t < 3; t += 0.05) {
      for (const a of [-Math.PI / 2, Math.PI / 2]) {
        if (segmentAt(o.rings[0], a) !== segmentAt(o.rings[1], a)) mirrored = false;
      }
      o.rings.forEach((r) => (r.rot += r.speed * 0.05));
    }
  }
}
check("double rings line up at top and bottom", mirrored);

// full-game collision: put a frozen ring right above the ball
const placeRing = (color, rot) => {
  const g = empty();
  g.ball.color = color;
  g.obstacles = [{ n: 0, y: -150, rings: [{ r: 110, rot, speed: 0 }], star: false, passed: false, flash: 0, switchY: -1e6, switcher: false }];
  return g;
};
// bottom of ring (90°) is segment 2 when rot = PI/2 - (2.5 * PI/2) → choose rot so the bottom is mid-segment c
const rotFor = (c) => Math.PI / 2 - (c + 0.5) * (Math.PI / 2);
const hit = placeRing(1, rotFor(2));
jump(hit);
check("mismatched ring kills the ball", run(hit, 0.3).some((e) => e.type === "die") && hit.status === "over");
const ok = placeRing(2, rotFor(2));
jump(ok);
run(ok, 0.3);
check("matching segment lets the ball through", ok.status === "playing" && ok.ball.y < -40 + 0);

// --- stars and colour switchers
const s = empty();
s.obstacles = [{ n: 0, y: -60, rings: [], star: true, passed: false, flash: 0, switchY: -1e6, switcher: false }];
jump(s);
const sev = run(s, 0.25);
check("star collected adds 1", s.score === 1 && !s.obstacles[0].star && sev.some((e) => e.type === "star"));
check("best follows score", s.best === 1);
run(s, 0.2);
check("star counted once", s.score === 1);
let changes = 0;
for (let seed = 1; seed < 40; seed++) {
  const c = empty();
  c.rng = seeded(seed);
  const before = c.ball.color;
  c.obstacles = [{ n: 0, y: -1e6, rings: [], star: false, passed: false, flash: 0, switchY: -60, switcher: true }];
  jump(c);
  const cev = run(c, 0.25);
  if (c.ball.color !== before && cev.some((e) => e.type === "switch") && !c.obstacles[0].switcher) changes++;
}
check("switcher always changes to a different colour (39 seeds)", changes === 39);

// --- pause
const z = empty();
jump(z);
step(z, 0.05);
togglePause(z);
const zy = z.ball.y;
run(z, 1);
check("paused: nothing moves", z.status === "paused" && z.ball.y === zy);
check("no jump while paused", !jump(z));
togglePause(z);
step(z, 0.02);
check("resume continues", z.status === "playing" && z.ball.y !== zy);

// --- camera, spawning, difficulty
const cam = empty();
cam.obstacles = [];
cam.nextY = -400;
cam.next = 0;
const cam0 = cam.camY;
jump(cam);
for (let i = 0; i < 40; i++) {
  if (i % 18 === 0) jump(cam);
  step(cam, 1 / 60);
}
check("camera follows the ball upward", cam.camY < cam0);
const camHigh = cam.camY;
run(cam, 0.3);
check("camera never moves down", cam.camY <= camHigh);
check("new obstacles spawn ahead", cam.obstacles.length > 0 && cam.obstacles.every((o) => o.y > cam.camY - cam.viewH - 500));
check("difficulty ramps (speed up, gaps shrink)", difficulty(20).speed > difficulty(0).speed && difficulty(20).gap < difficulty(0).gap);
check("difficulty is capped", difficulty(500).speed <= 3.1 && difficulty(500).gap >= 420);
check("double rings only later", difficulty(0).double === 0 && difficulty(10).double > 0);
const v = create(0, seeded());
const camR = v.camY;
setViewHeight(v, 1000);
check("view resize while ready keeps ball placement", near(v.ball.y - v.camY, 0.72 * 1000) && v.camY !== camR);

// --- every spawned obstacle leaves room for the ball between rings/pickups
const lay = create(0, seeded(3));
lay.viewH = 60000;
setViewHeight(lay, 60000);
let roomy = true;
for (const o of lay.obstacles) {
  const outer = Math.max(...o.rings.map((r) => r.r)) + RING_T / 2;
  const inner = Math.min(...o.rings.map((r) => r.r)) - RING_T / 2;
  if (inner < BALL_R * 4) roomy = false;
  if (o.y - o.switchY < outer + BALL_R * 2 + 15) roomy = false;
  if (o.rings.length === 2 && o.rings[0].r - o.rings[1].r - RING_T < BALL_R * 2) roomy = false;
}
let hoverRoom = Infinity;
for (let i = 1; i < lay.obstacles.length; i++) {
  const [a, b] = [lay.obstacles[i - 1], lay.obstacles[i]];
  const reach = (o) => Math.max(...o.rings.map((r) => r.r)) + RING_T / 2 + BALL_R;
  hoverRoom = Math.min(hoverRoom, a.y - b.y - reach(a) - reach(b));
}
check(`free space between rings fits a hover jump (${hoverRoom.toFixed(0)}px >= ${((JUMP_V * JUMP_V) / (2 * GRAVITY) + 40).toFixed(0)})`, hoverRoom >= (JUMP_V * JUMP_V) / (2 * GRAVITY) + 40);
check(`layout leaves room (${lay.obstacles.length} obstacles)`, roomy);

// --- a lookahead bot proves the ramping difficulty stays beatable
// replayable rng so rollouts see the same switcher colours the real run will
const tape = (seed) => {
  const next = seeded(seed);
  const vals = [];
  const at = (i) => (vals[i] ??= next());
  return (i = 0) => {
    const f = () => at(f.i++);
    f.i = i;
    return f;
  };
};
const clone = (g) => ({ ...g, ball: { ...g.ball }, obstacles: g.obstacles.map((o) => ({ ...o, rings: o.rings.map((r) => ({ ...r })) })), rng: g.tape(g.rng.i) });
const DT = 1 / 60;
// Does a 2 s rollout survive if it jumps now, then jumps every `p1` frames
// until frame `w` and every `p2` after? (40 frames ≈ hovering in place.)
function survives(g, [w, p1, p2]) {
  const t = clone(g);
  jump(t);
  for (let i = 1, last = 0; i <= 120; i++) {
    if (i - last >= (i < w ? p1 : p2)) {
      jump(t);
      last = i;
    }
    step(t, DT);
    if (t.status === "over") return false;
  }
  return true;
}
const PLANS = [[999, 40, 40]];
for (const w of [10, 20, 30, 45, 60, 80]) for (const k of [16, 22, 28]) PLANS.push([w, 40, k], [w, k, 40]);
let botBest = 0;
for (let seed = 1; seed <= 5; seed++) {
  const t = tape(seed * 7);
  const b = create(0, t());
  b.tape = t;
  jump(b);
  for (let f = 0; f < 60 * 120 && b.status === "playing" && b.score < 40; f++) {
    if (b.ball.vy > -150 && f % 2 === 0 && PLANS.some((p) => survives(b, p))) jump(b);
    step(b, DT);
  }
  botBest = Math.max(botBest, b.score);
  const o = b.obstacles.find((o) => Math.abs(o.y - b.ball.y) < 140);
  console.log(`     bot seed ${seed}: score ${b.score} (${b.status}${b.status === "over" ? ` at ring ${o?.n} x${o?.rings.length} spin ${o?.rings[0].speed.toFixed(2)}, dy ${Math.round(b.ball.y - (o?.y ?? 0))}` : ""})`);
}
check("bot reaches 25+ stars on some seed", botBest >= 25);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
