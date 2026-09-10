/**
 * Crowd Rush — the run engine. Plain JS, no React, no Three: it owns all of the
 * gameplay simulation for one level and exposes a `tick(dt)` the render layer
 * calls every frame. Because it's pure logic it can be run headless (see
 * systems/validate.js and the sim test), which is how the 50 levels are checked.
 *
 * State the renderer reads every frame lives on `run` directly (mutated in
 * place — no per-frame allocations). Discrete moments (a gate firing, a battle
 * starting, the finish) are pushed through `onEvent` for sound + HUD pops.
 */

import { applyOp, bestGateIndex } from "../systems/gateMath.js";
import { formationFor, steerHalfWidth } from "../systems/crowdFormation.js";
import { hitsRunner, pushAt, obstacleState } from "../systems/obstacleCollision.js";
import { makeBattle, tickBattle } from "../systems/battleSystem.js";
import { rateRun } from "../utils/scoring.js";

export const RUNNER_CAP = 400;
const FWD_SPEED = 13.5;
const TRACK_HALF = 5;
const SENS = { low: 9, medium: 14, high: 20 };

let RID = 0;

function makeRunner(seed) {
  return {
    id: RID++,
    sx: (Math.random() - 0.5) * 0.6,
    sz: -0.3 - Math.random() * 0.4,
    tox: 0,
    toz: 0,
    phase: Math.random() * Math.PI * 2,
    bob: 0.9 + Math.random() * 0.25,
    state: "in", // in (spawning) | alive | out (dying)
    anim: 0,
    hop: 0,
  };
}

export function createRun(level, { colorHex = "#3d8bff", sensitivity = "medium", onEvent = () => {} } = {}) {
  const finishLineZ =
    level.sections.reduce((m, s) => Math.max(m, s.type === "narrow" ? s.z + s.length : s.z), 0) + 26;

  const run = {
    level,
    colorHex,
    sens: SENS[sensitivity] || SENS.medium,
    onEvent,

    phase: "run", // run | battle | finish | won | lost
    t: 0,
    paused: false,

    z: 0, // crowd centre forward position
    x: 0,
    targetXNorm: 0, // -1..1 from keyboard
    dragX: null, // absolute world-x target from pointer drag (null = not dragging)
    speed: FWD_SPEED,

    count: level.startCount,
    displayCount: level.startCount,
    prevCount: level.startCount,
    countPulse: 0,

    runners: [],
    trackHalf: TRACK_HALF,
    finishLineZ,

    gates: level.sections
      .map((s, i) => (s.type === "gateChoice" ? { i, s, consumed: false } : null))
      .filter(Boolean),
    obstacles: level.sections
      .map((s, i) => (s.type === "obstacle" ? { i, s, ...s, tLocal: 0, _kw0: 0, _kwN: 0 } : null))
      .filter(Boolean),
    narrows: level.sections
      .map((s, i) => (s.type === "narrow" ? { i, s } : null))
      .filter(Boolean),
    enemies: level.sections
      .map((s, i) =>
        s.type === "enemy"
          ? { i, s, count: s.count, startCount: s.count, z: s.z, moving: s.moving, speed: s.speed || 0, state: "idle" }
          : null,
      )
      .filter(Boolean),

    battle: null,
    finale: null,

    shake: 0,
    fx: [], // transient visual pops: { kind, x, y, z, life, max, hue }

    stats: { collected: 0, lost: 0, enemiesDefeated: 0, bossDefeated: false, choices: [] },
    result: null,
  };

  for (let k = 0; k < run.count; k++) run.runners.push(makeRunner());
  for (const r of run.runners) r.state = "alive";

  applyFormation(run, 0.001);
  return run;
}

/* --------------------------------------------------------------- count ops */

function setCount(run, next, reason) {
  next = Math.max(0, Math.min(RUNNER_CAP, Math.floor(next)));
  const cur = run.count;
  if (next === cur) return;

  if (next > cur) {
    const add = next - cur;
    run.stats.collected += add;
    for (let k = 0; k < add; k++) {
      const r = makeRunner();
      // spawn near the current crowd edge, then let formation pull it in
      const ex = (Math.random() - 0.5) * (run.crowdWidth || 2) * 1.6;
      const ez = -0.5 - Math.random() * (run.crowdDepth || 2);
      r.sx = ex;
      r.sz = ez;
      run.runners.push(r);
    }
  } else {
    const remove = cur - next;
    run.stats.lost += remove;
    // mark the outermost living runners as dying
    const living = run.runners.filter((r) => r.state !== "out");
    living.sort((a, b) => (b.sx * b.sx + b.sz * b.sz) - (a.sx * a.sx + a.sz * a.sz));
    for (let k = 0; k < remove && k < living.length; k++) {
      living[k].state = "out";
      living[k].anim = 0;
      run.fx.push({ kind: "poof", x: living[k].sx, y: 0.5, z: living[k].sz, life: 0, max: 0.4 });
    }
  }
  run.prevCount = cur;
  run.count = next;
  run.countPulse = 1;
  if (next <= 0 && run.phase !== "lost") lose(run, "No runners left");
}

function applyFormation(run, dt) {
  const alive = run.runners.filter((r) => r.state !== "out");
  const f = formationFor(Math.max(1, alive.length), run.trackHalf - 0.4);
  run.crowdWidth = f.width;
  run.crowdDepth = f.depth;
  for (let k = 0; k < alive.length; k++) {
    const slot = f.slots[k] || f.slots[f.slots.length - 1] || { ox: 0, oz: 0 };
    alive[k].tox = slot.ox;
    alive[k].toz = slot.oz;
  }
  const lerp = Math.min(1, dt * 9);
  for (const r of run.runners) {
    if (r.state === "out") continue;
    r.sx += (r.tox - r.sx) * lerp;
    r.sz += (r.toz - r.sz) * lerp;
  }
}

/* ------------------------------------------------------------------ input */

function steer(run, dt) {
  const halfCrowd = steerHalfWidth(run.trackHalf, run.crowdWidth || 1);
  let target;
  if (run.dragX != null) {
    target = run.dragX;
  } else {
    // the chase camera looks toward +z, so screen-right is world -x — negate the
    // key direction so "press right / →" moves the crowd right on screen
    target = -run.targetXNorm * halfCrowd;
  }
  target = Math.max(-halfCrowd, Math.min(halfCrowd, target));

  // conveyor drift
  for (const ob of run.obstacles) {
    if (ob.obstacle !== "conveyor") continue;
    const rz = run.z - ob.s.z;
    run.x += pushAt(ob.s, ob.tLocal, run.x, rz) * dt;
  }

  const rate = run.sens * dt;
  run.x += Math.max(-rate, Math.min(rate, target - run.x));
  // hard clamp: narrows tighten the corridor
  let limit = halfCrowd;
  for (const nr of run.narrows) {
    if (run.z >= nr.s.z - 2 && run.z <= nr.s.z + nr.s.length + 2) {
      limit = Math.min(limit, Math.max(0.3, nr.s.width - (run.crowdWidth || 1) * 0.25));
    }
  }
  run.x = Math.max(-limit, Math.min(limit, run.x));
}

/* ------------------------------------------------------------------ gates */

function checkGates(run) {
  for (const g of run.gates) {
    if (g.consumed) continue;
    if (run.z < g.s.z) continue;
    g.consumed = true;
    const gates = g.s.gates;
    // pick by the crowd centre's x at the crossing
    let pick = 0;
    let bd = Infinity;
    gates.forEach((gg, idx) => {
      const d = Math.abs(gg.x - run.x);
      if (d < bd) { bd = d; pick = idx; }
    });
    const before = run.count;
    const chosen = gates[pick];
    const opt = bestGateIndex(gates, before);
    const resChosen = applyOp(chosen.operation, chosen.value, before);
    const resOpt = applyOp(gates[opt].operation, gates[opt].value, before);
    run.stats.choices.push({ eff: resOpt > 0 ? Math.min(1, resChosen / resOpt) : 1 });

    setCount(run, resChosen, "gate");
    const kind =
      chosen.operation === "mul" ? "mul" :
      chosen.operation === "add" ? "add" : "neg";
    run.fx.push({ kind: "gate", x: chosen.x, y: 2.2, z: 0, life: 0, max: 0.9, op: kind, label: gateLabelText(chosen) });
    run.onEvent(
      chosen.operation === "mul" ? "gateMultiply" :
      chosen.operation === "add" ? "gatePositive" : "gateNegative",
    );
  }
}

function gateLabelText(g) {
  const sym = { add: "+", sub: "−", mul: "×", div: "÷" }[g.operation] || "+";
  return `${sym}${g.value}`;
}

/* -------------------------------------------------------------- obstacles */

function checkObstacles(run, dt) {
  for (const ob of run.obstacles) {
    const dz = run.z - ob.s.z;
    // keep local time only while the obstacle is in play (fair, deterministic feel)
    ob.tLocal += dt;

    if (ob.obstacle === "fallingColumn" && !ob._triggered && dz > -9) {
      ob._triggered = true;
      ob._triggeredAt = ob.tLocal;
    }
    if (ob.obstacle === "conveyor") continue; // handled in steer()

    if (dz < -3 || dz > 4.5) continue; // only the slice the crowd is passing

    // fairness caps: a short rolling window AND a hard per-obstacle total, so a
    // single obstacle can clip the edge of a crowd but never wipe it
    if (ob.tLocal - ob._kw0 > 0.3) { ob._kw0 = ob.tLocal; ob._kwN = 0; }
    if (ob._contactCount == null) ob._contactCount = run.count;
    const windowCap = Math.max(2, Math.ceil(run.count * 0.09));
    const totalCap = Math.max(3, Math.ceil(ob._contactCount * 0.3));
    ob._totalKilled = ob._totalKilled || 0;

    let killed = 0;
    for (const r of run.runners) {
      if (r.state !== "alive") continue;
      if (ob._kwN + killed >= windowCap) break;
      if (ob._totalKilled + killed >= totalCap) break;
      const rz = run.z + r.sz - ob.s.z;
      if (hitsRunner(ob.s, ob.tLocal, run.x + r.sx, rz)) {
        r.state = "out";
        r.anim = 0;
        r.hop = 1;
        run.fx.push({ kind: "poof", x: r.sx, y: 0.5, z: r.sz, life: 0, max: 0.4 });
        killed++;
      }
    }
    if (killed) {
      ob._kwN += killed;
      ob._totalKilled += killed;
      run.count = Math.max(0, run.count - killed);
      run.stats.lost += killed;
      run.countPulse = 1;
      run.shake = Math.min(1, run.shake + 0.25 + killed * 0.02);
      run.onEvent("hit");
      if (run.count <= 0) lose(run, "Crowd wiped out");
    }
  }
}

function checkNarrows(run, dt) {
  for (const nr of run.narrows) {
    if (run.z < nr.s.z - 1 || run.z > nr.s.z + nr.s.length + 1) continue;
    const edge = nr.s.width;
    nr._kw0 = nr._kw0 || 0;
    if (run.t - nr._kw0 > 0.3) { nr._kw0 = run.t; nr._kwN = 0; }
    const cap = Math.max(1, Math.ceil(run.count * 0.06));
    let lost = 0;
    for (const r of run.runners) {
      if (r.state !== "alive") continue;
      const wx = run.x + r.sx;
      if (Math.abs(wx) > edge + 0.9) {
        // way outside the walls — this one is gone
        if ((nr._kwN || 0) + lost >= cap) { r.sx += (Math.sign(wx) * -1) * dt * 4; continue; }
        r.state = "out";
        r.anim = 0;
        run.fx.push({ kind: "poof", x: r.sx, y: 0.4, z: r.sz, life: 0, max: 0.35 });
        lost++;
      } else if (Math.abs(wx) > edge) {
        // just clipping the wall — shove back into the corridor
        r.sx += (Math.sign(wx) * (edge) - wx) * Math.min(1, dt * 6);
      }
    }
    if (lost) {
      nr._kwN = (nr._kwN || 0) + lost;
      run.count = Math.max(0, run.count - lost);
      run.stats.lost += lost;
      run.countPulse = 1;
      run.onEvent("hit");
      if (run.count <= 0) lose(run, "Fell off the path");
    }
  }
}

/* --------------------------------------------------------------- enemies */

function checkEnemies(run, dt) {
  if (run.phase === "battle") return;
  for (const e of run.enemies) {
    if (e.state === "done") continue;
    if (e.moving && run.z > e.z - 34 && e.z > run.z + 7) {
      e.z -= e.speed * dt;
    }
    if (e.state === "idle" && run.z >= e.z - 2.2) {
      e.state = "fighting";
      run.phase = "battle";
      run.battle = makeBattle(run.count, e);
      run.battle.enemyRef = e;
      run.onEvent("battleStart");
      return;
    }
  }
}

function tickBattlePhase(run, dt) {
  const b = run.battle;
  const r = tickBattle(b, dt);
  run.shake = Math.min(1, Math.max(run.shake, b.shake * 0.5));

  if (r.killedPlayer) {
    setCount(run, run.count - r.killedPlayer, "battle");
    for (let k = 0; k < r.killedPlayer && k < 6; k++) run.onEvent("battle");
  }
  b.enemyRef.count = r.enemyCount;
  if (r.killedEnemy) run.onEvent("battle");

  if (r.finished) {
    const wasFinale = b.isFinale;
    b.enemyRef.state = "done";
    run.phase = wasFinale ? "finish" : "run";
    if (r.outcome === "win") {
      setCount(run, Math.max(0, b.playerStart - b.enemyStart), "battle");
      run.stats.enemiesDefeated += 1;
      run.onEvent("enemyDown");
      run.fx.push({ kind: "burst", x: 0, y: 1.2, z: 3, life: 0, max: 0.6 });
      run.battle = null;
      if (wasFinale) win(run, { finaleBonus: run.count * 4 });
    } else {
      setCount(run, 0, "battle");
      run.battle = null;
      lose(run, "Crowd defeated");
    }
  }
}

/* ---------------------------------------------------------------- finale */

function startFinale(run) {
  const fin = run.level.finish;
  run.phase = "finish";
  run.finaleCrowdAtLine = run.count; // the number that "reached the finish"
  run.onEvent("finish");
  if (fin.type === "boss" || fin.type === "fortress") {
    run.finale = { type: fin.type, hp: fin.strength, hpStart: fin.strength, t: 0, rate: Math.max(10, fin.strength / 2.4), done: false, win: null };
  } else if (fin.type === "enemy") {
    const e = { count: fin.count, startCount: fin.count, z: run.z + 10, state: "fighting" };
    run.enemies.push({ ...e, i: -1, s: { type: "enemy" }, moving: false });
    run.battle = makeBattle(run.count, e);
    run.battle.enemyRef = run.enemies[run.enemies.length - 1];
    run.battle.isFinale = true;
    run.phase = "battle";
    run.finale = { type: "enemy", done: false };
  } else if (fin.type === "staircase") {
    run.finale = { type: "staircase", mults: fin.mults, t: 0, reached: 0, done: false };
  }
}

function tickFinale(run, dt) {
  const f = run.finale;
  if (!f) return;
  if (f.type === "boss" || f.type === "fortress") {
    f.t += dt;
    const loss = f.rate * dt;
    const before = f.hp;
    f.hp = Math.max(0, f.hp - loss);
    const dealt = before - f.hp;
    // crowd trades runners 1:1 with boss strength
    if (dealt >= 1) {
      setCount(run, run.count - Math.round(dealt), "boss");
      run.onEvent(f.type === "boss" ? "bossHit" : "battle");
    }
    run.shake = Math.min(1, run.shake + dt * 1.5);
    if (f.hp <= 0 || run.count <= 0) {
      f.done = true;
      f.win = run.count > 0;
      if (f.win) {
        if (f.type === "boss") run.stats.bossDefeated = true;
        run.fx.push({ kind: "burst", x: 0, y: 2, z: 8, life: 0, max: 1.1 });
        win(run);
      } else {
        lose(run, f.type === "boss" ? "The boss held" : "The fortress held");
      }
    }
  } else if (f.type === "staircase") {
    f.t += dt;
    // the crowd climbs; how far it gets scales with the crowd that arrived
    const reach = Math.min(f.mults.length - 1, Math.floor((run.finaleCrowdAtLine / 22) ));
    f.reached = Math.min(f.mults.length - 1, Math.floor((f.t / 2.4) * (reach + 1)));
    if (f.t >= 2.6) {
      f.reached = reach;
      f.mult = f.mults[reach];
      f.done = true;
      win(run, { finaleBonus: run.finaleCrowdAtLine * f.mult * 2 });
    }
  }
}

/* --------------------------------------------------------------- outcome */

function gateEfficiency(run) {
  const c = run.stats.choices;
  if (!c.length) return 1;
  return c.reduce((s, x) => s + x.eff, 0) / c.length;
}

function finishRun(run, success, extra = {}) {
  if (run.result) return;
  const finalCrowd = success ? (run.finaleCrowdAtLine ?? run.count) : run.count;
  const eff = gateEfficiency(run);
  const rated = success
    ? rateRun({
        level: run.level,
        finalCrowd,
        runnersLost: run.stats.lost,
        enemiesDefeated: run.stats.enemiesDefeated,
        gateEfficiency: eff,
        finaleBonus: extra.finaleBonus || 0,
        bossDefeated: run.stats.bossDefeated,
      })
    : { stars: 0, score: 0, coins: 0 };

  run.result = {
    success,
    reason: extra.reason || (success ? "Finished" : "Failed"),
    finalCrowd,
    crowdAtEnd: run.count,
    stars: rated.stars,
    score: rated.score,
    coins: rated.coins,
    gateEfficiency: eff,
    runnersCollected: run.stats.collected,
    runnersLost: run.stats.lost,
    enemiesDefeated: run.stats.enemiesDefeated,
    bossDefeated: run.stats.bossDefeated,
    staircaseMult: run.finale?.type === "staircase" ? run.finale.mult : null,
    levelId: run.level.id,
  };
}

function win(run, extra = {}) {
  run.phase = "won";
  finishRun(run, true, extra);
  run.onEvent("win");
}
function lose(run, reason) {
  if (run.phase === "lost" || run.result) return;
  run.phase = "lost";
  finishRun(run, false, { reason });
  run.onEvent("lose");
}

/* ------------------------------------------------------------------ tick */

export function tick(run, dtRaw) {
  if (run.paused || run.result) return;
  const dt = Math.min(0.05, Math.max(0, dtRaw));
  run.t += dt;

  // forward motion
  if (run.phase === "run" || run.phase === "finish") {
    const targetSpeed = run.phase === "finish" && run.finale?.type !== "staircase" && run.z > run.finishLineZ + 6 ? 0 : FWD_SPEED;
    run.speed += (targetSpeed - run.speed) * Math.min(1, dt * 4);
    run.z += run.speed * dt;
  } else if (run.phase === "battle") {
    run.speed += (0 - run.speed) * Math.min(1, dt * 6);
    run.z += run.speed * dt;
  }

  steer(run, dt);
  applyFormation(run, dt);

  // gait + spawn/death anims
  const gait = 6 + (run.speed / FWD_SPEED) * 7;
  for (let k = run.runners.length - 1; k >= 0; k--) {
    const r = run.runners[k];
    r.phase += dt * gait * (run.phase === "battle" ? 1.6 : 1) * r.bob;
    if (r.state === "in") {
      r.anim = Math.min(1, r.anim + dt * 4);
      if (r.anim >= 1) r.state = "alive";
    } else if (r.state === "out") {
      r.anim = Math.min(1, r.anim + dt * 3);
      if (r.anim >= 1) run.runners.splice(k, 1);
    }
  }

  // display count easing
  run.displayCount += (run.count - run.displayCount) * Math.min(1, dt * 12);
  run.countPulse = Math.max(0, run.countPulse - dt * 3);
  run.shake = Math.max(0, run.shake - dt * 2.5);

  // fx lifetimes
  for (let k = run.fx.length - 1; k >= 0; k--) {
    run.fx[k].life += dt;
    if (run.fx[k].life >= run.fx[k].max) run.fx.splice(k, 1);
  }

  if (run.phase === "run") {
    checkGates(run);
    checkObstacles(run, dt);
    checkNarrows(run, dt);
    checkEnemies(run, dt);
    if (run.z >= run.finishLineZ && !run.finale) startFinale(run);
  } else if (run.phase === "battle") {
    tickBattlePhase(run, dt);
  } else if (run.phase === "finish") {
    tickFinale(run, dt);
  }

  run.progress = Math.max(0, Math.min(1, run.z / run.finishLineZ));
}

/* ------------------------------------------------------------- externals */

export function setPaused(run, p) { run.paused = p; }
export function setKeyDir(run, dir) { run.targetXNorm = dir; }
export function setDragTarget(run, worldX) { run.dragX = worldX; }
export function clearDrag(run) { run.dragX = null; }
