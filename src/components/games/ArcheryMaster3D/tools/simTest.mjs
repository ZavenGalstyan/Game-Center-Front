// Archery Master 3D — headless checks: physics, scoring, rules, progress and
// a bot that plays all 50 levels through the real flight/collision code.
// node src/components/games/ArcheryMaster3D/tools/simTest.mjs [table]
import { LEVELS, LEVEL_COUNT, WORLDS, windFor, objectiveLines } from "../levels.js";
import { aimDir, launchOrigin, launchSpeed, accelOf, predict, createArrow, stepArrow, solveAim, posAt, ringScore, isPerfect, targetNormal, SUBSTEP, EYE } from "../physics.js";
import { newRun, recordShot, status, starsFor, loadProgress, saveProgress, applyResult, totalStars, worldStars, DEFAULT_PROGRESS, STORE_KEY } from "../rules.js";

const TABLE = process.argv.includes("table");
let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("FAIL:", msg);
  }
};
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg}: got ${a} want ${b} ±${eps}`);
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function gaussFrom(r) {
  return () => {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}
const FRAME = 1 / 60;

/** Fly a shot frame by frame exactly like the game loop does. */
function fly(level, yaw, pitch, power, wind, t0) {
  const dir = aimDir(yaw, pitch);
  const a = createArrow(launchOrigin(dir), dir, launchSpeed(power));
  const acc = accelOf(wind);
  let t = t0;
  for (let i = 0; i < 600; i++) {
    const hit = stepArrow(a, FRAME, level, acc, t);
    t += FRAME;
    if (hit) return hit;
  }
  return { kind: "lost", score: 0 };
}

/* ---------------------------------------------------------------- scoring */
ok(ringScore(0, 0.5) === 10, "centre scores 10");
ok(ringScore(0.049, 0.5) === 10, "inside 10-ring");
ok(ringScore(0.051, 0.5) === 9, "just outside 10-ring is 9");
ok(ringScore(0.499, 0.5) === 1, "edge scores 1");
ok(ringScore(0.501, 0.5) === 0, "off the face is 0");
for (let k = 0; k < 10; k++) ok(ringScore((k + 0.5) * 0.05, 0.5) === 10 - k, `ring ${10 - k} midpoint`);
ok(isPerfect(0.02, 0.5) && !isPerfect(0.03, 0.5), "perfect = inner half of the 10");

/* ---------------------------------------------------------------- flight model */
{
  // analytic prediction matches the stepped integrator
  const lvl = { targets: [], obstacles: [] };
  for (const [yaw, pitch, pw, wind] of [[0, 0.02, 1, { x: 0, z: 0 }], [0.1, 0.05, 0.6, { x: 3, z: -1 }], [-0.2, 0.08, 0.4, { x: -4, z: 2 }]]) {
    const dir = aimDir(yaw, pitch);
    const o = launchOrigin(dir);
    const sp = launchSpeed(pw);
    const acc = accelOf(wind);
    const pr = predict(o, dir, sp, acc, -20);
    const a = createArrow(o, dir, sp);
    let t = 0;
    while (a.p.z > -20 && t < 4) {
      stepArrow(a, SUBSTEP, lvl, acc, t);
      t += SUBSTEP;
    }
    near(a.p.y, pr.y, 0.25, `stepped y ≈ predicted y (yaw ${yaw})`);
    near(a.p.x, pr.x, 0.25, `stepped x ≈ predicted x (yaw ${yaw})`);
  }
  // gravity drops, wind pushes downwind
  const dir = aimDir(0, 0);
  const still = predict(launchOrigin(dir), dir, launchSpeed(1), accelOf({ x: 0, z: 0 }), -40);
  const right = predict(launchOrigin(dir), dir, launchSpeed(1), accelOf(windFor({ id: 1, wind: { s: 4, d: 0 } }, 0)), -40);
  const left = predict(launchOrigin(dir), dir, launchSpeed(1), accelOf(windFor({ id: 1, wind: { s: 4, d: 180 } }, 0)), -40);
  ok(still.y < EYE.y - 1, "gravity drops a level shot over 40 m");
  ok(right.x > 0.15 && left.x < -0.15, "wind 0° pushes right, 180° pushes left");
  ok(predict(launchOrigin(dir), dir, launchSpeed(0.3), accelOf({ x: 0, z: 0 }), -40).y < still.y, "weaker draw drops more");
  // windFor is deterministic and swings only with shift
  const gl = LEVELS.find((l) => l.wind.shift);
  ok(JSON.stringify(windFor(gl, 2)) === JSON.stringify(windFor(gl, 2)), "gusts are deterministic");
  ok(new Set([0, 1, 2, 3, 4].map((i) => windFor(gl, i).s)).size > 1, "gusting level changes wind per arrow");
  const steady = LEVELS.find((l) => l.wind.s && !l.wind.shift);
  ok(windFor(steady, 0).s === windFor(steady, 5).s, "steady wind stays put");
}

/* ---------------------------------------------------------------- collisions */
{
  const tg = { x: 0, y: 1.6, z: -20, r: 0.5, motion: null };
  const lvl = { targets: [tg], obstacles: [] };
  const o = launchOrigin(aimDir(0, 0));
  const aim = solveAim(o, () => tg, launchSpeed(1), accelOf({ x: 0, z: 0 }));
  const h = fly(lvl, aim.yaw, aim.pitch, 1, { x: 0, z: 0 }, 0);
  ok(h.kind === "target" && h.score === 10, `solved aim hits the 10 (got ${h.kind} ${h.score})`);
  // offset aims land in the matching ring
  for (const off of [0.12, 0.27, 0.42]) {
    const a2 = solveAim(o, () => ({ x: off, y: 1.6, z: -20 }), launchSpeed(1), accelOf({ x: 0, z: 0 }));
    const h2 = fly(lvl, a2.yaw, a2.pitch, 1, { x: 0, z: 0 }, 0);
    ok(h2.kind === "target" && h2.score === ringScore(off, 0.5), `offset ${off} → ring ${ringScore(off, 0.5)} (got ${h2.score})`);
    near(h2.dist, off, 0.03, `impact distance for offset ${off}`);
  }
  const miss = solveAim(o, () => ({ x: 0.8, y: 1.6, z: -20 }), launchSpeed(1), accelOf({ x: 0, z: 0 }));
  ok(fly(lvl, miss.yaw, miss.pitch, 1, { x: 0, z: 0 }, 0).kind !== "target", "aim beside the face misses");
  ok(fly(lvl, aim.yaw, aim.pitch - 0.2, 1, { x: 0, z: 0 }, 0).kind === "ground", "low shot sticks in the ground");
  ok(["lost", "ground"].includes(fly(lvl, aim.yaw, aim.pitch + 0.3, 1, { x: 0, z: 0 }, 0).kind), "high shot sails over the target");
  // obstacle in the way blocks it
  const blocked = { targets: [tg], obstacles: [{ x: 0, y: 1.6, z: -12, w: 2, h: 2, d: 0.4, motion: null }] };
  ok(fly(blocked, aim.yaw, aim.pitch, 1, { x: 0, z: 0 }, 0).kind === "obstacle", "obstacle blocks the shot");
  // fast arrow never tunnels through a thin shield
  const thin = { targets: [tg], obstacles: [{ x: 0, y: 1.6, z: -12, w: 2, h: 2, d: 0.05, motion: null }] };
  ok(fly(thin, aim.yaw, aim.pitch, 1, { x: 0, z: 0 }, 0).kind === "obstacle", "no tunnelling through a 5 cm shield");
  // shots from behind the face never score
  const n = targetNormal({ x: 3, z: -20 });
  ok(n.z > 0.98 && n.x < 0, "face normal points back toward the archer");
  // moving target: leading the shot hits, aiming at its current spot misses
  const mv = { x: 0, y: 1.6, z: -30, r: 0.4, motion: { k: "slide", a: 3, s: 1.6, p: 0 } };
  const mvl = { targets: [mv], obstacles: [] };
  const lead = solveAim(o, (t) => posAt(mv, 1 + t), launchSpeed(1), accelOf({ x: 0, z: 0 }));
  const hl = fly(mvl, lead.yaw, lead.pitch, 1, { x: 0, z: 0 }, 1);
  ok(hl.kind === "target" && hl.score >= 9, `leading a sliding target hits (${hl.kind} ${hl.score})`);
  const naive = solveAim(o, () => posAt(mv, 1), launchSpeed(1), accelOf({ x: 0, z: 0 }));
  ok(fly(mvl, naive.yaw, naive.pitch, 1, { x: 0, z: 0 }, 1).kind !== "target", "aiming where a fast target is (no lead) misses");
  // wind: compensated aim hits, uncompensated drifts
  const wind = { x: 5, z: 0 };
  const wAim = solveAim(o, () => ({ x: 0, y: 1.6, z: -45 }), launchSpeed(1), accelOf(wind));
  const wl = { targets: [{ x: 0, y: 1.6, z: -45, r: 0.4, motion: null }], obstacles: [] };
  ok(fly(wl, wAim.yaw, wAim.pitch, 1, wind, 0).score >= 9, "wind-compensated aim hits gold");
  const nAim = solveAim(o, () => ({ x: 0, y: 1.6, z: -45 }), launchSpeed(1), accelOf({ x: 0, z: 0 }));
  const drift = fly(wl, nAim.yaw, nAim.pitch, 1, wind, 0);
  ok(drift.point.x > 0.2, `uncompensated wind drifts downwind (${drift.point.x.toFixed(2)} m)`);
}

/* ---------------------------------------------------------------- level data */
ok(LEVELS.length === 50 && LEVEL_COUNT === 50, "50 levels");
ok(WORLDS.length === 5, "5 worlds");
const sigs = new Set();
for (const L of LEVELS) {
  const tag = `L${L.id}`;
  ok(L.world === Math.floor((L.id - 1) / 10), `${tag} world index`);
  ok(L.targets.length >= 1 && L.arrows >= 5 && L.arrows <= 10, `${tag} has targets and 5–10 arrows`);
  ok(objectiveLines(L).length >= 1, `${tag} has an objective`);
  ok(L.stars[0] < L.stars[1] && L.stars[1] <= L.arrows * 10, `${tag} star thresholds ordered and reachable`);
  if (L.objective.score) ok(L.objective.score <= L.stars[0], `${tag} score objective ≤ two-star line`);
  if (L.objective.all) ok(L.targets.length <= L.arrows, `${tag} enough arrows for every target`);
  if (L.objective.gold) ok(L.objective.gold <= L.arrows, `${tag} gold count ≤ arrows`);
  for (const t of L.targets) {
    const lowY = t.y - t.r - (t.motion && t.motion.k !== "slide" ? t.motion.a * (t.motion.k === "eight" ? 0.45 : 1) : 0);
    ok(lowY > 0.15, `${tag} target stays above ground (${lowY.toFixed(2)})`);
    ok(-t.z >= 10 && -t.z <= 70, `${tag} target distance sane`);
  }
  for (const o of L.obstacles) ok(o.y - o.h / 2 >= -0.01, `${tag} obstacle sits on/above ground`);
  // difficulty ramps by world: worlds 1 static, 2 moving/obstacles, 3 wind, 4 small/fast, 5 combined
  if (L.world === 0) ok(!L.wind.s && L.targets.every((t) => !t.motion) && !L.obstacles.length, `${tag} forest is static & calm`);
  if (L.world === 1) ok(!L.wind.s && (L.obstacles.length || L.targets.some((t) => t.motion)), `${tag} castle has movers or obstacles`);
  if (L.world === 2) ok(L.wind.s > 0 && Math.max(...L.targets.map((t) => -t.z)) >= 30, `${tag} desert has wind and range`);
  if (L.world === 3) ok(Math.min(...L.targets.map((t) => t.r)) <= 0.42, `${tag} frozen targets are small`);
  if (L.world === 4) ok([L.wind.s > 0, L.obstacles.length > 0, L.targets.some((t) => t.motion), L.targets.length > 1, Math.min(...L.targets.map((t) => t.r)) <= 0.36].filter(Boolean).length >= 2, `${tag} temple combines challenges`);
  sigs.add(JSON.stringify([L.targets, L.obstacles, L.wind, L.objective]));
}
ok(sigs.size === 50, "every level configuration is distinct");

/* ---------------------------------------------------------------- bot play */
/**
 * skill: sigma = angular aim noise (rad), windErr = fraction of wind misread,
 * leadErr = fraction of flight-time misjudged on moving targets.
 */
const SKILLS = {
  perfect: { sigma: 0, windErr: 0, leadErr: 0, timeErr: 0 },
  good: { sigma: 0.0016, windErr: 0.12, leadErr: 0.05, timeErr: 0.025 },
  casual: { sigma: 0.0032, windErr: 0.3, leadErr: 0.1, timeErr: 0.05 },
};

function chooseShot(L, run, T, wind) {
  // try targets in priority order, wait times 0…4 s; first clean noiseless 10 wins
  const order = L.targets.map((_, i) => i);
  const unhit = order.filter((i) => run.hit[i] === 0);
  const pri = L.objective.all && unhit.length ? unhit : order;
  pri.sort((a, b) => L.targets[b].r / -L.targets[b].z - L.targets[a].r / -L.targets[a].z);
  const acc = accelOf(wind);
  for (let w = 0; w <= 4; w += 0.05) {
    for (const i of pri) {
      const tg = L.targets[i];
      const o0 = launchOrigin(aimDir(0, 0));
      let a = solveAim(o0, (t) => posAt(tg, T + w + t), launchSpeed(1), acc);
      a = solveAim(launchOrigin(aimDir(a.yaw, a.pitch)), (t) => posAt(tg, T + w + t), launchSpeed(1), acc);
      const h = fly(L, a.yaw, a.pitch, 1, wind, T + w);
      if (h.kind === "target" && h.index === i && h.score === 10) return { i, w };
    }
  }
  return null;
}

function playLevel(L, skill, seed) {
  const g = gaussFrom(rng(seed));
  let run = newRun(L);
  let T = 1.2; // intro
  let stuck = 0;
  while (!run.over) {
    const shot = run.shots.length;
    const wind = windFor(L, shot);
    const plan = chooseShot(L, run, T + 0.9, wind); // draw takes ~0.9 s
    if (!plan) {
      stuck++;
      run = recordShot(run, L, { kind: "lost", score: 0 });
      T += 1;
      continue;
    }
    const fireT = T + 0.9 + plan.w;
    const tg = L.targets[plan.i];
    const seen = { x: wind.x * (1 + g() * skill.windErr), z: wind.z * (1 + g() * skill.windErr) };
    const lf = 1 + g() * skill.leadErr;
    const acc = accelOf(seen);
    let a = solveAim(launchOrigin(aimDir(0, 0)), (t) => posAt(tg, fireT + t * lf), launchSpeed(1), acc);
    a = solveAim(launchOrigin(aimDir(a.yaw, a.pitch)), (t) => posAt(tg, fireT + t * lf), launchSpeed(1), acc);
    const realT = fireT + g() * skill.timeErr; // release timing jitter
    const h = fly(L, a.yaw + g() * skill.sigma, a.pitch + g() * skill.sigma, 1, wind, realT);
    run = recordShot(run, L, h);
    T = realT + (h.time ? h.time - realT : 1) + 0.6;
  }
  return { run, stars: starsFor(run, L), stuck };
}

const N = { good: 40, casual: 40 };
const rows = [];
for (const L of LEVELS) {
  const p = playLevel(L, SKILLS.perfect, 1);
  ok(p.stuck === 0, `L${L.id} bot always finds a clean line (stuck ${p.stuck})`);
  ok(p.run.passed && p.stars === 3, `L${L.id} perfect bot earns 3 stars (score ${p.run.score}, ${p.stars}★)`);
  const res = {};
  for (const k of ["good", "casual"]) {
    let passN = 0, three = 0, sum = 0;
    for (let s = 0; s < N[k]; s++) {
      const r = playLevel(L, SKILLS[k], L.id * 1000 + s * 7 + (k === "good" ? 1 : 2));
      if (r.run.passed) passN++;
      if (r.stars === 3) three++;
      sum += r.run.score;
    }
    res[k] = { pass: passN / N[k], three: three / N[k], avg: sum / N[k] };
  }
  ok(res.good.pass >= 0.9, `L${L.id} skilled bot clears ≥90% (got ${(res.good.pass * 100).toFixed(0)}%)`);
  ok(res.good.three >= 0.2, `L${L.id} 3 stars attainable: ≥20% of skilled runs (got ${(res.good.three * 100).toFixed(0)}%)`);
  // from Desert Winds on, 3 stars must not be a formality
  if (L.world >= 2) ok(res.good.three <= 0.95, `L${L.id} 3 stars take real skill: ≤95% of skilled runs (got ${(res.good.three * 100).toFixed(0)}%)`);
  // casual players clear the first three worlds comfortably; the last two are allowed to bite
  const casualFloor = L.world <= 2 ? 0.5 : 0.15;
  ok(res.casual.pass >= casualFloor, `L${L.id} casual bot clears ≥${casualFloor * 100}% (got ${(res.casual.pass * 100).toFixed(0)}%)`);
  rows.push([L.id, L.name, L.arrows * 10, L.objective.score || "-", L.stars.join("/"), res.good.avg.toFixed(1), (res.good.pass * 100).toFixed(0) + "%", (res.good.three * 100).toFixed(0) + "%", res.casual.avg.toFixed(1), (res.casual.pass * 100).toFixed(0) + "%", (res.casual.three * 100).toFixed(0) + "%", `suggest ${Math.round(res.casual.avg)}/${Math.round(res.good.avg * 0.98)}`]);
}
if (TABLE) {
  console.log("id name max need stars | good avg pass 3★ | casual avg pass 3★");
  for (const r of rows) console.log(r.join("  "));
}

/* ---------------------------------------------------------------- rules */
{
  const L = LEVELS[0]; // score 20, 5 arrows
  let run = newRun(L);
  run = recordShot(run, L, { kind: "ground", score: 0 });
  run = recordShot(run, L, { kind: "obstacle", score: 0 });
  ok(!run.over, "two misses don't end level 1 yet");
  run = recordShot(run, L, { kind: "ground", score: 0 });
  ok(!run.over, "two arrows left can still make 20");
  run = recordShot(run, L, { kind: "lost", score: 0 });
  ok(run.over && !run.passed && run.arrowsLeft === 1, "level ends early once 20 points is out of reach");
  ok(starsFor(run, L) === 0, "failed run earns 0 stars");

  let r2 = newRun(L);
  for (let i = 0; i < 5; i++) r2 = recordShot(r2, L, { kind: "target", index: 0, score: 10, perfect: i === 0 });
  ok(r2.over && r2.passed && r2.score === 50 && r2.gold === 5 && r2.perfects === 1, "five 10s pass with 50");
  ok(starsFor(r2, L) === 3, "50 points = 3 stars");
  let r3 = newRun(L);
  for (let i = 0; i < 5; i++) r3 = recordShot(r3, L, { kind: "target", index: 0, score: 5 });
  ok(r3.passed && starsFor(r3, L) === 1, "25 points = pass with 1 star");

  const L3 = LEVELS[2]; // hit both
  let r4 = newRun(L3);
  for (let i = 0; i < 4; i++) r4 = recordShot(r4, L3, { kind: "target", index: 0, score: 10 });
  ok(!r4.over && status(r4, L3).parts[0].done === 1, "one arrow left can still hit the second target");
  r4 = recordShot(r4, L3, { kind: "target", index: 0, score: 10 });
  ok(r4.over && !r4.passed, "all-targets level fails if a target is never hit");
}

/* ---------------------------------------------------------------- progress */
{
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  let p = loadProgress(storage);
  ok(JSON.stringify(p) === JSON.stringify(DEFAULT_PROGRESS), "fresh progress: only level 1 unlocked");
  const pass1 = (id, score) => {
    const L = LEVELS[id - 1];
    let run = newRun(L);
    run = { ...run, score, passed: true, over: true };
    return applyResult(p, L, run);
  };
  let r = pass1(1, 35);
  p = r.progress;
  ok(p.unlocked === 2 && p.stars[1] === 2 && r.firstClear, "clearing level 1 unlocks 2, 2 stars");
  r = pass1(1, 30);
  p = r.progress;
  ok(p.stars[1] === 2 && p.best[1] === 35 && !r.newBest, "worse replay never lowers stars/best");
  r = pass1(1, 45);
  p = r.progress;
  ok(p.stars[1] === 3 && p.best[1] === 45 && r.improved, "replay improves to 3 stars");
  const failRun = { ...newRun(LEVELS[1]), over: true, passed: false };
  p = applyResult(p, LEVELS[1], failRun).progress;
  ok(p.unlocked === 2 && !p.stars[2], "failing doesn't unlock or award");
  saveProgress(storage, p);
  ok(JSON.stringify(loadProgress(storage)) === JSON.stringify(p), "progress round-trips through storage");
  storage.setItem(STORE_KEY, "{broken");
  ok(loadProgress(storage).unlocked === 1, "corrupt storage falls back to defaults");
  storage.setItem(STORE_KEY, JSON.stringify({ unlocked: 999, stars: { 1: 3 } }));
  ok(loadProgress(storage).unlocked === 50, "unlocked clamps to 50");
  // walk the whole campaign
  p = { ...DEFAULT_PROGRESS };
  for (const L of LEVELS) {
    ok(p.unlocked >= L.id, `L${L.id} unlocked when reached`);
    p = applyResult(p, L, { ...newRun(L), score: L.stars[1], passed: true, over: true }).progress;
  }
  ok(p.champion && p.unlocked === 50, "clearing level 50 crowns the champion");
  ok(totalStars(p) === 150 && worldStars(p, 4) === 30, "150 stars total, 30 per world");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
